/**
 * Consumer Message Contract Test – siebel ← integration-layer events
 *
 * Defines the IntegrationEvent message structure that siebel's
 * event-listener expects to receive from Redis Pub/Sub.
 *
 * Generates a message pact file that integration-layer's provider
 * verification uses to confirm event-publisher produces conforming events.
 *
 * ✅ Runs standalone — no Docker stack, Redis, or live services needed.
 */

import {
  MessageConsumerPact,
  synchronousBodyHandler,
  Matchers,
} from "@pact-foundation/pact";
import path from "path";
import { describe, it, expect } from "vitest";

const { like } = Matchers;

// ── Pact setup ──────────────────────────────────────────────────

const messagePact = new MessageConsumerPact({
  consumer: "siebel",
  provider: "integration-layer-events",
  dir: path.resolve(__dirname, "../../../pacts"),
  logLevel: "warn",
});

// ── Types (mirrors siebel/src/event-listener.ts) ────────────────

interface EventDetail {
  requestId?: string;
  originalSource?: string;
  originalTimestamp?: string;
  processedPayload?: Record<string, unknown>;
  status?: string;
}

interface IntegrationEvent {
  eventType?: string;
  source?: string;
  timestamp?: string;
  detail?: EventDetail;
}

// ── Tests ───────────────────────────────────────────────────────

describe("Contract: siebel ← IntegrationEvent", () => {
  it("can process a PROCESSED IntegrationEvent", () => {
    return messagePact
      .expectsToReceive("an IntegrationEvent with status PROCESSED")
      .withContent({
        eventType: like("IntegrationEvent"),
        source: like("event-publisher"),
        timestamp: like("2026-01-01T12:00:00.000Z"),
        detail: like({
          requestId: like("SBL-20260101120000"),
          originalSource: like("soap-processor"),
          originalTimestamp: like("2026-01-01T11:59:00.000Z"),
          processedPayload: like({
            Action: "ServiceRequest",
            AccountId: "ACC-2048",
          }),
          status: like("PROCESSED"),
        }),
      })
      .verify(
        synchronousBodyHandler((message: unknown) => {
          // Simulate what siebel's event-listener does:
          // parse the message and extract fields
          const event = message as IntegrationEvent;

          expect(event.eventType).toBe("IntegrationEvent");
          expect(event.source).toBe("event-publisher");
          expect(event.timestamp).toBeDefined();
          expect(event.detail).toBeDefined();
          expect(event.detail!.requestId).toBeDefined();
          expect(event.detail!.originalSource).toBeDefined();
          expect(event.detail!.processedPayload).toBeDefined();
          expect(event.detail!.status).toMatch(/^(PROCESSED|FAILED)$/);
        })
      );
  });

  it("can process an IntegrationEvent with minimal payload", () => {
    return messagePact
      .expectsToReceive("an IntegrationEvent with minimal payload")
      .withContent({
        eventType: like("IntegrationEvent"),
        source: like("event-publisher"),
        timestamp: like("2026-01-01T12:00:00.000Z"),
        detail: like({
          processedPayload: like({}),
          status: like("PROCESSED"),
        }),
      })
      .verify(
        synchronousBodyHandler((message: unknown) => {
          const event = message as IntegrationEvent;

          expect(event.eventType).toBeDefined();
          expect(event.detail).toBeDefined();
          expect(event.detail!.processedPayload).toBeDefined();
          expect(event.detail!.status).toBeDefined();
        })
      );
  });
});
