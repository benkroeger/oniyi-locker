'use strict';

// node core modules
const fs = require('fs');

// 3rd party modules
const _ = require('lodash');
const Redis = require('ioredis');

// internal modules
const logger = require('./logger');
const { InvalidParamsError } = require('./errors');

const parityDeleteLua = fs.readFileSync('./lua/parity-delete.lua', { encoding: 'utf8', flag: 'r' });

// add lua scripts to redis client
// https://github.com/luin/ioredis#lua-scripting
function defineLua(client) {
  client.defineCommand('parityDelete', {
    numberOfKeys: 1,
    lua: parityDeleteLua,
  });
}


function makeClusterClient(startupNodes, clusterOptions, redisOptions) {
  const options = _.defaults({}, clusterOptions, { redisOptions });
  return new Redis.Cluster(startupNodes, options);
}

function makeStandaloneClient(redisOptions) {
  return new Redis(redisOptions);
}

function makeRedisClient(params) {
  const redisOptions = _.omit(params, ['cluster']);
  let client;

  if (params.cluster && _.isPlainObject(params.cluster)) {
    const { cluster: { startupNodes } } = params;

    // fail if we don't get valid `startupNodes`
    if (!Array.isArray(startupNodes)) {
      throw new InvalidParamsError('.redis.cluster.startupNodes', 'Array', typeof startupNodes);
    }

    // https://github.com/luin/ioredis#cluster
    const validClusterOptions = [
      'clusterRetryStrategy',
      'enableOfflineQueue',
      'enableReadyCheck',
      'scaleReads',
      'maxRedirections',
      'retryDelayOnFailover',
      'retryDelayOnClusterDown',
      'retryDelayOnTryAgain',
    ];

    // compile clusterOptions
    // 1. start with empty object literal
    // 2. use params.cluster but pick only valid options
    // 3. add `params` but with omitted `cluster` param
    const clusterOptions = _.pick(params.cluster, validClusterOptions);

    logger.debug('creating redis cluster client with startupNodes "%j", clusterOptions "%j" and redisOptions "%j"',
      startupNodes,
      clusterOptions,
      redisOptions
    );

    client = makeClusterClient(startupNodes, clusterOptions, redisOptions);
  } else {
    logger.debug('creating redis standalone client with options "%j"', redisOptions);
    client = makeStandaloneClient(redisOptions);
  }

  defineLua(client);

  return client;
}

module.exports = makeRedisClient;
