import dotenv from "dotenv";
dotenv.config();

const _config = {
    port: process.env.PORT || 3000,
    corsOrigin: process.env.CORS_ORIGIN || "*",
    
    authServiceUrl: process.env.AUTH_SERVICE_URL || "http://localhost:3001/api/v1/auth",
    stockServiceUrl: process.env.STOCK_SERVICE_URL || "http://localhost:3002/api/v1/stock",
    orderServiceUrl: process.env.ORDER_SERVICE_URL || "http://localhost:3003/api/v1/orders",
};

export const config = Object.freeze(_config);