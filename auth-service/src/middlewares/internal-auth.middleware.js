import crypto from "node:crypto";
import { ApiError } from "../utils/api-error.js";

export function requireGateway(req, _res, next) {
  const provided = req.get("x-service-secret") || "";
  const expected = process.env.GATEWAY_SERVICE_SECRET || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (req.get("x-service-name") !== "gateway"
    || !expected
    || a.length !== b.length
    || !crypto.timingSafeEqual(a, b)) {
    return next(new ApiError(401, "Unauthorized service request"));
  }
  next();
}
