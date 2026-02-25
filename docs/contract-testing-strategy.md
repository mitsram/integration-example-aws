# Contract Testing Strategy for Separate Repos

When these become independent repos with independent deploy cycles, **contract testing becomes essential**. Here's the strategy:

## The Problem

With separate repos, you lose the safety net of atomic commits across boundaries. Team A can change core-app-1's SOAP payload format and deploy without knowing it breaks soap-processor. The E2E tests only run when *everything* is deployed together — too late.

## Identified Contracts

```
┌─────────────┐    SOAP XML     ┌───────────────────────────────────────────┐
│  core-app-1 │ ──────────────► │              integration-layer             │
│  (producer)  │ ◄────────────── │                                           │
└─────────────┘  SOAP Response  │  api-gateway → soap-processor → SQS       │
                                │  → event-publisher → Redis Pub/Sub        │
┌─────────────┐    SOAP XML     │                                           │
│   siebel    │ ──────────────► │                               (producer)  │
│  (producer)  │ ◄────────────── └────────────────────┬──────────────────────┘
└─────────────┘  SOAP Response                        │
                                          IntegrationEvent JSON
                                                      │
                                                      ▼
                                              (any subscriber)
```

**4 contracts to test:**

| # | Consumer | Provider | Format | What to verify |
|---|----------|----------|--------|----------------|
| 1 | integration-layer | core-app-1 | SOAP XML request | `ProcessRequest` schema: `RequestId`, `Action=PlannedOutage`, `System`, `Region`, `Severity`, etc. |
| 2 | integration-layer | siebel | SOAP XML request | `ProcessRequest` schema: `RequestId`, `Action`, `AccountId`, `ContactName`, `Priority`, etc. |
| 3 | core-app-1 / siebel | integration-layer | SOAP XML response | `ProcessResponse` schema: `Status`, `Message`, `RequestId`, `Timestamp` |
| 4 | any subscriber | integration-layer | `IntegrationEvent` JSON | `eventType`, `source`, `detail.requestId`, `detail.status`, `detail.processedPayload` |

## Strategy: Consumer-Driven Contract Testing with Pact

**Why Pact:** It's language-agnostic, has a broker for sharing contracts between repos, and supports both HTTP and message-based interactions (covers both SOAP-over-HTTP and the SQS/Redis messages).

## Per-Repo Responsibilities

**Repo: core-app-1** (consumer of SOAP response, producer of SOAP request)
```
tests/
  contract/
    soap-request.pact.ts    ← defines what SOAP XML it sends
    soap-response.pact.ts   ← defines what response shape it expects
```
- Runs in CI on every PR
- Publishes pacts to a **Pact Broker**
- Can deploy independently only if contract verification passes ("can-i-deploy")

**Repo: siebel** (consumer of SOAP response, producer of SOAP request)
```
tests/
  contract/
    soap-request.pact.ts
    soap-response.pact.ts
```
- Same pattern as core-app-1, different message schema (AccountUpdate vs PlannedOutage)

**Repo: integration-layer** (provider for all contracts, producer of IntegrationEvent)
```
tests/
  contract/
    provider-verification.pact.ts   ← verifies it satisfies all consumer pacts
    event-publisher.pact.ts         ← defines the IntegrationEvent message contract
```
- Pulls pacts from broker, runs provider verification against soap-processor
- Publishes its own event contract for any future subscribers

## CI/CD Pipeline

```
┌─ core-app-1 PR ─────────────────────────────────────────┐
│  1. Unit tests                                           │
│  2. Generate consumer pacts → publish to Pact Broker     │
│  3. `can-i-deploy --pacticipant core-app-1`              │
│  4. Deploy only if ✅                                    │
└──────────────────────────────────────────────────────────┘

┌─ integration-layer PR ───────────────────────────────────┐
│  1. Unit tests                                           │
│  2. Pull all consumer pacts from Broker                  │
│  3. Run provider verification (soap-processor, events)   │
│  4. `can-i-deploy --pacticipant integration-layer`       │
│  5. Deploy only if ✅                                    │
└──────────────────────────────────────────────────────────┘

┌─ Post-deploy (shared env) ───────────────────────────────┐
│  E2E tests (full-pipeline.test.ts) — smoke only          │
└──────────────────────────────────────────────────────────┘
```

## What Changes in Each Repo

**1. Shared contract schemas** — Extract into an npm package or use Pact's own format:

```typescript
// @org/integration-contracts (shared package or just Pact interactions)

// SOAP Request contract (what soap-processor expects)
export const PROCESS_REQUEST_FIELDS = {
  required: ['RequestId', 'Action'],
  optional: ['System', 'Region', 'Severity', 'AccountId', 'ContactName', 
             'Priority', 'Description', 'ServiceType', 'Source'],
} as const;

// IntegrationEvent contract (what event-publisher emits)
export const INTEGRATION_EVENT_SCHEMA = {
  eventType: 'IntegrationEvent',
  source: 'event-publisher',
  detail: {
    requestId: 'string',
    originalSource: 'string',
    status: 'PROCESSED | FAILED',
    processedPayload: 'object',
  },
} as const;
```

**2. Replace brittle template-literal SOAP** with schema-validated builders that fail fast if a required field is missing.

**3. Add Zod validation in soap-processor** on inbound SOAP — so it returns a clear 400 instead of silently producing garbage on the queue.

## What Stays the Same

- **E2E tests** still exist but become a lightweight **smoke suite** run post-deploy in a shared environment, not a gate for individual repo PRs.
- **Infrastructure tests** remain in the integration-layer repo.
- **Integration tests** (api-gateway.test.ts, siebel.test.ts) stay in their respective repos as fast-feedback tests against mocked dependencies.

## Priority Order

1. **Contract #1 & #2 (SOAP request)** — highest risk, template-literal XML with no validation
2. **Contract #4 (IntegrationEvent JSON)** — easy to do with Pact message support
3. **Contract #3 (SOAP response)** — lower risk since it's generated by one service
4. **Shared schema package** — optional but reduces duplication

The key shift: contract tests let each repo's CI answer "will my change break anyone?" *without* needing the other services running.
