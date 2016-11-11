'use strict';

// node core modules
const util = require('util');

// 3rd party modules

// internal modules

// This error indicates that the maximum number of attempts to acquire a lock for a key has been reached
function MaxAttemptsReachedError(key, maxAttempts) {
  Error.call(this);
  // captureStackTrace is V8-only (node, chrome)
  Error.captureStackTrace(this, MaxAttemptsReachedError);

  this.name = 'MaxAttemptsReachedError';
  this.message = `reached max attempts (${maxAttempts}) to acquire lock for "${key}"`;
}

util.inherits(MaxAttemptsReachedError, Error);

module.exports = MaxAttemptsReachedError;
