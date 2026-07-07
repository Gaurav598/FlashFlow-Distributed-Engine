import { AsyncHandler } from "../utils/async-handler.js";
import { config } from "../config/config.js";
import fetch from "node-fetch";

const registerProxy = AsyncHandler(async (req, res) => {
  const response = await fetch(`${config.authServiceUrl}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req.body),
  });

  const data = await response.json();
  return res.status(response.status).json(data);
});

const loginProxy = AsyncHandler(async (req, res) => {
  const response = await fetch(`${config.authServiceUrl}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req.body),
  });

  const cookie = response.headers.get("set-cookie");

  if (cookie) {
    res.setHeader("Set-Cookie", cookie);
  }

  const data = await response.json();
  return res.status(response.status).json(data);
});

export { registerProxy, loginProxy };
