import { Router } from "express";
import { registerUser, loginUser, validateToken } from "../controllers/auth.controllers.js"

const router = Router();

router.route("/register").post(registerUser);
router.route("/login").post(loginUser);

router.route("/validate").post(validateToken);

export default router;