# Testing Documentation

> **Comprehensive test coverage report for the AWS Integration Example project.**
> Covers both TypeScript (Vitest + Pact) and Java (JUnit 5 + Playwright + Pact JVM + Cucumber) test suites.

---

## Table of Contents

- [System Architecture](#system-architecture)
- [Test Coverage Overview](#test-coverage-overview)
- [Test Layers Diagram](#test-layers-diagram)
- [1. Infrastructure Health Checks](#1-infrastructure-health-checks)
- [2. Integration API Tests](#2-integration-api-tests)
- [3. End-to-End Pipeline Tests](#3-end-to-end-pipeline-tests)
- [4. Contract Tests – Consumer](#4-contract-tests--consumer)
- [5. Contract Tests – Provider](#5-contract-tests--provider)
- [6. Cucumber BDD Tests](#6-cucumber-bdd-tests-java-only)
- [Test Count Summary](#test-count-summary)
- [Coverage Rationale Matrix](#coverage-rationale-matrix)

---

## System Architecture

```mermaid
flowchart LR
    subgraph Clients["Client Applications"]
        CA1["core-app-1\n(Express :4001)\nPlannedOutage Sender"]
        SBL["siebel\n(Express :3002)\nServiceRequest Sender\n+ Event Listener"]
    end

    subgraph IL["Integration Layer (Docker Compose)"]
        GW["API Gateway\n(Nginx :8080)"]
        SP["soap-processor\n(Express :5000)"]
        SQS["ElasticMQ / SQS\n(:9424)"]
        EP["event-publisher\n(Node.js poller)"]
        RD["Redis\n(:6380)"]
        PS["pubsub-subscriber\n(Node.js)"]
    end

    CA1 -- "POST /soap\n(SOAP XML)" --> GW
    SBL -- "POST /soap\n(SOAP XML)" --> GW
    GW -- "proxy /soap" --> SP
    SP -- "SendMessage\n(JSON payload)" --> SQS
    SQS -- "ReceiveMessage\n(poll)" --> EP
    EP -- "PUBLISH\nIntegrationEvent" --> RD
    RD -- "SUBSCRIBE\nintegration-events" --> PS
    RD -- "SUBSCRIBE\nintegration-events" --> SBL

    style CA1 fill:#4A90D9,color:#fff
    style SBL fill:#4A90D9,color:#fff
    style GW fill:#F5A623,color:#fff
    style SP fill:#F5A623,color:#fff
    style SQS fill:#7B68EE,color:#fff
    style EP fill:#F5A623,color:#fff
    style RD fill:#D0021B,color:#fff
    style PS fill:#F5A623,color:#fff
```

**Data Flow:**

1. **core-app-1** or **siebel** sends a `POST /api/send` → builds SOAP XML → forwards to **API Gateway**
2. **API Gateway** (Nginx) proxies `/soap` to **soap-processor**
3. **soap-processor** parses SOAP XML, extracts payload, sends JSON to **SQS** (ElasticMQ)
4. **event-publisher** polls SQS, transforms message into an `IntegrationEvent`, publishes to **Redis Pub/Sub**
5. **pubsub-subscriber** and **siebel's event-listener** receive the event

---

## Test Coverage Overview

The following diagram shows every integration point in the system and which test layers cover it. Each colored zone represents a test category.

```mermaid
flowchart TB
    subgraph infra_zone["🟢 Infrastructure Health Checks"]
        direction LR
        I1["Gateway\n/health ✓"]
        I2["core-app-1\n/health ✓"]
        I3["siebel\n/health ✓"]
        I4["Redis\nPING ✓"]
        I5["ElasticMQ\nreachable ✓"]
    end

    subgraph integration_zone["🔵 Integration API Tests"]
        direction TB
        A1["API Gateway\nSOAP routing\n(valid/invalid/unique IDs)"]
        A2["core-app-1 → Gateway\nPOST /api/send\n(outage params, SOAP echo)"]
        A3["siebel → Gateway\nPOST /api/send\n(request params, msg types)"]
    end

    subgraph e2e_zone["🟣 End-to-End Pipeline Tests"]
        direction TB
        E1["core-app-1 → Gateway →\nSOAP Processor → SQS →\nEvent Publisher → Redis"]
        E2["siebel → Gateway →\nSOAP Processor → SQS →\nEvent Publisher → Redis"]
        E3["Cross-app\nconcurrent messages\n+ timestamp verification"]
    end

    subgraph contract_zone["🟠 Contract Tests"]
        direction TB
        C1["Consumer HTTP:\ncore-app-1 SOAP pact\nsiebel SOAP pact"]
        C2["Consumer Message:\nsiebel IntegrationEvent pact"]
        C3["Provider HTTP:\nintegration-layer verifies\nconsumer SOAP pacts"]
        C4["Provider Message:\nevent-publisher verifies\nevent message pacts"]
    end

    subgraph bdd_zone["🟡 Cucumber BDD (Java)"]
        direction LR
        B1["api_gateway.feature"]
        B2["core_app_1.feature"]
        B3["siebel.feature"]
    end

    style infra_zone fill:#c8e6c9,stroke:#2e7d32
    style integration_zone fill:#bbdefb,stroke:#1565c0
    style e2e_zone fill:#e1bee7,stroke:#6a1b9a
    style contract_zone fill:#ffe0b2,stroke:#e65100
    style bdd_zone fill:#fff9c4,stroke:#f9a825
```

---

## Test Layers Diagram

This diagram shows which portion of the architecture each test layer exercises, from narrow (unit-like) to broad (full system).

```mermaid
flowchart LR
    CA1["core-app-1"]
    SBL["siebel"]
    GW["API Gateway"]
    SP["soap-processor"]
    SQS["SQS / ElasticMQ"]
    EP["event-publisher"]
    RD["Redis Pub/Sub"]

    CA1 --> GW --> SP --> SQS --> EP --> RD

    SBL --> GW

    RD -.->|subscribe| SBL

    linkStyle 0 stroke:#1565c0,stroke-width:3
    linkStyle 1 stroke:#1565c0,stroke-width:3
    linkStyle 2 stroke:#6a1b9a,stroke-width:3
    linkStyle 3 stroke:#6a1b9a,stroke-width:3
    linkStyle 4 stroke:#6a1b9a,stroke-width:3
    linkStyle 5 stroke:#1565c0,stroke-width:3
    linkStyle 6 stroke:#6a1b9a,stroke-width:3
```

| Color | Layer | Scope |
|-------|-------|-------|
| 🟢 Green | Infrastructure | Each service individually (health/ping) |
| 🔵 Blue | Integration API | Client → Gateway → soap-processor (HTTP request/response) |
| 🟣 Purple | End-to-End | Client → Gateway → soap-processor → SQS → event-publisher → Redis (full async pipeline) |
| 🟠 Orange | Contract | Isolated consumer expectations + provider verification (no live infra needed for consumers) |
| 🟡 Yellow | Cucumber BDD | Same scope as Integration API, expressed in Gherkin for business readability |

---

## 1. Infrastructure Health Checks

**Purpose:** Verify all Docker services and external dependencies are running and reachable before other tests execute.

```mermaid
flowchart LR
    subgraph Tested["Components Under Test"]
        GW["API Gateway\n:8080/health"]
        CA["core-app-1\n:4001/health"]
        SB["siebel\n:3002/health"]
        RD["Redis\n:6380 PING"]
        MQ["ElasticMQ\n:9424 reachable"]
    end

    TEST["Infrastructure\nTest Suite"] --> GW
    TEST --> CA
    TEST --> SB
    TEST --> RD
    TEST --> MQ

    style TEST fill:#2e7d32,color:#fff
    style GW fill:#c8e6c9
    style CA fill:#c8e6c9
    style SB fill:#c8e6c9
    style RD fill:#c8e6c9
    style MQ fill:#c8e6c9
```

### Tests (5 per suite)

| # | Test | Assertion |
|---|------|-----------|
| 1 | API Gateway is healthy | `GET /health` → `{"status":"ok","service":"api-gateway"}` |
| 2 | core-app-1 is healthy | `GET /health` → `{"status":"ok","service":"core-app-1"}` |
| 3 | siebel is healthy | `GET /health` → `{"status":"ok","service":"siebel"}` |
| 4 | Redis is reachable | `PING` → `PONG` |
| 5 | ElasticMQ is reachable | `GET /` returns any HTTP status |

### Files

| Suite | File |
|-------|------|
| TypeScript | `tests/integration/infrastructure.test.ts` |
| Java | `playwright-java-framework/.../integration/InfrastructureTest.java` |

### Why This Coverage Matters

> **Fail-fast guarantee.** If any infrastructure component is down, all downstream tests would fail with misleading connection errors. Health checks provide a clear diagnostic signal—when these fail, the problem is environment setup, not application logic. This saves significant debugging time in CI pipelines and local development.

---

## 2. Integration API Tests

**Purpose:** Verify that each application's REST endpoint correctly builds SOAP XML, sends it through the API Gateway, and the integration-layer returns proper responses.

```mermaid
flowchart LR
    subgraph api_gw_tests["API Gateway Tests (4)"]
        T1["Valid SOAP → 202"]
        T2["Invalid XML → 400"]
        T3["Missing envelope → 400"]
        T4["Unique RequestIds"]
    end

    subgraph core_tests["core-app-1 Tests (4)"]
        T5["Default outage → 202"]
        T6["Custom params → 202"]
        T7["SOAP echo matches ID"]
        T8["Valid scheduled times"]
    end

    subgraph siebel_tests["siebel Tests (4)"]
        T9["Default request → 202"]
        T10["Custom params → 202"]
        T11["SOAP echo matches ID"]
        T12["4 message types"]
    end

    api_gw_tests --> GW["API Gateway\n(Nginx)"]
    core_tests --> CA["core-app-1"] --> GW
    siebel_tests --> SB["siebel"] --> GW
    GW --> SP["soap-processor"]

    style api_gw_tests fill:#bbdefb,stroke:#1565c0
    style core_tests fill:#bbdefb,stroke:#1565c0
    style siebel_tests fill:#bbdefb,stroke:#1565c0
    style GW fill:#F5A623,color:#fff
    style SP fill:#F5A623,color:#fff
```

### Tests (12 per suite)

| Group | # | Test | Key Assertions |
|-------|---|------|----------------|
| **API Gateway** | 1 | Valid SOAP → 202 | Status 202, body contains `<res:Status>Accepted</res:Status>` |
| | 2 | Invalid XML → 400 | Status 400, body contains `Missing SOAP Body` |
| | 3 | Missing envelope → 400 | Status 400, body contains `Missing SOAP Body` |
| | 4 | Unique RequestIds | 3 consecutive requests produce 3 distinct IDs |
| **core-app-1** | 5 | Default outage | `outageId` starts with `OUTAGE-`, system=`Siebel CRM`, severity=`MEDIUM` |
| | 6 | Custom parameters | All custom fields (system, region, severity, description) echoed back |
| | 7 | SOAP response ID match | Response XML `<res:RequestId>` matches sent outageId |
| | 8 | Valid scheduled times | `scheduledEnd - scheduledStart ≈ 2 hours` |
| **siebel** | 9 | Default request | `requestId` starts with `SBL-`, action=`ServiceRequest`, accountId=`ACC-2048` |
| | 10 | Custom parameters | All 6 custom fields (type, account, contact, service, priority, description) verified |
| | 11 | SOAP response ID match | Response XML `<res:RequestId>` matches sent requestId |
| | 12 | Different message types | `ServiceRequest`, `AccountUpdate`, `ContactChange`, `BillingInquiry` all succeed |

### Files

| Suite | File |
|-------|------|
| TypeScript | `tests/integration/api-gateway.test.ts` |
| TypeScript | `tests/integration/core-app-1.test.ts` |
| TypeScript | `tests/integration/siebel.test.ts` |
| Java | `playwright-java-framework/.../integration/ApiGatewayTest.java` |
| Java | `playwright-java-framework/.../integration/CoreApp1Test.java` |
| Java | `playwright-java-framework/.../integration/SiebelTest.java` |

### Why This Coverage Matters

> **Validates the synchronous request-response contract** between each client application and the integration layer. These tests catch:
> - SOAP XML serialization bugs (wrong tags, missing namespaces, encoding issues)
> - API Gateway routing misconfigurations (Nginx proxy rules)
> - soap-processor parsing regressions (body extraction, error handling)
> - Parameter passthrough integrity (custom fields not lost in transit)
>
> Without these, a change to the SOAP XML structure in one app could silently break the integration-layer without anyone noticing until production.

---

## 3. End-to-End Pipeline Tests

**Purpose:** Verify the **complete asynchronous pipeline** from initial HTTP request through SQS message queuing to Redis Pub/Sub event delivery.

```mermaid
flowchart LR
    subgraph E2E["E2E Test Suite"]
        direction TB
        P1["core-app-1 pipeline (3 tests)"]
        P2["siebel pipeline (3 tests)"]
        P3["Cross-app round trip (3 tests)"]
    end

    CA["core-app-1\nPOST /api/send"]
    SB["siebel\nPOST /api/send"]
    GW["API Gateway"]
    SP["soap-processor"]
    SQS["SQS\n(ElasticMQ)"]
    EP["event-publisher"]
    RD["Redis\nPub/Sub"]
    EC["EventCollector\n(test subscriber)"]

    P1 --> CA
    P2 --> SB
    P3 --> CA
    P3 --> SB

    CA --> GW --> SP --> SQS --> EP --> RD --> EC

    SB --> GW

    style E2E fill:#e1bee7,stroke:#6a1b9a
    style EC fill:#6a1b9a,color:#fff
    style RD fill:#D0021B,color:#fff
    style SQS fill:#7B68EE,color:#fff
```

### Tests (9 per suite)

| Group | # | Test | What It Verifies |
|-------|---|------|-----------------|
| **core-app-1 → Redis** | 1 | PlannedOutage full pipeline | Event arrives with correct `eventType`, `source`, `requestId`, `status=PROCESSED`, and full payload |
| | 2 | Default parameters preserved | Default `System=Siebel CRM`, `Region=US-WEST-2`, `Severity=MEDIUM` survive the pipeline |
| | 3 | Multiple distinct events | 3 outage notifications → 3 distinct events on Redis |
| **siebel → Redis** | 4 | ServiceRequest full pipeline | All 6 payload fields (Action, AccountId, Contact, ServiceType, Priority, Source) arrive intact |
| | 5 | AccountUpdate full pipeline | `Action=AccountUpdate` with custom account + priority |
| | 6 | Default parameters preserved | Default `AccountId=ACC-2048`, `ContactName=John Doe`, `Priority=NORMAL` survive |
| **Cross-app** | 7 | core-app-1 → event bus | Outage event reaches Redis with correct Action + System |
| | 8 | siebel → event bus | Service request event reaches Redis with correct Action + AccountId |
| | 9 | Timestamps & metadata | `timestamp ≥ beforeSend`, `source=event-publisher`, `originalSource=soap-processor` |

### EventCollector Pattern

Both TypeScript and Java suites use an **EventCollector** that subscribes to Redis Pub/Sub `integration-events` topic and provides a `waitForEvent(predicate, timeout)` method to match arriving events by `requestId` or other fields.

### Files

| Suite | File |
|-------|------|
| TypeScript | `tests/e2e/full-pipeline.test.ts` |
| Java | `playwright-java-framework/.../e2e/FullPipelineTest.java` |

### Why This Coverage Matters

> **The only tests that verify the asynchronous message pipeline works end-to-end.** This is the most critical coverage area because:
> 1. **Message queuing is eventually consistent** — SQS polling + Redis Pub/Sub introduce timing dependencies that are invisible to synchronous tests
> 2. **Data transformation fidelity** — The payload passes through 4 services (app → soap-processor → SQS → event-publisher → Redis), with XML→JSON→JSON transformations at each hop. Any serialization bug would silently corrupt data
> 3. **Multi-app isolation** — Verifies that messages from different apps don't interfere with each other when processed concurrently
> 4. **Event schema integrity** — The `IntegrationEvent` structure (`eventType`, `source`, `timestamp`, `detail.requestId`, `detail.processedPayload`, `detail.status`) is the system's observable output. If this breaks, downstream consumers (like siebel's event-listener) fail silently

---

## 4. Contract Tests – Consumer

**Purpose:** Define and lock down the expectations each consumer has of the integration-layer's API, **without needing any live services running**.

```mermaid
flowchart TB
    subgraph consumer_http["HTTP Consumer Contracts"]
        C1["core-app-1\n→ integration-layer\n(2 pacts)"]
        C2["siebel\n→ integration-layer\n(2 pacts)"]
    end

    subgraph consumer_msg["Message Consumer Contracts"]
        C3["siebel\n← integration-layer-events\n(2 pacts)"]
    end

    C1 -->|generates| P1["core-app-1-integration-layer.json"]
    C2 -->|generates| P2["siebel-integration-layer.json"]
    C3 -->|generates| P3["siebel-integration-layer-events.json"]

    subgraph mock["Pact Mock Server"]
        MS["Simulates integration-layer\nfor HTTP contracts"]
    end

    subgraph mock_msg["Pact Message Handler"]
        MH["Delivers test messages\nfor event contracts"]
    end

    C1 -.-> MS
    C2 -.-> MS
    C3 -.-> MH

    style consumer_http fill:#ffe0b2,stroke:#e65100
    style consumer_msg fill:#ffe0b2,stroke:#e65100
    style P1 fill:#fff3e0
    style P2 fill:#fff3e0
    style P3 fill:#fff3e0
```

### HTTP Consumer Pacts (4 tests per suite)

| Consumer | # | Interaction | Expected Response |
|----------|---|------------|-------------------|
| **core-app-1** | 1 | `POST /soap` with PlannedOutage SOAP XML | 202, `Content-Type: text/xml` |
| | 2 | `POST /soap` with XML missing SOAP Body | 400, `Content-Type: text/xml` |
| **siebel** | 3 | `POST /soap` with ServiceRequest SOAP XML | 202, `Content-Type: text/xml` |
| | 4 | `POST /soap` with AccountUpdate SOAP XML | 202, `Content-Type: text/xml` |

### Message Consumer Pacts (2 tests per suite)

| Consumer | # | Message Description | Key Fields Verified |
|----------|---|---------------------|-------------------|
| **siebel** | 1 | IntegrationEvent with status PROCESSED | `eventType`, `source`, `timestamp`, `detail.requestId`, `detail.originalSource`, `detail.processedPayload`, `detail.status` |
| | 2 | IntegrationEvent with minimal payload | `eventType`, `detail.processedPayload` (empty), `detail.status` |

### Files

| Suite | File | Type |
|-------|------|------|
| TypeScript | `core-app-1/tests/contract/soap-api.consumer.pact.test.ts` | HTTP |
| TypeScript | `siebel/tests/contract/soap-api.consumer.pact.test.ts` | HTTP |
| TypeScript | `siebel/tests/contract/integration-event.consumer.pact.test.ts` | Message |
| Java | `playwright-java-framework/.../contract/consumer/CoreApp1SoapConsumerPactTest.java` | HTTP |
| Java | `playwright-java-framework/.../contract/consumer/SiebelSoapConsumerPactTest.java` | HTTP |
| Java | `playwright-java-framework/.../contract/consumer/SiebelEventConsumerPactTest.java` | Message |

### Why This Coverage Matters

> **Consumer contracts are the safety net for independent deployability.** They matter because:
> 1. **Shift-left detection** — These tests run without Docker or any live service, making them fast (~seconds) and ideal for pre-commit hooks or early CI stages
> 2. **API evolution safety** — If the integration-layer changes its SOAP response format or event schema, the generated pact files will cause provider tests to fail *before* deployment
> 3. **Documentation as code** — Each pact file is a machine-readable specification of the exact SOAP XML structures and event schemas each consumer depends on
> 4. **Multi-repo readiness** — In a multi-repo setup, consumer pacts are published to a Pact Broker. The `can-i-deploy` check prevents incompatible versions from reaching production

---

## 5. Contract Tests – Provider

**Purpose:** Verify that the real integration-layer (or its business logic) satisfies all consumer expectations defined in the pact files.

```mermaid
flowchart TB
    subgraph pacts["Generated Pact Files"]
        P1["core-app-1-integration-layer.json"]
        P2["siebel-integration-layer.json"]
        P3["siebel-integration-layer-events.json"]
    end

    subgraph http_provider["HTTP Provider Verification"]
        PV1["SoapApiProviderPactTest\nReplays HTTP requests against\nlive API Gateway (:8080)"]
    end

    subgraph msg_provider["Message Provider Verification"]
        PV2["IntegrationEventProviderPactTest\nCalls processMessage() and\nverifies output matches pacts"]
    end

    P1 --> PV1
    P2 --> PV1
    P3 --> PV2

    PV1 --> GW["API Gateway\n(live Docker)"]
    PV2 --> PM["processMessage()\n(pure function)"]

    style pacts fill:#fff3e0,stroke:#e65100
    style http_provider fill:#ffe0b2,stroke:#e65100
    style msg_provider fill:#ffe0b2,stroke:#e65100
```

### HTTP Provider Verification

The Pact Verifier replays every HTTP interaction from the consumer pact files against the **live API Gateway** (Nginx → soap-processor chain). This proves the real provider returns responses matching consumer expectations.

| Provider | Consumers Verified | Requires |
|----------|--------------------|----------|
| `integration-layer` | core-app-1, siebel | Docker stack running (`docker compose up -d`) |

### Message Provider Verification

Invokes `processMessage()` (event-publisher's core transformation function) with test data and verifies the output matches the event schema defined in siebel's message pact.

| Provider | Consumers Verified | Requires |
|----------|--------------------|----------|
| `integration-layer-events` | siebel | Nothing (pure function, runs standalone) |

### Files

| Suite | File | Type |
|-------|------|------|
| TypeScript | `integration-layer/tests/contract/soap-api.provider.pact.test.ts` | HTTP |
| TypeScript | `integration-layer/tests/contract/integration-event.provider.pact.test.ts` | Message |
| Java | `playwright-java-framework/.../contract/provider/SoapApiProviderPactTest.java` | HTTP |
| Java | `playwright-java-framework/.../contract/provider/IntegrationEventProviderPactTest.java` | Message |

### Why This Coverage Matters

> **Provider verification closes the contract testing loop.** Without it:
> 1. **Consumer pacts are just wishful thinking** — A pact file only describes what consumers *expect*; provider verification proves the provider *actually delivers*
> 2. **Catches breaking changes at the source** — If a developer modifies soap-processor's response format or event-publisher's message schema, provider tests fail immediately
> 3. **Message verification avoids integration failures** — The message provider test exercises the actual `processMessage()` function, catching transformation bugs that wouldn't surface until a full E2E run
> 4. **Enables can-i-deploy workflows** — In a Pact Broker setup, provider verification results combined with consumer pacts enable automated compatibility checks before deployment

---

## 6. Cucumber BDD Tests (Java Only)

**Purpose:** Express integration scenarios in **business-readable Gherkin** syntax, bridging communication between technical and non-technical stakeholders.

```mermaid
flowchart TB
    subgraph features["Feature Files (Gherkin)"]
        F1["api_gateway.feature\n2 scenarios"]
        F2["core_app_1.feature\n1 scenario"]
        F3["siebel.feature\n1 scenario outline\n(3 examples)"]
    end

    subgraph steps["Step Definitions"]
        SD["IntegrationSteps.java\nGiven / When / Then\nimplementations"]
    end

    subgraph runner["Test Runner"]
        RC["RunCucumberTest.java\n@Suite + Cucumber config"]
    end

    runner --> features
    features --> steps
    steps --> |"HTTP calls"| SUT["System Under Test"]

    style features fill:#fff9c4,stroke:#f9a825
    style steps fill:#fff9c4,stroke:#f9a825
    style runner fill:#fff9c4,stroke:#f9a825
```

### Scenarios

| Feature File | Scenario | Steps |
|-------------|----------|-------|
| `api_gateway.feature` | Valid SOAP → 202 | Given integration layer running, When send valid SOAP, Then 202 + Accepted |
| `api_gateway.feature` | Invalid XML → 400 | Given integration layer running, When send invalid XML, Then 400 + Missing SOAP Body |
| `core_app_1.feature` | Default outage | Given core-app-1 running, When send outage notification, Then success + ID starts with OUTAGE- |
| `siebel.feature` | ServiceRequest | Given siebel running, When send type ServiceRequest, Then success + action matches |
| `siebel.feature` | AccountUpdate | Given siebel running, When send type AccountUpdate, Then success + action matches |
| `siebel.feature` | BillingInquiry | Given siebel running, When send type BillingInquiry, Then success + action matches |

### Files

| File | Purpose |
|------|---------|
| `playwright-java-framework/src/test/resources/features/api_gateway.feature` | API Gateway scenarios |
| `playwright-java-framework/src/test/resources/features/core_app_1.feature` | core-app-1 scenarios |
| `playwright-java-framework/src/test/resources/features/siebel.feature` | siebel scenarios (outline with 3 examples) |
| `playwright-java-framework/.../cucumber/IntegrationSteps.java` | Step definitions |
| `playwright-java-framework/.../cucumber/RunCucumberTest.java` | Cucumber test runner |

### Why This Coverage Matters

> **BDD tests serve a dual purpose — verification and documentation:**
> 1. **Living documentation** — Feature files are readable by product owners, QA, and developers. They serve as always-up-to-date executable specifications
> 2. **Stakeholder communication** — Non-technical team members can review `.feature` files to understand exactly what the system does, without reading Java/TypeScript code
> 3. **Scenario Outline for combinatorial coverage** — The siebel feature uses `Scenario Outline` with `Examples` to test multiple message types with a single scenario template, reducing duplication while increasing coverage
> 4. **Reusable step library** — Step definitions in `IntegrationSteps.java` create a vocabulary (`Given the integration layer is running`, `When I send a valid SOAP request`) that can be composed into new scenarios without writing new code

---

## Test Count Summary

### TypeScript (Vitest + Pact)

| Category | File | Tests |
|----------|------|-------|
| Infrastructure | `tests/integration/infrastructure.test.ts` | 5 |
| API Gateway | `tests/integration/api-gateway.test.ts` | 4 |
| core-app-1 API | `tests/integration/core-app-1.test.ts` | 4 |
| siebel API | `tests/integration/siebel.test.ts` | 4 |
| E2E Pipeline | `tests/e2e/full-pipeline.test.ts` | 9 |
| Contract Consumer (HTTP) | `core-app-1/.../soap-api.consumer.pact.test.ts` | 2 |
| Contract Consumer (HTTP) | `siebel/.../soap-api.consumer.pact.test.ts` | 2 |
| Contract Consumer (Message) | `siebel/.../integration-event.consumer.pact.test.ts` | 2 |
| Contract Provider (HTTP) | `integration-layer/.../soap-api.provider.pact.test.ts` | 2 |
| Contract Provider (Message) | `integration-layer/.../integration-event.provider.pact.test.ts` | 1 |
| **Total** | **10 files** | **35** |

### Java (JUnit 5 + Playwright + Pact JVM + Cucumber)

| Category | File | Tests |
|----------|------|-------|
| Infrastructure | `InfrastructureTest.java` | 5 |
| API Gateway | `ApiGatewayTest.java` | 4 |
| core-app-1 API | `CoreApp1Test.java` | 4 |
| siebel API | `SiebelTest.java` | 4 |
| E2E Pipeline | `FullPipelineTest.java` | 9 |
| Contract Consumer (HTTP) | `CoreApp1SoapConsumerPactTest.java` | 2 |
| Contract Consumer (HTTP) | `SiebelSoapConsumerPactTest.java` | 2 |
| Contract Consumer (Message) | `SiebelEventConsumerPactTest.java` | 2 |
| Contract Provider (HTTP) | `SoapApiProviderPactTest.java` | 2 |
| Contract Provider (Message) | `IntegrationEventProviderPactTest.java` | 2 |
| Cucumber BDD | `RunCucumberTest.java` + 3 features | 4 |
| **Total** | **13 files** | **40** |

### Combined Total: **75 tests** across **23 files**

---

## Coverage Rationale Matrix

```mermaid
quadrantChart
    title Test Coverage Value vs Execution Speed
    x-axis Slow --> Fast
    y-axis Low Risk Coverage --> High Risk Coverage
    quadrant-1 "Sweet Spot: Fast + High Value"
    quadrant-2 "Worth the wait"
    quadrant-3 "Nice to have"
    quadrant-4 "Quick confidence"
    "Contract Consumer": [0.85, 0.70]
    "Contract Provider (Msg)": [0.75, 0.65]
    "Infrastructure": [0.80, 0.30]
    "Integration API": [0.55, 0.55]
    "Cucumber BDD": [0.50, 0.40]
    "E2E Pipeline": [0.15, 0.95]
    "Contract Provider (HTTP)": [0.40, 0.72]
```

| Layer | Speed | Risk Covered | When It Catches Bugs |
|-------|-------|-------------|---------------------|
| **Infrastructure** | ⚡ Fast (~1s) | Environment setup | Before all other tests run — avoids misleading failures |
| **Integration API** | 🔵 Medium (~5s) | SOAP structure, routing, parameter handling | During development — immediate feedback on API changes |
| **E2E Pipeline** | 🐢 Slow (~30s) | Async message flow, data transformation, multi-service coordination | Pre-merge — catches integration bugs invisible to faster tests |
| **Contract Consumer** | ⚡ Fast (~2s) | API/event schema drift | Pre-commit — no infra needed, catches incompatible changes early |
| **Contract Provider** | 🔵 Medium (~5s) | Provider breaking changes | CI pipeline — proves provider still satisfies all consumers |
| **Cucumber BDD** | 🔵 Medium (~5s) | Business logic expressed as scenarios | Sprint review — validates features match acceptance criteria |

---

## Coverage Gaps & Future Considerations

| Area | Current Status | Recommendation |
|------|---------------|----------------|
| **Negative E2E paths** | Only happy-path pipeline tested | Add tests for SQS unavailability, Redis down mid-pipeline |
| **Performance / Load** | Not tested | Add k6 or Artillery load tests for throughput under concurrent SOAP submissions |
| **Security** | Not tested | Add tests for malformed SOAP injection, oversized payloads, auth headers |
| **Retry / Dead-letter** | Not tested | Verify event-publisher retry logic and DLQ behavior when processing fails |
| **Multi-repo Pact Broker** | Pacts stored locally in `/pacts` | Migrate to Pact Broker for `can-i-deploy` workflows in CI/CD |
