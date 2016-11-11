'use strict';

// node core modules
const util = require('util');

// 3rd party modules

// internal modules

// This error indicates that a lock couldn't be acquired (most likely because it is owned by someone else)
function LockFailedError(key) {
  Error.call(this);
  // captureStackTrace is V8-only (node, chrome)
  Error.captureStackTrace(this, LockFailedError);

  this.name = 'LockFailedError';
  this.message = `Failed to acquire lock for "${key}"`;
}

util.inherits(LockFailedError, Error);

module.exports = LockFailedError;
