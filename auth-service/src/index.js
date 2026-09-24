import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "./db/index.js";
import { app } from "./app.js";
import { bootstrapAdmin } from "./services/admin-bootstrap.service.js";

if (!process.env.ACCESS_TOKEN_SECRET || process.env.ACCESS_TOKEN_SECRET.length < 32) {
  throw new Error("ACCESS_TOKEN_SECRET of at least 32 characters is required");
}
if (!process.env.GATEWAY_SERVICE_SECRET || process.env.GATEWAY_SERVICE_SECRET.length < 32) {
  throw new Error("GATEWAY_SERVICE_SECRET of at least 32 characters is required");
}

await connectDB();
await bootstrapAdmin();
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => console.log(`Auth Service running on port : ${PORT}`));

function shutdown(signal) {
  console.log(`${signal} received; draining Auth Service`);
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
