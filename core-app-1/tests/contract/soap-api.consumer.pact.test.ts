/**
 * Consumer Contract Test – core-app-1 → integration-layer
 *
 * Defines what SOAP requests core-app-1 sends to the integration layer
 * and what responses it expects back.
 *
 * The contract verifies:
 *   - The exact SOAP XML structure core-app-1 sends
 *   - Expected HTTP status codes (202 for valid, 400 for invalid)
 *   - Response Content-Type is text/xml
 *
 * Generates a pact file consumed by the integration-layer provider
 * verification test to ensure compatibility.
 *
 * ✅ Runs standalone — no Docker stack or live services needed.
 *
 * In a multi-repo setup:
 *   1. This test runs in the core-app-1 CI pipeline
 *   2. The generated pact is published to a Pact Broker
 *   3. integration-layer's CI pulls the pact and runs provider verification
 */

import { PactV3 } from "@pact-foundation/pact";
import path from "path";
import { describe, it, expect } from "vitest";

// ── Pact setup ──────────────────────────────────────────────────

const provider = new PactV3({
  consumer: "core-app-1",
  provider: "integration-layer",
  dir: path.resolve(__dirname, "../../../pacts"),
  logLevel: "warn",
});

// ── Contract: PlannedOutage SOAP request ────────────────────────
// This is the exact SOAP structure core-app-1 sends (see core-app-1/src/index.ts)

const PLANNED_OUTAGE_SOAP = [
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"`,
  `                  xmlns:req="http://example.com/integration/request">`,
  `  <soapenv:Header/>`,
  `  <soapenv:Body>`,
  `    <req:ProcessRequest>`,
  `      <req:RequestId>OUTAGE-20260101120000</req:RequestId>`,
  `      <req:Action>PlannedOutage</req:Action>`,
  `      <req:System>Siebel CRM</req:System>`,
  `      <req:Region>US-WEST-2</req:Region>`,
  `      <req:ScheduledStart>2026-01-01T14:00:00.000Z</req:ScheduledStart>`,
  `      <req:ScheduledEnd>2026-01-01T16:00:00.000Z</req:ScheduledEnd>`,
  `      <req:Severity>MEDIUM</req:Severity>`,
  `      <req:Description>Planned maintenance window</req:Description>`,
  `    </req:ProcessRequest>`,
  `  </soapenv:Body>`,
  `</soapenv:Envelope>`,
].join("\n");

const XML_WITHOUT_BODY = `<?xml version="1.0" encoding="UTF-8"?><root><data>no soap here</data></root>`;

// ── Tests ───────────────────────────────────────────────────────

describe("Contract: core-app-1 → integration-layer", () => {
  it("sends a PlannedOutage SOAP request and receives 202 Accepted", async () => {
    provider
      .given("the integration layer is available")
      .uponReceiving("a PlannedOutage SOAP request from core-app-1")
      .withRequest({
        method: "POST",
        path: "/soap",
        headers: { "Content-Type": "text/xml; charset=utf-8" },
        body: PLANNED_OUTAGE_SOAP,
      })
      .willRespondWith({
        status: 202,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });

    await provider.executeTest(async (mockServer) => {
      const response = await fetch(`${mockServer.url}/soap`, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8" },
        body: PLANNED_OUTAGE_SOAP,
      });

      expect(response.status).toBe(202);
    });
  });

  it("receives a 400 for XML missing SOAP Body", async () => {
    provider
      .given("the integration layer is available")
      .uponReceiving("an XML request without SOAP Body from core-app-1")
      .withRequest({
        method: "POST",
        path: "/soap",
        headers: { "Content-Type": "text/xml; charset=utf-8" },
        body: XML_WITHOUT_BODY,
      })
      .willRespondWith({
        status: 400,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });

    await provider.executeTest(async (mockServer) => {
      const response = await fetch(`${mockServer.url}/soap`, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8" },
        body: XML_WITHOUT_BODY,
      });

      expect(response.status).toBe(400);
    });
  });
});
