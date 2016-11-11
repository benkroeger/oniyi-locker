'use strict';

// node core modules
const util = require('util');

// 3rd party modules

// internal modules

// This error indicates that some parameters are invalid
function LockTimeoutError(key, expiresAfter) {
  Error.call(this);
  // captureStackTrace is V8-only (node, chrome)
  Error.captureStackTrace(this, LockTimeoutError);

  this.name = 'LockTimeoutError';
  this.message = `Failed to acquire lock for "${key}" within ${expiresAfter}ms`;
}

util.inherits(LockTimeoutError, Error);

module.exports = LockTimeoutError;
