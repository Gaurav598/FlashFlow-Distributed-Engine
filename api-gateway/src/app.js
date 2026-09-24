import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config/config.js";
import authRoutes from "./routes/auth.routes.js";
import orderRoutes from "./routes/order.routes.js";
import stockRoutes from "./routes/stock.routes.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());
app.use(cors({
  origin: config.corsOrigin === "*" ? false : config.corsOrigin.split(","),
  credentials: true,
}));
app.use((req, _res, next) => {
  delete req.headers["x-user-id"];
  delete req.headers["x-user-role"];
  delete req.headers["x-service-name"];
  delete req.headers["x-service-secret"];
  next();
});
app.get("/health/live", (_req, res) => res.status(200).json({ status: "ok" }));
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/stock", stockRoutes);
app.use((_req, res) => res.status(404).json({ success: false, message: "Not found" }));
app.use((error, _req, res, _next) => {
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const message = status >= 500 ? "Gateway error" : error.message;
  if (status >= 500) console.error(error);
  res.status(status).json({ success: false, statusCode: status, message });
});

export { app };
