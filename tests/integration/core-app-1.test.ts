/**
 * System Integration Tests – core-app-1 API
 *
 * Verifies that core-app-1's POST /api/send endpoint correctly
 * sends SOAP messages through the API Gateway and receives
 * a successful response from the integration layer.
 */

import { describe, it, expect } from "vitest";
import { CORE_APP_1_URL } from "../helpers";

describe("core-app-1 – POST /api/send", () => {
  it("sends a default planned outage notification", async () => {
    const res = await fetch(`${CORE_APP_1_URL}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.outage).toBeDefined();
    expect(body.outage.outageId).toMatch(/^OUTAGE-/);
    expect(body.outage.system).toBe("Siebel CRM");
    expect(body.outage.severity).toBe("MEDIUM");
    expect(body.integrationResponse.status).toBe(202);
  });

  it("sends a custom planned outage notification with parameters", async () => {
    const res = await fetch(`${CORE_APP_1_URL}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system: "Billing System",
        region: "EU-WEST-1",
        severity: "CRITICAL",
        description: "Emergency patch deployment",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.outage.system).toBe("Billing System");
    expect(body.outage.region).toBe("EU-WEST-1");
    expect(body.outage.severity).toBe("CRITICAL");
    expect(body.outage.description).toBe("Emergency patch deployment");
    expect(body.integrationResponse.status).toBe(202);
  });

  it("SOAP response contains the correct request ID", async () => {
    const res = await fetch(`${CORE_APP_1_URL}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const body = await res.json();
    const soapResponse: string = body.integrationResponse.body;
    const outageId: string = body.outage.outageId;

    // The SOAP response should echo back the same RequestId
    expect(soapResponse).toContain(`<res:RequestId>${outageId}</res:RequestId>`);
    expect(soapResponse).toContain("<res:Status>Accepted</res:Status>");
    expect(soapResponse).toContain("Message queued successfully");
  });

  it("outage notification has valid scheduled times", async () => {
    const before = Date.now();
    const res = await fetch(`${CORE_APP_1_URL}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const body = await res.json();
    const start = new Date(body.outage.scheduledStart).getTime();
    const end = new Date(body.outage.scheduledEnd).getTime();

    // Start should be ~2 hours from now, end ~4 hours
    expect(start).toBeGreaterThan(before);
    expect(end).toBeGreaterThan(start);
    // End - Start should be ~2 hours (7_200_000 ms ± 5s tolerance)
    expect(end - start).toBeGreaterThanOrEqual(7_195_000);
    expect(end - start).toBeLessThanOrEqual(7_205_000);
  });
});
