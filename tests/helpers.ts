/**
 * Test Helpers
 *
 * Shared utilities for system integration and E2E tests.
 * All tests assume the integration-layer Docker stack is running
 * and core-app-1 / siebel servers are up.
 */

import Redis from "ioredis";

// ── Service URLs ────────────────────────────────────────────────
export const CORE_APP_1_URL = process.env.CORE_APP_1_URL ?? "http://localhost:3001";
export const SIEBEL_URL = process.env.SIEBEL_URL ?? "http://localhost:3002";
export const API_GATEWAY_URL = process.env.API_GATEWAY_URL ?? "http://localhost:8080";
export const REDIS_HOST = process.env.REDIS_HOST ?? "localhost";
export const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6380);
export const PUBSUB_TOPIC = process.env.PUBSUB_TOPIC ?? "integration-events";

// ── Types ───────────────────────────────────────────────────────

export interface IntegrationEvent {
  eventType?: string;
  source?: string;
  timestamp?: string;
  detail?: {
    requestId?: string;
    originalSource?: string;
    originalTimestamp?: string;
    processedPayload?: Record<string, unknown>;
    status?: string;
  };
}

// ── Health check helper ─────────────────────────────────────────

export async function waitForService(
  url: string,
  name: string,
  maxRetries = 10,
  delayMs = 1000
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      // service not ready yet
    }
    await sleep(delayMs);
  }
  throw new Error(
    `Service '${name}' at ${url} did not become healthy after ${maxRetries} retries`
  );
}

// ── Redis event collector ───────────────────────────────────────

/**
 * Subscribes to Redis Pub/Sub and collects events matching an optional
 * filter. Returns a handle with:
 *   - `waitForEvent(filter, timeoutMs)` — waits for a matching event
 *   - `getAll()` — returns all collected events
 *   - `cleanup()` — disconnects from Redis
 */
export function createEventCollector(topic = PUBSUB_TOPIC) {
  const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });
  const events: IntegrationEvent[] = [];
  const waiters: Array<{
    filter: (e: IntegrationEvent) => boolean;
    resolve: (e: IntegrationEvent) => void;
  }> = [];

  redis.subscribe(topic);
  redis.on("message", (_channel: string, data: string) => {
    try {
      const event: IntegrationEvent = JSON.parse(data);
      events.push(event);

      // Check if any waiter matches
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].filter(event)) {
          waiters[i].resolve(event);
          waiters.splice(i, 1);
        }
      }
    } catch {
      // ignore parse errors in test collector
    }
  });

  return {
    /**
     * Wait for an event matching the filter, or throw after timeout.
     * Once matched, the event is consumed (removed from the internal array)
     * so it cannot be matched again by a subsequent call.
     */
    waitForEvent(
      filter: (e: IntegrationEvent) => boolean,
      timeoutMs = 15_000
    ): Promise<IntegrationEvent> {
      // Check already-collected events first
      const idx = events.findIndex(filter);
      if (idx !== -1) {
        const [found] = events.splice(idx, 1);
        return Promise.resolve(found);
      }

      return new Promise<IntegrationEvent>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `Timed out waiting for matching event after ${timeoutMs}ms. ` +
                `Collected ${events.length} events: ${JSON.stringify(events.map((e) => e.detail?.requestId))}`
            )
          );
        }, timeoutMs);

        waiters.push({
          filter,
          resolve: (e) => {
            clearTimeout(timer);
            // Remove consumed event from array
            const i = events.indexOf(e);
            if (i !== -1) events.splice(i, 1);
            resolve(e);
          },
        });
      });
    },

    getAll: () => [...events],

    async cleanup() {
      // Fully tear down the Redis connection
      // Gracefully close: quit sends QUIT to server, then closes socket
      await redis.quit();
    },
  };
}

// ── Utilities ───────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
