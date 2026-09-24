const ADMISSION_SCRIPT = `
local global_count = tonumber(redis.call('GET', KEYS[1]) or '0')
local user_count = tonumber(redis.call('GET', KEYS[2]) or '0')
local global_limit = tonumber(ARGV[1])
local user_limit = tonumber(ARGV[2])
local window_ms = tonumber(ARGV[3])

if global_count >= global_limit then
  return cjson.encode({admitted=false, reason='GLOBAL_LIMIT', retryAfterMs=redis.call('PTTL', KEYS[1])})
end
if user_count >= user_limit then
  return cjson.encode({admitted=false, reason='USER_LIMIT', retryAfterMs=redis.call('PTTL', KEYS[2])})
end

global_count = redis.call('INCR', KEYS[1])
user_count = redis.call('INCR', KEYS[2])
if global_count == 1 then redis.call('PEXPIRE', KEYS[1], window_ms) end
if user_count == 1 then redis.call('PEXPIRE', KEYS[2], window_ms) end
return cjson.encode({admitted=true, globalCount=global_count, userCount=user_count})
`;

export function createAdmissionService(redis, options = {}) {
  const windowMs = options.windowMs ?? Number(process.env.ADMISSION_WINDOW_MS || 1000);
  const globalLimit = options.globalLimit ?? Number(process.env.ADMISSION_GLOBAL_LIMIT || 500);
  const userLimit = options.userLimit ?? Number(process.env.ADMISSION_USER_LIMIT || 10);

  return {
    async admit(userId) {
      const bucket = Math.floor(Date.now() / windowMs);
      const raw = await redis.eval(
        ADMISSION_SCRIPT,
        2,
        `ff:admission:global:${bucket}`,
        `ff:admission:user:${userId}:${bucket}`,
        globalLimit,
        userLimit,
        windowMs,
      );
      return JSON.parse(raw);
    },
  };
}
