# Security review

## Implemented controls

- JWTs are signed with HS256 and verified at the gateway for algorithm, expiry, issuer, and audience.
- JWT subject and role are generated server-side. Registration always creates a normal user; administrator creation is an environment-controlled bootstrap operation.
- Inventory initialization and Redis-loss reconciliation require the `admin` role.
- Purchase, order status, cancellation, and inventory reads require authentication.
- The gateway strips external `x-user-*` and `x-service-*` headers before injecting trusted values.
- Gateway and order service have different 32+ character service credentials and explicit service names.
- Stock routes authorize the exact service identity: order service cannot invoke inventory administration.
- Compose publishes only the gateway port. Kubernetes ingress targets only the gateway, and NetworkPolicies restrict internal paths.
- JSON bodies are capped at 16 KiB. Product IDs, idempotency keys, quantities, emails, usernames, and order IDs are validated.
- Downstream HTTP calls have bounded timeouts and client responses hide unexpected internal errors.
- Login errors do not distinguish unknown email from wrong password. Cookies are HTTP-only, SameSite strict, and secure in production.
- No production secret values are committed. Kubernetes secrets are created from a Git-ignored environment file.
- Containers run as non-root with dropped capabilities in the Kubernetes baseline.

## Threats resolved from the original implementation

| Finding | Resolution |
|---|---|
| Public stock initialization | Gateway authentication plus admin role; service credential required internally |
| Direct ingress to stock/order/auth | Removed; only gateway ingress remains |
| Forged `x-user-id` | Gateway strips it; order service accepts identity only with gateway credential |
| Shared internal privilege | Separate gateway/order credentials and route-level service authorization |
| Public reservation endpoint | Order-service credential required |
| Unbounded bodies/quantities | 16 KiB body limit and configured maximum order quantity |
| Hardcoded Kubernetes secret | Removed from Git; secret creation is an operator step |

## Remaining risks

- HS256 uses one symmetric JWT secret. Key rotation and asymmetric signing are not implemented.
- There is no token revocation list; a valid token remains usable until expiry.
- Service credentials are static bearer secrets. A service mesh/mTLS identity would be stronger.
- The bootstrap administrator password remains in runtime secret configuration; disable bootstrap variables after initial creation.
- No WAF, bot scoring, CAPTCHA, or distributed denial-of-service service is included.
- Fixed-window admission is intentionally simple and can allow boundary bursts.
- Kubernetes TLS host/certificate and a production secret manager must be configured by the deployer.
- MongoDB authentication and replica-set TLS are not configured in the local/baseline manifests.
