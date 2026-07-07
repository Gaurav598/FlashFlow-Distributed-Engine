import { Router } from "express";
import { createOrder } from "../controllers/order.controllers.js";

const router = Router();

router.route("/create").post(createOrder);

export default router;
