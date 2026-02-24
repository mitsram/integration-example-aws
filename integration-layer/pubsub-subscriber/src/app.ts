/**
 * Pub/Sub Subscriber
 * Subscribes to the Redis Pub/Sub topic and logs every event received.
 * Simulates a downstream consumer of SNS / EventBridge events.
 */

import Redis from "ioredis";

// ── Config ──────────────────────────────────────────────────────
const REDIS_HOST = process.env.REDIS_HOST ?? "localhost";
const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6379);
const PUBSUB_TOPIC = process.env.PUBSUB_TOPIC ?? "integration-events";

function log(msg: string, ...args: unknown[]) {
  const ts = new Date().toISOString();
  console.log(`${ts} [SUBSCRIBER] ${msg}`, ...args);
}

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

async function subscribe(): Promise<void> {
  const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

  try {
    await redis.subscribe(PUBSUB_TOPIC);
    log(`Subscribed to topic '${PUBSUB_TOPIC}' – waiting for events …`);
  } catch (err) {
    log(`Failed to subscribe: ${err}`);
    process.exit(1);
  }

  redis.on("message", (channel: string, data: string) => {
    try {
      const event: IntegrationEvent = JSON.parse(data);
      const detail = event.detail ?? {};

      log("╔══════════════════════════════════════════════════════╗");
      log("║  EVENT RECEIVED                                      ║");
      log("╠══════════════════════════════════════════════════════╣");
      log(`║  Type      : ${event.eventType}`);
      log(`║  Source    : ${event.source}`);
      log(`║  Timestamp : ${event.timestamp}`);
      log(`║  RequestId : ${detail.requestId}`);
      log(`║  Status    : ${detail.status}`);
      log(
        `║  Payload   : ${JSON.stringify(detail.processedPayload ?? {}, null, 2)}`
      );
      log("╚══════════════════════════════════════════════════════╝");
    } catch (err) {
      log(`Error processing event: ${err} – raw: ${data}`);
    }
  });
}

subscribe();
