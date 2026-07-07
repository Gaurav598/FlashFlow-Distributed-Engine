import express from "express";
import cors from "cors";
import orderRoutes from "./routes/order.routes.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.use("/api/v1/orders", orderRoutes);

export { app };
