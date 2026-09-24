# Performance report

No end-to-end performance benchmark was completed for the final implementation in this environment. Docker was unavailable and the maintainer elected to run testing independently.

The executed real-Redis correctness suite completed 7 tests in 186.40 ms on a local Apple-hosted development environment using Node.js v26.5.0 and a Homebrew Redis server. That runner duration is not HTTP throughput, sustained concurrency, or production capacity and must not be presented as such.

The repository's older README throughput figures were removed because they were not independently reproducible against this implementation and did not establish successful order outcomes.

## Required benchmark record

When running `scripts/stress-test.js`, record:

- CPU model/core count and memory.
- Docker/Kubernetes version and service replica counts.
- MongoDB and Redis topology/persistence configuration.
- Test duration, virtual users, initialized stock, and request count.
- Confirmed, rejected/sold-out, pending, and unexpected-error counts.
- HTTP throughput and p50/p95/p99 latency.
- Final `initial`, `available`, `reserved`, and `sold` values.
- Recovery time and final order state after each injected failure.

Strict fairness, unlimited scaling, 100k-user capacity, and a throughput number remain unclaimed until an executable benchmark demonstrates them.
