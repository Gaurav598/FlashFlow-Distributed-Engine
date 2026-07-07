import { Router } from "express";
import { createOrderProxy } from "../controllers/order.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/create").post(verifyJWT, createOrderProxy); 

export default router;