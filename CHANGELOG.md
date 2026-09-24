# Changelog

## Unreleased — reservation engine upgrade

### Inventory correctness

- Replaced the hardcoded single-item decrement/rollback path with per-product atomic Lua reservations.
- Added reservation IDs, user-scoped idempotency, TTL expiry, commit, release, terminal-state retention, and exact counter accounting.
- Added fencing deadlines to reject inventory mutations from expired order workers.
- Added Redis-backed global/per-user admission control.
- Added a fail-closed, administrator-only missing-inventory reconciliation operation.

### Order durability

- Persisted MongoDB order intents before inventory reservation.
- Added unique `(userId, idempotencyKey)` and reservation indexes.
- Added pending/reserved/confirmed/rejected/cancel-pending/cancelled states and order status/list/cancel APIs.
- Added bounded-backoff recovery with atomic leases, unique lease tokens, stale-worker protection, and idempotent stock retries.
- Added durable reconciliation aggregation for confirmed product quantities.

### Security

- Added JWT issuer/audience/role checks and administrator bootstrap.
- Removed fallback user identities and stripped forged identity/service headers.
- Added distinct gateway/order credentials with route-level service authorization.
- Protected inventory administration, limited request bodies/quantities, bounded upstream timeouts, and safe errors.
- Removed direct internal service ingress and hardcoded Kubernetes credentials.

### Infrastructure and documentation

- Kept only the gateway published in Compose; enabled Redis AOF and health-gated startup.
- Added container non-root users, graceful shutdown, probes, resource limits, persistent Redis storage, and NetworkPolicies.
- Replaced unsupported scalability/fairness/benchmark claims with implementation-specific architecture, consistency, security, API, test, and performance documentation.
- Added real-Redis deterministic concurrency tests.
