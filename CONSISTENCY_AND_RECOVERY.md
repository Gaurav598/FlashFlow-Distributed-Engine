# Consistency and recovery

## Business invariants

1. A product reservation succeeds only when `available >= quantity`; failure does not modify counters.
2. Reservation quantity is a strictly positive safe integer and product/user/reservation identifiers are validated.
3. `initial = available + reserved + sold` for every product while Redis data is intact.
4. A reservation has one terminal outcome. Release/expiry cannot follow commit, and commit cannot follow release/expiry.
5. Repeating reserve, confirm, or release does not repeat its inventory mutation.
6. One authenticated user and idempotency key identify one logical order payload.
7. Stock is never touched before the MongoDB order intent exists.
8. A confirmed Redis reservation records its durable Mongo order ID.

## Failure windows

| Failure | Resolution |
|---|---|
| Mongo intent insert fails | No Redis call occurs. Client receives an error. |
| Redis unavailable before reservation | Order remains `pending`; bounded-backoff recovery retries. |
| Reservation succeeds, response is lost | Retry uses the same reservation/key; Redis returns the existing hold. |
| Process dies after reservation | Lease expires; another worker reclaims the Mongo order and resumes idempotently. |
| Mongo update to `reserved` fails | Confirmation is not attempted. Recovery observes/recreates the same reservation. |
| Redis commits, Mongo final update fails | Mongo remains `reserved`; recovery's confirm retry observes `COMMITTED` and persists `confirmed`. |
| Confirmation races cancellation | Redis serializes both. Commit winner yields `confirmed`; release winner yields `cancelled`. |
| Confirmation reaches expiry boundary | Lua treats `now >= expiresAt` as expired and restores stock once. |
| Worker loses lease | Redis rejects transitions with `STALE_LEASE`; Mongo rejects stale-token updates. |

## Expiration

Reservations have a configurable deadline. A stock-service sweeper atomically expires due holds in batches. Confirmation itself also checks the deadline, so correctness does not depend on sweep timing. Terminal reservation records are retained temporarily for idempotent retry visibility.

## Redis restart and data loss

Local Compose and Kubernetes configure Redis AOF with `appendfsync everysec` and persistent storage. This bounds but does not eliminate data-loss risk.

If an inventory key is missing, reservations fail with `PRODUCT_NOT_FOUND`; the service does not recreate counters implicitly. Recovery is administrator-controlled:

1. Stop/limit purchase traffic for the affected product.
2. Determine the original total inventory from the external catalog/source of truth.
3. Call `POST /api/v1/stock/products/:productId/reconcile` as an administrator with `totalQuantity`.
4. The gateway queries MongoDB itself for durable confirmed quantity; clients cannot supply the sold count.
5. Stock service creates the missing key only, with `available = total - confirmed`, `reserved = 0`, `sold = confirmed`.
6. Resume order recovery. Mongo `pending`/`reserved` orders re-reserve using deterministic IDs and either confirm or reject.

Reconciliation refuses to overwrite an existing inventory key. This prevents the recovery API from becoming a normal stock-reset path.

## Limits of the recovery model

- The original product total is external business data and is not owned durably by this repository. An operator must provide it during full Redis loss.
- AOF `everysec` can lose roughly the last second on catastrophic host loss. The Mongo `reserved` state is written before Redis commit, allowing those orders to be replayed conservatively.
- Cross-region clock skew could affect lease/expiry boundary decisions. Deployments must maintain synchronized node clocks.
- Recoverable orders retry indefinitely while a dependency remains unavailable; they are observable through order status but no operator dashboard is included.
- The reconciliation endpoint assumes purchase traffic for the affected product is paused while the missing key is rebuilt.
