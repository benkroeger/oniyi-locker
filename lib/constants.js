'use strict';

// node core modules

// 3rd party modules

// internal modules

module.exports = {
  STATE_LOCKED: 'locked',
  STATE_UNLOCKED: 'unlocked',
  STATE_RELEASED_WITH_MESSAGE: 'released-with-message',
  FACTORY_PARAMS_WHITELIST: [
    'locksExpireAfter',
    'reuseData',
    'maxWait',
    'maxAttempts',
    'redis',
  ],
};
