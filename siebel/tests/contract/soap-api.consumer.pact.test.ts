/**
 * Consumer Contract Test – siebel → integration-layer
 *
 * Defines what SOAP requests siebel sends to the integration layer
 * and what responses it expects back. Covers both ServiceRequest
 * and AccountUpdate message types.
 *
 * The contract verifies:
 *   - The exact SOAP XML structure siebel sends for each action type
 *   - Expected HTTP status code (202 Accepted)
 *   - Response Content-Type is text/xml
 *
 * ✅ Runs standalone — no Docker stack or live services needed.
 */

import { PactV3 } from "@pact-foundation/pact";
import path from "path";
import { describe, it, expect } from "vitest";

// ── Pact setup ──────────────────────────────────────────────────

const provider = new PactV3({
  consumer: "siebel",
  provider: "integration-layer",
  dir: path.resolve(__dirname, "../../../pacts"),
  logLevel: "warn",
});

// ── Contract: ServiceRequest SOAP ───────────────────────────────

const SERVICE_REQUEST_SOAP = [
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"`,
  `                  xmlns:req="http://example.com/integration/request">`,
  `  <soapenv:Header/>`,
  `  <soapenv:Body>`,
  `    <req:ProcessRequest>`,
  `      <req:RequestId>SBL-20260101120000</req:RequestId>`,
  `      <req:Action>ServiceRequest</req:Action>`,
  `      <req:AccountId>ACC-2048</req:AccountId>`,
  `      <req:ContactName>John Doe</req:ContactName>`,
  `      <req:ServiceType>Billing Inquiry</req:ServiceType>`,
  `      <req:Priority>NORMAL</req:Priority>`,
  `      <req:Description>Customer requesting invoice correction</req:Description>`,
  `      <req:Source>Siebel CRM</req:Source>`,
  `    </req:ProcessRequest>`,
  `  </soapenv:Body>`,
  `</soapenv:Envelope>`,
].join("\n");

const ACCOUNT_UPDATE_SOAP = [
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"`,
  `                  xmlns:req="http://example.com/integration/request">`,
  `  <soapenv:Header/>`,
  `  <soapenv:Body>`,
  `    <req:ProcessRequest>`,
  `      <req:RequestId>SBL-20260101120001</req:RequestId>`,
  `      <req:Action>AccountUpdate</req:Action>`,
  `      <req:AccountId>ACC-5555</req:AccountId>`,
  `      <req:ContactName>Jane Smith</req:ContactName>`,
  `      <req:ServiceType>Premium Support</req:ServiceType>`,
  `      <req:Priority>URGENT</req:Priority>`,
  `      <req:Description>VIP account escalation</req:Description>`,
  `      <req:Source>Siebel CRM</req:Source>`,
  `    </req:ProcessRequest>`,
  `  </soapenv:Body>`,
  `</soapenv:Envelope>`,
].join("\n");

// ── Tests ───────────────────────────────────────────────────────

describe("Contract: siebel → integration-layer", () => {
  it("sends a ServiceRequest SOAP message and receives 202 Accepted", async () => {
    provider
      .given("the integration layer is available")
      .uponReceiving("a ServiceRequest SOAP request from siebel")
      .withRequest({
        method: "POST",
        path: "/soap",
        headers: { "Content-Type": "text/xml; charset=utf-8" },
        body: SERVICE_REQUEST_SOAP,
      })
      .willRespondWith({
        status: 202,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });

    await provider.executeTest(async (mockServer) => {
      const response = await fetch(`${mockServer.url}/soap`, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8" },
        body: SERVICE_REQUEST_SOAP,
      });

      expect(response.status).toBe(202);
    });
  });

  it("sends an AccountUpdate SOAP message and receives 202 Accepted", async () => {
    provider
      .given("the integration layer is available")
      .uponReceiving("an AccountUpdate SOAP request from siebel")
      .withRequest({
        method: "POST",
        path: "/soap",
        headers: { "Content-Type": "text/xml; charset=utf-8" },
        body: ACCOUNT_UPDATE_SOAP,
      })
      .willRespondWith({
        status: 202,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });

    await provider.executeTest(async (mockServer) => {
      const response = await fetch(`${mockServer.url}/soap`, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8" },
        body: ACCOUNT_UPDATE_SOAP,
      });

      expect(response.status).toBe(202);
    });
  });
});
