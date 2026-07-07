import { AsyncHandler } from "../utils/async-handler.js";
import { config } from "../config/config.js";
import fetch from "node-fetch";

const initializeStockProxy = AsyncHandler(async (req, res) => {
    const response = await fetch(`${config.stockServiceUrl}/initialize`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(req.body)
    });

    const data = await response.json();
    return res.status(response.status).json(data);
});

const getCurrentStockProxy = AsyncHandler(async (req, res) => {
    const response = await fetch(`${config.stockServiceUrl}/current`, {
        method: "GET"
    });

    const data = await response.json();
    return res.status(response.status).json(data);
});

export { initializeStockProxy, getCurrentStockProxy };
