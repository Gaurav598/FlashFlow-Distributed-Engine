import { AsyncHandler } from "../utils/async-handler.js";
import { config } from "../config/config.js";
import { serviceRequest, trustedHeaders } from "../utils/service-client.js";

const initializeStockProxy = AsyncHandler(async (req, res) => {
  const response = await serviceRequest(
    `${config.stockServiceUrl}/products/${encodeURIComponent(req.params.productId)}`,
    { method: "PUT", headers: trustedHeaders(req.user), body: req.body },
  );
  return res.status(response.status).json(response.data);
});

const getCurrentStockProxy = AsyncHandler(async (req, res) => {
  const response = await serviceRequest(
    `${config.stockServiceUrl}/products/${encodeURIComponent(req.params.productId)}`,
    { headers: trustedHeaders(req.user) },
  );
  return res.status(response.status).json(response.data);
});

const reconcileStockProxy = AsyncHandler(async (req, res) => {
  const productId = encodeURIComponent(req.params.productId);
  const durable = await serviceRequest(`${config.orderServiceUrl}/reconciliation/${productId}`, {
    headers: trustedHeaders(req.user),
  });
  if (durable.status !== 200) return res.status(durable.status).json(durable.data);
  const response = await serviceRequest(`${config.stockServiceUrl}/products/${productId}/reconcile`, {
    method: "POST",
    headers: trustedHeaders(req.user),
    body: {
      totalQuantity: req.body?.totalQuantity,
      soldQuantity: durable.data.data.confirmedSoldQuantity,
    },
  });
  return res.status(response.status).json(response.data);
});

export { initializeStockProxy, getCurrentStockProxy, reconcileStockProxy };
