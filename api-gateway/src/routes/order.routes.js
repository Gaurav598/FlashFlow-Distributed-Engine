import { Router } from "express";
import {
  cancelOrderProxy,
  createOrderProxy,
  getOrderProxy,
  listOrdersProxy,
} from "../controllers/order.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();
router.use(verifyJWT);
router.post("/", createOrderProxy);
router.post("/create", createOrderProxy);
router.get("/", listOrdersProxy);
router.get("/:orderId", getOrderProxy);
router.post("/:orderId/cancel", cancelOrderProxy);

export default router;
