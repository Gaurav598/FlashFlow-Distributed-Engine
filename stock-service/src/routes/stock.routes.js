import { Router } from "express";
import {
  confirmReservation,
  getCurrentStock,
  getReservation,
  initializeStock,
  reconcileStock,
  releaseReservation,
  requestOrderAdmission,
  reserveStock,
} from "../controllers/stock.controllers.js";
import { requireService } from "../middlewares/internal-auth.middleware.js";

const router = Router();

const gatewayOnly = requireService("gateway");
const orderOnly = requireService("order");
router.post("/admission/orders", gatewayOnly, requestOrderAdmission);
router.put("/products/:productId", gatewayOnly, initializeStock);
router.post("/products/:productId/reconcile", gatewayOnly, reconcileStock);
router.get("/products/:productId", gatewayOnly, getCurrentStock);
router.post("/reservations", orderOnly, reserveStock);
router.get("/reservations/:reservationId", orderOnly, getReservation);
router.post("/reservations/:reservationId/confirm", orderOnly, confirmReservation);
router.post("/reservations/:reservationId/release", orderOnly, releaseReservation);

export default router;
