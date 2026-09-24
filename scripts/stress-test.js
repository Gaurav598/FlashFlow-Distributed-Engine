import http from "k6/http";
import exec from "k6/execution";
import { check } from "k6";
import { Counter } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://localhost:3000/api/v1";
const productId = __ENV.PRODUCT_ID || "k6-phone";
const stock = Number(__ENV.STOCK || 100);

const confirmed = new Counter("orders_confirmed");
const pending = new Counter("orders_pending");
const rejected = new Counter("orders_rejected");
const rateLimited = new Counter("orders_rate_limited");
const unexpected = new Counter("orders_unexpected");

export const options = {
  scenarios: {
    flash_sale: {
      executor: "shared-iterations",
      vus: Number(__ENV.VUS || 100),
      iterations: Number(__ENV.ITERATIONS || 1000),
      maxDuration: __ENV.MAX_DURATION || "2m",
    },
  },
  thresholds: {
    orders_unexpected: ["count==0"],
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<1500"],
  },
};

function jsonHeaders(token, extra = {}) {
  return { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...extra } };
}

function login(email, password) {
  const response = http.post(`${baseUrl}/auth/login`, JSON.stringify({ email, password }), {
    headers: { "Content-Type": "application/json" },
  });
  if (response.status !== 200) throw new Error(`Login failed for ${email}: ${response.status}`);
  return response.json("data.accessToken");
}

export function setup() {
  const adminEmail = __ENV.ADMIN_EMAIL;
  const adminPassword = __ENV.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
  const adminToken = login(adminEmail, adminPassword);
  const runProductId = `${productId}-${Date.now()}`;
  const initialized = http.put(`${baseUrl}/stock/products/${runProductId}`,
    JSON.stringify({ quantity: stock }), jsonHeaders(adminToken));
  if (initialized.status !== 200) throw new Error(`Stock initialization failed: ${initialized.status}`);

  const userEmail = __ENV.USER_EMAIL || "k6-buyer@flashflow.local";
  const userPassword = __ENV.USER_PASSWORD || "k6-correct-password";
  http.post(`${baseUrl}/auth/register`, JSON.stringify({
    username: __ENV.USERNAME || "k6-buyer",
    email: userEmail,
    password: userPassword,
  }), { headers: { "Content-Type": "application/json" } });
  return { userToken: login(userEmail, userPassword), adminToken, productId: runProductId };
}

export default function (data) {
  const key = `k6-${exec.scenario.iterationInTest}`;
  const params = jsonHeaders(data.userToken, { "Idempotency-Key": key });
  params.responseCallback = http.expectedStatuses(201, 202, 409, 429);
  const response = http.post(`${baseUrl}/orders`, JSON.stringify({ productId: data.productId, quantity: 1 }), params);
  const status = response.json("data.status");
  if (status === "confirmed") confirmed.add(1);
  else if (["pending", "reserved", "cancel_pending"].includes(status)) pending.add(1);
  else if (status === "rejected") rejected.add(1);
  else if (response.status === 429) rateLimited.add(1);
  else unexpected.add(1);
  check(response, {
    "documented order outcome": (r) => [201, 202, 409, 429].includes(r.status),
  });
}

export function teardown(data) {
  const finalStock = http.get(`${baseUrl}/stock/products/${data.productId}`, jsonHeaders(data.adminToken));
  console.log(`FINAL_INVENTORY ${finalStock.body}`);
}
