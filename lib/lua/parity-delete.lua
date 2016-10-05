--
-- https://github.com/TheDeveloper/warlock/blob/master/lib/lua/parityDel.lua
-- https://www.npmjs.com/package/redislock#implementation
-- Delete a key if content is equal
--
-- KEYS[1]   - key
-- KEYS[2]   - content
local key     = KEYS[1]
local content = ARGV[1]

local value = redis.call('get', key)

if value == content then
  return redis.call('del', key);
end

return 0