'use strict';

import crypto from 'crypto';
import test from 'ava';
import _ from 'lodash';
import oniyiLockerFactory from '../lib';
import { InvalidParamsError, LockTimeoutError, MaxAttemptsReachedError, LockFailedError } from '../lib/errors';

// https://gist.github.com/jed/982883#gistcomment-852670
function uuid() {
  /* eslint-disable no-bitwise, no-mixed-operators */
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11)
    .replace(/[018]/g, a => (a ^ crypto.randomBytes(1)[0] >> a / 4).toString(16));
  /* eslint-enable */
}

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

test.cb('lock with invalid key', (t) => {
  const { locker } = t.context;
  const key = 1234;

  locker.lock({ key }, (lockErr) => {
    t.throws(Promise.reject(lockErr), InvalidParamsError);
    t.end();
  });
});

test.cb('can not double-acquire lock within expires time', (t) => {
  const { locker } = t.context;
  const key = uuid();
  const expiresAfter = 10000;
  const maxWait = 1000;
  locker.lock({ key, expiresAfter }, (firstLockErr) => {
    if (firstLockErr) {
      t.fail('failed to acquire first lock');
      t.end();
      return;
    }

    locker.lock({ key, maxWait }, (secondLockErr) => {
      t.throws(Promise.reject(secondLockErr), LockFailedError);
      t.end();
    });
  });
});

test.cb('can not even double-acquire with max attempts', (t) => {
  const { locker } = t.context;
  const key = uuid();
  const expiresAfter = 10000;
  const maxWait = 1000;
  const maxAttempts = 3;
  locker.lock({ key, expiresAfter }, (firstLockErr) => {
    if (firstLockErr) {
      t.fail('failed to acquire first lock');
      t.end();
      return;
    }

    locker.lock({ key, maxWait, maxAttempts }, (secondLockErr) => {
      t.throws(Promise.reject(secondLockErr), MaxAttemptsReachedError);
      t.end();
    });
  });
});

test.cb('second lock receives data from unlock event', (t) => {
  const { locker } = t.context;
  const key = uuid();
  const expiresAfter = 10000;
  const maxWait = 1000;
  const message = { foo: 'bar' };

  locker.lock({ key, expiresAfter }, (firstLockErr, firstResult) => {
    const { token } = firstResult;
    locker.lock({ key, maxWait, reuseData: true }, (secondLockErr, secondResult) => {
      t.deepEqual(secondResult.message, message);
      t.end();
    });

    // postpone unlocking by 500 ms
    setTimeout(() => { locker.unlock({ key, token, message }, _.noop); }, 500);
  });
});

test.cb('second lock times out while waiting to reuse data', (t) => {
  const { locker } = t.context;
  const key = uuid();
  const expiresAfter = 10000;
  const maxWait = 1000;

  locker.lock({ key, expiresAfter }, (firstLockErr) => {
    if (firstLockErr) {
      t.fail('failed to acquire first lock');
      t.end();
      return;
    }

    locker.lock({ key, maxWait, reuseData: true }, (secondLockErr) => {
      t.throws(Promise.reject(secondLockErr), LockTimeoutError);
      t.end();
    });
  });
});
