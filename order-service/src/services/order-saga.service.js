import { randomUUID } from "node:crypto";
import { Order } from "../models/order.model.js";
import { OrderStatusEnum } from "../utils/constants.js";
import { StockServiceError, stockClient } from "./stock.client.js";

const RECOVERABLE = [
  OrderStatusEnum.PENDING,
  OrderStatusEnum.RESERVED,
  OrderStatusEnum.CANCEL_PENDING,
];
const leaseMs = Number(process.env.ORDER_LEASE_MS || 10_000);

function retryDelay(attempts) {
  return Math.min(30_000, 250 * (2 ** Math.min(attempts, 7)));
}

function ownership(order) {
  return {
    _id: order._id,
    leaseToken: order.leaseToken,
    lockedUntil: { $gt: new Date() },
  };
}

async function ownedUpdate(order, update) {
  const updated = await Order.findOneAndUpdate(ownership(order), update, { new: true });
  return updated || Order.findById(order._id);
}

async function updateTerminal(order, status, fields = {}) {
  return ownedUpdate(order, {
    $set: {
      status,
      lockedUntil: new Date(0),
      leaseToken: null,
      nextAttemptAt: new Date(0),
      lastError: null,
      ...fields,
    },
  });
}

async function scheduleRetry(order, error) {
  const safeMessage = error instanceof StockServiceError
    ? `${error.code}: ${error.message}`
    : "Unexpected order processing error";
  return ownedUpdate(order, {
    $set: {
      lockedUntil: new Date(0),
      leaseToken: null,
      lastError: safeMessage,
      nextAttemptAt: new Date(Date.now() + retryDelay(order.attempts)),
    },
  });
}

async function finishCancellation(order) {
  try {
    const result = await stockClient.release(order.reservationId, order.lockedUntil.getTime());
    if (["RELEASED", "EXPIRED"].includes(result.code)) {
      return updateTerminal(order, OrderStatusEnum.CANCELLED, {
        terminalReason: result.code,
        cancelledAt: new Date(),
      });
    }
    return scheduleRetry(order, new Error("Unknown release result"));
  } catch (error) {
    if (error instanceof StockServiceError && error.code === "RESERVATION_NOT_FOUND") {
      return updateTerminal(order, OrderStatusEnum.CANCELLED, {
        terminalReason: "CANCELLED_BEFORE_RESERVATION",
        cancelledAt: new Date(),
      });
    }
    if (error instanceof StockServiceError && error.code === "ALREADY_COMMITTED") {
      return updateTerminal(order, OrderStatusEnum.CONFIRMED, {
        terminalReason: null,
        confirmedAt: new Date(),
      });
    }
    return scheduleRetry(order, error);
  }
}

async function execute(order) {
  if (order.cancellationRequested || order.status === OrderStatusEnum.CANCEL_PENDING) {
    return finishCancellation(order);
  }

  let reservation;
  try {
    reservation = await stockClient.reserve(order);
  } catch (error) {
    if (error instanceof StockServiceError && [
      "OUT_OF_STOCK",
      "PRODUCT_NOT_FOUND",
      "IDEMPOTENCY_CONFLICT",
      "RESERVATION_ID_CONFLICT",
    ].includes(error.code)) {
      return updateTerminal(order, OrderStatusEnum.REJECTED, {
        terminalReason: error.code,
      });
    }
    return scheduleRetry(order, error);
  }

  if (["RELEASED", "EXPIRED"].includes(reservation.state)) {
    return updateTerminal(order, OrderStatusEnum.REJECTED, {
      terminalReason: `RESERVATION_${reservation.state}`,
    });
  }
  if (reservation.state === "COMMITTED") {
    return updateTerminal(order, OrderStatusEnum.CONFIRMED, { confirmedAt: new Date() });
  }

  order = await ownedUpdate(order, {
    $set: { status: OrderStatusEnum.RESERVED },
  });
  if (!order?.leaseToken) return order;

  const fresh = await Order.findOne(ownership(order));
  if (!fresh) return Order.findById(order._id);
  if (fresh.cancellationRequested) return finishCancellation(fresh);

  try {
    const confirmation = await stockClient.confirm(
      fresh.reservationId,
      String(fresh._id),
      fresh.lockedUntil.getTime(),
    );
    if (confirmation.code === "COMMITTED") {
      return updateTerminal(fresh, OrderStatusEnum.CONFIRMED, { confirmedAt: new Date() });
    }
    return scheduleRetry(fresh, new Error("Unknown confirmation result"));
  } catch (error) {
    if (error instanceof StockServiceError && [
      "RESERVATION_TERMINAL",
      "RESERVATION_EXPIRED",
    ].includes(error.code)) {
      const current = await Order.findById(fresh._id);
      const cancelled = current?.cancellationRequested;
      return updateTerminal(
        fresh,
        cancelled ? OrderStatusEnum.CANCELLED : OrderStatusEnum.REJECTED,
        {
          terminalReason: error.data?.state || error.code,
          ...(cancelled ? { cancelledAt: new Date() } : {}),
        },
      );
    }
    return scheduleRetry(fresh, error);
  }
}

function leaseUpdate(now) {
  return {
    $set: {
      lockedUntil: new Date(now.getTime() + leaseMs),
      leaseToken: randomUUID(),
    },
    $inc: { attempts: 1 },
  };
}

export async function processOrder(orderId) {
  const now = new Date();
  const leased = await Order.findOneAndUpdate(
    { _id: orderId, status: { $in: RECOVERABLE }, lockedUntil: { $lte: now } },
    leaseUpdate(now),
    { new: true },
  );
  if (!leased) return Order.findById(orderId);
  return execute(leased);
}

export async function processNextDueOrder() {
  const now = new Date();
  const leased = await Order.findOneAndUpdate(
    {
      status: { $in: RECOVERABLE },
      nextAttemptAt: { $lte: now },
      lockedUntil: { $lte: now },
    },
    leaseUpdate(now),
    { new: true, sort: { nextAttemptAt: 1 } },
  );
  if (!leased) return null;
  return execute(leased);
}
