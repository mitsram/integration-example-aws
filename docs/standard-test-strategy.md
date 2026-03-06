# Enterprise Test Strategy — Integration Platform

> Aligned with **ISO/IEC/IEEE 29119-3:2021** (§7 — Organizational Test Strategy) and **IEEE 829-2008** (Test Documentation).

---

## Document Control

| Field | Value |
|-------|-------|
| **Strategy Identifier** | ETS-INTPLATFORM-001 |
| **Version** | 3.0 |
| **Date** | 2026-03-01 |
| **Status** | Approved |
| **Classification** | Internal |
| **Organisation** | Integration Platform Division |

### Revision History

| Version | Date | Author | Changes |
|:-------:|------|--------|---------|
| 1.0 | 2026-02-28 | QA Lead | Initial draft — generic test strategy. |
| 2.0 | 2026-03-01 | QA Lead | Aligned to codebase; added automation & performance sections. |
| 3.0 | 2026-03-01 | QA Lead | Restructured per ISO/IEC/IEEE 29119-3 §7 (Organizational Test Strategy) and IEEE 829. Added governance, risk management process, incident management, retest/regression policy, and standards clause mapping. |

### Approvals

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA Lead | _______________ | _______________ | ____/____/____ |
| Technical Lead | _______________ | _______________ | ____/____/____ |
| Head of Engineering | _______________ | _______________ | ____/____/____ |

---

## 1. Introduction

*(29119-3 §7.1 — Context; IEEE 829 §3)*

### 1.1 Purpose

This Enterprise Test Strategy defines the **organizational-level** testing approach, governance, and standards for all projects within the AWS Integration Example platform — a SOAP-based, event-driven system connecting client applications through an integration layer comprising an API Gateway, message queues, and pub/sub eventing.

This strategy applies across all current and future projects on the platform and serves as the **authoritative reference** from which project-specific Test Plans are derived.

### 1.2 Scope of Applicability

This strategy governs testing for:

- All client applications (core-app-1, core-app-2, siebel, and future integrations).
- The shared integration layer (API Gateway, message processor, queues, event bus).
- All test levels: contract, integration, end-to-end, and performance.
- Both technology stacks: TypeScript (Vitest / Pact JS) and Java (JUnit 5 / Pact JVM).

### 1.3 Relationship to Other Documents

| Document | Type | Relationship |
|----------|------|-------------|
| This document | **Organizational Test Strategy** (29119-3 §7) | Defines enterprise-wide testing approach, standards, and governance. |
| Project Test Plans | **Test Plan** (29119-3 §8) | Derived per-project/per-release from this strategy. Contain specific test cases, schedules, and assignments. |
| Test Design Specifications | **Test Design** (29119-3 §9) | Detail specific test conditions and expected results per test level. |
| Test Procedure Specifications | **Test Procedure** (29119-3 §10) | Step-by-step execution instructions for manual or exploratory tests. |
| Test Completion Reports | **Test Completion** (29119-3 §12) | Summarise results and exit criteria assessment per release. |

### 1.4 Standards Compliance

| Standard | Applicability |
|----------|---------------|
| **ISO/IEC/IEEE 29119-1:2022** | Concepts, definitions, and terminology used throughout. |
| **ISO/IEC/IEEE 29119-3:2021 §7** | Structure of this Organizational Test Strategy. |
| **ISO/IEC/IEEE 29119-4:2021** | Test techniques referenced in §5 and §6. |
| **IEEE 829-2008** | Supplementary documentation templates for test deliverables. |

### 1.5 Intended Audience

| Audience | Use |
|----------|-----|
| Development teams | Understand mandatory test levels, tooling standards, and ownership. |
| QA / test engineers | Define project test plans, maintain test suites, manage execution. |
| Engineering leadership | Review governance, metrics, risk posture, and resource requirements. |
| Architects | Validate that integration points and non-functional requirements are covered. |
| New team members | Onboard to the platform's testing philosophy and practices. |

---

## 2. References

*(29119-3 §7.2; IEEE 829 §2)*

| ID | Reference | Description |
|----|-----------|-------------|
| REF-01 | ISO/IEC/IEEE 29119-1:2022 | Software Testing — Part 1: General Concepts |
| REF-02 | ISO/IEC/IEEE 29119-3:2021 | Software Testing — Part 3: Test Documentation |
| REF-03 | ISO/IEC/IEEE 29119-4:2021 | Software Testing — Part 4: Test Techniques |
| REF-04 | IEEE 829-2008 | Standard for Software and System Test Documentation |
| REF-05 | `contracts/schemas.ts` | Shared Zod schemas (single source of truth) |
| REF-06 | `pacts/*.json` | Generated Pact contract files |
| REF-07 | `integration-layer/docker-compose.yml` | Infrastructure definition |
| REF-08 | `vitest.config.ts`, `vitest.config.contract.ts` | TypeScript test configuration |
| REF-09 | `playwright-java-framework/pom.xml` | Java test configuration and Maven profiles |

---

## 3. System Context

*(29119-3 §7.3 — Context of testing)*

### 3.1 Platform Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Client Applications                               │
│                                                                             │
│  core-app-1 (:3001)         core-app-2 (:3003)         siebel (:3002)      │
│  PlannedOutage sender       Work Order creator          ServiceRequest +    │
│  + Work Order approval      Vue.js + Express            Event listener     │
│  Vue.js + Express                                       Express + Redis    │
└────────┬────────────────────────┬──────────────────────────┬────────────────┘
         │ SOAP XML              │ SOAP XML                 │ SOAP XML
         ▼                       ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Integration Layer (Docker)                           │
│                                                                             │
│  Nginx API Gateway (:8080)  ──►  soap-processor (:5000)                    │
│                                       │                                     │
│                                       ▼                                     │
│                               ElasticMQ/SQS (:9424)                        │
│                                       │ poll                                │
│                                       ▼                                     │
│                               event-publisher                               │
│                                       │ PUBLISH                             │
│                                       ▼                                     │
│                                Redis (:6380)                                │
│                                  │         │                                │
│                                  ▼         ▼                                │
│                          pubsub-subscriber  siebel event-listener           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Integration Points

| ID | Interface | Protocol | Data Format |
|----|-----------|----------|-------------|
| IF-01 | core-app-1 → API Gateway | HTTP POST `/soap` | SOAP XML |
| IF-02 | core-app-2 → core-app-1 | HTTP POST `/soap/work-orders` | SOAP XML |
| IF-03 | siebel → API Gateway | HTTP POST `/soap` | SOAP XML |
| IF-04 | API Gateway → soap-processor | Nginx reverse proxy | SOAP XML |
| IF-05 | soap-processor → ElasticMQ | AWS SDK `SendMessage` | JSON |
| IF-06 | ElasticMQ → event-publisher | AWS SDK `ReceiveMessage` (poll) | JSON |
| IF-07 | event-publisher → Redis | `PUBLISH integration-events` | JSON |
| IF-08 | Redis → subscribers | `SUBSCRIBE integration-events` | JSON |

### 3.3 Shared Schemas (Single Source of Truth)

Defined in `contracts/schemas.ts` using Zod:

| Schema | Fields | Used By |
|--------|--------|---------|
| `ProcessRequestSchema` | `RequestId`, `Action`, plus app-specific optional fields | soap-processor inbound |
| `SqsMessageSchema` | `requestId`, `source`, `timestamp`, `payload` | SQS queue messages |
| `IntegrationEventSchema` | `eventType`, `source`, `timestamp`, `detail.status` | Redis Pub/Sub events |
| `ProcessResponseSchema` | `Status`, `Message`, `RequestId`, `Timestamp` | SOAP responses |

### 3.4 Test Items

| ID | Test Item | Version / Build | Description |
|----|-----------|-----------------|-------------|
| TI-01 | core-app-1 | HEAD | PlannedOutage sender, work order approval, Vue.js + Express (:3001) |
| TI-02 | core-app-2 | HEAD | Work order creator, Vue.js + Express (:3003) |
| TI-03 | siebel | HEAD | ServiceRequest sender, event listener, Express + Redis (:3002) |
| TI-04 | API Gateway (Nginx) | nginx:alpine | Reverse proxy routing (:8080) |
| TI-05 | soap-processor | HEAD | SOAP XML → JSON processor (:5000) |
| TI-06 | ElasticMQ | softwaremill/elasticmq-native | SQS-compatible queue (:9424) |
| TI-07 | event-publisher | HEAD | SQS poller → Redis publisher |
| TI-08 | Redis | redis:7-alpine | Pub/Sub message bus (:6380) |
| TI-09 | pubsub-subscriber | HEAD | Generic Redis subscriber |
| TI-10 | Shared schemas | `contracts/schemas.ts` | Zod schema definitions |

---

## 4. Guiding Principles & Test Policy

*(29119-3 §7.4 — Generic test strategy elements)*

### 4.1 Organisational Test Policy

| Policy | Mandate |
|--------|---------|
| **All integration points shall have contract tests.** | No consumer-provider interface may go to production without a verified Pact contract. |
| **All services shall have integration tests.** | Every service must prove it communicates correctly with its neighbours before merging. |
| **All critical workflows shall have E2E tests.** | Each user-meaningful flow must be verified end-to-end at least once per release. |
| **Tests are first-class code.** | Test code is reviewed, version-controlled, and maintained with the same rigour as production code. |
| **A broken test is a broken build.** | Failing tests block the pipeline. No exceptions without documented waivers. |

### 4.2 Guiding Principles

| Principle | What It Means in Practice |
|-----------|---------------------------|
| **Shift left** | Contract and schema tests catch issues before merging — no infrastructure required. |
| **Test at the right level** | Prefer fast, focused tests. Escalate to higher levels only for what lower levels cannot verify. |
| **Automate the repeatable** | Every test in the pyramid runs in CI. Reserve manual effort for exploratory testing. |
| **Own your contracts** | Each team owns consumer tests for services they call and provider tests for services they expose. |
| **Fail fast, fail loud** | Pipeline stops on the first broken contract or integration failure. |
| **Dual-stack validation** | TypeScript (Vitest + Pact JS) and Java (JUnit 5 + Pact JVM) both exercise the same interfaces. |

### 4.3 Assumptions

1. Docker Compose stack mirrors the production topology sufficiently for integration and E2E testing.
2. ElasticMQ is a functionally equivalent substitute for AWS SQS.
3. All services are built from the same commit under test.
4. Network latency in Docker Compose is negligible compared to production.

### 4.4 Constraints

1. Performance tests run against Docker Compose, not production-grade infrastructure — results represent relative baselines, not absolute production SLAs.
2. Provider contract verification for HTTP requires the Docker stack to be running.
3. Maximum CI pipeline time budget: 15 minutes for all test levels combined (excluding performance).

---

## 5. Test Levels & Test Types

*(29119-3 §7.5 — Test levels and test types)*

### 5.1 Test Pyramid

```
 ╔═══════════════════════════════════╗
 ║     End-to-End Tests (10 TS/9 J) ║  ← Few, slow, high confidence
 ╠═══════════════════════════════════╣
 ║   Integration Tests (17 TS/17 J) ║  ← Moderate count, real services
 ╠═══════════════════════════════════╣
 ║    Contract Tests  (9 TS/8+ J)   ║  ← Many, fast, no infra needed
 ╚═══════════════════════════════════╝
```

### 5.2 Contract Testing

**Goal:** Verify that producer and consumer agree on message structure without deploying either service.

| Aspect | Detail |
|--------|--------|
| **What is tested** | SOAP envelope structure, request/response schemas, field names/types, event payload shapes, error responses. |
| **What is NOT tested** | Business logic, latency, infrastructure availability. |
| **When to run** | Every commit and pull request. No Docker or external services required. |
| **Tooling** | Pact JS 16.2.0 / Pact JVM 4.6.16 (consumer-driven), Zod 4.3.6 (schema validation). |
| **Ownership** | Consumer team writes consumer tests. Provider team runs provider verification. |
| **Technique** | Consumer-driven contract testing (29119-4 §B.9 — interface testing). |

**How it works:**

1. **Consumer side** — The calling app writes a test declaring *"I will send this request shape and expect this response shape."* This produces a Pact JSON contract file.
2. **Provider side** — The provider replays the contract against its real handler and verifies the response matches.
3. **Broker (optional)** — Stores versioned contracts and enables `can-i-deploy` checks before release.

**Current contract test inventory:**

| Test File | Consumer → Provider | Tests | Infra Required |
|-----------|-------------------|:-----:|:--------------:|
| `core-app-1/tests/contract/soap-api.consumer.pact.test.ts` | core-app-1 → integration-layer | 2 | No |
| `siebel/tests/contract/soap-api.consumer.pact.test.ts` | siebel → integration-layer | 2 | No |
| `siebel/tests/contract/integration-event.consumer.pact.test.ts` | siebel ← integration-layer-events | 2 | No |
| `integration-layer/tests/contract/soap-api.provider.pact.test.ts` | Provider verification (HTTP) | 2 | Docker |
| `integration-layer/tests/contract/integration-event.provider.pact.test.ts` | Provider verification (message) | 1 | No |

**Scenarios covered:**

| Scenario | Type |
|----------|------|
| PlannedOutage SOAP request → 202 Accepted | Consumer |
| Missing SOAP Body → 400 error response | Consumer |
| ServiceRequest SOAP → 202 Accepted | Consumer |
| AccountUpdate SOAP → 202 Accepted | Consumer |
| PROCESSED IntegrationEvent matches schema | Message consumer |
| IntegrationEvent with minimal payload | Message consumer |
| Provider satisfies core-app-1 contract | Provider HTTP |
| Provider satisfies siebel contract | Provider HTTP |
| Event producer conforms to siebel expectations | Provider message |

**Generated contract artefacts** (in `pacts/`):
- `core-app-1-integration-layer.json`
- `siebel-integration-layer.json`
- `siebel-integration-layer-events.json`

---

### 5.3 Integration Testing

**Goal:** Verify that two or more real components communicate correctly over the network.

| Aspect | Detail |
|--------|--------|
| **What is tested** | HTTP routing, SOAP processing, queue delivery, health checks, error handling across service boundaries. |
| **What is NOT tested** | Full pipeline from source to final subscriber (that's E2E). |
| **When to run** | Every commit, after contract tests pass. Requires Docker Compose stack. |
| **Tooling** | Vitest 4.0.18 / JUnit 5.11.4, native `fetch` / HttpClient, Docker Compose. |
| **Ownership** | Team that owns the integration point. |
| **Technique** | Interface testing, state transition testing (29119-4 §B.9, §B.3). |

**Current integration test inventory:**

| Test File | Category | Tests |
|-----------|----------|:-----:|
| `tests/integration/infrastructure.test.ts` | Infrastructure health | 5 |
| `tests/integration/api-gateway.test.ts` | API gateway routing | 4 |
| `tests/integration/core-app-1.test.ts` | Service-to-service | 4 |
| `tests/integration/siebel.test.ts` | Service-to-service | 4 |

**Categories and what they verify:**

| Category | What It Covers | Specific Checks |
|----------|---------------|-----------------|
| **Infrastructure health** | Each service responds on its expected port. | API Gateway `:8080`, core-app-1 `:3001`, siebel `:3002`, Redis PING on `:6380`, ElasticMQ `:9424` reachable. |
| **API gateway routing** | Nginx proxy routes correctly and rejects bad input. | Valid SOAP → 202, invalid XML → 400, missing envelope → 400, unique RequestIds across consecutive requests. |
| **core-app-1 API** | PlannedOutage notification via `/api/send`. | Default outage works, custom parameters preserved, SOAP response echoes correct ID, scheduled times are valid. |
| **siebel API** | ServiceRequest/AccountUpdate via `/api/send`. | Default request works, custom SOAP params, response ID matches, handles 4 message types (ServiceRequest, AccountUpdate, BillingInquiry, StatusChange). |

#### 5.3.1 Integration Points

Each integration point (IF-01 – IF-08 from §3.2) represents a boundary where two components exchange data. Integration tests target these boundaries to verify correct communication, error propagation, and data fidelity.

| Integration Point | Source → Target | Integration Test Coverage |
|-------------------|-----------------|--------------------------|
| **IF-01** core-app-1 → API Gateway | HTTP POST `/soap` (SOAP XML) | API gateway routing tests verify 202 acceptance, 400 rejection for malformed XML, and RequestId uniqueness. |
| **IF-02** core-app-2 → core-app-1 | HTTP POST `/soap/work-orders` (SOAP XML) | Work order SOAP delivery — request arrives, is parsed, and returns acknowledgement with matching RequestId. |
| **IF-03** siebel → API Gateway | HTTP POST `/soap` (SOAP XML) | Siebel integration tests verify ServiceRequest, AccountUpdate, BillingInquiry, and StatusChange routing. |
| **IF-04** API Gateway → soap-processor | Nginx reverse proxy (SOAP XML) | Verified implicitly by gateway routing tests — valid requests reach the processor and return structured responses. |
| **IF-05** soap-processor → ElasticMQ | AWS SDK `SendMessage` (JSON) | Verified by E2E pipeline tests; integration tests confirm the processor responds with a valid `ProcessResponse`. |
| **IF-06** ElasticMQ → event-publisher | AWS SDK `ReceiveMessage` poll (JSON) | Infrastructure health test confirms ElasticMQ is reachable; message consumption verified at E2E level. |
| **IF-07** event-publisher → Redis | `PUBLISH integration-events` (JSON) | Infrastructure health test confirms Redis PING; publish/subscribe verified at E2E level. |
| **IF-08** Redis → subscribers | `SUBSCRIBE integration-events` (JSON) | E2E event collector confirms subscribers receive events matching `IntegrationEventSchema`. |

#### 5.3.2 Validation Points

Validation points define **what is checked at each boundary** to confirm data integrity, schema conformance, and correct error handling. Each validation point is mapped to the integration point it guards.

| VP-ID | Integration Point | Validation | Method | Pass Criteria |
|-------|-------------------|------------|--------|---------------|
| VP-01 | IF-01, IF-03 | **SOAP envelope well-formedness** | XML parsing at API Gateway / soap-processor | Request accepted (202) or rejected (400) with structured error body. |
| VP-02 | IF-01, IF-02, IF-03 | **RequestId presence and uniqueness** | Response inspection | Every response includes a `RequestId` that matches the request; consecutive calls produce distinct IDs. |
| VP-03 | IF-01, IF-03 | **Action field mapping** | Response body assertion | `Action` in response corresponds to the SOAP action sent (PlannedOutage, ServiceRequest, AccountUpdate, etc.). |
| VP-04 | IF-02 | **Work order SOAP schema** | XML structure check at core-app-1 receiver | `<wo:WorkOrderRequest>` envelope parsed correctly; required fields (`WorkOrderId`, `Description`, `Priority`) present. |
| VP-05 | IF-04 | **Proxy pass-through integrity** | Compare request at gateway entry vs. soap-processor receipt | No XML mutation, correct `Content-Type`, headers preserved. |
| VP-06 | IF-05 | **SQS message schema conformance** | Validate against `SqsMessageSchema` (Zod) | Message body conforms: `requestId` (string), `source` (string), `timestamp` (ISO 8601), `payload` (object). |
| VP-07 | IF-06 | **Message dequeue completeness** | Poll confirmation + message deletion | Every queued message is received exactly once; no orphaned messages after processing. |
| VP-08 | IF-07 | **Integration event schema conformance** | Validate against `IntegrationEventSchema` (Zod) | Published event contains `eventType`, `source`, `timestamp`, and `detail.status` with correct types. |
| VP-09 | IF-07 | **Event source attribution** | Field-level assertion on `source` | Event `source` matches the originating application (e.g., `core-app-1`, `siebel`). |
| VP-10 | IF-08 | **Subscriber delivery confirmation** | Redis `SUBSCRIBE` callback assertion | Subscriber receives the event within the configured timeout (15 s); payload is parseable JSON matching the schema. |
| VP-11 | IF-01, IF-02, IF-03 | **Error response structure** | HTTP 400 response body inspection | Error responses include `Status: "ERROR"`, `Message` (human-readable), and `Timestamp`. |
| VP-12 | IF-01 – IF-08 | **Timestamp consistency** | Cross-boundary timestamp comparison | Timestamps at each stage are monotonically increasing; no clock skew > 1 s within Docker network. |

#### 5.3.3 Integration & Validation Point Coverage Matrix

This matrix maps each integration point to its validation points and the test level(s) that exercise them.

| Integration Point | Validation Points | Contract | Integration | E2E |
|-------------------|-------------------|:--------:|:-----------:|:---:|
| IF-01 core-app-1 → Gateway | VP-01, VP-02, VP-03, VP-11 | ✓ | ✓ | ✓ |
| IF-02 core-app-2 → core-app-1 | VP-02, VP-04, VP-11 | — | ✓ | — |
| IF-03 siebel → Gateway | VP-01, VP-02, VP-03, VP-11 | ✓ | ✓ | ✓ |
| IF-04 Gateway → soap-processor | VP-05 | — | ✓ (implicit) | ✓ |
| IF-05 soap-processor → ElasticMQ | VP-06 | ✓ (schema) | — | ✓ |
| IF-06 ElasticMQ → event-publisher | VP-07 | — | — | ✓ |
| IF-07 event-publisher → Redis | VP-08, VP-09 | ✓ (message pact) | — | ✓ |
| IF-08 Redis → subscribers | VP-10 | — | — | ✓ |
| Cross-cutting | VP-12 | — | — | ✓ |

> **Gap note:** IF-02 (core-app-2 → core-app-1 work order SOAP) and IF-05/IF-06 (queue internals) currently lack dedicated integration-level tests. These are covered at E2E level but should be augmented with isolated integration tests as the platform matures (see Risk R-06).

---

### 5.4 End-to-End Testing

**Goal:** Verify that full user-meaningful workflows complete correctly across all services.

| Aspect | Detail |
|--------|--------|
| **What is tested** | Complete async flows — data passes through every layer and arrives intact at subscribers. |
| **What is NOT tested** | Internal implementation details. Performance at scale. |
| **When to run** | After integration tests pass. In CI on merge to main. |
| **Tooling** | Vitest 4.0.18 / JUnit 5.11.4, Redis Pub/Sub event collector, `waitForEvent()` with 15s timeout. |
| **Ownership** | Platform team or cross-functional ownership. |
| **Technique** | Scenario-based testing (29119-4 §B.7), use-case testing. |

**Current E2E test inventory** (`tests/e2e/full-pipeline.test.ts`):

| Group | Test | What It Verifies |
|-------|------|-----------------|
| **core-app-1 → pipeline** | PlannedOutage flows through full pipeline | HTTP → Gateway → SQS → Redis event |
| | Default outage parameters preserved | Field values arrive intact |
| | Multiple notifications produce distinct events | No duplication or merging |
| **siebel → pipeline** | ServiceRequest flows through full pipeline | HTTP → Gateway → SQS → Redis event |
| | AccountUpdate flows through full pipeline | Different action type routed correctly |
| | Default parameters produce correct payload | Siebel-specific fields preserved |
| **Cross-app round trip** | core-app-1 outage reaches event bus | Events match `IntegrationEvent` schema |
| | siebel request reaches event bus | Events match `IntegrationEvent` schema |
| | Concurrent messages from both apps processed independently | Parallel sends don't interfere |
| | Events contain consistent timestamps/metadata | `eventType`, `source`, `timestamp` present |

**Event collection pattern:** Tests use a shared `createEventCollector()` helper that subscribes to Redis `integration-events` topic and exposes `waitForEvent(predicate, timeout)` for async assertion.

---

### 5.5 Performance Testing

**Goal:** Validate that the platform meets throughput, latency, and stability requirements under realistic load conditions.

| Aspect | Detail |
|--------|--------|
| **What is tested** | Response times, throughput, resource consumption, stability under sustained and peak load. |
| **What is NOT tested** | Functional correctness (covered by other levels). |
| **When to run** | Weekly in CI, before major releases, after infrastructure changes. |
| **Tooling** | k6 (planned). |
| **Ownership** | Platform / QA team. |
| **Technique** | Performance testing (29119-4 §B.10). |

#### 5.5.1 Performance Objectives

| # | Objective | Target |
|---|-----------|--------|
| P1 | SOAP request-to-response latency (synchronous) | P95 < 500 ms |
| P2 | End-to-end pipeline latency (HTTP → Redis event) | P95 < 5 seconds |
| P3 | Sustained throughput under normal load | ≥ 50 requests/second |
| P4 | System stability under extended load | Zero errors over 30-minute soak |
| P5 | Resource usage under load | No container restarts, memory < 512 MB per service |

#### 5.5.2 Performance Test Types

| Type | Purpose | Duration |
|------|---------|----------|
| **Load test** | Verify system handles expected concurrent users. | 5 minutes |
| **Stress test** | Find the breaking point — increase load until failures appear. | 10 minutes (ramp) |
| **Soak test** | Detect memory leaks, connection pool exhaustion, queue buildup. | 30–60 minutes |
| **Spike test** | Verify recovery from sudden traffic bursts. | 2 minutes (burst) |

#### 5.5.3 Performance Scenarios

**Scenario 1: SOAP Gateway Throughput**
```
Target:   POST http://localhost:8080/soap
Payload:  Valid SOAP XML (PlannedOutage)
VUs:      Ramp 1 → 50 → 100 over 5 minutes
Assert:   P95 response time < 500ms, error rate < 1%
```

**Scenario 2: End-to-End Pipeline Latency**
```
Target:   POST http://localhost:3001/api/send (core-app-1)
Measure:  Time from HTTP request to IntegrationEvent appearing on Redis
VUs:      10 concurrent users, steady state 5 minutes
Assert:   P95 < 5 seconds, zero lost messages
```

**Scenario 3: Work Order Flow Under Load**
```
Target:   POST http://localhost:3003/api/work-orders (core-app-2)
Flow:     Create work order → SOAP to core-app-1 → approve → sync back
VUs:      Ramp 1 → 25 over 3 minutes
Assert:   P95 < 2 seconds, all approvals succeed
```

**Scenario 4: Multi-App Concurrent Load**
```
Targets:  core-app-1 /api/send + siebel /api/send + core-app-2 /api/work-orders
VUs:      20 per app (60 total), steady state 10 minutes
Assert:   No cross-app interference, all events delivered, error rate < 0.5%
```

**Scenario 5: Soak Test**
```
Target:   Mixed workload across all apps
VUs:      20 steady
Duration: 30 minutes
Assert:   No memory growth > 20%, no container restarts, latency stable
```

#### 5.5.4 Performance Metrics

| Metric | Description | Threshold |
|--------|-------------|-----------|
| `http_req_duration` | Request-to-response time | P95 < 500 ms |
| `http_req_failed` | Percentage of non-2xx responses | < 1% |
| `http_reqs` | Total requests per second (throughput) | ≥ 50 rps |
| `pipeline_latency` | HTTP trigger → Redis event received | P95 < 5 s |
| `iteration_duration` | Full scenario cycle time | P95 < 10 s |
| Container memory | RSS per Docker container | < 512 MB |
| Queue depth | ElasticMQ message backlog | < 100 at steady state |

#### 5.5.5 Baseline and Regression

- Establish baselines from the first full run and store as JSON artefacts.
- Subsequent runs compare against baselines. Flag any metric that degrades > 20%.
- Performance regression blocks release — same as a failing functional test.

---

### 5.6 Features Excluded from Testing

| Feature | Rationale |
|---------|-----------|
| Vue.js UI rendering and component behaviour | Out of scope; covered by separate front-end unit test plan. |
| AWS production infrastructure (Lambda, real SQS) | Tested via staging smoke tests only; not covered by automated local tests. |
| Security / penetration testing | Requires separate security test plan. |
| Accessibility and usability | Requires separate UX testing approach. |
| Database / persistence layer | Current architecture uses in-memory stores; no database under test. |

### 5.7 Test Level Selection Guide

| Question | Recommended Level |
|----------|-------------------|
| "Does my request payload match what the provider expects?" | **Contract** |
| "Does the API gateway route my request to the right service?" | **Integration** |
| "Does the soap processor correctly parse XML and queue a message?" | **Integration** |
| "Can a work order go from creation to approval across two apps?" | **End-to-End** |
| "Will a schema change break downstream consumers?" | **Contract** |
| "Does the full async pipeline deliver events within 15 seconds?" | **End-to-End** |
| "Is the system fast enough under load?" | **Performance** |

---

## 6. Entry & Exit Criteria

*(29119-3 §7.6 — Completion criteria; IEEE 829 §9–§10)*

### 6.1 Generic Entry Criteria (Testing May Begin When)

These criteria apply to **all projects** on the platform. Project test plans may add additional criteria.

| # | Criterion |
|---|-----------|
| EC-1 | Code compiles and passes linting with zero errors. |
| EC-2 | Contract schemas are defined in `contracts/schemas.ts` for all new or changed interfaces. |
| EC-3 | Docker Compose stack starts cleanly (`docker-compose up -d`) and all health checks pass. |
| EC-4 | All test dependencies are installed (`npm install` / `mvn dependency:resolve`). |
| EC-5 | Test environment configuration matches the target profile (local / CI / staging). |

### 6.2 Generic Exit Criteria (Release Is Approved When)

| # | Criterion | Threshold |
|---|-----------|-----------|
| XC-1 | Contract tests passing | 100% |
| XC-2 | Integration tests passing | 100% |
| XC-3 | E2E tests passing | 100% |
| XC-4 | Performance baselines met | No metric degraded > 20% from baseline |
| XC-5 | No critical or high severity defects open | 0 |
| XC-6 | Test coverage on new/changed code | ≥ 80% |
| XC-7 | All Pact contracts verified by providers | `can-i-deploy` returns success |

### 6.3 Suspension Criteria

Testing **shall be suspended** when any of the following occur:

| # | Condition | Action |
|---|-----------|--------|
| SC-1 | Docker Compose stack fails to start or a critical service is unreachable. | Halt integration and E2E tests. Contract tests may continue. |
| SC-2 | > 30% of tests in a level fail in a single run. | Suspend that level. Investigate systemic cause before re-run. |
| SC-3 | A blocking defect is discovered in shared infrastructure (Nginx, Redis, ElasticMQ). | Suspend all levels pending fix. |
| SC-4 | Test data or environment corruption is detected. | Suspend, reset environment, re-run. |

### 6.4 Resumption Criteria

| # | Condition |
|---|-----------|
| RC-1 | Root cause of suspension is identified and fixed. |
| RC-2 | Docker Compose stack passes health checks on all services. |
| RC-3 | A clean re-run of the previously suspended level shows ≤ 5% failure rate. |

---

## 7. Test Environment Strategy

*(29119-3 §7.7 — Test environment; IEEE 829 §13)*

### 7.1 Environment Matrix

| Environment | Infrastructure | Test Levels Run |
|-------------|---------------|-----------------|
| **Local (no infra)** | Developer machine only | Contract consumer tests |
| **Local (Docker Compose)** | `docker-compose up` in `integration-layer/` | Contract, integration, E2E |
| **CI pipeline** | Docker Compose in CI runner | Contract → Integration → E2E → Performance (gated) |
| **Staging** | Real AWS services (Lambda, SQS, SNS, ElastiCache) | E2E smoke, performance, exploratory |

### 7.2 Docker Compose Services

| Service | Image | Port | Health Check |
|---------|-------|------|-------------|
| api-gateway | nginx:alpine | 8080 | `GET /` → 200 |
| soap-processor | Custom (Express) | 5000 | `GET /health` → 200 |
| elasticmq | softwaremill/elasticmq-native | 9424 | TCP connect |
| event-publisher | Custom (Node.js poller) | — | Log-based |
| redis | redis:7-alpine | 6380 | `PING` → `PONG` |
| pubsub-subscriber | Custom (Node.js) | — | Log-based |

### 7.3 Software Prerequisites

| Software | Minimum Version |
|----------|----------------|
| Node.js | 18.x |
| npm | 9.x |
| Docker & Docker Compose | 24.x / Compose v2 |
| Java JDK | 17 |
| Apache Maven | 3.9.x |

---

## 8. Retest & Regression Testing

*(29119-3 §7.8)*

### 8.1 Retest Policy

When a defect is fixed, the **specific failing test(s)** must be re-executed to confirm the fix. The developer includes the test case reference in the fix commit.

### 8.2 Regression Testing Policy

| Trigger | Regression Scope |
|---------|-----------------|
| Any code change to a client app | Full contract + integration + E2E suite for that app. |
| Change to `contracts/schemas.ts` | **All** contract consumer + provider tests across all apps. |
| Change to integration-layer code | Full integration + E2E suite. |
| Change to Docker Compose or infrastructure config | Full regression: all levels. |
| Dependency version upgrade | Full regression: all levels. |

### 8.3 Regression Automation

All regression tests are automated and run in CI. There is no manual regression test suite. The pipeline enforces the regression scope based on changed file paths.

---

## 9. Test Design Techniques

*(29119-3 §7.9; 29119-4)*

| Technique (29119-4 ref) | Applied At | How |
|--------------------------|-----------|-----|
| **Interface testing** (§B.9) | Contract, Integration | Pact contracts verify consumer-provider interface agreements. Integration tests verify HTTP/SOAP interfaces. |
| **Equivalence partitioning** (§B.1) | Integration | Valid SOAP, invalid XML, missing envelope — one representative from each partition. |
| **Boundary value analysis** (§B.2) | Integration | Empty body, minimal payload, maximal payload. |
| **State transition testing** (§B.3) | E2E | Message flows through states: submitted → queued → published → delivered. |
| **Scenario-based testing** (§B.7) | E2E | Full user journeys: PlannedOutage pipeline, work order creation → approval. |
| **Performance testing** (§B.10) | Performance | Load, stress, soak, spike against SOAP gateway and async pipeline. |

---

## 10. Automation Strategy

*(29119-3 §7.10 — Test implementation and execution)*

### 10.1 Dual-Stack Architecture

All automated tests are implemented in two technology stacks to support diverse team skills and CI environments:

| Stack | Framework | Assertion Library | Contract Tool | Runner |
|-------|-----------|-------------------|---------------|--------|
| **TypeScript** | Vitest 4.0.18 | Built-in `expect` | Pact JS 16.2.0 | `npm run test:*` |
| **Java** | JUnit 5.11.4 | AssertJ 3.27.3 | Pact JVM 4.6.16 | Maven Surefire 3.5.2 |

### 10.2 Test Count Summary

| Level | TypeScript | Java | Total |
|-------|:---------:|:----:|:-----:|
| Contract (consumer) | 6 | 6 | 12 |
| Contract (provider) | 3 | 2+ | 5+ |
| Integration | 17 | 17 | 34 |
| E2E | 10 | 9 | 19 |
| BDD (Cucumber) | — | 6 scenarios | 6 |
| **Total** | **36** | **40+** | **76+** |

### 10.3 Test Execution Procedures

#### NPM Scripts (TypeScript)

| Command | What It Runs |
|---------|-------------|
| `npm run test:contract` | All contract tests (consumer + provider) via `vitest.config.contract.ts` |
| `npm run test:contract:consumer` | Consumer contract tests only (no Docker needed) |
| `npm run test:contract:provider` | Provider verification (Docker stack required) |
| `npm run test:integration` | All 17 integration tests (`tests/integration/`) |
| `npm run test:e2e` | All 10 E2E tests (`tests/e2e/`) |
| `npm test` | Integration + E2E sequentially |

#### Maven Profiles (Java)

| Profile | Command | What It Runs |
|---------|---------|-------------|
| `contract` | `mvn test -Pcontract` | All Pact consumer + provider tests |
| `integration` | `mvn test -Pintegration` | Infrastructure, API gateway, app-level tests |
| `e2e` | `mvn test -Pe2e` | Full pipeline tests with Redis event collection |
| `cucumber` | `mvn test -Pcucumber` | BDD scenario execution |
| `docker` | `mvn test -Pdocker` | All tests requiring Docker (integration + e2e) |

#### BDD Scenarios (Cucumber 7.21.1)

| Feature File | Scenarios | Example |
|-------------|:---------:|---------|
| `api_gateway.feature` | 2 | Valid SOAP → 202, invalid XML → 400 |
| `core_app_1.feature` | 1 | Default outage notification succeeds |
| `siebel.feature` | 1 outline × 3 examples | ServiceRequest, AccountUpdate, BillingInquiry |

### 10.4 Test Configuration Standards

| Setting | Value | Why |
|---------|-------|-----|
| `fileParallelism` | `false` | Prevent shared Docker resource contention |
| `sequence.concurrent` | `false` | Tests within a file run sequentially |
| `testTimeout` | 30,000 ms | Allow for container startup and async event delivery |
| `hookTimeout` | 30,000 ms | Allow for Redis subscriber setup/teardown |

### 10.5 Automation Principles

| Principle | Implementation |
|-----------|---------------|
| **Idempotent** | Each test creates unique IDs (`OUTAGE-*`, `SBL-*`, `WO-*`) — no shared mutable state. |
| **Self-contained** | Event collectors are created and cleaned up per test suite. |
| **Deterministic** | Async assertions use `waitForEvent(predicate, 15s)` with polling, not fixed sleeps. |
| **Reportable** | Vitest console reporter + JUnit XML Surefire reports for CI dashboards. |
| **Fast feedback** | Contract tests (< 5s) run first; integration (< 30s) next; E2E (< 60s) last. |

---

## 11. CI/CD Pipeline Integration

*(29119-3 §7.10 continued — Test execution within delivery pipeline)*

### 11.1 Pipeline Stages

```
┌──────────┐    ┌──────────────┐    ┌──────────────────┐    ┌─────────────┐    ┌─────────────┐
│  Commit   │───▶│  Contract    │───▶│  Integration     │───▶│   E2E       │───▶│ Performance │
│           │    │  Tests       │    │  Tests           │    │   Tests     │    │ (weekly/    │
└──────────┘    │  (no infra)  │    │  (Docker Compose)│    │ (full stack)│    │  release)   │
                └──────┬───────┘    └────────┬─────────┘    └──────┬──────┘    └──────┬──────┘
                       │ PASS               │ PASS                │ PASS             │ PASS
                       ▼                    ▼                     ▼                  ▼
                ┌──────────────────────────────────────────────────────────────────────────────┐
                │                           Deploy to Staging                                   │
                └──────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Gate Rules

- Contract tests must pass before integration tests start.
- Integration tests must pass before E2E tests start.
- Any failure stops the pipeline — no partial deployments.
- Contract broker `can-i-deploy` check runs before production release.
- Performance tests run on a weekly schedule and before major releases; regressions block release.

### 11.3 Schedule

| Phase | Activities | Trigger | Duration |
|-------|-----------|---------|----------|
| **Per commit** | Contract tests (consumer) | Every push / PR | < 1 minute |
| **Per commit** | Contract tests (provider) + integration tests | After contract pass | < 5 minutes |
| **Per commit** | E2E tests | After integration pass | < 5 minutes |
| **Weekly** | Full performance suite (all scenarios) | Scheduled CI job | ~60 minutes |
| **Pre-release** | All levels + extended soak test | Manual gate | ~90 minutes |
| **On demand** | Exploratory testing | After E2E pass in staging | Variable |

---

## 12. Risk Management Process

*(29119-3 §7.11 — Risk-based testing; IEEE 829 §17)*

### 12.1 Risk Assessment Approach

Risks are assessed using a **Likelihood × Impact** matrix. Each risk is assigned a mitigation strategy and an owner. High-impact risks drive test prioritisation — features associated with high risks receive deeper test coverage.

### 12.2 Risk Register

| Risk ID | Risk | Likelihood | Impact | Mitigation | Owner |
|---------|------|:----------:|:------:|------------|-------|
| R-01 | SOAP schema changes break consumers | High | High | Contract tests on every PR, broker `can-i-deploy`. | Dev teams |
| R-02 | Async messages lost or delayed | Medium | High | E2E tests with 15s timeout assertions; dead-letter queue monitoring. | Platform team |
| R-03 | Service startup order causes failures | Medium | Medium | Infrastructure health checks with `waitForService()` retry/backoff. | Platform team |
| R-04 | Performance regression undetected | Medium | High | Weekly performance tests with baseline comparison. | QA Lead |
| R-05 | Test environment drift from production | Low | High | Infrastructure-as-code; staging mirrors production topology. | Platform team |
| R-06 | Work order SOAP contract between core-app-2 ↔ core-app-1 changes | Medium | Medium | Add Pact contract tests for the work order SOAP interface. | Dev teams |
| R-07 | CI pipeline exceeds 15-minute budget | Low | Medium | Parallelise independent test suites; cache Docker images. | Platform team |

### 12.3 Risk-Based Test Prioritisation

Features mapped to high-likelihood / high-impact risks (R-01, R-02, R-04) receive:
- Contract tests at minimum (mandatory).
- Integration tests for every interface.
- E2E tests for every critical path.
- Performance regression checks weekly.

---

## 13. Incident Management

*(29119-3 §7.12)*

### 13.1 Defect Lifecycle

```
  Found → Logged → Triaged → Assigned → Fixed → Retested → Closed
                     ↓                              ↓
                  Deferred                       Reopened
```

### 13.2 Severity Classification

| Severity | Definition | Response SLA |
|----------|-----------|:------------:|
| **Critical** | Pipeline blocked, no workaround. Core integration flow broken. | Fix within 4 hours |
| **High** | Feature broken, workaround exists. Contract or E2E test failing. | Fix within 1 business day |
| **Medium** | Non-critical behaviour deviation. Edge case failure. | Fix within current sprint |
| **Low** | Cosmetic, minor inconsistency, test flakiness. | Backlog |

### 13.3 Defect Reporting Requirements

Each defect report shall include:

| Field | Required |
|-------|:--------:|
| Summary / title | Yes |
| Severity and priority | Yes |
| Steps to reproduce | Yes |
| Expected vs actual result | Yes |
| Test level and test case reference (if applicable) | Yes |
| Environment (local / CI / staging) | Yes |
| Screenshots / logs | Recommended |
| Commit SHA or build number | Yes |

---

## 14. Test Data Strategy

*(29119-3 §7.13)*

| Data Type | Source | Management |
|-----------|--------|------------|
| SOAP request payloads | Hardcoded in test files with unique IDs per execution | Generated dynamically with `OUTAGE-*`, `SBL-*`, `WO-*` prefixes |
| Pact contract JSON files | Generated by consumer tests into `pacts/` directory | Version-controlled; regenerated on consumer test run |
| Expected response schemas | Defined in `contracts/schemas.ts` (Zod) | Shared across all test stacks |
| Redis event payloads | Published by event-publisher during test execution | Captured by `createEventCollector()` subscriber |
| Docker Compose configuration | `integration-layer/docker-compose.yml` | Version-controlled, deterministic startup |

**No persistent test data or external databases are required.** All test state is ephemeral and scoped to a single test run.

---

## 15. Staffing, Roles & Training

*(29119-3 §7.14; IEEE 829 §14–§15)*

### 15.1 Roles & Responsibilities

| Role | Responsibilities |
|------|-----------------|
| **Development team** | Write and maintain contract consumer tests and app-level integration tests. Fix failing contracts. |
| **Platform / integration team** | Write and maintain provider verification, E2E tests, and performance tests. Maintain Docker Compose and CI infrastructure. |
| **QA / test lead** | Define and maintain this strategy. Review coverage gaps. Own Cucumber BDD scenarios and exploratory testing. |
| **Engineering leadership** | Approve strategy changes, allocate resources, review metrics quarterly. |
| **All teams** | Keep tests green. A broken test is treated with the same urgency as a broken build. |

### 15.2 Training Needs

| Skill | Required By | Priority |
|-------|-------------|----------|
| Pact consumer-driven contract testing | All developers | High |
| k6 performance scripting | Platform / QA | Medium |
| Cucumber / Gherkin BDD | QA leads, business analysts | Medium |
| Docker Compose troubleshooting | All developers | Low |

---

## 16. Test Measurement & Metrics

*(29119-3 §7.15; IEEE 829 §12)*

| Metric | Target | Measured By | Reporting Frequency |
|--------|--------|-------------|---------------------|
| Contract test pass rate | 100% | CI pipeline | Every commit |
| Integration test pass rate | 100% | CI pipeline | Every commit |
| E2E test pass rate | ≥ 95% (flake budget) | CI pipeline | Every commit |
| SOAP gateway P95 latency | < 500 ms | k6 performance run | Weekly |
| Pipeline P95 latency | < 5 seconds | k6 performance run | Weekly |
| Time from commit to test result | < 15 minutes | CI pipeline duration | Every commit |
| Mean time to fix broken test | < 4 hours | Issue tracker | Weekly review |
| Test coverage on integration code | ≥ 80% | Coverage tool | Per release |
| Requirements traceability | 100% features mapped | Traceability matrix (§17) | Per release |
| Defect detection effectiveness | > 90% defects found before staging | Defect analysis | Quarterly |

---

## 17. Requirements Traceability

*(29119-3 §7.16)*

| Feature ID | Feature | Contract Tests | Integration Tests | E2E Tests | Performance Scenarios |
|------------|---------|:--------------:|:-----------------:|:---------:|:---------------------:|
| F-01 | SOAP envelope construction | Consumer pacts | — | — | — |
| F-02 | Consumer-provider agreement | Provider verification | — | — | — |
| F-03 | Message/event schema conformance | Message pacts | — | Cross-app schema checks | — |
| F-04 | API Gateway routing | — | Gateway routing suite (4) | — | Scenario 1 |
| F-05 | Infrastructure health | — | Health check suite (5) | — | — |
| F-06 | Service-to-service communication | — | App API suites (8) | — | — |
| F-07 | Async pipeline delivery | — | — | Pipeline flow tests | Scenario 2 |
| F-08 | Cross-app round trips | — | — | Cross-app suite (4) | Scenario 4 |
| F-09 | Work order flow | — | — | — | Scenario 3 |
| F-10 | Gateway throughput | — | — | — | Scenario 1 |
| F-11 | Pipeline latency under load | — | — | — | Scenario 2 |
| F-12 | System stability (soak) | — | — | — | Scenario 5 |

---

## 18. Test Deliverables

*(29119-3 §7.17; IEEE 829 §11)*

| Deliverable | Format | Produced By | Frequency |
|-------------|--------|-------------|-----------|
| This enterprise test strategy | Markdown (version-controlled) | QA Lead | Updated per major release |
| Project test plans (per release) | Markdown | QA / Dev leads | Per release |
| Pact contract files | JSON (`pacts/*.json`) | Consumer test runs | Every commit |
| Vitest test results | Console output + CI log | `npm test` | Every commit |
| JUnit Surefire reports | XML (`target/surefire-reports/`) | `mvn test` | Every commit |
| Cucumber report | HTML (`target/cucumber-reports/report.html`) | `mvn test -Pcucumber` | Every commit |
| k6 performance results | JSON + stdout summary | k6 CLI | Weekly / pre-release |
| Performance baseline | JSON artefact | First k6 run | Established once, updated on infra change |
| Test incident reports | Issue tracker | Tester who discovers defect | As needed |
| Test completion reports | Markdown | QA Lead | Per release |

---

## 19. Configuration Management

*(29119-3 §7.18)*

| Item | Location | Versioning |
|------|----------|-----------|
| Test strategy (this document) | `docs/standard-test-strategy.md` | Git — tagged per release |
| Test code (TypeScript) | `*/tests/**/*.test.ts` | Git — same branch as application code |
| Test code (Java) | `playwright-java-framework/src/test/java/` | Git — same branch as application code |
| Pact contracts | `pacts/*.json` | Git — regenerated by consumer tests |
| Shared schemas | `contracts/schemas.ts` | Git — changes trigger contract re-verification |
| Docker Compose config | `integration-layer/docker-compose.yml` | Git — changes require full regression |
| Vitest config | `vitest.config.ts`, `vitest.config.contract.ts` | Git |
| Maven config | `playwright-java-framework/pom.xml` | Git |
| k6 scripts | `tests/performance/` (planned) | Git |

**Change control:** Any change to shared schemas (`contracts/schemas.ts`) or Pact contract files must trigger a full contract + provider verification cycle before merging.

---

## 20. Strategy Review & Governance

*(29119-3 §7.19)*

### 20.1 Review Cadence

| Review | Frequency | Participants | Output |
|--------|-----------|-------------|--------|
| Strategy review | Quarterly | QA Lead, Tech Lead, Engineering Manager | Updated strategy document (if changed) |
| Metrics review | Monthly | QA Lead, Dev leads | Dashboard update, action items for regressions |
| Risk register review | Quarterly | QA Lead, Tech Lead | Updated risk register, new mitigations |
| Tooling assessment | Semi-annually | QA Lead, Platform team | Evaluation of tool upgrades or replacements |

### 20.2 Approval Authority

This enterprise test strategy is effective upon approval by all signatories listed in the Document Control section. Changes to test policy (§4.1), exit criteria (§6.2), or risk thresholds (§12) require re-approval.

---

## Appendix A: Quick Reference

```
Contract Tests    → "Do we agree on the shape of data?"
Integration Tests → "Do our services talk to each other correctly?"
End-to-End Tests  → "Does the whole workflow actually work?"
Performance Tests → "Is it fast and stable enough under load?"
```

## Appendix B: Glossary

*(IEEE 829 §19; 29119-1 Definitions)*

| Term | Definition |
|------|-----------|
| **Consumer** | A service that calls or depends on another service's API or messages. |
| **Provider** | A service that exposes an API or produces messages consumed by others. |
| **Pact** | A consumer-driven contract testing framework that generates verifiable JSON contracts. |
| **Contract (Pact file)** | A JSON file specifying the expected interactions between a consumer and provider. |
| **can-i-deploy** | A Pact Broker CLI command that verifies all contracts are satisfied before deployment. |
| **ElasticMQ** | A lightweight, SQS-compatible message queue used locally in place of AWS SQS. |
| **SUT (System Under Test)** | The complete integration platform, including all client apps and the integration layer. |
| **VU (Virtual User)** | A simulated concurrent user in k6 performance tests. |
| **P95** | The 95th percentile — 95% of observations fall below this value. |
| **Soak test** | A performance test run over an extended period to detect resource leaks. |
| **Entry criteria** | Conditions that must be met before test execution begins (29119-1 §3.1.16). |
| **Exit criteria** | Conditions that must be met to declare testing complete (29119-1 §3.1.19). |
| **Test level** | A group of test activities organised and managed together (29119-1 §3.1.49). |
| **Test type** | A group of test activities based on specific test objectives (29119-1 §3.1.56). |
| **Test strategy** | A description of the generic test approach at the organisational level (29119-1 §3.1.53). |
| **Test policy** | A high-level document describing the principles, approach, and objectives of testing within the organisation (29119-1 §3.1.50). |
| **BDD** | Behaviour-Driven Development — writing tests as human-readable scenarios (Given/When/Then). |
| **Regression testing** | Re-running tests after a change to ensure existing functionality is not broken. |

## Appendix C: Standards Clause Mapping

| Document Section | IEEE 829-2008 Clause | ISO/IEC/IEEE 29119-3:2021 Clause |
|------------------|---------------------|----------------------------------|
| Document Control | §1 (Identifier) | §7.1 (Strategy Identifier) |
| §1 Introduction | §3 (Introduction) | §7.1 (Context of testing) |
| §2 References | §2 (References) | §7.2 (References) |
| §3 System Context | §4 (Test Items) | §7.3 (Context of testing) |
| §4 Guiding Principles & Policy | — | §7.4 (Generic test strategy elements) |
| §5 Test Levels & Types | §5 (Features to be tested) | §7.5 (Test levels and types) |
| §6 Entry & Exit Criteria | §9–§10 (Criteria, Suspension) | §7.6 (Completion criteria) |
| §7 Test Environment | §13 (Environmental Needs) | §7.7 (Test environment) |
| §8 Retest & Regression | — | §7.8 (Retest and regression) |
| §9 Test Design Techniques | — | §7.9 (Test design techniques) |
| §10 Automation Strategy | — | §7.10 (Test implementation and execution) |
| §11 CI/CD Pipeline | — | §7.10 (Test execution continued) |
| §12 Risk Management | §17 (Risks & Contingencies) | §7.11 (Risk-based testing) |
| §13 Incident Management | — | §7.12 (Incident management) |
| §14 Test Data Strategy | — | §7.13 (Test data management) |
| §15 Staffing & Training | §14–§15 (Staffing, Responsibilities) | §7.14 (Staffing and training) |
| §16 Metrics & Reporting | §12 (Remaining Tasks) | §7.15 (Test measurement) |
| §17 Requirements Traceability | — | §7.16 (Traceability) |
| §18 Test Deliverables | §11 (Test Deliverables) | §7.17 (Test deliverables) |
| §19 Configuration Management | — | §7.18 (Configuration management) |
| §20 Governance | §18 (Approvals) | §7.19 (Review and maintenance) |
| Appendix B Glossary | §19 (Glossary) | 29119-1 Definitions |
