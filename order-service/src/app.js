import express from "express";
import mongoose from "mongoose";
import orderRoutes from "./routes/order.routes.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.get("/health/live", (_req, res) => res.status(200).json({ status: "ok" }));
app.get("/health/ready", (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "unavailable" });
});
app.use("/api/v1/orders", orderRoutes);
app.use((_req, res) => res.status(404).json({ success: false, message: "Not found" }));
app.use((error, _req, res, _next) => {
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const message = status >= 500 ? "Internal service error" : error.message;
  if (status >= 500) console.error(error);
  res.status(status).json({ success: false, statusCode: status, message });
});

export { app };
