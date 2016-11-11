'use strict';

// node core modules
const util = require('util');

// 3rd party modules

// internal modules

function RedisClientMock() {}
RedisClientMock.prototype.defineCommand = function defineCommand() {};

function IORedisClientMock() {}
util.inherits(IORedisClientMock, RedisClientMock);

function IORedisClusterMock() {}
util.inherits(IORedisClusterMock, RedisClientMock);

exports = module.exports = IORedisClientMock;
exports.Cluster = IORedisClusterMock;
