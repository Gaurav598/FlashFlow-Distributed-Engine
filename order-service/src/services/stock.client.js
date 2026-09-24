const baseUrl = process.env.STOCK_SERVICE_URL || "http://localhost:3002/api/v1/stock";
const timeoutMs = Number(process.env.STOCK_REQUEST_TIMEOUT_MS || 2000);

export class StockServiceError extends Error {
  constructor(message, { code = "STOCK_UNAVAILABLE", status = 503, data = null } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.data = data;
    this.retryable = status >= 500 || code === "STOCK_UNAVAILABLE";
  }
}

async function request(path, { method = "GET", body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-service-name": "order",
        "x-service-secret": process.env.ORDER_SERVICE_SECRET || "",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new StockServiceError("Inventory operation was rejected", {
        code: payload?.data?.code || "STOCK_REJECTED",
        status: response.status,
        data: payload?.data,
      });
    }
    return payload.data;
  } catch (error) {
    if (error instanceof StockServiceError) throw error;
    throw new StockServiceError("Inventory service is unavailable", {
      code: "STOCK_UNAVAILABLE",
      status: 503,
    });
  } finally {
    clearTimeout(timer);
  }
}

export const stockClient = {
  reserve(order) {
    return request("/reservations", {
      method: "POST",
      body: {
        productId: order.productId,
        quantity: order.quantity,
        reservationId: order.reservationId,
        idempotencyKey: order.idempotencyKey,
        userId: order.userId,
        leaseExpiresAt: order.lockedUntil.getTime(),
      },
    });
  },
  confirm(reservationId, orderId, leaseExpiresAt) {
    return request(`/reservations/${encodeURIComponent(reservationId)}/confirm`, {
      method: "POST",
      body: { orderId, leaseExpiresAt },
    });
  },
  release(reservationId, leaseExpiresAt) {
    return request(`/reservations/${encodeURIComponent(reservationId)}/release`, {
      method: "POST",
      body: { leaseExpiresAt },
    });
  },
  getReservation(reservationId) {
    return request(`/reservations/${encodeURIComponent(reservationId)}`);
  },
};
