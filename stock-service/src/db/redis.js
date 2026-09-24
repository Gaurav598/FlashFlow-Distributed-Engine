import Redis from "ioredis";

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 1,
  connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 2000),
  commandTimeout: Number(process.env.REDIS_COMMAND_TIMEOUT_MS || 2000),
  enableOfflineQueue: false,
});

redis.on("connect", () => {
  console.log("Redis Connected (Stock Service)");
});

redis.on("error", (err) => {
  console.error("Redis Connection Error:", err);
});

export default redis;
