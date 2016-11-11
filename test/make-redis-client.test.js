'use strict';

import test from 'ava';
import mockery from 'mockery';

test.before('prepare mockery for ioredis', () => {
  mockery.enable({
    useCleanCache: true,
    warnOnReplace: true,
    warnOnUnregistered: false,
  });
  // mockery.registerAllowables(['util', 'lodash', 'oniyi-logger']);

  // use mockery to overload dependency `ioredis` with our mock from the fixtures folder
  mockery.registerSubstitute('ioredis', require.resolve('./fixtures/ioredis-mock'));
});

test.after('disable mockery', () => {
  mockery.disable();
});

test('make ioredis standalone client', (t) => {
  const ioredisMock = require('./fixtures/ioredis-mock');
  const makeRedisClient = require('../lib/make-redis-client');

  const client = makeRedisClient({});
  t.true(client instanceof ioredisMock, 'client is not instance of basic ioredis client');
});

test('make ioredis cluster client', (t) => {
  const ioredisMock = require('./fixtures/ioredis-mock');
  const makeRedisClient = require('../lib/make-redis-client');

  const startupNodes = [];
  const cluster = {
    startupNodes,
  };

  const client = makeRedisClient({
    cluster,
  });

  t.true(client instanceof ioredisMock.Cluster, 'client is not instance of cluster ioredis client');
});

/* eslint-disable ava/no-todo-test */
test.todo('extend client with lua script');
/* eslint-enable ava/no-todo-test */
