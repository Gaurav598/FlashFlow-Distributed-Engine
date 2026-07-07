# FlashFlow – Distributed Flash Sale & Inventory Reservation Engine

## Project Overview

FlashFlow is a distributed, microservices-based backend system designed to handle flash sales and inventory reservations. During high-demand flash sales, concurrent purchase requests vastly exceed available stock. FlashFlow decouples core services and utilizes an in-memory datastore for rapid inventory decrements to prevent overselling and improve system resilience.

## Goals

*   **Fast Inventory Checks:** Leverage in-memory operations to validate and decrement stock quickly.
*   **Decoupled Architecture:** Ensure that high CPU load in authentication does not completely crash the order processing pipeline.
*   **Scalability:** Deploy services independently via Kubernetes to handle sudden traffic spikes.

## Non-Goals

*   Complex, Machine Learning-based dynamic pricing.
*   Full-fledged e-commerce platform capabilities (e.g., complex supply chain logistics, recommendation engines).

## Current Architecture

The system utilizes a synchronous microservices architecture over HTTP. 

### Core System Components

*   **API Gateway:** An Express-based reverse proxy that handles incoming HTTP requests, extracts JWTs, and synchronously routes them downstream for validation and processing.
*   **Auth Service:** A MongoDB-backed service responsible for user registration, password hashing (bcrypt), and stateless JWT generation/validation.
*   **Stock Service:** A Redis-backed service that manages the core inventory count in memory, allowing for high-throughput atomic decrements (`DECRBY`).
*   **Order Service:** A MongoDB-backed service that processes purchase intents. It queries the Stock Service synchronously over HTTP to reserve inventory, and upon success, persists the final order in its local database.

## System Workflows

### Authentication Flow
1. Client sends a request to the API Gateway.
2. The Gateway extracts the JWT and synchronously calls `POST /api/v1/auth/validate` on the Auth Service.
3. The Auth Service decodes the token, queries MongoDB to ensure the user exists, and returns a validity status.
4. The Gateway routes the request to the target service.

### Request Flow (Order Creation)
1. **Reserve Request:** A customer initiates a checkout request via the Gateway.
2. **Synchronous Call:** The Order Service receives the request and synchronously calls the Stock Service.
3. **Redis Atomic Decrement:** The Stock Service atomically decrements the inventory counter in Redis. If the value drops below zero, it compensates by incrementing it back and returns an "Out of Stock" error.
4. **Order Confirmation:** If the stock reservation succeeds, the Order Service persists the final order status in its MongoDB collection.

## Tech Stack

*   **Backend Framework:** Node.js, Express.js
*   **Databases:** MongoDB (Persistent state), Redis (In-memory inventory state)
*   **Authentication:** JWT, bcrypt
*   **Inter-Service Communication:** Synchronous HTTP (`node-fetch`)
*   **Containerization & Orchestration:** Docker, Docker Compose, Kubernetes (K8s)

## Deployment Strategy

FlashFlow is designed for containerized environments.
*   **Local Development:** Orchestrated entirely via `docker-compose.yml`, which spins up all Node.js microservices alongside local Redis and MongoDB containers. Environment variables are managed via a `.env` file (see `.env.example`).
*   **Production Deployment:** Fully defined Kubernetes manifests (`K8s/`) provide Deployments, Services, Horizontal Pod Autoscalers (HPA), and Nginx Ingress routing. All deployments are grouped under the `flashflow-ns` namespace.

## Current Capabilities

*   **Microservice Isolation:** Auth, Stock, and Order domains are completely isolated in separate Node.js processes.
*   **In-Memory Decrements:** The use of Redis `DECRBY` guarantees integer-based oversell protection at the memory layer.
*   **Horizontal Scalability:** CPU-bound tasks like password hashing can be scaled by adding more `auth-service` pods via Kubernetes HPA.

## Current Limitations

*   **Synchronous Coupling:** All inter-service communication happens over blocking HTTP calls. This creates tight coupling and increases latency.
*   **Distributed Transaction Risk:** Because there is no distributed transaction manager (e.g., Saga or Two-Phase Commit), if the Order Service crashes *after* reserving stock in Redis but *before* saving to MongoDB, the stock is permanently lost without reconciliation.
*   **Database Bottlenecks:** The API Gateway forces a synchronous MongoDB lookup via the Auth Service for every single protected request to validate JWTs.
*   **Single Item Limitation:** The Stock Service currently uses a hardcoded Redis key, restricting the engine to a single product per deployment.

## Future Vision

For the complete architectural roadmap, including the planned migration to Kafka, Lua scripts for true atomicity, Dead Letter Queues, and the Outbox pattern, please refer to:
[docs/07-Future-Roadmap.md](docs/07-Future-Roadmap.md)
