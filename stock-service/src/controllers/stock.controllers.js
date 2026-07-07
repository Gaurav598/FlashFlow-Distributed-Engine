import redis from "../db/redis.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { AsyncHandler } from "../utils/async-handler.js";

const ITEM_KEY = "item:1:stock";

const initializeStock = AsyncHandler(async (req, res) => {
  const { quantity } = req.body;

  if (!quantity || quantity < 0) {
    throw new ApiError(400, "Invalid stock quantity");
  }

  await redis.set(ITEM_KEY, quantity);

  return res
    .status(200)
    .json(new ApiResponse(200, { quantity }, `Stock initialized to ${quantity}`));
});

const getCurrentStock = AsyncHandler(async (req, res) => {
  const stock = await redis.get(ITEM_KEY);
  
  return res
    .status(200)
    .json(new ApiResponse(200, { stock: parseInt(stock) || 0 }, "Current stock fetched"));
});

const reserveStock = AsyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const quantityToReserve = quantity || 1;

  const newStock = await redis.decrby(ITEM_KEY, quantityToReserve);

  if (newStock < 0) {
    await redis.incrby(ITEM_KEY, quantityToReserve);
    
    throw new ApiError(400, "Out of Stock! Reservation failed.");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200, 
        { remainingStock: newStock, reserved: quantityToReserve }, 
        "Stock reserved successfully"
      )
    );
});

export { initializeStock, getCurrentStock, reserveStock };