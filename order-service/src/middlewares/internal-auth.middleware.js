import crypto from "node:crypto";
import { ApiError } from "../utils/api-error.js";

function safeEqual(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function requireGateway(req, _res, next) {
  const userId = req.get("x-user-id");
  const valid = req.get("x-service-name") === "gateway"
    && safeEqual(req.get("x-service-secret"), process.env.GATEWAY_SERVICE_SECRET);
  if (!valid || !userId) return next(new ApiError(401, "Unauthorized service request"));
  req.auth = { userId, role: req.get("x-user-role") || "user" };
  next();
}
