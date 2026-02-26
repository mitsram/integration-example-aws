/**
 * Provider Contract Verification – integration-layer SOAP API
 *
 * Verifies that the integration-layer (soap-processor behind API Gateway)
 * satisfies all consumer contracts from core-app-1 and siebel.
 *
 * The Pact Verifier replays the requests from each consumer's pact file
 * against the running integration-layer and checks that the responses
 * match the expected patterns.
 *
 * ⚠️  Requires the Docker stack running:
 *     cd integration-layer && docker compose up -d
 *
 * In a multi-repo setup:
 *   1. Consumer pact files are fetched from the Pact Broker
 *   2. This test runs in the integration-layer CI pipeline
 *   3. Results are published back to the Broker for can-i-deploy checks
 */

import { Verifier } from "@pact-foundation/pact";
import path from "path";
import { describe, it, beforeAll } from "vitest";

// ── Config ──────────────────────────────────────────────────────
// Point at API Gateway (Nginx) which proxies to soap-processor.
// In CI this would be a Docker service URL.

const PROVIDER_BASE_URL =
  process.env.PROVIDER_BASE_URL ?? "http://localhost:8080";

const PACT_DIR = path.resolve(__dirname, "../../../pacts");

// ── Health check ────────────────────────────────────────────────

async function waitForProvider(
  url: string,
  retries = 10,
  delayMs = 1000
): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    `Provider at ${url} not healthy after ${retries} retries. ` +
      `Make sure the Docker stack is running: cd integration-layer && docker compose up -d`
  );
}

// ── Provider verification ───────────────────────────────────────

describe("Provider Verification: integration-layer SOAP API", () => {
  beforeAll(async () => {
    await waitForProvider(PROVIDER_BASE_URL);
  });

  it("satisfies the core-app-1 consumer contract", async () => {
    const verifier = new Verifier({
      providerBaseUrl: PROVIDER_BASE_URL,
      pactUrls: [path.join(PACT_DIR, "core-app-1-integration-layer.json")],
      // Provider states — no special setup needed for SOAP processing
      stateHandlers: {
        "the integration layer is available": async () => {
          // The Docker stack provides all necessary infrastructure
          // (API Gateway, soap-processor, ElasticMQ)
        },
      },
    });

    await verifier.verifyProvider();
  });

  it("satisfies the siebel consumer contract", async () => {
    const verifier = new Verifier({
      providerBaseUrl: PROVIDER_BASE_URL,
      pactUrls: [path.join(PACT_DIR, "siebel-integration-layer.json")],
      stateHandlers: {
        "the integration layer is available": async () => {
          // No special setup needed
        },
      },
    });

    await verifier.verifyProvider();
  });
});
