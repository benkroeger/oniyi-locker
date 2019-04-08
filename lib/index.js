'use strict';

// node core modules
const crypto = require('crypto');

// 3rd party modules
const _ = require('lodash');
const async = require('async');
const logger = require('oniyi-logger')('oniyi:locker');

// internal modules
const makeRedisClient = require('./make-redis-client');
const {
  STATE_LOCKED,
  STATE_UNLOCKED,
  STATE_RELEASED_WITH_MESSAGE,
  FACTORY_PARAMS_WHITELIST,
} = require('./constants');
const {
  InvalidParamsError,
  LockTimeoutError,
  InvalidUnlockTokenError,
  UnexpectedResultError,
  MaxAttemptsReachedError,
  LockFailedError,
} = require('./errors');

const factoryDefaults = {
  locksExpireAfter: 5000, // this is milliseconds
  maxWait: 5000, // this is milliseconds
  reuseData: false,
  maxAttempts: 1,
  redis: {
    cluster: null,
    keyPrefix: 'oniyi-locker:',
  },
};

// https://gist.github.com/jed/982883#gistcomment-852670
const uuid = () =>
  // eslint-disable-next-line no-bitwise, no-mixed-operators
  ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, a =>
    // eslint-disable-next-line no-bitwise
    (a ^ (crypto.randomBytes(1)[0] >> (a / 4))).toString(16),
  );

function acquireLock(params = {}, done) {
  const { client, key, unlockToken, expiresAfter } = params;
  client.set(
    key,
    unlockToken,
    'PX',
    expiresAfter,
    'NX',
    (setLockError, result) => {
      if (setLockError) {
        done(setLockError);
        return;
      }

      done(null, result !== null);
    },
  );
}

function attemptAcquire(params = {}, done) {
  const { key, maxWait, maxAttempts } = params;
  const acquireParams = _.pick(params, [
    'client',
    'key',
    'unlockToken',
    'expiresAfter',
  ]);

  async.retry(
    {
      times: maxAttempts,
      interval: maxWait / maxAttempts,
    },
    taskCallback => {
      acquireLock(acquireParams, (acquireError, acquired) => {
        if (acquireError) {
          logger.debug('failed to acquire lock for "%s"', key);
          logger.debug(acquireError);
          taskCallback(null); // need to pass a falsy err to taskCallback in order to init the next retry
          return;
        }

        taskCallback(!acquireError && acquired, acquired);
      });
    },
    (attemptError, acquired) => {
      // if this error is actually an instance of Error, it is not coming from a taskCallback
      if (attemptError instanceof Error) {
        done(attemptError);
        return;
      }

      if (!acquired) {
        done(new MaxAttemptsReachedError(key, maxAttempts));
        return;
      }

      done(null, acquired);
    },
  );
}

function subscribeToReuseData(params = {}, done) {
  const { client, key, maxWait } = params;
  const timeout = setTimeout(() => {
    logger.debug(
      'waited %dms for lock "%s" to be released, aborted',
      maxWait,
      key,
    );
    client.unsubscribe();
    client.disconnect();

    done(new LockTimeoutError(key, maxWait));
  }, maxWait);

  // we assume that every message on this channel is an `STATE_RELEASED_WITH_MESSAGE` message
  client.on('message', (channel, data) => {
    if (channel !== key) {
      return;
    }
    clearTimeout(timeout);
    done(null, JSON.parse(data));
  });

  client.subscribe(key);
}

function lockerFactory(factoryParams = {}) {
  // prepare options with defaults
  const options = _.defaultsDeep(
    {},
    // only allow supported params
    _.pick(factoryParams, FACTORY_PARAMS_WHITELIST),
    factoryDefaults,
  );

  // verify `maxAttempts` option to be of type number with val > 0
  if (!_.isNumber(options.maxAttempts) || options.maxAttempts < 1) {
    throw new InvalidParamsError(
      '.maxAttempts',
      'number > 0',
      `type: ${typeof options.maxAttempts}, val: ${_.toString(
        options.maxAttempts,
      )}`,
    );
  }

  // verify `redis` options
  if (!_.isPlainObject(options.redis)) {
    throw new InvalidParamsError(
      '.redis',
      'plain object literal',
      typeof options.redis,
    );
  }

  // make sure keyPrefix (if any) ends with ':'
  // @TODO: replace keyPrefix option with hash keys?
  // http://redis.io/topics/cluster-tutorial
  // this{key}foo
  if (options.redis.keyPrefix && !/:$/.test(options.redis.keyPrefix)) {
    Object.assign(options.redis, {
      keyPrefix: `${options.redis.keyPrefix}:`,
    });
  }

  // make client instance
  const redisClient = makeRedisClient(options.redis);

  function lock(params, callback) {
    logger.debug('lock with params %j', params);
    const {
      key,
      expiresAfter = options.locksExpireAfter,
      maxWait = options.maxWait,
      maxAttempts = options.maxAttempts,
      reuseData = options.reuseData,
    } = params;

    if (!(key && _.isString(key))) {
      callback(new InvalidParamsError('.key', 'string', typeof key));
      return;
    }

    const unlockToken = uuid();

    const acquireParams = {
      key,
      unlockToken,
      expiresAfter,
      maxWait,
      maxAttempts,
      client: redisClient,
    };

    if (maxAttempts > 1) {
      attemptAcquire(acquireParams, callback);
      return;
    }

    // you can only reuse data fetched by previous lock owner when maxAttempts === 1
    acquireLock(acquireParams, (attemptError, acquired) => {
      if (attemptError) {
        callback(attemptError);
        return;
      }

      if (acquired) {
        logger.debug('lock acquired for {%s}', key);

        // pass the good news (incl. the unlock token) to our callback function
        callback(null, {
          state: STATE_LOCKED,
          token: unlockToken,
        });
        return;
      }

      // lock is taken already
      logger.debug('lock for {%s} has already been acquired', key);

      if (reuseData) {
        // subscribe to lock release event on pub/sub and pass message to callback
        subscribeToReuseData(
          {
            key,
            // @TODO: should we actually only create one `subscriber` client and re-use with a queue of callback functions?
            client: makeRedisClient(options.redis),
            maxWait: maxWait / maxAttempts,
          },
          callback,
        );
        return;
      }

      callback(new LockFailedError(key));
    });
  }

  /**
   * unlock an existing `key` in redis and pass publish a message via redis `PUBSUB`
   * @param  {Object}   params   plain object literal with unlock params
   * @param  {Function} callback callback function, will retrieve single error argument
   * @return {[type]}            [description]
   */
  function unlock(params, callback) {
    const { key, token, message } = params;

    // validate params
    if (!(key && _.isString(key))) {
      callback(new InvalidParamsError('.key', 'string', typeof key));
      return;
    }
    if (!(token && _.isString(token))) {
      callback(new InvalidParamsError('.token', 'string', typeof token));
      return;
    }

    // use lua script to check parity and delete lock in one atomic operation
    redisClient.parityDelete(key, token, (parityDeleteError, result) => {
      if (parityDeleteError) {
        callback(parityDeleteError);
        return;
      }

      if (result === 0) {
        // either `key` does not exist or `token` is invalid
        // @TODO: determine exact cause of error
        callback(new InvalidUnlockTokenError(key, token));
        return;
      }

      if (result === 1) {
        // unlocked successfully, publishing message on channel `key` so that other (waiting) clients
        // get notified along with the retrieved data immediately
        // the publishing happens as "fire and forget"
        redisClient.publish(
          key,
          JSON.stringify({
            state: STATE_RELEASED_WITH_MESSAGE,
            message,
          }),
        );

        callback(null, { state: STATE_UNLOCKED });
        return;
      }

      logger.debug(
        'unexpected result "%s" when running "parityDelete" with key = "%s" and token = "%s"',
        result,
        key,
        token,
      );

      callback(new UnexpectedResultError([0, 1], result));
    });
  }

  return {
    lock,
    unlock,
  };
}

module.exports = lockerFactory;
