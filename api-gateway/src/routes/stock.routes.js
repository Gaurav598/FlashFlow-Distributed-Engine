import { Router } from "express";
import {
  getCurrentStockProxy,
  initializeStockProxy,
  reconcileStockProxy,
} from "../controllers/stock.controllers.js";
import { requireRole, verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();
router.use(verifyJWT);
router.put("/products/:productId", requireRole("admin"), initializeStockProxy);
router.post("/products/:productId/reconcile", requireRole("admin"), reconcileStockProxy);
router.get("/products/:productId", getCurrentStockProxy);

export default router;
