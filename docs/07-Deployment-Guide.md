# 08 — Deployment Guide

## 1. Prerequisites

- Docker
- Node.js
- `kubectl` configured against a target cluster (for production deployment)

## 2. Local Development (Docker Compose)

The repo's `docker-compose.yml` orchestrates all four services plus Redis and MongoDB in one command:

```bash
docker-compose up --build
```

This provisions Redis and MongoDB automatically alongside the four Node.js services (`api-gateway`, `auth-service`, `stock-service`, `order-service`). Each service also has its own `Dockerfile`, using standard Node.js Alpine base images.

Per-service setup (if not using Compose):
```bash
cd <service-directory>
npm install
```

## 3. Configuration

- Ports, downstream service URLs, and secrets are managed via environment variables. See the `.env.example` file in the repository root for all required configuration values.
- In Kubernetes, secrets are provided via native K8s Secret objects (referenced in the manifests as something like `flashflow-secrets`).
- No environment "profiles" (dev/staging/prod config layering) were found in the codebase — this is a gap worth addressing if multiple environments need distinct configs.

## 4. Kubernetes Deployment (Production)

Manifests exist under the `K8s/` folder for:
- Deployments (per service)
- Services (internal networking)
- Ingress (via Nginx Ingress Controller, acting as the external entry point)
- Horizontal Pod Autoscaler (HPA) — configured per service with resource requests/limits

```bash
kubectl apply -f K8s/
```

Verify rollout and scaling behavior:
```bash
kubectl get pods -w
kubectl get hpa -w
```

## 5. Scaling Behavior

Each service scales independently based on CPU load thresholds defined in its HPA config. In the load test documented in `09-Load-Testing.md`, all three tested services (Auth, Stock, Order) scaled from 1 to 5 pods under a 200 req/sec synthetic load, and this can theoretically be extended to much higher `maxReplicas` values for larger target loads (the README frames this as scaling toward 100k–1M users, though that specific scale was not itself load-tested).

## 6. What's Confirmed Missing From the Deployment Story

- **No CI/CD pipeline** was found in the repository (no GitHub Actions workflows, despite being referenced in the vision document). Deployments today appear to be manual (`kubectl apply`).
- **No environment-specific configuration profiles.**
- **No documented rollback procedure** — recommend defining one (e.g., via `kubectl rollout undo`) before relying on this in a real production incident.

## 7. Recommended Immediate Additions

1. A GitHub Actions workflow (or equivalent) that runs tests and builds/pushes images on merge to main, then applies manifests to a staging cluster.
2. Readiness/liveness probes in the Deployment manifests, if not already present — verify this directly in the `K8s/` YAML files, as the audit did not explicitly confirm their presence or absence.
3. Secrets management upgrade (e.g., a secrets manager or sealed-secrets approach) beyond raw K8s Secrets, especially before handling real payment credentials.

*Note: I don't have direct access to the actual `K8s/` YAML file contents or `docker-compose.yml` — the details above are based on what the audit report confirmed exists. Recommend verifying exact manifest contents (probe configs, resource limits, replica counts) directly against the repository files before relying on specifics not explicitly stated here.*
