import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.routes.js";
import orderRoutes from "./routes/order.routes.js";
import stockRoutes from "./routes/stock.routes.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors());

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/stock", stockRoutes);

export { app };