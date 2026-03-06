# Contract Testing — A Comprehensive Guide

> **Audience:** Project managers, engineering leadership, developers, and QA engineers.
> **Purpose:** Explain what contract testing is, why it matters to our platform, how it works under the hood, and how we have implemented it.

---

## Table of Contents

1. [What Is Contract Testing?](#1-what-is-contract-testing)
2. [The Problem Contract Testing Solves](#2-the-problem-contract-testing-solves)
3. [Why Our Platform Needs Contract Testing](#3-why-our-platform-needs-contract-testing)
4. [How Contract Testing Works](#4-how-contract-testing-works)
5. [Consumer-Driven Contract Testing (Our Approach)](#5-consumer-driven-contract-testing-our-approach)
6. [Contract Testing vs Other Test Types](#6-contract-testing-vs-other-test-types)
7. [Our Contracts — What We Test](#7-our-contracts--what-we-test)
8. [Our Implementation — Code & Tooling](#8-our-implementation--code--tooling)
9. [The Pact Workflow in Detail](#9-the-pact-workflow-in-detail)
10. [Contract Testing in the CI/CD Pipeline](#10-contract-testing-in-the-cicd-pipeline)
11. [Business Value & ROI](#11-business-value--roi)
12. [Common Misconceptions](#12-common-misconceptions)
13. [Glossary](#13-glossary)

---

## 1. What Is Contract Testing?

Contract testing is a technique for verifying that two systems (a **consumer** and a **provider**) can communicate with each other by checking that they both agree on the **shape and structure of the data** they exchange — without needing to deploy both systems together.

Think of it like a legal contract between two parties:

> _"I, the consumer, will send you a message that looks like **this**. In return, I expect you to respond with something that looks like **that**."_

If either party changes their end of the deal without the other knowing, the contract test **fails** — before anything reaches production.

```mermaid
graph LR
    A["Consumer\n(core-app-1)"] -->|"I expect THIS shape"| C["📝 Contract\n(Pact JSON file)"]
    C -->|"Verified against"| B["Provider\n(integration-layer)"]
    
    style C fill:#ffe066,stroke:#d4a017,stroke-width:2px
    style A fill:#a8d8ea,stroke:#3d8eb9,stroke-width:2px
    style B fill:#b5e8b5,stroke:#3d8e3d,stroke-width:2px
```

### The Key Idea

Instead of testing the full system end-to-end, you test the **agreement at each boundary** independently. If the agreement holds at every boundary, the full system will work when assembled.

---

## 2. The Problem Contract Testing Solves

### 2.1 The Integration Problem

In a distributed system, services communicate across network boundaries. Each boundary is an implicit agreement — a contract — about:

- **What format** the data is in (XML, JSON, etc.)
- **What fields** are present and their data types
- **What status codes** indicate success or failure
- **What the response** looks like

When these agreements are only enforced by end-to-end tests, problems emerge:

```mermaid
graph TB
    subgraph "Without Contract Testing"
        D1["Developer changes\nSOAP field name"] --> D2["Change deployed\nto integration-layer"]
        D2 --> D3["E2E tests run\n⏱️ 10+ minutes"]
        D3 --> D4["❌ Test fails"]
        D4 --> D5["Debug across\nmultiple services"]
        D5 --> D6["Find the root cause\n🕐 Hours later"]
    end
    
    subgraph "With Contract Testing"
        C1["Developer changes\nSOAP field name"] --> C2["Contract test runs\n⏱️ < 10 seconds"]
        C2 --> C3["❌ Contract broken!\nExact field highlighted"]
        C3 --> C4["Fix immediately\nbefore merging"]
    end
    
    style D4 fill:#ffcccc,stroke:#cc0000
    style D6 fill:#ffcccc,stroke:#cc0000
    style C3 fill:#ffffcc,stroke:#ccaa00
    style C4 fill:#ccffcc,stroke:#00cc00
```

### 2.2 Real-World Scenarios This Prevents

| Scenario | What Happens Without Contract Tests | What Happens With Contract Tests |
|----------|-------------------------------------|----------------------------------|
| Someone renames `<req:Action>` to `<req:ActionType>` in a SOAP message | E2E test fails after the full Docker stack spins up. Debug time: 30+ minutes. | Contract test fails **instantly** at the PR stage. Developer sees exactly which field broke. |
| A new engineer adds a required field to the `IntegrationEvent` but forgets to update consumers | Event listeners crash in staging. Hours of debugging. | Consumer's contract test still expects the old shape — provider verification fails. |
| Two teams deploy independently and one changes the response schema | Production breakage. Incident response needed. | `can-i-deploy` check blocks the deployment before it happens. |
| SOAP response removes the `Timestamp` field | Downstream apps that parse the timestamp start throwing null pointer errors | Provider verification catches that `Timestamp` is expected but missing. |

---

## 3. Why Our Platform Needs Contract Testing

### 3.1 Our Architecture Has 8 Integration Boundaries

Our platform connects multiple applications through SOAP XML, JSON message queues, and Redis Pub/Sub — each boundary is a contract:

```mermaid
graph TB
    CA1["🖥️ core-app-1\n(:3001)"] -->|"IF-01: SOAP XML"| GW["🌐 API Gateway\n(Nginx :8080)"]
    CA2["🖥️ core-app-2\n(:3003)"] -->|"IF-02: SOAP XML"| CA1
    SBL["🖥️ siebel\n(:3002)"] -->|"IF-03: SOAP XML"| GW
    
    GW -->|"IF-04: Reverse Proxy"| SP["⚙️ soap-processor\n(:5000)"]
    SP -->|"IF-05: JSON"| SQS["📬 ElasticMQ/SQS\n(:9424)"]
    SQS -->|"IF-06: JSON (poll)"| EP["📤 event-publisher"]
    EP -->|"IF-07: JSON (PUBLISH)"| REDIS["🔴 Redis\n(:6380)"]
    REDIS -->|"IF-08: JSON (SUBSCRIBE)"| SUB1["📥 pubsub-subscriber"]
    REDIS -->|"IF-08: JSON (SUBSCRIBE)"| SBL_EL["📥 siebel\nevent-listener"]
    
    style GW fill:#f9d71c,stroke:#d4a017,stroke-width:2px
    style SP fill:#ffa07a,stroke:#cc5533,stroke-width:2px
    style SQS fill:#87ceeb,stroke:#4682b4,stroke-width:2px
    style REDIS fill:#ff6347,stroke:#cc3322,stroke-width:2px,color:#fff
```

**Every arrow in this diagram is a contract.** If any service changes the format of data it sends or expects, the services on the other end will break.

### 3.2 Our SOAP Payloads Are Built with String Templates

This is the actual code that builds a SOAP message in our platform:

```typescript
// core-app-1/src/index.ts — SOAP XML built with template literals
const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:req="http://example.com/integration/request">
  <soapenv:Body>
    <req:ProcessRequest>
      <req:RequestId>${requestId}</req:RequestId>
      <req:Action>PlannedOutage</req:Action>
      ...
    </req:ProcessRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
```

There is **no compile-time enforcement** that this XML matches what the receiver expects. If someone changes `<req:Action>` to `<req:ActionType>`, the code compiles fine, the app starts fine — but the integration **silently breaks**.

Contract tests catch this kind of drift.

### 3.3 Multiple Data Formats Cross Multiple Boundaries

| Boundary | Format | Risk Area |
|----------|--------|-----------|
| Client apps → API Gateway | SOAP XML | Field names, namespaces, envelope structure |
| soap-processor → SQS | JSON | Field names, types, required vs optional |
| event-publisher → Redis | JSON | Event type, detail structure, status values |
| soap-processor → clients | SOAP XML response | Status values, timestamp format, RequestId echo |

Each format change is a potential production incident. Contract tests guard every one of these boundaries.

### 3.4 Future-Proofing: Moving to Separate Repositories

Today, all services live in a single monorepo. But as the platform grows, services will likely be split into separate repositories with independent deployment cycles. When that happens:

- You **cannot** run E2E tests in a single repo's CI pipeline (the other apps aren't there).
- You **need** a way for each repo to verify: _"Will my change break anyone?"_ — without the other services running.

Contract testing is that way.

---

## 4. How Contract Testing Works

### 4.1 The Core Concept

Contract testing works in two phases:

```mermaid
sequenceDiagram
    participant Consumer as 🔵 Consumer (e.g., core-app-1)
    participant Pact as 📝 Pact File (JSON)
    participant Provider as 🟢 Provider (e.g., integration-layer)
    
    Note over Consumer,Provider: Phase 1 — Consumer Writes the Contract
    Consumer->>Consumer: Writes test: "I'll send THIS,<br>I expect THAT response"
    Consumer->>Pact: Generates Pact JSON file<br>(the contract)
    
    Note over Consumer,Provider: Phase 2 — Provider Verifies the Contract
    Pact->>Provider: Replays recorded requests<br>against real provider
    Provider->>Provider: Checks: "Does my response<br>match what consumer expects?"
    Provider-->>Pact: ✅ Verified / ❌ Broken
```

### 4.2 Phase 1 — Consumer Side (Generating the Contract)

The consumer team writes a test that says:

1. **Given** the provider is in a particular state (e.g., "the integration layer is available")
2. **When** I send this specific request (e.g., a SOAP XML POST to `/soap`)
3. **Then** I expect this response (e.g., HTTP 202, Content-Type: text/xml)

The test runs against a **mock server** (provided by Pact) — not the real provider. The mock server records the interaction and saves it as a **Pact JSON file**.

```mermaid
graph LR
    subgraph "Consumer CI Pipeline"
        T["Consumer\nTest Code"] -->|"Sends request to"| MS["🤖 Pact Mock Server\n(auto-generated)"]
        MS -->|"Returns expected\nresponse"| T
        MS -->|"Records\ninteraction"| PF["📝 Pact JSON File"]
    end
    
    style MS fill:#ffe066,stroke:#d4a017,stroke-width:2px
    style PF fill:#b5e8b5,stroke:#3d8e3d,stroke-width:2px
```

**No real services need to be running.** This is why contract tests are fast — they run in seconds, not minutes.

### 4.3 Phase 2 — Provider Side (Verifying the Contract)

The provider team takes the Pact file and runs **provider verification**:

1. Start the real provider service
2. Replay every request from the Pact file against it
3. Check that the actual response matches what the consumer expected

```mermaid
graph LR
    subgraph "Provider CI Pipeline"
        PF["📝 Pact JSON File"] -->|"Replay requests"| PV["🔍 Pact Verifier"]
        PV -->|"Sends recorded\nrequests"| RP["🟢 Real Provider\n(running)"]
        RP -->|"Returns actual\nresponse"| PV
        PV -->|"Compare actual\nvs expected"| R{"✅ Match?\n❌ Mismatch?"}
    end
    
    style PF fill:#b5e8b5,stroke:#3d8e3d,stroke-width:2px
    style PV fill:#ffe066,stroke:#d4a017,stroke-width:2px
    style R fill:#ffcccc,stroke:#cc0000,stroke-width:2px
```

If the provider's actual response doesn't match the contract, the test **fails** — and the provider team knows they've broken a consumer's expectations.

### 4.4 The Full Lifecycle

```mermaid
graph TB
    subgraph "1. Consumer writes contract"
        A1["Consumer team writes<br>Pact test"] --> A2["Pact mock server<br>records interactions"]
        A2 --> A3["📝 Pact JSON generated"]
    end
    
    subgraph "2. Contract is shared"
        A3 --> B1["Pact file committed<br>to pacts/ folder"]
        B1 --> B2["(Future: Published to<br>Pact Broker)"]
    end
    
    subgraph "3. Provider verifies"
        B1 --> C1["Provider pulls<br>Pact file"]
        C1 --> C2["Replays requests against<br>real provider"]
        C2 --> C3{"All interactions<br>verified?"}
    end
    
    C3 -->|"✅ Yes"| D1["Safe to deploy ✅"]
    C3 -->|"❌ No"| D2["Deployment blocked ❌\nFix required"]
    
    style A3 fill:#b5e8b5,stroke:#3d8e3d
    style D1 fill:#ccffcc,stroke:#00cc00
    style D2 fill:#ffcccc,stroke:#cc0000
```

---

## 5. Consumer-Driven Contract Testing (Our Approach)

### 5.1 Why "Consumer-Driven"?

There are two approaches to contract testing:

| Approach | Who Defines the Contract | Used When |
|----------|--------------------------|-----------|
| **Provider-driven** | The provider publishes a spec (e.g., OpenAPI/Swagger) and consumers must conform | Provider is a public API with many unknown consumers |
| **Consumer-driven** | Each consumer declares what it needs, and the provider must satisfy all consumers | Teams collaborate closely; consumers know exactly what they need |

**We use consumer-driven** because:
- Our consumers (core-app-1, siebel, core-app-2) know exactly what fields they send and what responses they parse.
- The provider (integration-layer) must satisfy **all** of them — not just one.
- If any consumer's expectations break, we want to know immediately.

### 5.2 The Consumer-Driven Philosophy

```mermaid
graph BT
    C1["core-app-1\n'I send PlannedOutage SOAP\nand expect 202'"] -->|"Contract #1"| P["integration-layer\n(Provider)"]
    C2["siebel\n'I send ServiceRequest SOAP\nand expect 202'"] -->|"Contract #2"| P
    C3["siebel\n'I listen for IntegrationEvents\nwith eventType & detail.status'"] -->|"Contract #3"| EP["integration-layer-events\n(Provider)"]
    
    P -->|"Must satisfy\nALL contracts"| V{"✅ All verified?\n→ Safe to deploy"}
    EP -->|"Must satisfy\nALL contracts"| V
    
    style P fill:#b5e8b5,stroke:#3d8e3d,stroke-width:2px
    style EP fill:#b5e8b5,stroke:#3d8e3d,stroke-width:2px
    style V fill:#ffe066,stroke:#d4a017,stroke-width:2px
```

The contracts are "driven" by the consumers — each consumer declares its minimal requirements. The provider is free to return **more** data than the consumer expects (backwards-compatible additions), but must never **remove or change** what any consumer relies on.

### 5.3 What Makes a Good Contract?

A contract should specify the **minimum viable agreement**, not every detail:

| Good Contract | Bad Contract |
|---------------|-------------|
| "Response has field `RequestId` of type string" | "Response has `RequestId` with value `OUTAGE-20260101120000`" |
| "Status code is 202" | "Response time is under 500ms" |
| "Body contains `eventType` and `detail.status`" | "Redis channel name is `integration-events`" |
| "`Status` is one of `Accepted` or `Error`" | "`Message` is exactly `Request received and queued for processing`" |

Contracts test **structure and types**, not exact values or behaviour.

---

## 6. Contract Testing vs Other Test Types

### 6.1 Where Contract Testing Fits

```mermaid
graph TB
    subgraph "Test Pyramid"
        E2E["🔺 End-to-End Tests\n(10 TS / 9 Java)\nFull pipeline, slowest, highest confidence"]
        INT["🔶 Integration Tests\n(17 TS / 17 Java)\nReal services, moderate speed"]
        CON["🟢 Contract Tests\n(9 TS / 8+ Java)\nNo infrastructure, fastest"]
    end
    
    E2E --- |"Minutes"| INT
    INT --- |"Seconds"| CON
    
    style E2E fill:#ff9999,stroke:#cc0000,stroke-width:2px
    style INT fill:#ffcc66,stroke:#cc8800,stroke-width:2px
    style CON fill:#99ff99,stroke:#00cc00,stroke-width:2px
```

### 6.2 Comparison Table

| Dimension | Contract Tests | Integration Tests | End-to-End Tests |
|-----------|---------------|-------------------|------------------|
| **What it answers** | "Do we agree on the data shape?" | "Do services talk to each other correctly?" | "Does the whole workflow work?" |
| **Infrastructure needed** | None (consumer side) | Docker Compose stack | Full Docker stack + Redis subscriber |
| **Speed** | < 5 seconds | 10–30 seconds | 30–60 seconds |
| **When it runs** | Every commit / PR | Every commit (after contract pass) | After integration tests pass |
| **Failure means** | "Someone changed the interface without updating consumers" | "Services are misconfigured or routing is wrong" | "A workflow is broken across the system" |
| **Scope** | One boundary at a time | One or two services at a time | All services end-to-end |
| **Can run without other services?** | ✅ Yes (consumer side) | ❌ No — needs real services | ❌ No — needs everything |

### 6.3 What Each Level Catches

```mermaid
graph LR
    subgraph "Contract Tests Catch"
        CC1["SOAP field renamed"]
        CC2["Response schema changed"]
        CC3["New required field added"]
        CC4["Event payload restructured"]
        CC5["Status code changed"]
    end
    
    subgraph "Integration Tests Catch"
        IC1["Routing misconfiguration"]
        IC2["Service unreachable"]
        IC3["Timeout / connection issues"]
        IC4["Invalid XML rejected correctly"]
    end
    
    subgraph "E2E Tests Catch"
        EC1["Message lost in pipeline"]
        EC2["Async timing issues"]
        EC3["Cross-app workflow failures"]
        EC4["Event delivery failures"]
    end
    
    style CC1 fill:#99ff99,stroke:#00aa00
    style CC2 fill:#99ff99,stroke:#00aa00
    style CC3 fill:#99ff99,stroke:#00aa00
    style CC4 fill:#99ff99,stroke:#00aa00
    style CC5 fill:#99ff99,stroke:#00aa00
    style IC1 fill:#ffcc66,stroke:#cc8800
    style IC2 fill:#ffcc66,stroke:#cc8800
    style IC3 fill:#ffcc66,stroke:#cc8800
    style IC4 fill:#ffcc66,stroke:#cc8800
    style EC1 fill:#ff9999,stroke:#cc0000
    style EC2 fill:#ff9999,stroke:#cc0000
    style EC3 fill:#ff9999,stroke:#cc0000
    style EC4 fill:#ff9999,stroke:#cc0000
```

### 6.4 The Key Insight

> **Contract tests don't replace integration or E2E tests.** They **complement** them by catching a specific category of bugs — interface mismatches — faster and with less infrastructure.
>
> Without contract tests, interface bugs are only discovered when the full stack is running. Contract tests shift that discovery to the **earliest possible moment** — before the code is even merged.

---

## 7. Our Contracts — What We Test

### 7.1 Identified Contracts

Our platform has **4 distinct contract types** across 8 integration boundaries:

```mermaid
graph TB
    subgraph "Contract #1 & #2 — SOAP Requests"
        CA1["core-app-1"] -->|"PlannedOutage SOAP\n→ POST /soap"| IL["integration-layer"]
        SBL["siebel"] -->|"ServiceRequest SOAP\nAccountUpdate SOAP\n→ POST /soap"| IL
    end
    
    subgraph "Contract #3 — SOAP Response"
        IL -->|"ProcessResponse SOAP\n← Status, Message,\nRequestId, Timestamp"| CA1
        IL -->|"ProcessResponse SOAP"| SBL
    end
    
    subgraph "Contract #4 — Integration Events"
        EP["event-publisher"] -->|"IntegrationEvent JSON\neventType, source,\ndetail.status"| SUB["siebel\nevent-listener"]
    end
    
    style IL fill:#ffa07a,stroke:#cc5533,stroke-width:2px
    style EP fill:#ffa07a,stroke:#cc5533,stroke-width:2px
```

### 7.2 Contract Details

#### Contract #1: core-app-1 → integration-layer (SOAP Request)

| Aspect | Detail |
|--------|--------|
| **Consumer** | core-app-1 |
| **Provider** | integration-layer (via API Gateway → soap-processor) |
| **Protocol** | HTTP POST to `/soap` |
| **Format** | SOAP XML |
| **Key Fields** | `RequestId`, `Action` (= `PlannedOutage`), `System`, `Region`, `ScheduledStart`, `ScheduledEnd`, `Severity`, `Description` |
| **Expected Response** | HTTP 202 Accepted, Content-Type: text/xml |
| **Error Case** | XML without SOAP Body → HTTP 400 |

#### Contract #2: siebel → integration-layer (SOAP Request)

| Aspect | Detail |
|--------|--------|
| **Consumer** | siebel |
| **Provider** | integration-layer |
| **Protocol** | HTTP POST to `/soap` |
| **Format** | SOAP XML |
| **Key Fields** | `RequestId`, `Action` (= `ServiceRequest` or `AccountUpdate`), `AccountId`, `ContactName`, `ServiceType`, `Priority`, `Description`, `Source` |
| **Expected Response** | HTTP 202 Accepted |

#### Contract #3: integration-layer → clients (SOAP Response)

| Aspect | Detail |
|--------|--------|
| **Format** | SOAP XML |
| **Schema** | `ProcessResponseSchema` (Zod) |
| **Key Fields** | `Status` (= `Accepted` or `Error`), `Message`, `RequestId`, `Timestamp` |
| **Validated** | Implicitly by consumer contracts (response assertion) |

#### Contract #4: event-publisher → subscribers (IntegrationEvent)

| Aspect | Detail |
|--------|--------|
| **Consumer** | siebel event-listener (and any future subscribers) |
| **Provider** | integration-layer-events (event-publisher) |
| **Protocol** | Redis Pub/Sub (message-based contract, not HTTP) |
| **Format** | JSON (`IntegrationEvent`) |
| **Key Fields** | `eventType` (= `IntegrationEvent`), `source` (= `event-publisher`), `timestamp`, `detail.requestId`, `detail.originalSource`, `detail.processedPayload`, `detail.status` (= `PROCESSED` or `FAILED`) |

### 7.3 Shared Schemas — The Single Source of Truth

All data contracts are formally defined in `contracts/schemas.ts` using **Zod** (a TypeScript runtime validation library):

```mermaid
graph TB
    SCHEMAS["📦 contracts/schemas.ts\n(Zod Schemas)"] --> S1["ProcessRequestSchema\nSOAP request fields"]
    SCHEMAS --> S2["SqsMessageSchema\nQueue message shape"]
    SCHEMAS --> S3["IntegrationEventSchema\nRedis Pub/Sub events"]
    SCHEMAS --> S4["ProcessResponseSchema\nSOAP response fields"]
    
    S1 --> U1["Used by: soap-processor\n(validates inbound SOAP)"]
    S2 --> U2["Used by: event-publisher\n(validates queue messages)"]
    S3 --> U3["Used by: subscribers\n(validates received events)"]
    S4 --> U4["Used by: consumer apps\n(validates responses)"]
    
    style SCHEMAS fill:#ffe066,stroke:#d4a017,stroke-width:2px
```

These schemas serve double duty:
1. **Runtime validation** — services validate data at boundaries.
2. **Test assertions** — contract and E2E tests use the same schemas to verify data shapes.

---

## 8. Our Implementation — Code & Tooling

### 8.1 Technology Stack

We implement contract tests in **two technology stacks** for cross-validation:

| Stack | Framework | Contract Tool | Version |
|-------|-----------|---------------|---------|
| **TypeScript** | Vitest | Pact JS | 16.2.0 |
| **Java** | JUnit 5 | Pact JVM | 4.6.16 |

### 8.2 Test Inventory

| Test | Type | Language | Infra Required |
|------|------|----------|:--------------:|
| core-app-1 → integration-layer (PlannedOutage SOAP) | Consumer HTTP | TypeScript | ❌ No |
| core-app-1 → integration-layer (invalid XML → 400) | Consumer HTTP | TypeScript | ❌ No |
| siebel → integration-layer (ServiceRequest SOAP) | Consumer HTTP | TypeScript | ❌ No |
| siebel → integration-layer (AccountUpdate SOAP) | Consumer HTTP | TypeScript | ❌ No |
| siebel ← IntegrationEvent (PROCESSED status) | Consumer Message | TypeScript | ❌ No |
| siebel ← IntegrationEvent (minimal payload) | Consumer Message | TypeScript | ❌ No |
| integration-layer satisfies core-app-1 contract | Provider HTTP | TypeScript | ✅ Docker |
| integration-layer satisfies siebel contract | Provider HTTP | TypeScript | ✅ Docker |
| event-publisher satisfies siebel event contract | Provider Message | TypeScript | ❌ No |
| *(All of the above are mirrored in Java)* | — | Java | — |

**Total: 17+ contract tests across both stacks.**

### 8.3 Consumer Test Example Walkthrough

Here's what a consumer contract test looks like in our codebase, with annotations:

```typescript
// core-app-1/tests/contract/soap-api.consumer.pact.test.ts

// Step 1 — Define the Pact (consumer ↔ provider pair)
const provider = new PactV3({
  consumer: "core-app-1",           // Who is calling?
  provider: "integration-layer",     // Who is being called?
  dir: path.resolve(__dirname, "../../../pacts"),  // Where to save the contract
});

// Step 2 — Define the exact request we send
const PLANNED_OUTAGE_SOAP = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope ...>
  <soapenv:Body>
    <req:ProcessRequest>
      <req:RequestId>OUTAGE-20260101120000</req:RequestId>
      <req:Action>PlannedOutage</req:Action>
      ...
    </req:ProcessRequest>
  </soapenv:Body>
</soapenv:Envelope>`;

// Step 3 — Write the test
describe("Contract: core-app-1 → integration-layer", () => {
  it("sends a PlannedOutage and receives 202 Accepted", async () => {
    // Arrange — declare the expected interaction
    provider
      .given("the integration layer is available")    // Provider state
      .uponReceiving("a PlannedOutage SOAP request")  // Description
      .withRequest({
        method: "POST",
        path: "/soap",
        headers: { "Content-Type": "text/xml; charset=utf-8" },
        body: PLANNED_OUTAGE_SOAP,
      })
      .willRespondWith({
        status: 202,                                    // Expected response
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });

    // Act — run against the Pact mock server
    await provider.executeTest(async (mockServer) => {
      const response = await fetch(`${mockServer.url}/soap`, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8" },
        body: PLANNED_OUTAGE_SOAP,
      });

      // Assert — verify our consumer code handles it correctly
      expect(response.status).toBe(202);
    });
  });
});
```

**What this produces:** A file `pacts/core-app-1-integration-layer.json` containing the recorded interaction.

### 8.4 Provider Verification Example

```typescript
// integration-layer/tests/contract/soap-api.provider.pact.test.ts

describe("Provider Verification: integration-layer SOAP API", () => {
  it("satisfies the core-app-1 consumer contract", async () => {
    const verifier = new Verifier({
      providerBaseUrl: "http://localhost:8080",       // Real running provider
      pactUrls: ["pacts/core-app-1-integration-layer.json"],  // Contract to verify
      stateHandlers: {
        "the integration layer is available": async () => {
          // Docker stack provides all infrastructure
        },
      },
    });

    await verifier.verifyProvider();  // Replays all interactions and checks responses
  });
});
```

### 8.5 Message Contract Example (Async / Event-Based)

Not all contracts are HTTP. Our `IntegrationEvent` flows through Redis Pub/Sub — a **message-based** contract:

```mermaid
sequenceDiagram
    participant Consumer as 🔵 siebel event-listener<br>(Consumer)
    participant Pact as 📝 Message Pact
    participant Provider as 🟢 event-publisher<br>(Provider)
    
    Note over Consumer: Phase 1 — Consumer declares expected message shape
    Consumer->>Pact: "I expect messages with<br>eventType, source,<br>detail.status, detail.processedPayload"
    
    Note over Provider: Phase 2 — Provider verifies it produces conforming messages
    Pact->>Provider: "Call your processMessage() function<br>and give me the output"
    Provider->>Pact: Returns IntegrationEvent JSON
    Pact->>Pact: Compare structure:<br>Does output match consumer's expectations?
```

This is how we test the event contract **without Redis running** — Pact calls the `processMessage()` function directly and checks the output shape.

### 8.6 Generated Pact Files

Running consumer tests generates JSON contract files in the `pacts/` directory:

| File | Consumer | Provider | Contract Type |
|------|----------|----------|---------------|
| `core-app-1-integration-layer.json` | core-app-1 | integration-layer | SOAP HTTP |
| `siebel-integration-layer.json` | siebel | integration-layer | SOAP HTTP |
| `siebel-integration-layer-events.json` | siebel | integration-layer-events | Message (JSON) |

These files are **version-controlled** in the repository and regenerated every time consumer tests run.

---

## 9. The Pact Workflow in Detail

### 9.1 End-to-End Contract Testing Flow

```mermaid
flowchart TD
    A["👨‍💻 Developer makes a code change"] --> B{"Which side changed?"}
    
    B -->|"Consumer changed"| C1["Run consumer Pact tests"]
    C1 --> C2["📝 New Pact JSON<br>generated"]
    C2 --> C3["Commit Pact file"]
    C3 --> C4["Provider verification runs<br>against new contract"]
    C4 --> C5{"Provider still<br>satisfies contract?"}
    C5 -->|"✅ Yes"| PASS["✅ Safe to merge"]
    C5 -->|"❌ No"| FAIL1["❌ Provider must update<br>or consumer must adjust"]
    
    B -->|"Provider changed"| P1["Run provider verification<br>against existing Pact files"]
    P1 --> P2{"Provider still<br>satisfies all contracts?"}
    P2 -->|"✅ Yes"| PASS
    P2 -->|"❌ No"| FAIL2["❌ Provider change<br>breaks a consumer"]
    
    style PASS fill:#ccffcc,stroke:#00cc00,stroke-width:2px
    style FAIL1 fill:#ffcccc,stroke:#cc0000,stroke-width:2px
    style FAIL2 fill:#ffcccc,stroke:#cc0000,stroke-width:2px
```

### 9.2 The `can-i-deploy` Pattern (Future with Pact Broker)

When we adopt a Pact Broker (recommended for multi-repo setups), the workflow adds a deployment gate:

```mermaid
sequenceDiagram
    participant Dev as 👨‍💻 Developer
    participant CI as 🔄 CI Pipeline
    participant Broker as 📦 Pact Broker
    participant Prod as 🚀 Production
    
    Dev->>CI: Push code change
    CI->>CI: Run consumer tests → generate Pact
    CI->>Broker: Publish Pact (version tagged)
    CI->>Broker: can-i-deploy?<br>"Can core-app-1 v2.1 deploy<br>given current integration-layer?"
    
    alt All contracts verified ✅
        Broker-->>CI: ✅ Yes — all providers satisfy your contracts
        CI->>Prod: Deploy safely
    else Contract not yet verified ❌
        Broker-->>CI: ❌ No — integration-layer hasn't verified this Pact yet
        CI-->>Dev: Deployment blocked
    end
```

---

## 10. Contract Testing in the CI/CD Pipeline

### 10.1 Where Contract Tests Run

```mermaid
graph LR
    subgraph "Pipeline Stages"
        COMMIT["📝 Commit"] --> CONTRACT["🟢 Contract Tests\n< 1 minute\nNo infrastructure"]
        CONTRACT -->|"PASS"| INTEGRATION["🔶 Integration Tests\n< 5 minutes\nDocker Compose"]
        INTEGRATION -->|"PASS"| E2E["🔺 E2E Tests\n< 5 minutes\nFull stack"]
        E2E -->|"PASS"| DEPLOY["🚀 Deploy"]
    end
    
    CONTRACT -->|"❌ FAIL"| BLOCK1["🛑 Pipeline stopped\nInterface mismatch detected"]
    
    style CONTRACT fill:#99ff99,stroke:#00cc00,stroke-width:2px
    style BLOCK1 fill:#ffcccc,stroke:#cc0000,stroke-width:2px
```

Contract tests run **first** because they:
- Need no infrastructure (fastest feedback)
- Catch the highest-risk bugs (interface mismatches)
- Gate the more expensive tests (no point running integration tests if the contract is broken)

### 10.2 Running the Tests

**TypeScript:**
```bash
npm run test:contract              # All contract tests
npm run test:contract:consumer     # Consumer tests only (no Docker needed)
npm run test:contract:provider     # Provider verification (Docker required)
```

**Java:**
```bash
mvn test -Pcontract                # All Pact tests via Maven
```

### 10.3 Pipeline Time Budget

| Stage | Duration | Infrastructure |
|-------|----------|----------------|
| Contract tests (consumer) | < 10 seconds | None |
| Contract tests (provider) | < 30 seconds | Docker stack |
| Integration tests | < 5 minutes | Docker stack |
| E2E tests | < 5 minutes | Docker stack |
| **Total pipeline** | **< 15 minutes** | — |

Contract tests consume **less than 1%** of the total pipeline time but catch interface bugs that would otherwise require the full stack to detect.

---

## 11. Business Value & ROI

### 11.1 Cost of Bugs Without Contract Testing

```mermaid
graph LR
    subgraph "Bug Found At..."
        A["🟢 Contract Test\n(PR time)"] -->|"Cost: $"| AC["Minutes to fix\nDeveloper sees exact field"]
        B["🔶 Integration Test\n(CI pipeline)"] -->|"Cost: $$"| BC["30+ min to debug\nDocker stack needed"]
        C["🔺 E2E Test\n(CI pipeline)"] -->|"Cost: $$$"| CC["Hours to root-cause\nFull stack + async timing"]
        D["🔴 Production\n(incident)"] -->|"Cost: $$$$"| DC["Outage, incident response\nCustomer impact"]
    end
    
    style A fill:#99ff99,stroke:#00aa00
    style B fill:#ffcc66,stroke:#cc8800
    style C fill:#ff9999,stroke:#cc4444
    style D fill:#ff4444,stroke:#990000,color:#fff
```

### 11.2 Quantified Benefits

| Metric | Without Contract Tests | With Contract Tests |
|--------|------------------------|---------------------|
| **Time to detect interface bug** | 10–60 minutes (E2E run) | < 10 seconds |
| **Time to identify root cause** | 30 min – 2 hours | Immediate (test names the exact field) |
| **Infrastructure needed to detect** | Full Docker stack | None (consumer side) |
| **Deployment confidence** | "Hope it works" | "Contract verified ✅" |
| **Independent deployability** | Not possible without full E2E | Possible with `can-i-deploy` checks |
| **New team member onboarding** | Read all service code to understand interfaces | Read Pact files — they document every interface |

### 11.3 What Contract Tests Give a Project Manager

| Benefit | Explanation |
|---------|-------------|
| **Faster feedback loops** | Developers know within seconds if their change breaks an interface — no waiting for long test runs. |
| **Reduced integration risk** | Every boundary is explicitly tested. No "it worked on my machine" surprises. |
| **Living documentation** | Pact JSON files serve as always-up-to-date interface documentation. |
| **Safer refactoring** | Teams can refactor provider internals confidently — if contracts still pass, nothing is broken. |
| **Independent team velocity** | Teams don't need to coordinate deployments. Each team verifies its contracts independently. |
| **Reduced production incidents** | Interface mismatches — a leading cause of integration bugs — are caught at PR time. |

### 11.4 The "Broken Phone" Analogy

Imagine a game of telephone with 8 people (our 8 integration points). A message goes from Person 1 to Person 8, passing through each intermediary. Without contract testing, you only check if the final person heard the right message. If they didn't, you have to figure out **who** got it wrong.

With contract testing, **every person writes down what they heard and what they said** — and you can check each handoff independently. If Person 4 changes what they say, Person 5's contract test fails immediately — before the message ever reaches Person 8.

---

## 12. Common Misconceptions

### 12.1 "Contract tests replace E2E tests"

**❌ No.** Contract tests verify **structure**. E2E tests verify **behaviour**. You need both.

A contract test confirms that the event-publisher produces a JSON message with the right fields. An E2E test confirms that a SOAP request sent to core-app-1 actually **arrives** as a Redis event 5 seconds later.

### 12.2 "Contract tests are slow and complex"

**❌ No.** Consumer contract tests run in under 10 seconds with zero infrastructure. They are the **fastest** tests in our pipeline after unit tests.

### 12.3 "We don't need them because we have a monorepo"

**⚠️ Partially true, but misleading.** A monorepo means you can run integration tests easily — but contract tests still provide:
- **Faster feedback** (seconds vs minutes)
- **Explicit documentation** of every interface
- **A safety net** for when you eventually split repos

### 12.4 "Contract tests are the same as schema validation"

**❌ Not exactly.** Schema validation (like our Zod schemas) checks that data conforms to a shape at runtime. Contract testing checks that **the interaction between two specific systems** produces the expected data — including HTTP methods, paths, headers, status codes, and the negotiation between request and response.

Schema validation is one tool; contract testing is a comprehensive testing strategy.

### 12.5 "Only the QA team should write contract tests"

**❌ No.** The **consumer team** writes consumer contracts (they know what they need). The **provider team** runs verification (they own the service). QA oversees the strategy and fills gaps.

---

## 13. Glossary

| Term | Definition |
|------|-----------|
| **Consumer** | A service that **calls** another service or **receives** messages from it. In our platform: core-app-1, siebel, core-app-2. |
| **Provider** | A service that **is called by** consumers or **produces** messages. In our platform: integration-layer, event-publisher. |
| **Contract** | A formal agreement about the data shape exchanged between a consumer and provider. Expressed as a Pact JSON file. |
| **Pact** | An open-source consumer-driven contract testing framework. Supports HTTP and message-based contracts. |
| **Pact file** | A JSON file generated by consumer tests, listing all expected interactions (requests and responses). |
| **Provider verification** | The process of replaying a Pact file against a real running provider to check compliance. |
| **Pact Broker** | A central service for storing, sharing, and versioning Pact files across repositories. |
| **can-i-deploy** | A Pact Broker command that checks whether all contracts are verified before allowing deployment. |
| **Consumer-driven** | An approach where consumers define the contract, and providers must conform to all consumers' expectations. |
| **Provider state** | A precondition for a test (e.g., "the integration layer is available"). Allows the provider to set up test data. |
| **Mock server** | An auto-generated HTTP server (by Pact) that simulates the provider during consumer testing. |
| **Message pact** | A contract for asynchronous message-based interactions (e.g., Redis Pub/Sub, SQS). Unlike HTTP pacts, there's no request — only a message shape. |
| **Interaction** | A single request-response pair (HTTP) or message (async) recorded in a Pact file. |
| **Schema (Zod)** | A TypeScript runtime validation definition. Our contracts are formally defined in `contracts/schemas.ts`. |
| **SOAP** | Simple Object Access Protocol — an XML-based messaging protocol used by our platform. |
| **Breaking change** | Any modification to a provider that causes an existing consumer to fail — e.g., renaming a field, changing a type, removing a field. |
| **Backwards-compatible change** | A modification that doesn't break existing consumers — e.g., adding a new optional field. |
| **Contract drift** | When the actual interface diverges from what consumers expect. Without contract tests, drift is only caught at E2E or production. |

---

> **Summary for Project Managers:** Contract testing is a fast, low-cost testing technique that verifies every service boundary agrees on the data format — independently of other services. It catches interface bugs in seconds (instead of minutes or hours), provides living documentation of all interfaces, and is essential for scaling to multiple teams or repositories. Our platform has 8 integration boundaries, 4 contracts, and 17+ automated contract tests across TypeScript and Java — all running in under 10 seconds with zero infrastructure.
