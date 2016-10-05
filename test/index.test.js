'use strict';

import test from 'ava';
import _ from 'lodash';
import oniyiLockerFactory from '../lib';

test('factory returns object', (t) => {
  const locker = oniyiLockerFactory();
  t.truthy(_.isPlainObject(locker), 'locker instance is not a plain object');
});

/* eslint-disable ava/no-todo-test */
test.todo('lock with invalid key');
test.todo('lock an already locked resource');
test.todo('lock subscribes to `unlock` event and calls callback with error after timeout');
test.todo('lock calls callback with message');
test.todo('apply timeout');
test.todo('publish message on unlock');
/* eslint-enable ava/no-todo-test */
