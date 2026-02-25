/**
 * End-to-End Tests – Full Pipeline Verification
 *
 * This single-file suite verifies the complete integration flows:
 *
 *   App POST /api/send
 *   → API Gateway (Nginx) → SOAP Processor → SQS (ElasticMQ)
 *   → Event Publisher → Redis Pub/Sub
 *   → Event arrives with correct payload
 *
 * Tests are organized into three groups:
 * 1. core-app-1 pipeline (PlannedOutage messages)
 * 2. siebel pipeline (ServiceRequest / AccountUpdate messages)
 * 3. Cross-app round trip (both apps interacting concurrently)
 *
 * A single Redis Pub/Sub collector is shared across all tests.
 * Each waitForEvent call consumes the matched event so tests
 * don't interfere with each other.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  CORE_APP_1_URL,
  SIEBEL_URL,
  createEventCollector,
  IntegrationEvent,
  waitForService,
  sleep,
} from "../helpers";

describe("E2E: Full Pipeline", () => {
  let collector: ReturnType<typeof createEventCollector>;

  beforeAll(async () => {
    // Ensure all services are healthy
    await Promise.all([
      waitForService(CORE_APP_1_URL, "core-app-1"),
      waitForService(SIEBEL_URL, "siebel"),
    ]);
    // Subscribe to Redis Pub/Sub events
    collector = createEventCollector();
    // Give the collector a moment to subscribe
    await sleep(500);
  });

  afterAll(async () => {
    await collector.cleanup();
  });

  // ─────────────────────────────────────────────────────────────
  // core-app-1 pipeline
  // ─────────────────────────────────────────────────────────────
  describe("core-app-1 → integration-layer → Redis Pub/Sub", () => {
    it("PlannedOutage message flows through the full pipeline and arrives as an event", async () => {
      const res = await fetch(`${CORE_APP_1_URL}/api/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: "E2E-Test-System",
          region: "E2E-REGION",
          severity: "HIGH",
          description: "E2E test outage notification",
        }),
      });

      expect(res.status).toBe(200);
      const apiResponse = await res.json();
      expect(apiResponse.success).toBe(true);

      const outageId: string = apiResponse.outage.outageId;

      const event: IntegrationEvent = await collector.waitForEvent(
        (e) => e.detail?.requestId === outageId,
        15_000
      );

      expect(event.eventType).toBe("IntegrationEvent");
      expect(event.source).toBe("event-publisher");
      expect(event.detail!.requestId).toBe(outageId);
      expect(event.detail!.originalSource).toBe("soap-processor");
      expect(event.detail!.status).toBe("PROCESSED");

      const payload = event.detail!.processedPayload!;
      expect(payload.Action).toBe("PlannedOutage");
      expect(payload.System).toBe("E2E-Test-System");
      expect(payload.Region).toBe("E2E-REGION");
      expect(payload.Severity).toBe("HIGH");
      expect(payload.Description).toBe("E2E test outage notification");
    });

    it("default outage parameters are preserved through the pipeline", async () => {
      const res = await fetch(`${CORE_APP_1_URL}/api/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const apiResponse = await res.json();
      const outageId: string = apiResponse.outage.outageId;

      const event = await collector.waitForEvent(
        (e) => e.detail?.requestId === outageId,
        15_000
      );

      const payload = event.detail!.processedPayload!;
      expect(payload.Action).toBe("PlannedOutage");
      expect(payload.System).toBe("Siebel CRM");
      expect(payload.Region).toBe("US-WEST-2");
      expect(payload.Severity).toBe("MEDIUM");
    });

    it("multiple outage notifications produce distinct events", async () => {
      const ids: string[] = [];

      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${CORE_APP_1_URL}/api/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system: `E2E-Multi-${i}`,
            severity: "LOW",
          }),
        });
        const body = await res.json();
        ids.push(body.outage.outageId);
        await sleep(200);
      }

      for (const id of ids) {
        const event = await collector.waitForEvent(
          (e) => e.detail?.requestId === id,
          15_000
        );
        expect(event.detail!.requestId).toBe(id);
        expect(event.detail!.status).toBe("PROCESSED");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // siebel pipeline
  // ─────────────────────────────────────────────────────────────
  describe("siebel → integration-layer → Redis Pub/Sub", () => {
    it("ServiceRequest message flows through the full pipeline", async () => {
      const res = await fetch(`${SIEBEL_URL}/api/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ServiceRequest",
          account: "ACC-E2E-001",
          contact: "E2E Test User",
          service: "E2E Test Service",
          priority: "HIGH",
          description: "End-to-end pipeline verification",
        }),
      });

      expect(res.status).toBe(200);
      const apiResponse = await res.json();
      expect(apiResponse.success).toBe(true);

      const requestId: string = apiResponse.message.requestId;

      const event: IntegrationEvent = await collector.waitForEvent(
        (e) => e.detail?.requestId === requestId,
        15_000
      );

      expect(event.eventType).toBe("IntegrationEvent");
      expect(event.detail!.requestId).toBe(requestId);
      expect(event.detail!.status).toBe("PROCESSED");

      const payload = event.detail!.processedPayload!;
      expect(payload.Action).toBe("ServiceRequest");
      expect(payload.AccountId).toBe("ACC-E2E-001");
      expect(payload.ContactName).toBe("E2E Test User");
      expect(payload.ServiceType).toBe("E2E Test Service");
      expect(payload.Priority).toBe("HIGH");
      expect(payload.Source).toBe("Siebel CRM");
    });

    it("AccountUpdate message flows through the full pipeline", async () => {
      const res = await fetch(`${SIEBEL_URL}/api/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "AccountUpdate",
          account: "ACC-E2E-UPDATE",
          contact: "Jane Doe",
          priority: "URGENT",
        }),
      });

      const apiResponse = await res.json();
      const requestId: string = apiResponse.message.requestId;

      const event = await collector.waitForEvent(
        (e) => e.detail?.requestId === requestId,
        15_000
      );

      const payload = event.detail!.processedPayload!;
      expect(payload.Action).toBe("AccountUpdate");
      expect(payload.AccountId).toBe("ACC-E2E-UPDATE");
      expect(payload.ContactName).toBe("Jane Doe");
      expect(payload.Priority).toBe("URGENT");
    });

    it("default parameters produce correct event payload", async () => {
      const res = await fetch(`${SIEBEL_URL}/api/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const apiResponse = await res.json();
      const requestId: string = apiResponse.message.requestId;

      const event = await collector.waitForEvent(
        (e) => e.detail?.requestId === requestId,
        15_000
      );

      const payload = event.detail!.processedPayload!;
      expect(payload.Action).toBe("ServiceRequest");
      expect(payload.AccountId).toBe("ACC-2048");
      expect(payload.ContactName).toBe("John Doe");
      expect(payload.Priority).toBe("NORMAL");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Cross-app round trip
  // ─────────────────────────────────────────────────────────────
  describe("Cross-App Round Trip", () => {
    it("core-app-1 outage notification reaches the event bus", async () => {
      const res = await fetch(`${CORE_APP_1_URL}/api/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: "CrossApp-Test",
          severity: "CRITICAL",
        }),
      });

      const apiResponse = await res.json();
      const outageId: string = apiResponse.outage.outageId;

      const event = await collector.waitForEvent(
        (e) => e.detail?.requestId === outageId,
        15_000
      );

      expect(event.detail!.processedPayload!.Action).toBe("PlannedOutage");
      expect(event.detail!.processedPayload!.System).toBe("CrossApp-Test");
      expect(event.detail!.processedPayload!.Severity).toBe("CRITICAL");
    });

    it("siebel service request reaches the event bus", async () => {
      const res = await fetch(`${SIEBEL_URL}/api/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "AccountUpdate",
          account: "ACC-CROSSAPP",
          priority: "HIGH",
        }),
      });

      const apiResponse = await res.json();
      const requestId: string = apiResponse.message.requestId;

      const event = await collector.waitForEvent(
        (e) => e.detail?.requestId === requestId,
        15_000
      );

      expect(event.detail!.processedPayload!.Action).toBe("AccountUpdate");
      expect(event.detail!.processedPayload!.AccountId).toBe("ACC-CROSSAPP");
    });

    it("concurrent messages from both apps are processed independently", async () => {
      const [coreRes, siebelRes] = await Promise.all([
        fetch(`${CORE_APP_1_URL}/api/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system: "Concurrent-Core",
            severity: "LOW",
          }),
        }),
        fetch(`${SIEBEL_URL}/api/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "ConcurrentRequest",
            account: "ACC-CONCURRENT",
          }),
        }),
      ]);

      const coreBody = await coreRes.json();
      const siebelBody = await siebelRes.json();

      expect(coreBody.success).toBe(true);
      expect(siebelBody.success).toBe(true);

      const coreOutageId: string = coreBody.outage.outageId;
      const siebelRequestId: string = siebelBody.message.requestId;

      const [coreEvent, siebelEvent] = await Promise.all([
        collector.waitForEvent(
          (e) => e.detail?.requestId === coreOutageId,
          15_000
        ),
        collector.waitForEvent(
          (e) => e.detail?.requestId === siebelRequestId,
          15_000
        ),
      ]);

      expect(coreEvent.detail!.processedPayload!.Action).toBe("PlannedOutage");
      expect(coreEvent.detail!.processedPayload!.System).toBe("Concurrent-Core");

      expect(siebelEvent.detail!.processedPayload!.Action).toBe("ConcurrentRequest");
      expect(siebelEvent.detail!.processedPayload!.AccountId).toBe("ACC-CONCURRENT");
    });

    it("events contain consistent timestamps and metadata", async () => {
      const beforeSend = new Date().toISOString();

      const res = await fetch(`${CORE_APP_1_URL}/api/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: "Timestamp-Test" }),
      });

      const apiResponse = await res.json();
      const outageId: string = apiResponse.outage.outageId;

      const event = await collector.waitForEvent(
        (e) => e.detail?.requestId === outageId,
        15_000
      );

      expect(event.eventType).toBe("IntegrationEvent");
      expect(event.source).toBe("event-publisher");
      expect(event.timestamp).toBeDefined();
      expect(event.detail!.originalSource).toBe("soap-processor");
      expect(event.detail!.status).toBe("PROCESSED");

      expect(new Date(event.timestamp!).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeSend).getTime()
      );
    });
  });
});
