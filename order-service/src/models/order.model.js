import mongoose, { Schema } from "mongoose";
import { AvailableOrderStatus, OrderStatusEnum } from "../utils/constants.js";

const orderSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    productId: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: AvailableOrderStatus,
      default: OrderStatusEnum.PENDING,
    },
  },
  { timestamps: true },
);

export const Order = mongoose.model("Order", orderSchema);
