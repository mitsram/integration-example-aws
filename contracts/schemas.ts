/**
 * Shared Contract Schemas
 *
 * Defines the data contracts between core-app-1, siebel, and the
 * integration-layer. In a multi-repo setup this would be published
 * as an npm package (e.g. @org/integration-contracts).
 *
 * These Zod schemas serve as the single source of truth for:
 *   - SOAP ProcessRequest payload fields
 *   - SQS message shape (soap-processor → event-publisher)
 *   - IntegrationEvent shape (event-publisher → Redis Pub/Sub)
 *   - SOAP ProcessResponse structure
 */

import { z } from "zod";

// ── SOAP ProcessRequest ─────────────────────────────────────────
// Fields extracted from <req:ProcessRequest> after XML parsing.
// soap-processor walks the parsed XML and flattens all text nodes.

export const ProcessRequestSchema = z
  .object({
    RequestId: z.string().min(1),
    Action: z.string().min(1),
    // core-app-1 fields
    System: z.string().optional(),
    Region: z.string().optional(),
    ScheduledStart: z.string().optional(),
    ScheduledEnd: z.string().optional(),
    Severity: z.string().optional(),
    Description: z.string().optional(),
    // siebel fields
    AccountId: z.string().optional(),
    ContactName: z.string().optional(),
    ServiceType: z.string().optional(),
    Priority: z.string().optional(),
    Source: z.string().optional(),
  })
  .passthrough(); // allow extra fields

// ── SQS Message ─────────────────────────────────────────────────
// JSON pushed to ElasticMQ by soap-processor, consumed by event-publisher.

export const SqsMessageSchema = z.object({
  requestId: z.string(),
  source: z.literal("soap-processor"),
  timestamp: z.string(),
  payload: z.record(z.string(), z.string()),
});

// ── IntegrationEvent ────────────────────────────────────────────
// JSON published to Redis Pub/Sub by event-publisher.

export const IntegrationEventSchema = z.object({
  eventType: z.literal("IntegrationEvent"),
  source: z.literal("event-publisher"),
  timestamp: z.string(),
  detail: z.object({
    requestId: z.string().optional(),
    originalSource: z.string().optional(),
    originalTimestamp: z.string().optional(),
    processedPayload: z.record(z.string(), z.unknown()),
    status: z.enum(["PROCESSED", "FAILED"]),
  }),
});

// ── SOAP ProcessResponse ────────────────────────────────────────
// Fields in soap-processor's <res:ProcessResponse> reply.

export const ProcessResponseSchema = z.object({
  Status: z.enum(["Accepted", "Error"]),
  Message: z.string(),
  RequestId: z.string(),
  Timestamp: z.string(),
});

// ── TypeScript types (inferred from schemas) ────────────────────

export type ProcessRequest = z.infer<typeof ProcessRequestSchema>;
export type SqsMessage = z.infer<typeof SqsMessageSchema>;
export type IntegrationEvent = z.infer<typeof IntegrationEventSchema>;
export type ProcessResponse = z.infer<typeof ProcessResponseSchema>;

// ── SOAP XML Namespace constants ────────────────────────────────

export const SOAP_NS = {
  envelope: "http://schemas.xmlsoap.org/soap/envelope/",
  request: "http://example.com/integration/request",
  response: "http://example.com/integration/response",
} as const;
