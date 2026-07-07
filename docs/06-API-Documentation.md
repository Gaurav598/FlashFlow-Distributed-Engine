# 06 — API Documentation

> This reflects the endpoints confirmed present in the actual codebase (per the engineering audit), not the larger API surface sketched in the vision document. Endpoints like `/sales`, `/checkout`, `/cancel`, and `/analytics` appear in `Project.md` but were **not found** in the implementation.

## Base Path

All routes are versioned under `/api/v1/...` and pass through the API Gateway.

## Auth Service

### `POST /api/v1/auth/register`
Registers a new user in MongoDB. Password is hashed with bcrypt (salt rounds: 10) via a Mongoose pre-save hook.

### `POST /api/v1/auth/login`
Verifies credentials against the stored hash and returns a JWT, set in a cookie.

### `POST /api/v1/auth/validate`
Decodes the JWT and looks up the corresponding user via `User.findById`. Called internally by the Gateway on every protected request — **this DB lookup is the system's primary performance bottleneck** (see `01-Architecture-Analysis.md`).

## Stock Service

### `POST /api/v1/stock/initialize`
Admin-only. Sets the stock count in Redis via `SET`. Operates against a single hardcoded key (`item:1:stock`) — does not support arbitrary product IDs.

### `GET /api/v1/stock/current`
Reads the live stock count from Redis via `GET`.

### `POST /api/v1/stock/reserve`
Decrements stock via `DECRBY`. If the result goes negative, compensates with `INCRBY` and returns an "Out of Stock" error (see `04-Redis-Design.md` for why this two-step approach is not truly atomic).

## Order Service

### `POST /api/v1/orders/create`
Authenticated endpoint (JWT required, validated via the Gateway → Auth Service round trip). Calls Stock Service's `/reserve` synchronously, then creates the order document in MongoDB. **No distributed transaction** wraps these two steps — see the data-loss risk noted in `01-Architecture-Analysis.md` and `03-Database-Design.md`.

### `GET /api/v1/orders` *(Planned Future Feature)*
Retrieves a customer's order history. This endpoint is not currently implemented in the `order-service` routes.

## API Gateway Behavior

- Acts as a **pass-through proxy** using `node-fetch` — the gateway controllers for auth/order/stock are simple forwarders, not custom business logic.
- `auth.middleware.js` extracts the JWT from cookies/headers and calls Auth Service's `/validate` before forwarding any protected request.
- No request timeout or circuit-breaker configuration was found around these proxy calls.

## Confirmed Missing From the Vision Doc's API Surface

The following endpoints are described in `Project.md` but were **not found** in the codebase:
- `POST /sales`, `GET /sales` (flash sale scheduling/listing)
- `POST /checkout` (separate payment step)
- `POST /cancel`
- `GET /analytics`
- `POST /products` (product catalog management)

If these are needed, they represent genuinely new endpoints to design and build, not gaps to "wire up" against existing internal logic.

## Error Handling

Centralized via a custom `ApiError` / `ApiResponse` utility pattern, used consistently across all four services (this is one of the codebase's stronger points per the audit — rated 8/10 for error-handling quality).

## Authentication Notes

- JWTs are stored in cookies **without CSRF protection** — flagged as a security gap in the audit.
- Input validation is basic string-checking in controllers; no schema-validation library (e.g., Joi/Zod) was found.
- No rate limiting was found anywhere in the stack.
