# Test report

Date: 2026-09-24  
Branch: `codex/flashflow-reservation-engine`  
Base commit: `adc14bc6945498efcc00a0f2c889bc2143fa9c77`

## Executed in this environment

| Command | Scope | Result |
|---|---|---|
| `node --check` over all service and script JavaScript after implementation | Final static syntax check | Passed |
| `cd stock-service && npm test` | Real Redis: 100/10, 1,000/100, multi-SKU, duplicate request, invalid quantity, expiry, confirm/cancel race | 7 passed, 0 failed; 186.40 ms runner duration |
| `git diff --check` | Final patch whitespace/integrity check | Passed |

The Redis suite launches a real temporary `redis-server`; it does not mock Redis atomicity. The latest suite also contains repeated confirm, repeated release, and expired-lease fencing cases for the maintainer to execute.

## Not executed here

The Docker daemon was unavailable (`docker info` could not connect), and there is no native `mongod`. At the maintainer's request, final full-stack testing is left to them. Therefore these are not claimed as verified:

- MongoDB order-saga integration and crash recovery.
- Gateway/auth/service security negative tests.
- Full Docker Compose purchase flow.
- Redis AOF restart and full-loss reconciliation drill.
- Kubernetes manifest apply/rollout.
- k6 HTTP performance test.

## Maintainer validation commands

```bash
cd stock-service && npm ci && npm test

cp .env.example .env
# Replace sample values.
docker compose config
docker compose up --build -d
docker compose ps

# Exercise the README admin/user flow, duplicate the same Idempotency-Key,
# exhaust a small product, and poll every returned order ID.

k6 run scripts/stress-test.js
docker compose down
```

Failure drills should stop the order service after a reservation, stop/restart Redis with its volume intact, temporarily stop MongoDB, and run the documented missing-key reconciliation procedure. Do not treat this report as evidence those unexecuted cases passed.
