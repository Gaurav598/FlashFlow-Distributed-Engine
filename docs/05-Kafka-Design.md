# 05 — Kafka / Event-Driven Design

## ⚠️ Status: Not Implemented

This is the most important callout in the whole documentation set: **Kafka does not exist anywhere in the current FlashFlow codebase.** The original vision document (`Project.md`) describes an extensive Kafka-based event system, but the engineering audit confirms this was never built — the system is entirely synchronous HTTP today. This document exists so the *intended* design is captured accurately, clearly labeled as aspirational, for whoever picks up this work next.

## 1. Why the Vision Document Wanted Kafka

The stated goal was to decouple the fast, latency-sensitive reservation path from slower downstream work (payment processing, notifications, database persistence) — so that a slow consumer doesn't block a fast producer, and so failures downstream don't affect the customer-facing reservation flow.

## 2. Proposed Topics (From Vision Doc — Not Built)

| Topic | Purpose |
|---|---|
| `sale-created` | Announce a new flash sale |
| `reservation-created` | A stock hold was made |
| `reservation-expired` | A TTL-based hold expired without payment |
| `inventory-released` | Stock returned to the pool after expiry/cancellation |
| `payment-requested` | Checkout initiated |
| `payment-success` / `payment-failed` | Payment gateway result |
| `order-created` / `order-confirmed` | Order lifecycle events |
| `analytics-events` | Business metrics stream |

## 3. Proposed Consumer Groups (From Vision Doc — Not Built)

Independent consumer groups per domain (Reservations, Orders, Inventory, Analytics, Notifications), allowing each concern to scale and fail independently, with Dead Letter Queues (DLQs) and retry policies for transient failures.

## 4. What Would Actually Need to Change to Build This

Since the current Order Service calls Stock Service synchronously and immediately writes to MongoDB, introducing Kafka is a genuine architectural rewrite, not an incremental patch:

1. **Reservation path stays fast:** Order Service would reserve stock in Redis (ideally via the Lua script from `04-Redis-Design.md`), then *publish* a `reservation-created` event instead of directly writing to MongoDB.
2. **A new consumer** (part of the Order domain) would subscribe to that topic and perform the actual MongoDB write asynchronously.
3. **Failure handling changes:** if the MongoDB write fails, the event stays in Kafka and can be retried or dead-lettered — this is what actually solves the "stock decremented but order never saved" data-loss bug identified in the current codebase (see `01-Architecture-Analysis.md`, §4, Order Service).
4. **Client experience changes:** the client would need to either poll an order-status endpoint or receive a WebSocket push once the async write completes, since the response is no longer synchronous end-to-end.

## 5. Trade-offs to Be Aware Of

- **Added operational complexity:** running and monitoring a Kafka cluster (or a managed equivalent) is nontrivial compared to the current all-HTTP setup.
- **Eventual consistency:** the client no longer gets an instant "your order is saved" confirmation — UX needs to account for a short async window.
- **Still need idempotency:** consumers must handle at-least-once delivery correctly (duplicate event processing) to avoid double-charging inventory.

## 6. Recommendation

Given the current codebase's actual size (4 simple services) and the audit's identification of the Auth Service DB lookup as the *bigger* immediate bottleneck, a phased approach makes more sense than jumping straight to Kafka:

1. First, fix JWT validation to be truly stateless (verify signature only, no DB hit) — cheap, high impact.
2. Second, fix the Redis atomicity issue with a Lua script — cheap, closes a real correctness gap.
3. Only then, if scale genuinely requires decoupling the order-write path, introduce Kafka (or a lighter-weight alternative like Redis Streams or a managed queue) for the reservation → order-persistence handoff.

See `07-Future-Roadmap.md` for how this fits into the overall enhancement sequence.
