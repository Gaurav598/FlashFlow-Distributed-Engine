# Project Overview

FlashFlow – Distributed Flash Sale & Inventory Reservation Engine is a production-grade distributed backend infrastructure project engineered to handle massive concurrent traffic while strictly guaranteeing zero overselling. The system achieves this through Redis atomic operations, asynchronous event processing, TTL-based reservation expiration, and robust database consistency mechanisms.

# Problem Statement

During high-demand flash sales, inventory is extremely limited, and concurrent purchase requests vastly exceed available stock. Traditional relational databases struggle with the high write throughput required for inventory decrements, often leading to race conditions, database lock contention, and overselling. Furthermore, synchronous processing of requests severely degrades user experience and system throughput. A highly scalable, decoupled, and strictly consistent architecture is required to process requests instantly, secure inventory reliably, and handle partial system failures gracefully.

# Goals

*   **Zero Overselling:** Guarantee strict inventory constraints under massive concurrency.
*   **High Throughput & Low Latency:** Facilitate rapid inventory reservation and checkout processes.
*   **Scalability:** Effortlessly handle sudden traffic spikes inherent to flash sales.
*   **Fault Tolerance:** Ensure system reliability and graceful degradation in the event of component failures.
*   **Observability:** Provide comprehensive, real-time insights into system health and business metrics.

## Non-Goals

*   Complex, Machine Learning-based dynamic pricing (pricing algorithms will remain strictly rule-based).
*   Full-fledged e-commerce platform capabilities (e.g., complex supply chain logistics, recommendation engines) outside the scope of flash sale mechanics.

# Use Cases and Business Flow

*   **Customers:** Browse available products, join active flash sales, reserve inventory (triggering a countdown timer), complete checkout, and track real-time order status.
*   **Administrators:** Manage product catalogs, configure inventory levels, schedule and create flash sales, and monitor real-time sales analytics.

# High-Level Architecture

The system utilizes an event-driven, microservices-oriented architecture to separate concerns, maximize throughput, and ensure scalability. It leverages a fast in-memory datastore for initial reservations and a distributed message broker to asynchronously persist state changes to the database.

## Core System Components

*   **API Gateway / Application Tier:** Handles incoming HTTP requests, enforces authentication, manages rate limiting, and performs request validation.
*   **Pricing Engine:** A dynamic, rule-based service that determines pricing based on inventory levels, time constraints, or demand metrics.
*   **Reservation Engine:** Powered by Redis, this tier manages atomic inventory decrements, idempotency, and temporary reservation holds via Time-To-Live (TTL).
*   **Event Bus:** Kafka manages asynchronous communication between domain services (reservations, orders, payments, notifications).
*   **Persistent Storage:** PostgreSQL serves as the durable source of truth for finalized orders and long-term inventory state.

# System Workflows

## Inventory Lifecycle

1.  **Available:** Inventory is fully available for purchase.
2.  **Reserved:** A customer initiates a checkout, temporarily holding the item.
3.  **Paid:** Payment is successfully processed and verified.
4.  **Sold:** The order is finalized, and inventory is permanently decremented in the database.
    *   *Alternative Path (Expiration):* If the reservation TTL expires before payment completion, the state reverts from **Reserved** to **Available**.

## Reservation Lifecycle

1.  **Reserve Request:** Customer requests to purchase an item.
2.  **Redis Atomic Decrement:** The system atomically checks and decrements inventory in Redis via a Lua script.
3.  **TTL Set:** A temporary reservation is created with a strict Time-To-Live (e.g., 5 minutes).
4.  **Payment Processing:** The customer attempts payment.
5.  **Success:** The order is confirmed, and an event is published to finalize the database state.
    *   *Alternative Path (TTL Expiration):* If the TTL expires, an `inventory-released` event is published, and the Redis inventory count is atomically incremented.

## Order Lifecycle

1.  **Created:** Order intent is registered in the system.
2.  **Reserved:** Inventory is successfully secured in the Redis caching layer.
3.  **Pending Payment:** The system awaits payment gateway confirmation.
4.  **Confirmed:** Payment is successful.
5.  **Completed:** Fulfillment processes are initiated.
    *   *Failure States:* The order can transition to **Cancelled**, **Expired** (TTL timeout), or **Failed** (payment rejection).

# Core Technologies & Design

## Caching & State Management (Redis)

Redis acts as the critical component for high-throughput, low-latency operations, absorbing the initial traffic spike.

*   **Atomic Operations:** Lua scripts guarantee atomic read-and-update operations (e.g., verifying `inventory > 0` and decrementing in a single network round-trip).
*   **Keys & TTL:** Manages short-lived reservation tokens utilizing Redis Key Expiration, automatically releasing abandoned carts.
*   **Rate Limiting:** Throttles incoming requests based on User ID or IP address to mitigate abuse.
*   **Idempotency:** Stores idempotency keys to definitively prevent duplicate transaction processing.
*   **Caching Strategy:** Serves static session data, product details, and hot inventory counts to reduce database load.

## Event-Driven Architecture (Kafka)

Kafka decouples the fast-path reservation system from slow-path persistence and third-party integrations.

*   **Topics:** `sale-created`, `reservation-created`, `reservation-expired`, `inventory-released`, `payment-requested`, `payment-success`, `payment-failed`, `order-created`, `order-confirmed`, `analytics-events`.
*   **Consumer Groups:** Independent consumer groups manage Reservations, Orders, Inventory, Analytics, and Notifications to ensure parallel, non-blocking processing.
*   **Reliability:** Implements Dead Letter Queues (DLQs) and configurable retry mechanisms for transient failures.
*   **Offset Management:** Utilizes robust commit strategies to prevent message loss and ensure at-least-once or exactly-once processing semantics.

## Pricing Engine

A rule-based microservice calculating dynamic pricing without relying on complex machine learning models:
*   **Inventory-Based Rules:** e.g., Increase price by 5% when inventory falls below 20%; increase by 10% when below 10%.
*   **Time-Based Rules:** Enforce peak hour surges (e.g., +15%) or weekend pricing adjustments (e.g., +8%).

## Database Design (PostgreSQL)

Serves as the durable source of truth and system of record.

*   **Concurrency & Locking:** Employs Optimistic Locking (row versioning) for low-contention updates and Pessimistic Locking (`SELECT ... FOR UPDATE`) where strict serialization is required.
*   **Constraints:** Enforces strict database-level constraints (e.g., `CHECK (inventory >= 0)`) as the final safeguard against overselling.
*   **Indexes:** Optimized indexing strategies tailored for querying orders, user histories, and active flash sales.

# Failure Handling & Fault Tolerance

The system is designed to be highly resilient to various distributed systems failure scenarios:

*   **Redis Degradation:** Graceful degradation strategies are implemented. If Redis fails, the system can throttle and route traffic directly to the database with significantly reduced throughput.
*   **Kafka Unavailability:** Utilizes circuit breakers and local buffering until the message broker recovers.
*   **Postgres Downtime:** The system continues accepting reservations in Redis (within predefined limits) until the database is restored, eventually reconciling state via Kafka event replay.
*   **Consumer/Producer Crashes:** Handled natively via Kafka consumer group rebalancing and durable offset tracking.
*   **Duplicate Requests:** Mitigated via unique idempotency keys enforced at the Redis cache layer.
*   **Retry Storms:** Prevented using exponential backoff and jitter algorithms within consumer retry loops.
*   **Network Partitions:** Adheres to CAP theorem trade-offs, prioritizing Availability and Partition Tolerance (AP) for the initial reservation phase, and strict Consistency (CP) for finalized order persistence.

# Security

*   **Authentication:** Stateless JWT-based authentication coupled with secure Refresh Tokens.
*   **Authorization:** Strict Role-Based Access Control (RBAC) separating Admin, Customer, and Guest privileges.
*   **Application Security:** Comprehensive input validation, SQL Injection prevention, rate limiting, and HTTPS enforcement.
*   **Frontend Security:** Cross-Site Scripting (XSS) and Cross-Site Request Forgery (CSRF) protections, specifically targeting the admin dashboard.
*   **Secret Management:** All API keys, credentials, and environment-specific configurations are injected securely via Environment Variables.

# API Design

The API adheres to RESTful principles, featuring strict versioning and standardized HTTP error codes.

*   `POST /products` - Create new products (Admin).
*   `POST /sales` - Initialize a new flash sale (Admin).
*   `GET /sales` - Retrieve active or upcoming flash sales.
*   `POST /reserve` - High-throughput endpoint to securely reserve inventory.
*   `POST /checkout` - Process payment for an active reservation.
*   `GET /orders` - Retrieve customer order history.
*   `GET /inventory` - Check real-time stock levels.
*   `POST /cancel` - Explicitly cancel a reservation or order.
*   `GET /analytics` - Retrieve metrics for the admin dashboard.

# Deployment Architecture

Designed for cloud-native, containerized environments.

*   **Containerization:** Docker Compose is utilized for local development environments; orchestrators (like Kubernetes or ECS) for production.
*   **Infrastructure Components:** Nginx (Reverse Proxy/Load Balancer), Application Nodes (Spring Boot), Redis Cluster, Kafka Cluster, and PostgreSQL.
*   **CI/CD Pipeline:** GitHub Actions for automated unit testing, integration testing, and continuous deployment.

# Observability & Monitoring

Comprehensive telemetry ensures deep visibility into system health and business operations.

*   **Metrics Infrastructure:** Prometheus and Grafana for real-time dashboarding.
*   **Application Telemetry:** Spring Boot Actuator and Micrometer integration.
*   **Key Metrics Tracked:** Reservations/sec, Orders/sec, Inventory Remaining, Kafka Consumer Lag, Retry Rates, Redis Latency, API Latency (P95, P99), and overall Success/Failure Rates.
*   **Distributed Tracing & Logging:** Structured JSON logging utilizing Correlation IDs and Request IDs to trace requests across microservices.
*   **Audit Logs:** Immutable records tracking Inventory Changes, Sale Creations, Reservation Expirations, and Order Confirmations.

# Testing & Benchmarking Plan

A rigorous testing strategy guarantees reliability under extreme load.

*   **Automated Testing:** Comprehensive suite of JUnit, Mockito, Repository, API, and Contract Tests.
*   **Infrastructure Integration:** Validating Kafka and Redis interactions using Testcontainers.
*   **Load Testing (k6):** Systematic benchmarks simulating varying concurrent user loads (100, 500, 1000, 5000, 10000+ users).
*   **Benchmarking Module:** A dedicated module to perform comparative analysis on throughput, latency, oversells, and CPU/Memory utilization across different concurrency control strategies (Normal DB, Optimistic Lock, Pessimistic Lock, Redis Lua).

# Future Enhancements

*   **Waiting Queue:** Virtual queueing system that assigns queue numbers and estimated wait times when initial inventory is exhausted, featuring auto-promotion if reservations expire.
*   **Live Dashboard:** Real-time, WebSockets-based UI updates for consumers (live sale countdowns, inventory depletion) and administrators (live order velocity, system health metrics).
*   **Event Replay:** Utilizing Kafka's event retention to replay historical events for deep debugging or complete state reconstruction.

# Engineering Principles & Design Decisions (The "Why")

*   **Why PostgreSQL over NoSQL?** The system requires strict ACID compliance for finalizing financial transactions and ensuring the permanent order state is absolutely consistent.
*   **Why Redis before the DB?** Relational databases suffer from massive row-level lock contention during flash sales. Redis handles high-concurrency atomic decrements entirely in memory, absorbing the initial shock.
*   **Why Lua instead of a simple Redis `DECR`?** A standard `DECR` operation can result in negative inventory if the pre-condition isn't met. A Lua script executes the conditional check (`if inventory > 0`) and the decrement as a single, atomic network operation, preventing race conditions.
*   **Why Kafka instead of synchronous API calls?** Kafka decouples the critical, latency-sensitive path (the reservation) from slower downstream processes (payment processing, email notifications, database persistence), maximizing frontend throughput.
*   **Why reservation-first instead of payment-first?** This workflow prevents users from paying for items that are already out of stock, guaranteeing a superior user experience and eliminating complex, high-volume refund operations.
*   **Why utilize both Optimistic and Pessimistic locking?** Optimistic locking is used for low-contention administrative updates, while Pessimistic locking (or strict database constraints) serves as the ultimate safety net during high-contention, asynchronous database writes to guarantee zero overselling.