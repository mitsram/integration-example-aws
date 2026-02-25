/**
 * System Integration Tests – Siebel API
 *
 * Verifies that siebel's POST /api/send endpoint correctly
 * sends SOAP messages through the API Gateway and receives
 * a successful response from the integration layer.
 */

import { describe, it, expect } from "vitest";
import { SIEBEL_URL } from "../helpers";

describe("siebel – POST /api/send", () => {
  it("sends a default service request", async () => {
    const res = await fetch(`${SIEBEL_URL}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.message).toBeDefined();
    expect(body.message.requestId).toMatch(/^SBL-/);
    expect(body.message.action).toBe("ServiceRequest");
    expect(body.message.accountId).toBe("ACC-2048");
    expect(body.message.priority).toBe("NORMAL");
    expect(body.integrationResponse.status).toBe(202);
  });

  it("sends a custom SOAP message with all parameters", async () => {
    const res = await fetch(`${SIEBEL_URL}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "AccountUpdate",
        account: "ACC-5555",
        contact: "Jane Smith",
        service: "Premium Support",
        priority: "URGENT",
        description: "VIP account escalation",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.message.action).toBe("AccountUpdate");
    expect(body.message.accountId).toBe("ACC-5555");
    expect(body.message.contactName).toBe("Jane Smith");
    expect(body.message.serviceType).toBe("Premium Support");
    expect(body.message.priority).toBe("URGENT");
    expect(body.message.description).toBe("VIP account escalation");
  });

  it("SOAP response contains the correct request ID", async () => {
    const res = await fetch(`${SIEBEL_URL}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const body = await res.json();
    const soapResponse: string = body.integrationResponse.body;
    const requestId: string = body.message.requestId;

    expect(soapResponse).toContain(`<res:RequestId>${requestId}</res:RequestId>`);
    expect(soapResponse).toContain("<res:Status>Accepted</res:Status>");
  });

  it("handles different message types", async () => {
    const types = ["ServiceRequest", "AccountUpdate", "ContactChange", "BillingInquiry"];

    for (const type of types) {
      const res = await fetch(`${SIEBEL_URL}/api/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message.action).toBe(type);
    }
  });
});
