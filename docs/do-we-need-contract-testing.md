# Do You Need Contract Testing?

**Short answer: It would add value, but isn't critical given your current setup.**

## What You Already Have

Your test pyramid is solid:
- **Infrastructure tests** — verify all services are reachable
- **Integration tests** — verify API Gateway SOAP routing and each app's API independently
- **E2E tests** — verify the full pipeline from HTTP POST through to Redis Pub/Sub events

## Where Contract Tests Would Help

Your system has **4 implicit contracts** built via string interpolation with no schema enforcement:

| Boundary | Producer | Consumer | Format |
|---|---|---|---|
| 1 | core-app-1 / siebel | soap-processor | SOAP XML (`<req:ProcessRequest>`) |
| 2 | soap-processor | SQS queue | JSON (`{ requestId, source, payload }`) |
| 3 | event-publisher | Redis Pub/Sub | JSON (`IntegrationEvent`) |
| 4 | soap-processor | core-app-1 / siebel | SOAP XML response (`<res:ProcessResponse>`) |

The SOAP XML is particularly fragile — it's assembled with template literals in `core-app-1/src/index.ts` and `siebel/src/soap-sender.ts` with no XSD or schema validation on either side. If someone renames `<req:Action>` to `<req:ActionType>`, the E2E test catches it, but only after spinning up the entire Docker stack.

## My Recommendation

**Not yet.** Here's why:

1. **Monorepo** — all services live in one repo, so contract drift from independent deployments isn't a risk.
2. **E2E tests already cover the contracts** — `full-pipeline.test.ts` asserts the exact field names and values at every boundary.
3. **Small service count** — with only 5 services, the coordination overhead is manageable.

**What I'd do instead** — add lightweight **schema validation** at the contract boundaries:

- Define a shared `IntegrationEvent` Zod/JSON schema and validate in both event-publisher (producer) and test helpers (consumer). This gives you contract-like safety without Pact infrastructure.
- Add XML schema validation in soap-processor for inbound SOAP, so malformed XML from any producer fails fast with a clear error.

**When you should revisit:** If you split this into separate repos, add more producer apps, or have different teams owning different services, then consumer-driven contract testing (e.g., Pact) becomes worth the overhead.
