# 10 — Architecture Decisions

This document records key architectural decisions — both the ones actually reflected in the current codebase, and open decisions still to be made per the roadmap. Written in a lightweight ADR (Architecture Decision Record) style.

---

### ADR-01: Microservices over Monolith

**Decision:** Split Auth, Stock, and Order into independent services behind an API Gateway, deployed on Kubernetes.

**Why:** The original monolithic Node.js implementation hit a hard ceiling around ~2,000 concurrent users. A CPU spike in password hashing (Auth) froze the entire process, including unrelated stock-check requests, and a single memory leak in Order processing could crash the whole server.

**Result:** Confirmed working — the load test in `09-Load-Testing.md` shows each service scaling and failing independently under stress.

**Trade-off accepted:** Inter-service network calls, and the operational overhead of running/monitoring multiple services instead of one.

---

### ADR-02: MongoDB over PostgreSQL

**Decision (as implemented):** Use MongoDB + Mongoose for both Auth and Order services, despite the original vision document specifying PostgreSQL.

**Why (inferred):** MongoDB's flexible schema and low-friction Node.js integration made it faster to build against; this appears to be a case of the implementation diverging from the vision doc for pragmatic/speed-of-development reasons rather than a deliberate, documented trade-off decision (the audit found no rationale recorded for this specific divergence).

**Open question:** Whether to formally adopt MongoDB going forward (and add multi-document transactions to fix the current data-loss gap) or migrate to PostgreSQL to match the original vision and gain hard `CHECK`-constraint guarantees. See `03-Database-Design.md` §3 for both paths.

---

### ADR-03: Redis for the Fast-Path Inventory Counter

**Decision:** Use Redis as the primary datastore for live stock counts, bypassing the database entirely for the reservation check.

**Why:** Avoids row-level lock contention in a relational database during high-concurrency decrements.

**Current gap:** The implementation uses a non-atomic two-command pattern (`DECRBY` + conditional `INCRBY`) instead of a single atomic Lua script, which was the original intent. See `04-Redis-Design.md` for the specific race-condition risk and the recommended fix.

---

### ADR-04: Synchronous HTTP Instead of Kafka (as implemented)

**Decision (as implemented):** All inter-service communication uses direct, synchronous HTTP calls via `node-fetch`, not an event bus.

**Why this diverges from the vision doc:** Not documented in the codebase — the vision doc calls for Kafka to decouple the reservation path from downstream persistence and notifications, but this was never built.

**Consequence:** This is the direct cause of the current data-loss bug (stock reserved in Redis, but order write to MongoDB can fail with no compensating mechanism) and of the Auth Service becoming a synchronous bottleneck on every request.

**Recommendation:** See `05-Kafka-Design.md` and `07-Future-Roadmap.md` for a phased path toward the originally-intended event-driven design, without necessarily requiring a full rewrite on day one.

---

### ADR-05: JWT Stateless Auth at the Gateway

**Decision (as implemented in Step 1):** Validate the JWT signature statelessly at the API Gateway instead of querying the Auth Service database on every request. The Gateway decodes the JWT and injects internal trusted headers (`x-user-id`) for downstream services.

**Why:** The original implementation called `/validate` (which performed a `User.findById`) on every single API Gateway request. This defeated the primary benefit of JWTs and created a massive CPU/Database bottleneck (1439% peak CPU in Auth service during load testing).

**Result:** By pushing `jsonwebtoken` validation to the Gateway, we eliminated an internal HTTP network hop and a database query per request. The Auth Service `/validate` endpoint remains for backward compatibility but is deprecated. We only verify claims currently supported (`exp`, `algorithms: ["HS256"]`). Future security enhancements will introduce and verify `iss`, `aud`, and `nbf`.

---

### ADR-06: Kubernetes HPA for Scaling

**Decision:** Use Kubernetes' Horizontal Pod Autoscaler, keyed on CPU utilization, to scale each service independently.

**Why:** Enables the system to theoretically scale from thousands to hundreds of thousands of users by adjusting `maxReplicas`, without re-architecting the deployment model.

**Caveat:** This was validated only at a 200 req/sec synthetic load in the available test results (see `09-Load-Testing.md`) — the full target scenario (10,000 concurrent users) has not been confirmed as independently load-tested at that exact scale based on the materials reviewed here.

---

## Summary Table

| ADR | Decision | Status | Key Risk if Unaddressed |
|---|---|---|---|
| 01 | Microservices over monolith | Implemented, working | Operational complexity |
| 02 | MongoDB over PostgreSQL | Implemented, undocumented rationale | No transactions → data loss |
| 03 | Redis fast-path counter | Implemented, non-atomic | Transient negative-stock race |
| 04 | Sync HTTP over Kafka | Implemented (vision wanted Kafka) | Lost inventory on DB write failure |
| 05 | JWT stateless auth | Vision only — actual is DB-backed | Auth Service bottleneck |
| 06 | K8s HPA scaling | Implemented, partially validated | Untested at full target scale |
