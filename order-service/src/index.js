import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "./db/index.js";
import { app } from "./app.js";
import { Order } from "./models/order.model.js";
import { processNextDueOrder } from "./services/order-saga.service.js";

const PORT = process.env.PORT || 3003;
if (!process.env.GATEWAY_SERVICE_SECRET || process.env.GATEWAY_SERVICE_SECRET.length < 32
  || !process.env.ORDER_SERVICE_SECRET || process.env.ORDER_SERVICE_SECRET.length < 32) {
  throw new Error("GATEWAY_SERVICE_SECRET and ORDER_SERVICE_SECRET must be at least 32 characters");
}
if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
if (process.env.NODE_ENV === "production" && !process.env.STOCK_SERVICE_URL) {
  throw new Error("STOCK_SERVICE_URL is required in production");
}

await connectDB();
await Order.init();

const server = app.listen(PORT, () => {
  console.log(`Order Service running on port: ${PORT}`);
});

let recoveryRunning = false;
const recoveryTimer = setInterval(async () => {
  if (recoveryRunning) return;
  recoveryRunning = true;
  try {
    for (let i = 0; i < 100; i += 1) {
      const processed = await processNextDueOrder();
      if (!processed) break;
    }
  } catch (error) {
    console.error("Order recovery sweep failed:", error.message);
  } finally {
    recoveryRunning = false;
  }
}, Number(process.env.ORDER_RECOVERY_INTERVAL_MS || 1000));
recoveryTimer.unref();

async function shutdown(signal) {
  console.log(`${signal} received; draining Order Service`);
  clearInterval(recoveryTimer);
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
