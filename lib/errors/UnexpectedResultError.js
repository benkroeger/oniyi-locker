'use strict';

// node core modules
const util = require('util');

// 3rd party modules

// internal modules

// This error indicates that the provided unlock token was invalid
function UnexpectedResultError(expected, result) {
  Error.call(this);
  // captureStackTrace is V8-only (node, chrome)
  Error.captureStackTrace(this, UnexpectedResultError);

  this.name = 'UnexpectedResultError';
  if (Array.isArray(expected)) {
    this.message = `expected redis command result to be one of "${expected.join(' ')}"! received "${result}" instead`;
  } else {
    this.message = `expected redis command result to be "${expected}"! received "${result}" instead`;
  }
}

util.inherits(UnexpectedResultError, Error);

module.exports = UnexpectedResultError;
