'use strict';
var assert = require('assert'),
	util = require('util');

var debug = require('debug'),
	_ = require('lodash'),
	makeRedisClient = require('make-redis-client');

// variables and functions
var moduleName = 'oniyi-locker';


var logError = debug(moduleName + ':error');
// set this namespace to log via console.error
logError.log = console.error.bind(console); // don't forget to bind to console!

var logWarn = debug(moduleName + ':warn');
// set all output to go via console.warn
logWarn.log = console.warn.bind(console);

var logDebug = debug(moduleName + ':debug');
// set all output to go via console.warn
logDebug.log = console.warn.bind(console);

function OniyiLocker(args) {
	var self = this;
	_.merge(self, {
		keyPrefix: 'oniyi-locker:',
		locksExpireAfter: 5000 // this is milliseconds
	}, _.pick(args, ['keyPrefix', 'locksExpireAfter', 'redisOptions']));

	assert(self.redisOptions, '.redisOptions must be defined');
	self.redisClient = makeRedisClient(self.redisOptions);
}

OniyiLocker.prototype.lock = function(args) {
	var self = this;

	if (!_.isFunction(args.callback)) {
		args.callback = _.noop;
	}
	if (!_.isString(args.key)) {
		return args.callback(new TypeError('args.key must be a string'));
	}

	if (!_.isNumber(args.expiresAfter)) {
		args.expiresAfter = self.locksExpireAfter;
	}

	var lockKey = self.keyPefix + args.key;

	var lockToken = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		var r = Math.random() * 16 | 0,
			v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});

	self.redisClient.set(lockKey, lockToken, 'PX', args.expiresAfter, 'NX', function(err, result) {
		if (err) {
			return args.callback(err, null);
		}
		if (result === null) {
			// lock is taken already

			logDebug('Lock for {%s} is taken already', args.key);

			// make a redis client and subscribe to lock release
			var client = makeRedisClient(self.redisOptions);

			var timeout = setTimeout(function() {
				logDebug('Waited %d milliseconds on lock release for %s, aborted', args.expiresAfter, args.key);
				client.unsubscribe();
				client.end();
				args.callback(null, {
					state: 'timeout',
					message: util.format('waited %d ms for lock on %s to be released', args.expiresAfter, args.key)
				});
			}, args.expiresAfter);

			// we assume that every message on this channel is an "unlock" message
			client.on('message', function(channel, data) {
				if (channel === lockKey) {
					clearTimeout(timeout);
					args.callback(null, data);
				}
			});

			return client.subscribe(lockKey);
		}

		logDebug('Aquired lock for {%s}, executing throttled request now', args.key);
		// pass the good news (incl. the unlock token) to our callback function
		return args.callback(null, {
			state: 'locked',
			token: lockToken
		});
	});
};

OniyiLocker.prototype.unlock = function(args) {
	var self = this;

	if (!_.isFunction(args.callback)) {
		args.callback = _.noop;
	}
	if (!_.isString(args.key)) {
		return args.callback(new TypeError('args.key must be a string'));
	}
	if (!_.isString(args.token)) {
		return args.callback(new TypeError('args.token must be a string'));
	}

	var lockKey = self.keyPefix + args.key;

	self.redisClient.get(lockKey, function(err, lockedValue) {
		if (err) {
			return args.callback(err, null);
		}
		if (lockedValue === args.token) {
			self.redisClient.del(lockKey, function(err, result) {
				if (err) {
					return args.callback(err, null);
				}
				if (result === 1) {
					self.redisClient.publish(lockKey, {
						state: args.message
					});
					return args.callback(null, 'unlocked');
				}
				return args.callback(new Error('No key was deleted'));
			});
		}
		return args.callback(new Error('token provided is not valid'));
	});
};

module.exports = OniyiLocker;