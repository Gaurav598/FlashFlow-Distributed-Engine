import { AsyncHandler } from "../utils/async-handler.js";
import { config } from "../config/config.js";
import { serviceRequest } from "../utils/service-client.js";

const registerProxy = AsyncHandler(async (req, res) => {
  const response = await serviceRequest(`${config.authServiceUrl}/register`, {
    method: "POST",
    body: req.body,
  });
  return res.status(response.status).json(response.data);
});

const loginProxy = AsyncHandler(async (req, res) => {
  const response = await serviceRequest(`${config.authServiceUrl}/login`, {
    method: "POST",
    body: req.body,
  });
  const cookie = response.headers.get("set-cookie");
  if (cookie) res.setHeader("Set-Cookie", cookie);
  return res.status(response.status).json(response.data);
});

export { registerProxy, loginProxy };
