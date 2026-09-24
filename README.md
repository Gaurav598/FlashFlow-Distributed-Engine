# FlashFlow

FlashFlow is a demonstrable flash-sale inventory engine built around atomic Redis reservations and a recoverable MongoDB order saga. It prioritizes inventory correctness and explicit failure states over headline throughput claims.

## What is implemented

- Per-product inventory with `initial = available + reserved + sold` accounting.
- Atomic Lua transitions for reserve, confirm, release, and expiry.
- Reservation states `RESERVED`, `COMMITTED`, `RELEASED`, and `EXPIRED`.
- MongoDB order intent persisted before inventory is touched.
- User-scoped idempotency backed by a MongoDB unique index and Redis keys.
- Lease-based order recovery with unique fencing tokens and Redis-enforced deadlines.
- Bounded, Redis-backed admission control before order creation.
- Stateless JWT verification at the gateway with administrator-only inventory management.
- Separate gateway and order-service credentials, internal-only service ports, and Kubernetes network policies.
- Redis AOF persistence plus an administrator-controlled reconciliation path after Redis data loss.

Kafka is intentionally not used. The current reservation saga is sufficient for this codebase and avoids adding a broker whose operational cost has not been justified by measurements. The system does not claim strict global request fairness, unlimited scaling, or an independently verified production throughput.

## Request path

```text
client -> API gateway -> Redis admission control -> order service
                                                -> MongoDB order intent
                                                -> stock service / Redis reservation
                                                -> Redis commit
                                                -> MongoDB confirmed order
```

If a downstream response is lost, the order remains recoverable. The order worker retries with the same order ID, reservation ID, user ID, and idempotency key. See [ARCHITECTURE.md](ARCHITECTURE.md) and [CONSISTENCY_AND_RECOVERY.md](CONSISTENCY_AND_RECOVERY.md).

## Local demo

Requirements: Docker Compose.

```bash
cp .env.example .env
# Change the sample secrets and bootstrap administrator password.
docker compose up --build
```

Only the gateway is published on `localhost:3000`. MongoDB, Redis, and internal services stay on the Compose network.

Log in as the bootstrap administrator and initialize a product:

```bash
ADMIN_TOKEN=$(curl -sS http://localhost:3000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@flashflow.local","password":"change-this-admin-password"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken')

curl -sS -X PUT http://localhost:3000/api/v1/stock/products/phone-1 \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"quantity":10}'
```

Register/login a customer, then purchase with a unique idempotency key:

```bash
curl -sS -X POST http://localhost:3000/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"username":"buyer1","email":"buyer1@example.com","password":"correct-horse-battery"}'

USER_TOKEN=$(curl -sS http://localhost:3000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"buyer1@example.com","password":"correct-horse-battery"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken')

curl -sS -X POST http://localhost:3000/api/v1/orders \
  -H "authorization: Bearer $USER_TOKEN" \
  -H 'content-type: application/json' \
  -H 'idempotency-key: demo-order-0001' \
  -d '{"productId":"phone-1","quantity":1}'
```

The response is `201` when confirmed, `202` while recoverable work is pending, `409` for a terminal rejection/sold-out result, or `429` when admission control rejects the request. Retrieve the authoritative status with `GET /api/v1/orders/:orderId`.

## Tests

```bash
cd stock-service && npm ci && npm test
```

The stock suite launches a real temporary Redis server and includes 100-for-10, 1,000-for-100, multi-product, duplicate, invalid-quantity, expiry, fencing, repeated-transition, and race cases. Full-stack validation requires Docker; see [TEST_REPORT.md](TEST_REPORT.md).

## Kubernetes

Create secrets locally rather than committing them:

```bash
cp K8s/secrets.example.env K8s/secrets.env
# Replace every value.
kubectl apply -f K8s/namespace.yaml
kubectl -n flashflow-ns create secret generic flashflow-secrets \
  --from-env-file=K8s/secrets.env
kubectl apply -f K8s/
```

The ingress routes only to the gateway. Configure a real hostname and TLS secret before exposing it publicly. The checked-in manifests are a baseline, not a high-availability production database design.

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Consistency and recovery](CONSISTENCY_AND_RECOVERY.md)
- [Security review](SECURITY_REVIEW.md)
- [API reference](docs/06-API-Documentation.md)
- [Test report](TEST_REPORT.md)
- [Performance report](PERFORMANCE_REPORT.md)
- [Changelog](CHANGELOG.md)
