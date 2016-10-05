'use strict';

// node core modules

// 3rd party modules
const _ = require('lodash');

// internal modules
const logger = require('./logger');
const makeRedisClient = require('./make-redis-client');
const { InvalidParamsError, InvalidUnlockTokenError, UnexpectedResultError } = require('./errors');

const factoryDefaults = {
  locksExpireAfter: 5000, // this is milliseconds
  redis: {
    cluster: null,
    keyPrefix: '',
  },
};

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function oniyiLockerFactory(factoryParams = {}) {
  // prepare options with defaults
  const options = _.defaultsDeep({},
    // only allow supported params
    _.pick(factoryParams, ['locksExpireAfter', 'redis']),
    factoryDefaults
  );

  // verify `redis` options
  if (!_.isPlainObject(options.redis)) {
    throw new InvalidParamsError('.redis', 'plain object literal', typeof options.redis);
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
    const { key, expiresAfter = options.locksExpireAfter } = params;

    if (!(key && _.isString(key))) {
      callback(new InvalidParamsError('.key', 'string', typeof key));
      return;
    }

    const unlockToken = uuid();

    redisClient.set(key, unlockToken, 'PX', expiresAfter, 'NX', (setLockError, result) => {
      if (setLockError) {
        callback(setLockError, null);
        return;
      }
      // lock is taken already
      if (result === null) {
        logger.debug('Lock for {%s} is taken already', key);

        // make a redis client and subscribe to lock release
        // @TODO: should we actually only create one `subscriber` client and re-use with a queue of callback functions?
        const client = makeRedisClient(options.redis);

        const timeout = setTimeout(() => {
          logger.debug('waited %dms for lock "%s" to be released, aborted', expiresAfter, key);
          client.unsubscribe();
          client.disconnect();
          callback(null, {
            state: 'timeout',
            message: `waited ${expiresAfter}ms for lock on "${key}" to be released`,
          });
        }, expiresAfter);

        // we assume that every message on this channel is an "unlock" message
        client.on('message', (channel, data) => {
          if (channel !== key) {
            return;
          }
          clearTimeout(timeout);
          callback(null, JSON.parse(data));
        });

        client.subscribe(key);
        return;
      }

      logger.debug('created lock for {%s}', key);

      // pass the good news (incl. the unlock token) to our callback function
      callback(null, {
        state: 'locked',
        token: unlockToken,
      });
      return;
    });
    return;
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
        redisClient.publish(key, JSON.stringify({
          state: message,
        }));

        callback(null);
        return;
      }

      logger.debug('unexpected result "%s" when running "parityDelete" with key = "%s" and token = "%s"',
        result,
        key,
        token
      );

      callback(new UnexpectedResultError([0, 1], result));
      return;
    });
  }

  return {
    lock,
    unlock,
  };
}

module.exports = oniyiLockerFactory;
