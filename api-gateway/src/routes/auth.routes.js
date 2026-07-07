import { Router } from "express";
import { registerProxy, loginProxy } from "../controllers/auth.controllers.js";

const router = Router();

router.route("/register").post(registerProxy);
router.route("/login").post(loginProxy);

export default router;