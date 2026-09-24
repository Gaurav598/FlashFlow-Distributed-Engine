import fetch from "node-fetch";
import { config } from "../config/config.js";
import { ApiError } from "./api-error.js";

export async function serviceRequest(url, { method = "GET", body, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({
      success: false,
      statusCode: response.status,
      message: "Invalid downstream response",
    }));
    return { status: response.status, data, headers: response.headers };
  } catch {
    throw new ApiError(503, "A required service is unavailable");
  } finally {
    clearTimeout(timer);
  }
}

export function trustedHeaders(user) {
  return {
    "x-service-name": "gateway",
    "x-service-secret": config.gatewayServiceSecret || "",
    "x-user-id": String(user.sub || user._id),
    "x-user-role": user.role || "user",
  };
}
