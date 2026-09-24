import { Router } from "express";
import { registerUser, loginUser, validateToken } from "../controllers/auth.controllers.js"
import { requireGateway } from "../middlewares/internal-auth.middleware.js";

const router = Router();

router.route("/register").post(registerUser);
router.route("/login").post(loginUser);

router.route("/validate").post(requireGateway, validateToken);

export default router;
