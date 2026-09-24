import express from "express";
import stockRoutes from "./routes/stock.routes.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.get("/health/live", (_req, res) => res.status(200).json({ status: "ok" }));
app.get("/health/ready", async (_req, res) => {
  try {
    const { default: redis } = await import("./db/redis.js");
    await redis.ping();
    res.status(200).json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});
app.use("/api/v1/stock", stockRoutes);
app.use((_req, res) => res.status(404).json({ success: false, message: "Not found" }));
app.use((error, _req, res, _next) => {
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const message = status >= 500 ? "Internal service error" : error.message;
  if (status >= 500) console.error(error);
  res.status(status).json({ success: false, statusCode: status, message });
});

export { app };
