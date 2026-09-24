# API reference

Base URL: `http://localhost:3000/api/v1`. All client traffic goes through the API gateway. JSON request bodies are limited to 16 KiB.

Responses use:

```json
{ "statusCode": 200, "data": {}, "message": "...", "success": true }
```

## Authentication

### `POST /auth/register`

Body: `email`, `username`, and a password of at least 10 characters. The server always assigns role `user`; a caller cannot self-assign administrator privileges.

### `POST /auth/login`

Body: `email`, `password`. Returns a JWT in `data.accessToken` and an HTTP-only cookie. Bearer tokens use `Authorization: Bearer <token>`.

## Inventory

### `PUT /stock/products/:productId` — administrator

Creates or changes total product inventory.

```json
{ "quantity": 100 }
```

The quantity may be zero but cannot be below already reserved plus sold units. This endpoint cannot erase allocations.

### `GET /stock/products/:productId` — authenticated

Returns `initial`, `available`, `reserved`, and `sold` counters.

### `POST /stock/products/:productId/reconcile` — administrator

Rebuilds a missing Redis inventory key after data loss.

```json
{ "totalQuantity": 100 }
```

The gateway obtains confirmed sold quantity from MongoDB; the client cannot override it. Reconciliation is rejected when the inventory key already exists.

## Orders

### `POST /orders` — authenticated

Required header: `Idempotency-Key` (8–128 safe characters). Body:

```json
{ "productId": "phone-1", "quantity": 1 }
```

The key is scoped to the authenticated user. Reusing it with the same payload returns the same logical order. Reusing it with a different product or quantity returns `409`.

Status meanings:

- `201`: order reached `confirmed` during this request.
- `202`: durable order is `pending`, `reserved`, or `cancel_pending`; poll its status.
- `409`: terminal `rejected`/sold-out result.
- `429`: admission limit reached; honor `Retry-After`.
- `503`: a required service is unavailable before a durable response can be provided.

`POST /orders/create` remains as a compatibility alias.

### `GET /orders/:orderId` — authenticated owner

Returns the authoritative state. Cross-user access returns `404`.

### `GET /orders` — authenticated

Returns up to the 100 most recent orders for the authenticated user.

### `POST /orders/:orderId/cancel` — authenticated owner

Cancellation is valid only before commit. Returns `200` when cancelled and `202` while cancellation is recoverable. If commit won the race, the order is confirmed and cancellation returns `409`.

## Internal endpoints

The stock reservation, confirmation, release, admission, and durable reconciliation-summary endpoints are not public API. They require the correct named service credential and are network-restricted in Kubernetes. Direct user identity headers are not accepted as authentication.

## Order states

| State | Meaning |
|---|---|
| `pending` | Durable intent exists; work will be retried |
| `reserved` | Inventory hold was observed; confirmation is recoverable |
| `cancel_pending` | Cancellation requested; transition is recoverable |
| `confirmed` | Terminal; inventory is committed/sold |
| `rejected` | Terminal; no inventory allocated |
| `cancelled` | Terminal; reservation released or never created |
