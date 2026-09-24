import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL || "http://localhost:3000/api/v1";
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminEmail || !adminPassword) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");

async function request(path, { method = "GET", token, body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { response, payload: await response.json() };
}

async function login(email, password) {
  const result = await request("/auth/login", { method: "POST", body: { email, password } });
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  return result.payload.data.accessToken;
}

async function waitForTerminal(token, id) {
  for (let i = 0; i < 100; i += 1) {
    const result = await request(`/orders/${id}`, { token });
    assert.equal(result.response.status, 200);
    if (["confirmed", "rejected", "cancelled"].includes(result.payload.data.status)) return result.payload.data;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Order ${id} did not become terminal`);
}

const suffix = Date.now();
const productId = `e2e-product-${suffix}`;
const password = "e2e-correct-password";
const users = [1, 2].map((number) => ({
  username: `e2e-user-${number}-${suffix}`,
  email: `e2e-user-${number}-${suffix}@example.com`,
  password,
}));

const adminToken = await login(adminEmail, adminPassword);
for (const user of users) {
  const registered = await request("/auth/register", { method: "POST", body: user });
  assert.equal(registered.response.status, 201, JSON.stringify(registered.payload));
}
const [userToken, otherToken] = await Promise.all(users.map((user) => login(user.email, user.password)));

const forged = await request("/orders", {
  method: "POST",
  headers: { "x-user-id": "forged", "Idempotency-Key": "forged-request" },
  body: { productId, quantity: 1 },
});
assert.equal(forged.response.status, 401);

const unauthorizedInit = await request(`/stock/products/${productId}`, {
  method: "PUT", token: userToken, body: { quantity: 2 },
});
assert.equal(unauthorizedInit.response.status, 403);

const initialized = await request(`/stock/products/${productId}`, {
  method: "PUT", token: adminToken, body: { quantity: 2 },
});
assert.equal(initialized.response.status, 200, JSON.stringify(initialized.payload));

const duplicateResponses = await Promise.all(Array.from({ length: 10 }, () => request("/orders", {
  method: "POST",
  token: userToken,
  headers: { "Idempotency-Key": "e2e-duplicate-0001" },
  body: { productId, quantity: 1 },
})));
assert.ok(duplicateResponses.every(({ response }) => [201, 202].includes(response.status)));
const duplicateIds = new Set(duplicateResponses.map(({ payload }) => payload.data.id));
assert.equal(duplicateIds.size, 1);
const firstOrder = await waitForTerminal(userToken, [...duplicateIds][0]);
assert.equal(firstOrder.status, "confirmed");

const second = await request("/orders", {
  method: "POST",
  token: userToken,
  headers: { "Idempotency-Key": "e2e-second-0002" },
  body: { productId, quantity: 1 },
});
assert.ok([201, 202].includes(second.response.status));
assert.equal((await waitForTerminal(userToken, second.payload.data.id)).status, "confirmed");

const soldOut = await request("/orders", {
  method: "POST",
  token: userToken,
  headers: { "Idempotency-Key": "e2e-soldout-0003" },
  body: { productId, quantity: 1 },
});
assert.ok([202, 409].includes(soldOut.response.status));
assert.equal((await waitForTerminal(userToken, soldOut.payload.data.id)).status, "rejected");

const crossUser = await request(`/orders/${firstOrder.id}`, { token: otherToken });
assert.equal(crossUser.response.status, 404);

const inventory = await request(`/stock/products/${productId}`, { token: adminToken });
assert.equal(inventory.response.status, 200);
assert.deepEqual(
  (({ initial, available, reserved, sold }) => ({ initial, available, reserved, sold }))(inventory.payload.data),
  { initial: 2, available: 0, reserved: 0, sold: 2 },
);

console.log(JSON.stringify({ productId, duplicateOrderId: firstOrder.id, inventory: inventory.payload.data }, null, 2));
