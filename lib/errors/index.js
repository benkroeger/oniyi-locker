'use strict';

// node core modules

// 3rd party modules

// internal modules

module.exports = [
  'InvalidParamsError',
  'InvalidUnlockTokenError',
  'UnexpectedResultError',
].reduce((result, name) => {
  Object.assign(result, {
    [name]: require(`./${name}`), // eslint-disable-line global-require
  });
  return result;
}, {});