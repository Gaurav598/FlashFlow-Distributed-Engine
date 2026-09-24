import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import Redis from "ioredis";
import { createInventoryService } from "../src/services/inventory.service.js";

let redis;
let redisProcess;
let redisDir;
let port;

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const selected = server.address().port;
      server.close(() => resolve(selected));
    });
  });
}

async function waitForRedis(client) {
  for (let i = 0; i < 100; i += 1) {
    try {
      if (await client.ping() === "PONG") return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Redis did not start");
}

before(async () => {
  port = await freePort();
  redisDir = await mkdtemp(path.join(os.tmpdir(), "flashflow-redis-test-"));
  redisProcess = spawn("redis-server", [
    "--bind", "127.0.0.1",
    "--port", String(port),
    "--dir", redisDir,
    "--save", "",
    "--appendonly", "no",
  ], { stdio: "ignore" });
  redis = new Redis(port, "127.0.0.1", {
    maxRetriesPerRequest: 20,
    retryStrategy: () => 20,
  });
  redis.on("error", () => {});
  await waitForRedis(redis);
});

beforeEach(async () => redis.flushdb());

after(async () => {
  await redis?.quit().catch(() => {});
  if (redisProcess) {
    redisProcess.kill("SIGTERM");
    await new Promise((resolve) => redisProcess.once("exit", resolve));
  }
  if (redisDir) await rm(redisDir, { recursive: true, force: true });
});

async function contend({ buyers, stock, productId }) {
  const inventory = createInventoryService(redis);
  await inventory.initialize(productId, stock);
  const results = await Promise.all(Array.from({ length: buyers }, (_, index) => inventory.reserve({
    productId,
    quantity: 1,
    reservationId: `${productId}-reservation-${index}`,
    idempotencyKey: `${productId}-request-${index}`,
    userId: `buyer-${index}`,
  })));
  const winners = results.filter((result) => result.code === "RESERVED");
  await Promise.all(winners.map((result, index) => inventory.confirm(result.reservationId, `order-${index}`)));
  return { inventory, results, state: await inventory.getInventory(productId) };
}

test("100 concurrent buyers competing for 10 units cannot oversell", async () => {
  const { results, state } = await contend({ buyers: 100, stock: 10, productId: "phone-100" });
  assert.equal(results.filter((result) => result.code === "RESERVED").length, 10);
  assert.deepEqual(state, { ...state, initial: 10, available: 0, reserved: 0, sold: 10 });
});

test("1,000 concurrent buyers competing for 100 units cannot oversell", async () => {
  const { results, state } = await contend({ buyers: 1000, stock: 100, productId: "phone-1000" });
  assert.equal(results.filter((result) => result.code === "RESERVED").length, 100);
  assert.equal(state.sold, 100);
  assert.equal(state.initial, state.available + state.reserved + state.sold);
});

test("simultaneous reservations are isolated across products", async () => {
  const [a, b] = await Promise.all([
    contend({ buyers: 80, stock: 13, productId: "sku-a" }),
    contend({ buyers: 70, stock: 7, productId: "sku-b" }),
  ]);
  assert.equal(a.state.sold, 13);
  assert.equal(b.state.sold, 7);
});

test("duplicate idempotency requests reserve once and conflicting payloads are rejected", async () => {
  const inventory = createInventoryService(redis);
  await inventory.initialize("duplicate-sku", 5);
  const request = {
    productId: "duplicate-sku",
    quantity: 2,
    reservationId: "reservation-original",
    idempotencyKey: "same-request-key",
    userId: "buyer-duplicate",
  };
  const results = await Promise.all(Array.from({ length: 50 }, (_, index) => inventory.reserve({
    ...request,
    reservationId: `reservation-${index}`,
  })));
  assert.equal(results.filter((result) => result.code === "RESERVED").length, 1);
  assert.equal(results.filter((result) => result.code === "DUPLICATE").length, 49);
  const conflict = await inventory.reserve({ ...request, reservationId: "conflict", quantity: 1 });
  assert.equal(conflict.code, "IDEMPOTENCY_CONFLICT");
  const state = await inventory.getInventory("duplicate-sku");
  assert.equal(state.available, 3);
  assert.equal(state.reserved, 2);
});

test("invalid quantities never mutate inventory", async () => {
  const inventory = createInventoryService(redis);
  await inventory.initialize("invalid-quantity", 4);
  for (const [index, quantity] of [0, -1, 1.5].entries()) {
    const result = await inventory.reserve({
      productId: "invalid-quantity",
      quantity,
      reservationId: `invalid-${index}`,
      idempotencyKey: `invalid-key-${index}`,
      userId: "buyer-invalid",
    });
    assert.equal(result.code, "INVALID_QUANTITY");
  }
  const state = await inventory.getInventory("invalid-quantity");
  assert.equal(state.available, 4);
  assert.equal(state.reserved, 0);
});

test("expired reservations release exactly once and cannot be committed", async () => {
  let clock = 1_000;
  const inventory = createInventoryService(redis, { reservationTtlMs: 100, now: () => clock });
  await inventory.initialize("expiring-sku", 1);
  await inventory.reserve({
    productId: "expiring-sku",
    quantity: 1,
    reservationId: "expires-once",
    idempotencyKey: "expires-request",
    userId: "buyer-expiry",
  });
  clock = 1_100;
  const confirmation = await inventory.confirm("expires-once", "late-order");
  const release = await inventory.release("expires-once");
  assert.equal(confirmation.code, "RESERVATION_EXPIRED");
  assert.equal(release.code, "EXPIRED");
  const state = await inventory.getInventory("expiring-sku");
  assert.equal(state.available, 1);
  assert.equal(state.reserved, 0);
  assert.equal(state.sold, 0);
});

test("simultaneous confirmation and cancellation has one consistent winner", async () => {
  const inventory = createInventoryService(redis);
  for (let i = 0; i < 50; i += 1) {
    const productId = `race-sku-${i}`;
    const reservationId = `race-reservation-${i}`;
    await inventory.initialize(productId, 1);
    await inventory.reserve({
      productId,
      quantity: 1,
      reservationId,
      idempotencyKey: `race-request-${i}`,
      userId: `race-user-${i}`,
    });
    await Promise.allSettled([
      inventory.confirm(reservationId, `race-order-${i}`),
      inventory.release(reservationId),
    ]);
    const reservation = await inventory.getReservation(reservationId);
    const state = await inventory.getInventory(productId);
    assert.ok(["COMMITTED", "RELEASED"].includes(reservation.state));
    assert.equal(state.reserved, 0);
    assert.equal(state.initial, state.available + state.sold);
  }
});

test("confirmation retries are idempotent and never double-count sold inventory", async () => {
  const inventory = createInventoryService(redis);
  await inventory.initialize("confirm-twice", 2);
  await inventory.reserve({
    productId: "confirm-twice",
    quantity: 1,
    reservationId: "confirm-twice-reservation",
    idempotencyKey: "confirm-twice-request",
    userId: "confirm-twice-user",
  });
  const [first, second] = await Promise.all([
    inventory.confirm("confirm-twice-reservation", "confirm-twice-order"),
    inventory.confirm("confirm-twice-reservation", "confirm-twice-order"),
  ]);
  assert.equal(first.code, "COMMITTED");
  assert.equal(second.code, "COMMITTED");
  const state = await inventory.getInventory("confirm-twice");
  assert.equal(state.sold, 1);
  assert.equal(state.available, 1);
  assert.equal(state.reserved, 0);
});

test("cancellation retries are idempotent and never create inventory", async () => {
  const inventory = createInventoryService(redis);
  await inventory.initialize("release-twice", 1);
  await inventory.reserve({
    productId: "release-twice",
    quantity: 1,
    reservationId: "release-twice-reservation",
    idempotencyKey: "release-twice-request",
    userId: "release-twice-user",
  });
  const releases = await Promise.all(Array.from({ length: 20 }, () =>
    inventory.release("release-twice-reservation")));
  assert.ok(releases.every((result) => result.code === "RELEASED"));
  const state = await inventory.getInventory("release-twice");
  assert.equal(state.available, 1);
  assert.equal(state.reserved, 0);
  assert.equal(state.sold, 0);
});

test("an expired worker lease cannot mutate reservation state", async () => {
  let clock = 10_000;
  const inventory = createInventoryService(redis, { now: () => clock });
  await inventory.initialize("fenced-worker", 1);
  const staleReserve = await inventory.reserve({
    productId: "fenced-worker",
    quantity: 1,
    reservationId: "stale-reservation",
    idempotencyKey: "stale-worker-request",
    userId: "stale-worker-user",
    leaseExpiresAt: 9_999,
  });
  assert.equal(staleReserve.code, "STALE_LEASE");
  const state = await inventory.getInventory("fenced-worker");
  assert.equal(state.available, 1);
  assert.equal(state.reserved, 0);
});
