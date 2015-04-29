'use strict';
var assert = require('assert'),
	util = require('util');

var _ = require('lodash'),
	makeRedisClient = require('make-redis-client');

function OniyiLocker(args) {
	var self = this;
	_.merge(self, {
		keyPrefix: 'oniyi-locker:',
		locksExpireAfter: 5000 // this is milliseconds
	}, _.pick(args, ['keyPrefix', 'locksExpireAfter', 'redisOptions']));

	assert(self.redisOptions, '.redisOptions must be defined');
	self.redisClient = makeRedisClient(self.redisOptions);
}

// Debugging
OniyiLocker.debug = process.env.NODE_DEBUG && /\boniyi-locker\b/.test(process.env.NODE_DEBUG);

function debug() {
  if (OniyiLocker.debug) {
    console.error('OniyiLocker %s', util.format.apply(util, arguments));
  }
}

OniyiLocker.prototype.lock = function(args) {
	var self = this;

	if (!_.isFunction(args.callback)) {
		args.callback = _.noop;
	}
	if (_.isUndefined(args.key)) {
		return args.callback(new TypeError('args.key must be provided'));
	}

	if (!_.isNumber(args.expiresAfter)) {
		args.expiresAfter = self.locksExpireAfter;
	}

	var lockKey = self.keyPrefix + args.key;

	var unlockToken = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		var r = Math.random() * 16 | 0,
			v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});

	self.redisClient.set(lockKey, unlockToken, 'PX', args.expiresAfter, 'NX', function(err, result) {
		if (err) {
			return args.callback(err, null);
		}
		if (result === null) {
			// lock is taken already

			debug('Lock for {%s} is taken already', args.key);

			// make a redis client and subscribe to lock release
			var client = makeRedisClient(self.redisOptions);

			var timeout = setTimeout(function() {
				debug('Waited %d milliseconds on lock release for %s, aborted', args.expiresAfter, args.key);
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
					args.callback(null, JSON.parse(data));
				}
			});

			return client.subscribe(lockKey);
		}

		debug('assigned lock for {%s}', args.key);
		// pass the good news (incl. the unlock token) to our callback function
		return args.callback(null, {
			state: 'locked',
			token: unlockToken
		});
	});
};

OniyiLocker.prototype.unlock = function(args) {
	var self = this;

	if (!_.isFunction(args.callback)) {
		args.callback = _.noop;
	}
	if (_.isUndefined(args.key)) {
		return args.callback(new TypeError('args.key must be provided'));
	}
	if (!_.isString(args.token)) {
		return args.callback(new TypeError('args.token must be a string'));
	}

	var lockKey = self.keyPrefix + args.key;

	self.redisClient.get(lockKey, function(err, lockedValue) {
		if (err) {
			return args.callback(err, null);
		}
		if (lockedValue === args.token) {
			return self.redisClient.del(lockKey, function(err, result) {
				if (err) {
					return args.callback(err, null);
				}
				if (result === 1) {
					self.redisClient.publish(lockKey, JSON.stringify({
						state: args.message
					}));
					return args.callback(null, 'unlocked');
				}
				return args.callback(new Error('No key was deleted'));
			});
		}
		return args.callback(new Error('token provided is not valid'));
	});
};

module.exports = OniyiLocker;