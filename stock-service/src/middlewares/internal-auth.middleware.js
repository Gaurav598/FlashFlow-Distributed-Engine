import crypto from "node:crypto";
import { ApiError } from "../utils/api-error.js";

function safeEqual(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const credentials = {
  gateway: () => process.env.GATEWAY_SERVICE_SECRET,
  order: () => process.env.ORDER_SERVICE_SECRET,
};

export function requireService(...allowedServices) {
  return function serviceAuth(req, _res, next) {
    const service = req.get("x-service-name");
    const expected = credentials[service]?.();
    if (!allowedServices.includes(service)
      || !expected
      || !safeEqual(req.get("x-service-secret"), expected)) {
      return next(new ApiError(401, "Unauthorized service request"));
    }
    req.serviceIdentity = service;
    next();
  };
}
