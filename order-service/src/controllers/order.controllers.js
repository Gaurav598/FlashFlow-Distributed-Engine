import { Order } from "../models/order.model.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { AsyncHandler } from "../utils/async-handler.js";
import { AvailableOrderStatus, OrderStatusEnum } from "../utils/constants.js";
import fetch from "node-fetch";

const stockServiceUrl =
  process.env.STOCK_SERVICE_URL || "http://localhost:3002/api/v1/stock";

const createOrder = AsyncHandler(async (req, res) => {
  const userId = req.headers["x-user-id"] || "quest_123";
  const { productId, quantity } = req.body;

  const qty = quantity || 1;
  const pId = productId || "item:1";

  try {
    const stockResponse = await fetch(`${stockServiceUrl}/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: pId, quantity: qty }),
    });

    if (!stockResponse.ok) {
      throw new ApiError(400, "stock reservation failed");
    }
  } catch (error) {
    console.error(
      "Stock Service Error:",
      error.response?.data || error.message,
    );
    throw new ApiError(
      400,
      "Order Failed: Out of Stock or Service Unavailable",
    );
  }

  const order = await Order.create({
    userId,
    productId: pId,
    quantity: qty,
    status: OrderStatusEnum.CONFIRMED,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, order, "Order placed successfully"));
});

export { createOrder };
