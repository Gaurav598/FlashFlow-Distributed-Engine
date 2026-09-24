import "dotenv/config";
import { app } from "./app.js";
import { config } from "./config/config.js";

if (!config.jwtSecret || config.jwtSecret.length < 32
  || !config.gatewayServiceSecret || config.gatewayServiceSecret.length < 32) {
  throw new Error("ACCESS_TOKEN_SECRET and GATEWAY_SERVICE_SECRET must be at least 32 characters");
}

const server = app.listen(config.port, () => {
  console.log(`API Gateway running on port : ${config.port}`);
});

function shutdown(signal) {
  console.log(`${signal} received; draining API Gateway`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
