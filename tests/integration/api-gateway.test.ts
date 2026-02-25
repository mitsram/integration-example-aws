/**
 * System Integration Tests – API Gateway Routing
 *
 * Verifies that the API Gateway (Nginx) correctly proxies
 * SOAP requests to the soap-processor and returns proper responses.
 * Tests the integration-layer pipeline from the gateway entry point
 * through to the SQS queue.
 */

import { describe, it, expect } from "vitest";
import { API_GATEWAY_URL } from "../helpers";

const VALID_SOAP = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:req="http://example.com/integration/request">
  <soapenv:Header/>
  <soapenv:Body>
    <req:ProcessRequest>
      <req:RequestId>TEST-GATEWAY-001</req:RequestId>
      <req:Action>TestAction</req:Action>
      <req:Description>API Gateway routing test</req:Description>
    </req:ProcessRequest>
  </soapenv:Body>
</soapenv:Envelope>`;

describe("API Gateway – SOAP Routing", () => {
  it("proxies a valid SOAP request and returns HTTP 202", async () => {
    const res = await fetch(`${API_GATEWAY_URL}/soap`, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      body: VALID_SOAP,
    });

    expect(res.status).toBe(202);
    const body = await res.text();
    expect(body).toContain("<res:Status>Accepted</res:Status>");
    expect(body).toContain("TEST-GATEWAY-001");
  });

  it("returns a SOAP error for invalid XML", async () => {
    const res = await fetch(`${API_GATEWAY_URL}/soap`, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      body: "this is not xml",
    });

    // soap-processor returns 400 for missing SOAP Body
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("Missing SOAP Body");
  });

  it("returns a SOAP error for XML without SOAP envelope", async () => {
    const res = await fetch(`${API_GATEWAY_URL}/soap`, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      body: `<?xml version="1.0"?><root><data>test</data></root>`,
    });

    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("Missing SOAP Body");
  });

  it("generates unique RequestIds in responses for consecutive requests", async () => {
    const ids: string[] = [];

    for (let i = 0; i < 3; i++) {
      const soap = VALID_SOAP.replace(
        "TEST-GATEWAY-001",
        `TEST-UNIQUE-${Date.now()}-${i}`
      );
      const res = await fetch(`${API_GATEWAY_URL}/soap`, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8" },
        body: soap,
      });
      const body = await res.text();
      const match = body.match(/<res:RequestId>(.+?)<\/res:RequestId>/);
      if (match) ids.push(match[1]);
    }

    // All three RequestIds should be different
    expect(new Set(ids).size).toBe(3);
  });
});
