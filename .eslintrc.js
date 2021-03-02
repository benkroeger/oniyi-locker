'use strict';

// node core

// third-party

// internal

module.exports = {
  parserOptions: {
    sourceType: 'script',
    ecmaFeatures: {
      jsx: false,
    },
  },
  env: {
    jest: true,
    node: true,
  },
  extends: ['airbnb-base', 'plugin:prettier/recommended'],
  overrides: [
    {
      files: ['**/*.test.js'],
      parserOptions: {
        ecmaVersion: 2017,
        sourceType: 'module',
      },
      rules: {
        extends: 'plugin:ava/recommended',
        plugins: ['ava'],
        rules: {
          'import/no-extraneous-dependencies': [
            'error',
            { devDependencies: true },
          ],
        },
      },
    },
  ],
};
