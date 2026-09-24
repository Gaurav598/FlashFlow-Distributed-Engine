import mongoose from "mongoose";
import { Order } from "../models/order.model.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { AsyncHandler } from "../utils/async-handler.js";
import { OrderStatusEnum } from "../utils/constants.js";
import { processOrder } from "../services/order-saga.service.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function publicOrder(order) {
  return {
    id: String(order._id),
    productId: order.productId,
    quantity: order.quantity,
    status: order.status,
    terminalReason: order.terminalReason,
    lastError: order.status === OrderStatusEnum.PENDING || order.status === OrderStatusEnum.RESERVED
      ? order.lastError : undefined,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function responseStatus(order, created = false) {
  if (order.status === OrderStatusEnum.CONFIRMED) return created ? 201 : 200;
  if ([OrderStatusEnum.REJECTED, OrderStatusEnum.CANCELLED].includes(order.status)) return 409;
  return 202;
}

const createOrder = AsyncHandler(async (req, res) => {
  const userId = req.auth.userId;
  const { productId, quantity } = req.body || {};
  const key = req.get("idempotency-key");
  if (typeof productId !== "string" || !SAFE_ID.test(productId)) {
    throw new ApiError(400, "productId must be a safe identifier");
  }
  const maxQuantity = Number(process.env.MAX_ORDER_QUANTITY || 100);
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > maxQuantity) {
    throw new ApiError(400, `quantity must be an integer between 1 and ${maxQuantity}`);
  }
  if (typeof key !== "string" || !IDEMPOTENCY_KEY.test(key)) {
    throw new ApiError(400, "Idempotency-Key must be 8-128 safe characters");
  }

  let order;
  let created = false;
  try {
    const _id = new mongoose.Types.ObjectId();
    order = await Order.create({
      _id,
      userId,
      productId,
      quantity,
      idempotencyKey: key,
      reservationId: String(_id),
      status: OrderStatusEnum.PENDING,
    });
    created = true;
  } catch (error) {
    if (error?.code !== 11000) throw error;
    order = await Order.findOne({ userId, idempotencyKey: key });
    if (!order) throw error;
    if (order.productId !== productId || order.quantity !== quantity) {
      throw new ApiError(409, "Idempotency key was already used for a different request");
    }
  }

  if ([OrderStatusEnum.PENDING, OrderStatusEnum.RESERVED, OrderStatusEnum.CANCEL_PENDING].includes(order.status)) {
    order = await processOrder(order._id);
  }
  const status = responseStatus(order, created);
  return res.status(status).json(new ApiResponse(status, publicOrder(order), created ? "Order accepted" : "Existing order returned"));
});

const getOrder = AsyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.orderId)) throw new ApiError(400, "Invalid order id");
  const order = await Order.findOne({ _id: req.params.orderId, userId: req.auth.userId });
  if (!order) throw new ApiError(404, "Order not found");
  return res.status(200).json(new ApiResponse(200, publicOrder(order), "Order fetched"));
});

const listOrders = AsyncHandler(async (req, res) => {
  const orders = await Order.find({ userId: req.auth.userId }).sort({ createdAt: -1 }).limit(100);
  return res.status(200).json(new ApiResponse(200, orders.map(publicOrder), "Orders fetched"));
});

const cancelOrder = AsyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.orderId)) throw new ApiError(400, "Invalid order id");
  let order = await Order.findOneAndUpdate(
    {
      _id: req.params.orderId,
      userId: req.auth.userId,
      status: { $in: [OrderStatusEnum.PENDING, OrderStatusEnum.RESERVED, OrderStatusEnum.CANCEL_PENDING] },
    },
    { $set: { cancellationRequested: true, status: OrderStatusEnum.CANCEL_PENDING, nextAttemptAt: new Date() } },
    { new: true },
  );
  if (!order) {
    order = await Order.findOne({ _id: req.params.orderId, userId: req.auth.userId });
    if (!order) throw new ApiError(404, "Order not found");
    if (order.status === OrderStatusEnum.CONFIRMED) {
      throw new ApiError(409, "Confirmed orders cannot be cancelled by reservation release");
    }
    return res.status(200).json(new ApiResponse(200, publicOrder(order), "Order is already terminal"));
  }

  order = await processOrder(order._id);
  const status = order.status === OrderStatusEnum.CANCELLED ? 200 : 202;
  return res.status(status).json(new ApiResponse(status, publicOrder(order),
    status === 200 ? "Order cancelled" : "Cancellation pending"));
});

const getReconciliationState = AsyncHandler(async (req, res) => {
  if (req.auth.role !== "admin") throw new ApiError(403, "Forbidden");
  const productId = req.params.productId;
  if (typeof productId !== "string" || !SAFE_ID.test(productId)) {
    throw new ApiError(400, "productId must be a safe identifier");
  }
  const grouped = await Order.aggregate([
    { $match: { productId } },
    { $group: { _id: "$status", quantity: { $sum: "$quantity" }, orders: { $sum: 1 } } },
  ]);
  const byStatus = Object.fromEntries(grouped.map((row) => [row._id, {
    quantity: row.quantity,
    orders: row.orders,
  }]));
  return res.status(200).json(new ApiResponse(200, {
    productId,
    confirmedSoldQuantity: byStatus[OrderStatusEnum.CONFIRMED]?.quantity || 0,
    byStatus,
  }, "Durable order totals fetched"));
});

export { cancelOrder, createOrder, getOrder, getReconciliationState, listOrders };
