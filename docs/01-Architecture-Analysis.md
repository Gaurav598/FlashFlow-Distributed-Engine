# 01 — Architecture Analysis

> **Scope of this document:** This is a factual audit of the FlashFlow codebase as it actually exists, based on the engineering analysis report. It intentionally separates **what is built** from **what is documented/aspirational** in `Project.md`, since there is a significant gap between the two.

---

## 1. Executive Summary

**What FlashFlow is:** A distributed, microservices-based backend system designed to handle flash sales and inventory reservations for a limited-stock item ("The 1,000 iPhone Problem" — 10,000 concurrent users competing for 1,000 units).

**Business problem:** During flash sales, demand vastly exceeds supply. The system needs to process massive concurrent traffic while preventing overselling.

**Engineering problem:** Traditional monolithic architectures collapse under concurrent load due to CPU-bound bottlenecks (e.g., bcrypt password hashing) blocking unrelated request paths. FlashFlow's actual solution is service isolation via microservices + Kubernetes horizontal scaling, plus Redis for fast inventory counters.

**Real-world analogues:** Sneaker drops, concert ticket sales, flagship phone launches.

**Architecture maturity: Low-to-Medium.** The system uses microservices and Kubernetes to isolate workloads and scale horizontally, but it does **not** contain the enterprise features described in `Project.md` (Kafka, Lua scripts, Dead Letter Queues, two-phase commits, PostgreSQL). It is a basic synchronous microservices implementation, and it is susceptible to distributed transaction failures.

---

## 2. System Vision vs. Actual Scope

| | Project.md (Vision) | Actual Codebase (Analysis) |
|---|---|---|
| Database | PostgreSQL | MongoDB |
| Messaging | Kafka (10 topics, consumer groups, DLQs) | None — synchronous HTTP only |
| Redis usage | Lua scripts, atomic check-and-decrement, TTL reservations | Plain `DECRBY`/`INCRBY`, no TTL, single hardcoded key |
| Pricing | Rule-based dynamic pricing engine | Not implemented |
| Locking | Optimistic + Pessimistic DB locking | Not implemented |
| Auth | Stateless JWT | JWT exists, but validated via a DB lookup on every request (not stateless in practice) |
| Concurrency safety | Guaranteed zero overselling via Lua | `DECRBY` then compensating `INCRBY` — a two-step, non-atomic workaround |

The current, actually-implemented end-to-end business workflow:

1. Admin initializes stock in the Stock Service (`SET` in Redis).
2. User registers/logs in via Auth Service, receives a JWT.
3. User requests order creation via the API Gateway.
4. Gateway synchronously validates the JWT by calling Auth Service (which hits MongoDB).
5. Gateway forwards the request to Order Service.
6. Order Service synchronously calls Stock Service to reserve inventory.
7. If successful, Order Service saves the confirmed order in MongoDB.

**Non-goals (confirmed by both docs):** dynamic ML-based pricing, full e-commerce/supply-chain logistics.

---

## 3. Tech Stack (Actual)

| Technology | Purpose | Where used | Essential? |
|---|---|---|---|
| Node.js / Express | Backend framework | All 4 services | Yes |
| MongoDB + Mongoose | Persistent store | Auth & Order services | Yes |
| Redis | In-memory inventory counter | Stock Service | Yes |
| JWT | Auth tokens | Gateway, Auth Service | Yes |
| Docker / Docker Compose | Local dev containerization | Entire stack | Yes |
| Kubernetes | Orchestration, HPA auto-scaling | Production deployment | Yes |
| node-fetch | Synchronous inter-service HTTP calls | Gateway, Order Service | Bottleneck — candidate for replacement (gRPC/queue) |

**Confirmed NOT in the repo:** Kafka, message queues of any kind, a frontend, CI/CD pipeline, PostgreSQL, Lua scripting.

---

## 4. Component Weaknesses (Service-by-Service)

**API Gateway**
- Adds a network hop to every protected request by synchronously calling Auth Service to validate JWTs.
- `node-fetch` calls have no timeouts or circuit breakers.

**Auth Service**
- `/validate` performs a `User.findById` on *every single request* routed through the Gateway — this defeats the main advantage of stateless JWTs and is the single biggest bottleneck in the system.

**Stock Service**
- Hardcoded key `item:1:stock` — ignores `productId` in the request. The system can only ever sell one product.
- "Atomic" reservation is actually two non-atomic Redis commands (`DECRBY`, then conditional `INCRBY`), which allows stock to dip below zero momentarily before correcting.

**Order Service**
- No distributed transaction between Redis (stock reservation) and MongoDB (order persistence). If `Order.create()` fails after stock has already been decremented, that inventory is permanently lost with no reconciliation.
- Hardcoded fallback product ID (`item:1`).

---

## 5. Production Readiness Scorecard

| Dimension | Score /10 |
|---|---|
| Architecture | 4 |
| Reliability | 3 |
| Scalability | 5 |
| Security | 5 |
| Deployment | 8 |
| Observability | 2 |
| Documentation | 3 (vision docs overstate real capability) |
| Maintainability | 8 |
| **Overall** | **4.7 / 10** |

---

## 6. Final Verdict

**Strengths:** Clean, consistent folder structure across services; solid Docker/Kubernetes deployment manifests (HPA, Ingress, Deployments); good conceptual separation of domains; clean custom `ApiError`/`ApiResponse`/`AsyncHandler` utilities.

**Weaknesses:** Extreme synchronous coupling between services; the documented "Kafka-backed, Lua-atomic, PostgreSQL-consistent" architecture does not exist in code; real risk of silent inventory loss if the DB write fails after the Redis reservation succeeds.

**Technical debt:** High — closing the gap to the documented vision requires introducing an event-driven core (Kafka or equivalent), true atomic Redis scripting, and a distributed-transaction-safe write path (Saga/Outbox pattern).

**Interview-style questions this codebase invites:**
1. Why does the Gateway validate JWTs by hitting the Auth DB instead of just verifying the signature?
2. What happens if MongoDB crashes between the Redis stock reservation and the `Order.create()` call — how is that inventory recovered?
3. The documentation describes Kafka and Lua scripts that don't exist in the code — why the discrepancy?
4. Why is the stock key hardcoded to a single product — how would this scale to a real multi-SKU store?

---

*Source: engineering audit findings (Analysis.md), cross-referenced against Project.md (vision doc) and README.md (test results/marketing copy).*
