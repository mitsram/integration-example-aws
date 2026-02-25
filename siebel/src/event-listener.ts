/**
 * Siebel – Event Listener
 *
 * Subscribes to the Redis Pub/Sub topic (message bus) and listens for
 * integration events. Simulates Siebel receiving back processed events
 * from the integration pipeline.
 *
 * Usage:
 *   npx ts-node src/event-listener.ts
 *   REDIS_HOST=localhost REDIS_PORT=6380 npx ts-node src/event-listener.ts
 */

import Redis from "ioredis";

// ── Config ──────────────────────────────────────────────────────
const REDIS_HOST = process.env.REDIS_HOST ?? "localhost";
const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6380);
const PUBSUB_TOPIC = process.env.PUBSUB_TOPIC ?? "integration-events";

function log(msg: string) {
  console.log(`[SIEBEL-LISTENER] ${msg}`);
}

// ── Types ───────────────────────────────────────────────────────
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

// ── Main ────────────────────────────────────────────────────────
export async function startEventListener(): Promise<void> {
  const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

  log("╔═══════════════════════════════════════════════════════╗");
  log("║  SIEBEL EVENT LISTENER                                ║");
  log("╠═══════════════════════════════════════════════════════╣");
  log(`║  Redis     : ${REDIS_HOST}:${REDIS_PORT}`);
  log(`║  Topic     : ${PUBSUB_TOPIC}`);
  log("╚═══════════════════════════════════════════════════════╝");
  log("");

  try {
    await redis.subscribe(PUBSUB_TOPIC);
    log(`Subscribed to '${PUBSUB_TOPIC}' — waiting for events …`);
    log("");
  } catch (err) {
    log(`✗ Failed to subscribe: ${err}`);
    log("  Make sure Redis is reachable. The integration-layer stack");
    log("  exposes Redis on port 6380:");
    log("    cd integration-layer && docker compose up -d");
    process.exit(1);
  }

  redis.on("message", (_channel: string, data: string) => {
    try {
      const event: IntegrationEvent = JSON.parse(data);
      const detail = event.detail ?? {};
      const payload = detail.processedPayload ?? {};

      log("┌───────────────────────────────────────────────────────┐");
      log("│  INCOMING EVENT                                       │");
      log("├───────────────────────────────────────────────────────┤");
      log(`│  Type        : ${event.eventType}`);
      log(`│  Source      : ${event.source}`);
      log(`│  Timestamp   : ${event.timestamp}`);
      log(`│  Request ID  : ${detail.requestId}`);
      log(`│  Orig Source : ${detail.originalSource}`);
      log(`│  Status      : ${detail.status}`);
      log(`│  Action      : ${(payload as Record<string, unknown>).Action ?? "N/A"}`);
      log(`│  Account     : ${(payload as Record<string, unknown>).AccountId ?? "N/A"}`);
      log(`│  Priority    : ${(payload as Record<string, unknown>).Priority ?? "N/A"}`);
      log("└───────────────────────────────────────────────────────┘");
      log("");

      // Simulate Siebel processing the event
      log(`  → Siebel acknowledging event ${detail.requestId} …`);
      log(`  → Updating internal CRM record for account ${(payload as Record<string, unknown>).AccountId ?? "unknown"}`);
      log(`  ✓ Event processed by Siebel`);
      log("");
    } catch (err) {
      log(`✗ Error parsing event: ${err}`);
      log(`  Raw data: ${data}`);
    }
  });
}

// Run if executed directly
if (require.main === module) {
  startEventListener();
}
