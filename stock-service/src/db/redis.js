import Redis from "ioredis";

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
});

redis.on("connect", () => {
  console.log("Redis Connected (Stock Service)");
});

redis.on("error", (err) => {
  console.error("Redis Connection Error:", err);
});

export default redis;