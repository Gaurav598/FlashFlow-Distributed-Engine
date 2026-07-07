# 03 — Database Design

> **Note on scope:** The original vision doc (`Project.md`) specifies PostgreSQL as the system of record with optimistic/pessimistic locking and `CHECK` constraints. The **actual implementation uses MongoDB** via Mongoose, with no explicit locking strategy. This document describes the real, current design, with the PostgreSQL vision noted separately where relevant.

## 1. Current Implementation — MongoDB

Two separate MongoDB databases are used, one per owning service:

| Database | Owned by | Purpose |
|---|---|---|
| `auth_db` | Auth Service | User identities |
| `order_db` | Order Service | Finalized orders |

### 1.1 `User` schema (Auth Service)

- Fields: username, email, hashed password (bcrypt, salt rounds: 10), plus JWT-generation instance method.
- Constraints: `unique: true` on `email` and `username`.
- Indexes: index on `username`.
- Pre-save hook hashes the password with bcrypt before persisting.

### 1.2 `Order` schema (Order Service)

- Fields: `userId`, `productId`, `quantity`, `status`.
- Constraints: `min: 1` on `quantity`.
- No relationships are established at the database level — links between `User` and `Order` are logical only, via string IDs (`userId`, `productId`), not foreign keys or Mongoose refs with population.

### 1.3 What's missing (confirmed by codebase audit)

- **No transactions.** MongoDB sessions/multi-document transactions are not used anywhere.
- **No optimistic locking** (no `__v` version-key concurrency checks despite this being implied in `README.md`).
- **No pessimistic locking.**
- **Query patterns are simple:** `findOne`, `create`, `findById` — no aggregation pipelines or complex queries.

### 1.4 Known bottleneck

`Auth.validateToken` calls `User.findById` on **every single authenticated request** that passes through the Gateway. Under flash-sale load, this makes the Auth Service's MongoDB instance the most likely point of failure — worse than the Stock Service's Redis layer, which handles concurrency far better.

## 2. Original Vision — PostgreSQL (Not Implemented)

For completeness, this is what the vision document proposed and what would need to be built if the project moves toward `Project.md`'s target architecture:

- PostgreSQL as durable source of truth for finalized orders and long-term inventory state, chosen for strict ACID guarantees on financial transactions.
- **Optimistic locking** (row versioning) for low-contention updates.
- **Pessimistic locking** (`SELECT ... FOR UPDATE`) for high-contention writes during flash sales.
- Database-level `CHECK (inventory >= 0)` constraint as a last-resort safeguard against overselling, on top of the Redis-layer protection.
- Indexing strategy tuned for order history, user history, and active-sale queries.

**Why this matters:** if overselling protection is ever meant to be guaranteed (not just "unlikely"), a database-level constraint is the only hard backstop — Redis alone, in its current unscripted form, cannot provide that guarantee (see `04-Redis-Design.md`).

## 3. Recommendation

Two realistic paths forward, documented further in `10-Architecture-Decisions.md`:

1. **Stay on MongoDB**, add multi-document transactions (available since MongoDB 4.0) around the stock-reserve + order-create sequence to close the current data-loss gap.
2. **Migrate to PostgreSQL** to match the original vision, gaining `CHECK` constraints and mature locking primitives, at the cost of a schema/migration effort.

Given the current scale and MongoDB familiarity already in the codebase, option 1 is the lower-risk near-term fix; option 2 is the correct move if the system needs strict ACID guarantees across multiple entities long-term.
