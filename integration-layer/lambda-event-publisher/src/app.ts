/**
 * Lambda 2 – Event Publisher
 * Polls SQS (ElasticMQ) for messages, processes them, and publishes
 * events to Redis Pub/Sub (simulating SNS / EventBridge).
 */

import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import Redis from "ioredis";

// ── Config ──────────────────────────────────────────────────────
const SQS_ENDPOINT = process.env.SQS_ENDPOINT ?? "http://localhost:9324";
const SQS_QUEUE_URL =
  process.env.SQS_QUEUE_URL ??
  "http://localhost:9324/queue/integration-queue";
const REDIS_HOST = process.env.REDIS_HOST ?? "localhost";
const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6379);
const PUBSUB_TOPIC = process.env.PUBSUB_TOPIC ?? "integration-events";
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL ?? 2) * 1000; // ms

// ── Clients ─────────────────────────────────────────────────────
const sqs = new SQSClient({
  endpoint: SQS_ENDPOINT,
  region: "us-east-1",
  credentials: { accessKeyId: "dummy", secretAccessKey: "dummy" },
});

const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

// ── Helpers ─────────────────────────────────────────────────────

function log(msg: string, ...args: unknown[]) {
  const ts = new Date().toISOString();
  console.log(`${ts} [EVENT-PUBLISHER] ${msg}`, ...args);
}

export interface SqsMessageBody {
  requestId?: string;
  source?: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
}

export interface IntegrationEvent {
  eventType: string;
  source: string;
  timestamp: string;
  detail: {
    requestId?: string;
    originalSource?: string;
    originalTimestamp?: string;
    processedPayload: Record<string, unknown>;
    status: string;
  };
}

export function processMessage(body: SqsMessageBody): IntegrationEvent {
  return {
    eventType: "IntegrationEvent",
    source: "event-publisher",
    timestamp: new Date().toISOString(),
    detail: {
      requestId: body.requestId,
      originalSource: body.source,
      originalTimestamp: body.timestamp,
      processedPayload: body.payload ?? {},
      status: "PROCESSED",
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Poll Loop ───────────────────────────────────────────────────

async function pollLoop(): Promise<void> {
  log(`Starting poll loop  [queue=${SQS_QUEUE_URL}, topic=${PUBSUB_TOPIC}]`);

  while (true) {
    try {
      const response = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: SQS_QUEUE_URL,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 5,
        })
      );

      const messages = response.Messages ?? [];
      if (messages.length === 0) {
        await sleep(POLL_INTERVAL);
        continue;
      }

      for (const msg of messages) {
        try {
          const body: SqsMessageBody = JSON.parse(msg.Body ?? "{}");
          log(
            `Received message  [MessageId=${msg.MessageId}, RequestId=${body.requestId ?? "?"}]`
          );

          // Process & build event
          const event = processMessage(body);

          // Publish to Redis Pub/Sub (simulates SNS / EventBridge)
          const subscribers = await redis.publish(
            PUBSUB_TOPIC,
            JSON.stringify(event)
          );
          log(
            `Published event to topic '${PUBSUB_TOPIC}'  [subscribers=${subscribers}, RequestId=${body.requestId ?? "?"}]`
          );

          // Delete message from queue
          await sqs.send(
            new DeleteMessageCommand({
              QueueUrl: SQS_QUEUE_URL,
              ReceiptHandle: msg.ReceiptHandle!,
            })
          );
        } catch (err) {
          log(`Error processing message ${msg.MessageId}: ${err}`);
        }
      }
    } catch (err) {
      log(`Error polling SQS: ${err}`);
    }

    await sleep(POLL_INTERVAL);
  }
}

// Only start polling when run directly (not when imported for testing)
if (require.main === module) {
  pollLoop();
}
