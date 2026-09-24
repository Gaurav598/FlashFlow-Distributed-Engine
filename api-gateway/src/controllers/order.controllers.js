import { AsyncHandler } from "../utils/async-handler.js";
import { config } from "../config/config.js";
import { serviceRequest, trustedHeaders } from "../utils/service-client.js";

async function proxy(req, res, path, method = "GET") {
  const response = await serviceRequest(`${config.orderServiceUrl}${path}`, {
    method,
    headers: {
      ...trustedHeaders(req.user),
      ...(req.get("idempotency-key") ? { "idempotency-key": req.get("idempotency-key") } : {}),
    },
    body: method === "GET" ? undefined : req.body,
  });
  return res.status(response.status).json(response.data);
}

const createOrderProxy = AsyncHandler(async (req, res) => {
  const admission = await serviceRequest(`${config.stockServiceUrl}/admission/orders`, {
    method: "POST",
    headers: trustedHeaders(req.user),
    body: { userId: String(req.user.sub || req.user._id) },
  });
  if (admission.status !== 200) return res.status(admission.status).json(admission.data);
  return proxy(req, res, "/", "POST");
});
const listOrdersProxy = AsyncHandler((req, res) => proxy(req, res, "/"));
const getOrderProxy = AsyncHandler((req, res) => proxy(req, res, `/${encodeURIComponent(req.params.orderId)}`));
const cancelOrderProxy = AsyncHandler((req, res) => proxy(req, res,
  `/${encodeURIComponent(req.params.orderId)}/cancel`, "POST"));

export { cancelOrderProxy, createOrderProxy, getOrderProxy, listOrdersProxy };
