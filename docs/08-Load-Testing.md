# 09 — Load Testing

> Source: results reported in `README.md`. I have not independently verified these numbers — treat them as the project's self-reported test results and re-run the k6 scripts yourself if you need to confirm them for a report or presentation.

## 1. Test Objective

Simulate the "1,000 iPhone Problem": 10,000 concurrent users competing for 1,000 units of stock, while verifying:
1. **Fairness** — no overselling, race conditions handled correctly.
2. **Speed** — the ~9,000 users who don't get stock fail fast, without a hanging UI.
3. **Isolation** — heavy load on the "Buy" flow doesn't take down the "Login" flow.

## 2. Tooling

- **k6** for load generation.
- **Kubernetes Metrics Server** + `kubectl get hpa -w` for observing auto-scaling in real time.
- Postman for functional API testing (separate from the load test itself).

## 3. Reported Results

| Service | Auth Service | Stock Service | Order Service |
|---|---|---|---|
| Role | Gatekeeper | Fast reader | Transaction manager |
| Test scenario | 200 concurrent logins/sec | 200 concurrent stock checks | 200 concurrent orders |
| Workload type | CPU-bound (bcrypt hashing) | I/O-bound (fast DB reads) | Network-bound (internal API calls) |
| Peak CPU load | 1439% (extreme spike) | 177% (healthy) | 292% (cascading load) |
| Throughput | ~46 req/sec | ~69 req/sec | ~61 req/sec |
| Avg latency | 513 ms | 10 ms | 137 ms |
| Scaling threshold | ~9 RPS/pod | ~14 RPS/pod | ~12 RPS/pod |
| Scaling action | 1 → 5 pods | 1 → 5 pods | 1 → 5 pods |
| Verdict | Survived | Survived | Survived |

**Reported observation:** when Order Service was stressed, it propagated load to Stock Service (since Order Service calls Stock Service synchronously per request), and both auto-scaled in tandem, reportedly with 100% uptime maintained throughout the test.

## 4. How to Interpret This, Given the Architecture Audit

A few things worth flagging so the numbers aren't read as more than they are:

- **Auth Service's CPU spike (1439%) matches the audit's finding** that `/validate` performs a database lookup on every call — this is consistent with Auth being the most CPU/latency-strained service under load, and its 513ms average latency is far higher than the other two services.
- **The test scenario (200 req/sec) is much smaller than the "10,000 concurrent users" headline scenario.** These results demonstrate horizontal pod scaling under a *moderate* synthetic load, not a full validated run at the actual target scale (10k users / 1k stock units). If you need numbers specifically for the full target scenario, that test should be re-run and reported separately.
- **These results reflect the actual synchronous architecture**, not the Kafka-based design in the vision doc — so they're a legitimate baseline for the *current* system, but shouldn't be assumed to represent performance after any future architectural changes (see `07-Future-Roadmap.md`).

## 5. How to Reproduce

```bash
kubectl apply -f K8s/
k6 run scripts/stress-test.js
kubectl get hpa -w   # observe scaling in a separate terminal
```

## 6. Recommended Follow-Up Tests

1. Run the actual 10,000-concurrent-user / 1,000-unit scenario end-to-end and record real oversell counts (if any), not just per-service throughput.
2. Add a dedicated benchmark comparing the current Redis `DECRBY`+`INCRBY` approach against a Lua-script version, to quantify whether the race-condition window identified in `04-Redis-Design.md` produces measurable anomalies under load.
3. Measure Auth Service latency specifically *after* implementing the stateless-JWT fix from `07-Future-Roadmap.md`, to confirm the predicted improvement.
