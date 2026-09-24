import { Router } from "express";
import {
  cancelOrder,
  createOrder,
  getOrder,
  getReconciliationState,
  listOrders,
} from "../controllers/order.controllers.js";
import { requireGateway } from "../middlewares/internal-auth.middleware.js";

const router = Router();
router.use(requireGateway);
router.post("/", createOrder);
router.get("/", listOrders);
router.get("/reconciliation/:productId", getReconciliationState);
router.get("/:orderId", getOrder);
router.post("/:orderId/cancel", cancelOrder);

export default router;
