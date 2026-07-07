import { Router } from "express";
import { initializeStockProxy, getCurrentStockProxy } from "../controllers/stock.controllers.js";

const router = Router();

router.route("/initialize").post(initializeStockProxy);
router.route("/current").get(getCurrentStockProxy);

export default router;