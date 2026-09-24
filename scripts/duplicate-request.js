const baseUrl = process.env.BASE_URL || "http://localhost:3000/api/v1";
const token = process.env.USER_TOKEN;
if (!token) throw new Error("USER_TOKEN is required");

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "Idempotency-Key": process.env.IDEMPOTENCY_KEY || "duplicate-demo-0001",
};
const body = JSON.stringify({ productId: process.env.PRODUCT_ID || "phone-1", quantity: 1 });
const responses = await Promise.all(Array.from({ length: 25 }, () => fetch(`${baseUrl}/orders`, {
  method: "POST",
  headers,
  body,
})));
const payloads = await Promise.all(responses.map((response) => response.json()));
const ids = new Set(payloads.map((payload) => payload?.data?.id).filter(Boolean));
console.log(JSON.stringify({ statuses: responses.map((response) => response.status), orderIds: [...ids] }, null, 2));
if (ids.size !== 1) process.exitCode = 1;
