import redis from "../db/redis.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { AsyncHandler } from "../utils/async-handler.js";
import { createInventoryService } from "../services/inventory.service.js";
import { createAdmissionService } from "../services/admission.service.js";

const inventory = createInventoryService(redis, {
  reservationTtlMs: Number(process.env.RESERVATION_TTL_MS || 120_000),
});
const admission = createAdmissionService(redis);

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function requireSafeId(value, field) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new ApiError(400, `${field} must be a safe identifier`);
  }
  return value;
}

function requireQuantity(value, { allowZero = false } = {}) {
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new ApiError(400, `quantity must be an integer greater than or equal to ${minimum}`);
  }
  return value;
}

const initializeStock = AsyncHandler(async (req, res) => {
  const productId = requireSafeId(req.params.productId, "productId");
  const quantity = requireQuantity(req.body?.quantity, { allowZero: true });
  const result = await inventory.initialize(productId, quantity);

  if (result.code === "QUANTITY_BELOW_ALLOCATED") {
    throw new ApiError(409, "quantity cannot be lower than reserved plus sold inventory");
  }

  return res.status(200).json(new ApiResponse(200, result, "Inventory initialized"));
});

const getCurrentStock = AsyncHandler(async (req, res) => {
  const productId = requireSafeId(req.params.productId, "productId");
  const stock = await inventory.getInventory(productId);
  if (!stock) throw new ApiError(404, "Product inventory not found");
  return res.status(200).json(new ApiResponse(200, stock, "Inventory fetched"));
});

const reconcileStock = AsyncHandler(async (req, res) => {
  const productId = requireSafeId(req.params.productId, "productId");
  const totalQuantity = requireQuantity(req.body?.totalQuantity, { allowZero: true });
  const soldQuantity = requireQuantity(req.body?.soldQuantity, { allowZero: true });
  const result = await inventory.reconcile(productId, totalQuantity, soldQuantity);
  if (result.code === "INVENTORY_EXISTS") {
    throw new ApiError(409, "Reconciliation is only allowed when inventory is missing");
  }
  if (result.code !== "RECONCILED") throw new ApiError(400, "Invalid reconciliation values");
  return res.status(200).json(new ApiResponse(200, result, "Inventory reconciled"));
});

const reserveStock = AsyncHandler(async (req, res) => {
  const productId = requireSafeId(req.body?.productId, "productId");
  const reservationId = requireSafeId(req.body?.reservationId, "reservationId");
  const userId = requireSafeId(req.body?.userId, "userId");
  const quantity = requireQuantity(req.body?.quantity);
  const leaseExpiresAt = req.body?.leaseExpiresAt;
  if (!Number.isSafeInteger(leaseExpiresAt)) throw new ApiError(400, "leaseExpiresAt is required");
  const key = req.body?.idempotencyKey;
  if (typeof key !== "string" || !IDEMPOTENCY_KEY.test(key)) {
    throw new ApiError(400, "idempotencyKey must be 8-128 safe characters");
  }

  const result = await inventory.reserve({
    productId,
    reservationId,
    userId,
    quantity,
    idempotencyKey: key,
    leaseExpiresAt,
  });

  const statusByCode = {
    PRODUCT_NOT_FOUND: 404,
    OUT_OF_STOCK: 409,
    IDEMPOTENCY_CONFLICT: 409,
    IDEMPOTENCY_ORPHANED: 409,
    RESERVATION_ID_CONFLICT: 409,
  };
  const status = statusByCode[result.code] || 200;
  if (status !== 200) {
    return res.status(status).json(new ApiResponse(status, result, result.code));
  }
  const successStatus = result.code === "RESERVED" ? 201 : 200;
  return res.status(successStatus).json(new ApiResponse(successStatus, result, result.code));
});

const confirmReservation = AsyncHandler(async (req, res) => {
  const reservationId = requireSafeId(req.params.reservationId, "reservationId");
  const orderId = requireSafeId(req.body?.orderId, "orderId");
  const leaseExpiresAt = req.body?.leaseExpiresAt;
  if (!Number.isSafeInteger(leaseExpiresAt)) throw new ApiError(400, "leaseExpiresAt is required");
  const result = await inventory.confirm(reservationId, orderId, leaseExpiresAt);
  const status = result.code === "COMMITTED" ? 200
    : result.code === "RESERVATION_NOT_FOUND" ? 404 : 409;
  return res.status(status).json(new ApiResponse(status, result, result.code));
});

const releaseReservation = AsyncHandler(async (req, res) => {
  const reservationId = requireSafeId(req.params.reservationId, "reservationId");
  const leaseExpiresAt = req.body?.leaseExpiresAt;
  if (!Number.isSafeInteger(leaseExpiresAt)) throw new ApiError(400, "leaseExpiresAt is required");
  const result = await inventory.release(reservationId, "RELEASED", leaseExpiresAt);
  const status = ["RELEASED", "EXPIRED"].includes(result.code) ? 200
    : result.code === "RESERVATION_NOT_FOUND" ? 404 : 409;
  return res.status(status).json(new ApiResponse(status, result, result.code));
});

const getReservation = AsyncHandler(async (req, res) => {
  const reservationId = requireSafeId(req.params.reservationId, "reservationId");
  const reservation = await inventory.getReservation(reservationId);
  if (!reservation) throw new ApiError(404, "Reservation not found");
  return res.status(200).json(new ApiResponse(200, reservation, "Reservation fetched"));
});

const requestOrderAdmission = AsyncHandler(async (req, res) => {
  const userId = requireSafeId(req.body?.userId, "userId");
  const result = await admission.admit(userId);
  if (!result.admitted) {
    const retryAfterMs = Math.max(1, Number(result.retryAfterMs) || 1000);
    res.set("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
    return res.status(429).json(new ApiResponse(429, result, "Admission limit reached"));
  }
  return res.status(200).json(new ApiResponse(200, result, "Request admitted"));
});

export {
  confirmReservation,
  getCurrentStock,
  getReservation,
  initializeStock,
  inventory,
  reconcileStock,
  releaseReservation,
  requestOrderAdmission,
  reserveStock,
};
