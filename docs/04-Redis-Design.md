# 04 — Redis Design

## 1. Current Role of Redis

Redis is used as the **primary datastore for the live inventory counter** — not as a cache in the traditional sense. It is the fast-path layer that absorbs the concurrency spike during a flash sale, sitting in front of MongoDB.

## 2. Current Implementation (Confirmed in Codebase)

- **Single hardcoded key:** `item:1:stock`. The `productId` field sent by clients is not actually used to look up a Redis key — meaning the system can only ever manage inventory for one product at a time.
- **Operations used:**
  - `SET` — via `/initialize`, admin sets the starting stock count.
  - `GET` — via `/current`, clients read the live stock count.
  - `DECRBY` — via `/reserve`, decrements stock by the requested quantity.
- **Reservation logic ("atomic" in name only):**
  1. Run `DECRBY` unconditionally.
  2. Check if the resulting value is negative.
  3. If negative, run a compensating `INCRBY` to restore the value, and return an "Out of Stock" error.

  This is **two separate Redis commands**, not one atomic operation. Under high concurrency, stock can transiently dip below zero (visible in monitoring) before the compensation step corrects it. It generally still prevents a *confirmed* oversell because the check happens before the order is persisted, but it is not a clean atomic guarantee.
- **No TTL / expiration:** there is no reservation-expiry mechanism. A reservation, once decremented, is permanent unless the order-creation step explicitly compensates it (see the data-loss risk in `03-Database-Design.md`).
- **No Lua scripting** of any kind is present, despite this being a headline feature of the vision document.
- **No rate limiting or idempotency keys** are implemented in Redis, despite being planned in the vision doc.

## 3. Why This Matters

The `DECRBY`-then-`INCRBY` pattern has a real race-condition weakness: between the decrement and the compensating increment, other requests can read a transiently-incorrect stock value (via `/current`), and under extreme concurrency, multiple requests could all decrement past zero before any of them run their compensation step. This doesn't necessarily cause an oversold *order* (since order creation still checks the reservation result), but it does undermine the accuracy of live stock display and could allow edge-case anomalies under very high load.

## 4. Recommended Design (Matches Original Vision — Not Yet Built)

A **Lua script** executed via `EVAL`/`EVALSHA` would make the check-and-decrement a single atomic server-side operation:

```lua
-- Pseudocode illustrating the intent, not a drop-in production script
local stock = tonumber(redis.call('GET', KEYS[1]))
if stock >= tonumber(ARGV[1]) then
    redis.call('DECRBY', KEYS[1], ARGV[1])
    return 1  -- reserved
else
    return 0  -- insufficient stock, no mutation happens
end
```

This removes the two-step race entirely because Redis executes Lua scripts single-threaded and atomically — no other command can interleave between the check and the decrement.

**Additional recommended additions (currently missing):**
- **Per-product keys** (e.g., `stock:{productId}`) instead of the single hardcoded key, to support more than one SKU.
- **TTL-based reservation holds** (e.g., `SETEX reservation:{orderId} 300 ...`) so that abandoned checkouts automatically release inventory instead of it being lost.
- **Idempotency keys** stored in Redis to reject duplicate reservation requests (e.g., from client retries).
- **Rate limiting** at the Gateway or Stock Service layer, keyed by user ID or IP.

## 5. Failure Handling (Current State)

There is no documented graceful-degradation path in the codebase for Redis unavailability — if Redis goes down, the Stock Service has no fallback, and reservation requests would fail. Building a fallback (e.g., routing directly to the database with reduced throughput) is a future enhancement, not a current capability.
