// This error indicates that some parameters are invalid

'use strict';

// node core modules
const util = require('util');

// 3rd party modules

// internal modules

function InvalidParamsError(name, expected, actual) {
  Error.call(this);
  // captureStackTrace is V8-only (node, chrome)
  Error.captureStackTrace(this, InvalidParamsError);

  this.name = 'InvalidParamsError';
  this.message = `invalid parameter "${name}"! expected: "${expected}", actual: "${actual}"`;
}

util.inherits(InvalidParamsError, Error);

module.exports = InvalidParamsError;
