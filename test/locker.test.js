// node core modules
import crypto from 'crypto';

// 3rd party modules
import test from 'ava';
import _ from 'lodash';

// internal modules
import oniyiLockerFactory from '../lib';
import { InvalidParamsError, LockTimeoutError, MaxAttemptsReachedError, LockFailedError } from '../lib/errors';
import { STATE_RELEASED_WITH_MESSAGE } from '../lib/constants';

// https://gist.github.com/jed/982883#gistcomment-852670
const uuid = () =>
  // eslint-disable-next-line no-bitwise, no-mixed-operators
  ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, a => (a ^ (crypto.randomBytes(1)[0] >> (a / 4))).toString(16));

test.beforeEach((t) => {
  const locker = oniyiLockerFactory();
  Object.assign(t.context, { locker });
});

test('factory returns object with "lock" and "unlock" methods', (t) => {
  const { locker } = t.context;
  const result = ['lock', 'unlock'].every(name => _.isFunction(locker[name]));
  t.true(result, 'locker instance does not have all expected methods');
});

test.cb('lock with valid key', (t) => {
  t.plan(4);
  const { locker } = t.context;
  const key = uuid();
  locker.lock({ key }, (lockErr, result) => {
    t.ifError(lockErr);
    t.true(_.isPlainObject(result));
    t.is(result.state, 'locked');
    t.truthy(result.token);
    t.end();
  });
});

test('lock with invalid key', async (t) => {
  const { locker } = t.context;
  const key = 1234;

  const promise = new Promise((resolve, reject) => locker.lock({ key }, reject));
  await t.throws(promise, InvalidParamsError);
});

test('can not double-acquire lock within expires time', async (t) => {
  const { locker } = t.context;
  const key = uuid();
  const expiresAfter = 10000;
  const maxWait = 1000;
  const promise = new Promise((resolve, reject) => locker.lock({ key, expiresAfter }, (firstLockErr) => {
    t.ifError(firstLockErr);

    locker.lock({ key, maxWait }, reject);
  }));

  await t.throws(promise, LockFailedError);
});

test('can not even double-acquire with max attempts', async (t) => {
  const { locker } = t.context;
  const key = uuid();
  const expiresAfter = 10000;
  const maxWait = 1000;
  const maxAttempts = 3;
  const promise = new Promise((resolve, reject) => locker.lock({ key, expiresAfter }, (firstLockErr) => {
    t.ifError(firstLockErr);

    locker.lock({ key, maxWait, maxAttempts }, reject);
  }));

  await t.throws(promise, MaxAttemptsReachedError);
});

test.cb('second lock can be acquired with multiple attempts after first is released', (t) => {
  const { locker } = t.context;
  const key = uuid();
  const expiresAfter = 10000;
  const maxWait = 3000;

  locker.lock({ key, expiresAfter }, (firstLockErr, firstResult) => {
    t.ifError(firstLockErr);

    const { token } = firstResult;
    locker.lock({ key, maxWait, reuseData: true }, (secondLockErr, secondResult) => {
      t.ifError(secondLockErr);
      t.true(secondResult && secondResult.state === STATE_RELEASED_WITH_MESSAGE);
      t.end();
    });

    // postpone unlocking by 500 ms
    setTimeout(() => {
      locker.unlock({ key, token }, _.noop);
    }, 500);
  });
});

test.cb('second lock receives data from unlock event', (t) => {
  const { locker } = t.context;
  const key = uuid();
  const expiresAfter = 10000;
  const maxWait = 1000;
  const message = { foo: 'bar' };

  locker.lock({ key, expiresAfter }, (firstLockErr, firstResult) => {
    t.ifError(firstLockErr);
    const { token } = firstResult;
    locker.lock({ key, maxWait, reuseData: true }, (secondLockErr, secondResult) => {
      t.ifError(secondLockErr);
      t.deepEqual(secondResult.message, message);
      t.end();
    });

    // postpone unlocking by 500 ms
    setTimeout(() => {
      locker.unlock({ key, token, message }, _.noop);
    }, 500);
  });
});

test('second lock times out while waiting to reuse data', async (t) => {
  const { locker } = t.context;
  const key = uuid();
  const expiresAfter = 10000;
  const maxWait = 1000;

  const promise = new Promise((resolve, reject) => locker.lock({ key, expiresAfter }, (firstLockErr) => {
    t.ifError(firstLockErr);

    locker.lock({ key, maxWait, reuseData: true }, reject);
  }));

  await t.throws(promise, LockTimeoutError);
});
