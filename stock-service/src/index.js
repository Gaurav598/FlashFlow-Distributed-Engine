import "dotenv/config";
import { app } from "./app.js";
import redis from "./db/redis.js";
import { inventory } from "./controllers/stock.controllers.js";

const PORT = process.env.PORT || 3002;
if (!process.env.GATEWAY_SERVICE_SECRET || process.env.GATEWAY_SERVICE_SECRET.length < 32
  || !process.env.ORDER_SERVICE_SECRET || process.env.ORDER_SERVICE_SECRET.length < 32) {
  throw new Error("GATEWAY_SERVICE_SECRET and ORDER_SERVICE_SECRET must be at least 32 characters");
}
if (process.env.NODE_ENV === "production" && (!process.env.REDIS_HOST || !process.env.REDIS_PASSWORD)) {
  throw new Error("REDIS_HOST and REDIS_PASSWORD are required in production");
}
const intervalMs = Number(process.env.EXPIRY_SWEEP_INTERVAL_MS || 1000);
const server = app.listen(PORT, () => {
  console.log(`Stock Service running on port : ${PORT}`);
});

const expiryTimer = setInterval(async () => {
  try {
    let result;
    do {
      result = await inventory.expireDue(100);
    } while (result.processed === 100);
  } catch (error) {
    console.error("Reservation expiry sweep failed:", error.message);
  }
}, intervalMs);
expiryTimer.unref();

async function shutdown(signal) {
  console.log(`${signal} received; draining Stock Service`);
  clearInterval(expiryTimer);
  server.close(async () => {
    await redis.quit().catch(() => redis.disconnect());
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
