# FlashFlow – Distributed Flash Sale & Inventory Reservation Engine

A production-grade distributed flash sale and inventory reservation engine engineered to handle massive concurrent traffic while guaranteeing zero overselling using Redis atomic operations, asynchronous event processing, and scalable microservices.

## 🎯 The Challenge: "The 1,000 iPhone Problem"

The mission was specific and brutal:

**Handle 10,000 concurrent users competing for only 1,000 stock items (e.g., iPhones) during a Flash Sale.**

The system needed to guarantee three things:

1. **Fairness:** No overselling. First come, first served. Race conditions must be handled atomically.
2. **Speed:** 9,000 users will fail to buy, but they must fail fast (low latency). They cannot see a loading spinner.
3. **Uptime:** The high traffic on the "Buy" button must not crash the "Login" page.

---

## 🏛️ Phase 1: The Monolith Trap

Our first attempt was a standard **Monolithic Architecture**. All logic (Auth, Order, Stock) lived in one Node.js process.

### The Architecture

![Monolith Architecture](Monolith%20Architecture.png)

### 💥 Why It Failed the "10k Test"

- **The "Auth Choke":** When 10,000 users tried to login at 10:00 AM, the CPU hit 100% just hashing passwords. This choked the Stock Check, causing the "Buy" button to freeze for users who were already logged in.

- **The "One-Kill-All" Bug:** A single memory leak in the Order processing crashed the entire server, taking down the Storefront and Inventory with it.

- **Scale Limits:** We could handle ~2,000 users. Beyond that, vertical scaling (bigger RAM) became too expensive and inefficient.

---

## ☁️ Phase 2: The Microservices Re-Architecture

To break the 10k barrier and aim for 100k+, we tore it down and rebuilt it as a **Distributed System on Kubernetes**.

### The New Architecture

![Microservice Architecture](Microservice%20Architecture.png)

### 🛡️ System Design Flex (The Solutions)

1. **Concurrency & Fairness:** We implemented **Optimistic Locking** at the Database layer. Even if 100 users click "Buy" at the exact same millisecond, the database processes them sequentially. No overselling.

2. **Architectural Isolation:**
   - **Scenario:** Auth Service is getting hammered (DDoS or Flash Crowd).
   - **Outcome:** The `auth-service` pods scale up to 100% CPU. BUT, the `order-service` runs on separate pods. Users already inside the app experience **Zero Lag** while checking out.

3. **Infinite Scaling:** While the target was 10k, this architecture can theoretically handle 100k or 1M users simply by increasing the `maxReplicas` in the HPA configuration.

---

## 📊 The Proof: Production-Grade Stress Test

We simulated the "Flash Sale" load using **k6** (Load Testing) and monitored the **Kubernetes HPA** (Auto-scaler).

### ⚡ The Performance Matrix

| Service | 🔐 Auth Service | 📦 Stock Service | 🛒 Order Service |
|---------|----------------|------------------|------------------|
| **Role** | The Gatekeeper | The Fast Reader | The Transaction Manager |
| **Test Scenario** | 200 Concurrent Logins/sec | 200 Concurrent Stock Checks | 200 Concurrent Orders |
| **Workload Type** | CPU Bound (bcrypt hashing) | I/O Bound (Fast DB Reads) | Network Bound (Internal API calls) |
| **Peak CPU Load** | 1439% (Extreme Spike) 😱 | 177% (Healthy) | 292% (Cascading Load) |
| **Throughput** | ~46 Req/Sec | ~69 Req/Sec | ~61 Req/Sec |
| **Latency (Avg)** | 513 ms | 10 ms (Instant) ⚡ | 137 ms |
| Scaling Threshold | ~9 RPS / Pod | ~14 RPS / Pod | ~12 RPS / Pod |
| **Scaling Action** | 1 ➔ 5 Pods (Instant) | 1 ➔ 5 Pods | 1 ➔ 5 Pods |
| **Verdict** | ✅ SURVIVED | ✅ SURVIVED | ✅ SURVIVED |

> **Engineer's Note:** The system demonstrated **Dependency Propagation Resilience**. When `Order Service` was stressed, it naturally stressed the `Stock Service`. Both auto-scaled in tandem without human intervention, maintaining 100% uptime.

---

## 🛠️ Tech Stack

- **Core:** Node.js, Express.js (Microservices)
- **Orchestration:** Kubernetes (K8s), Docker
- **Gateway:** Nginx Ingress Controller, Custom Node.js Gateway
- **Data Layer:** MongoDB (Per-Service DB), Redis (Caching)
- **Testing:** k6 (Performance), Postman (API)
- **Observability:** Kubernetes Metrics Server

---

## 🚀 How to Run the System

1. **Deploy Infrastructure:**
```bash
   kubectl apply -f K8s/
```

2. **Simulate Traffic:**
```bash
   k6 run scripts/stress-test.js
```

3. **Monitor Scaling:**
```bash
   kubectl get hpa -w
```

---

**Architected & Engineered by Gaurav**
