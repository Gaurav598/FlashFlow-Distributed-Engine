import { AsyncHandler } from "../utils/async-handler.js";
import { config } from "../config/config.js";
import fetch from "node-fetch";

const createOrderProxy = AsyncHandler(async (req, res) => {
  const response = await fetch(`${config.orderServiceUrl}/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": req.user._id,
    },
    body: JSON.stringify(req.body),
  });

  const data = await response.json();
  return res.status(response.status).json(data);
});

export { createOrderProxy };
