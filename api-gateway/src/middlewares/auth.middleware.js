import { ApiError } from "../utils/api-error.js";
import { AsyncHandler } from "../utils/async-handler.js";
import jwt from "jsonwebtoken";

export const verifyJWT = AsyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    throw new ApiError(401, "Unauthorized request");
  }

  // SECURITY: Strip any potentially spoofed internal trusted headers from external clients.
  // These headers are injected by the API Gateway and must never be accepted directly.
  delete req.headers["x-user-id"];
  delete req.headers["x-username"];

  try {
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, {
      algorithms: ["HS256"],
      issuer: process.env.JWT_ISSUER || "flashflow-auth",
      audience: process.env.JWT_AUDIENCE || "flashflow-api",
    });

    // Store decoded payload in req.user. Downstream controllers will propagate only needed minimal identity.
    req.user = decodedToken;

    next();
  } catch (error) {
    throw new ApiError(
      401,
      error?.message || "Invalid Access Token"
    );
  }
});

export function requireRole(role) {
  return function roleMiddleware(req, _res, next) {
    if (req.user?.role !== role) return next(new ApiError(403, "Forbidden"));
    next();
  };
}
