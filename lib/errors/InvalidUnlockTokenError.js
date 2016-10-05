// This error indicates that the provided unlock token was invalid

'use strict';

// node core modules
const util = require('util');

// 3rd party modules

// internal modules

function InvalidUnlockTokenError(key, token) {
  Error.call(this);
  // captureStackTrace is V8-only (node, chrome)
  Error.captureStackTrace(this, InvalidUnlockTokenError);

  this.name = 'InvalidUnlockTokenError';
  this.message = `token "${token}" is not valid to unlock key "${key}"`;
}

util.inherits(InvalidUnlockTokenError, Error);

module.exports = InvalidUnlockTokenError;
