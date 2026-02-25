/**
 * System Integration Tests – Infrastructure
 *
 * Verifies that all infrastructure components (Docker stack) are
 * running and accessible from the host:
 *   - API Gateway (Nginx) on port 8080
 *   - ElasticMQ (SQS) on port 9424
 *   - Redis on port 6380
 *   - core-app-1 on port 3001
 *   - siebel on port 3002
 */

import { describe, it, expect } from "vitest";
import Redis from "ioredis";
import {
  API_GATEWAY_URL,
  CORE_APP_1_URL,
  SIEBEL_URL,
  REDIS_HOST,
  REDIS_PORT,
} from "../helpers";

describe("Infrastructure Health Checks", () => {
  it("API Gateway is healthy", async () => {
    const res = await fetch(`${API_GATEWAY_URL}/health`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("api-gateway");
  });

  it("core-app-1 is healthy", async () => {
    const res = await fetch(`${CORE_APP_1_URL}/health`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("core-app-1");
  });

  it("siebel is healthy", async () => {
    const res = await fetch(`${SIEBEL_URL}/health`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("siebel");
  });

  it("Redis is reachable", async () => {
    const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });
    const pong = await redis.ping();
    expect(pong).toBe("PONG");
    redis.disconnect();
  });

  it("ElasticMQ (SQS) is reachable", async () => {
    // ElasticMQ returns a 404 HTML page on GET / but that confirms it's running
    const res = await fetch("http://localhost:9424");
    // Any response (even 404) means ElasticMQ is up
    expect(res.status).toBeDefined();
  });
});
