import mongoose, { Schema } from "mongoose";
import { AvailableOrderStatus, OrderStatusEnum } from "../utils/constants.js";

const orderSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    productId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    idempotencyKey: { type: String, required: true },
    reservationId: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: AvailableOrderStatus,
      default: OrderStatusEnum.PENDING,
      index: true,
    },
    cancellationRequested: { type: Boolean, default: false },
    terminalReason: { type: String, default: null },
    lastError: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    lockedUntil: { type: Date, default: new Date(0), index: true },
    leaseToken: { type: String, default: null },
    confirmedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true, optimisticConcurrency: true },
);

orderSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
orderSchema.index({ status: 1, nextAttemptAt: 1, lockedUntil: 1 });

export const Order = mongoose.model("Order", orderSchema);
