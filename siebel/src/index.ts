/**
 * Siebel – Main entry point
 *
 * Express server that:
 *   - Starts the event listener (Redis Pub/Sub subscriber) on startup
 *   - Exposes POST /api/send to trigger SOAP messages to integration-layer
 *   - Exposes GET  /health for health checks
 *
 * Usage:
 *   npx ts-node src/index.ts              # start server on port 3002
 *   PORT=3002 npx ts-node src/index.ts
 */

import express, { Request, Response } from "express";
import { startEventListener } from "./event-listener";
import { sendSoapMessage, SiebelSendParams } from "./soap-sender";

// ── Config ──────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3002);

function log(msg: string) {
  console.log(`[SIEBEL] ${msg}`);
}

const app = express();
app.use(express.json());

// ── POST /api/send – trigger a SOAP message to integration-layer ─
app.post("/api/send", async (req: Request, res: Response) => {
  const params: SiebelSendParams = {
    type: req.body?.type,
    account: req.body?.account,
    contact: req.body?.contact,
    service: req.body?.service,
    priority: req.body?.priority,
    description: req.body?.description,
  };

  try {
    const result = await sendSoapMessage(params);
    res.status(200).json({
      success: result.status === 200 || result.status === 202,
      message: result.message,
      integrationResponse: {
        status: result.status,
        body: result.responseBody,
      },
    });
  } catch (err) {
    log(`✗ Failed to send SOAP message: ${err}`);
    res.status(502).json({
      success: false,
      error: "Failed to connect to integration layer",
    });
  }
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "siebel" });
});

// ── Start ───────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Start the event listener (Redis Pub/Sub subscriber)
  await startEventListener();

  // Start the Express server
  app.listen(PORT, () => {
    log("");
    log("╔═══════════════════════════════════════════════════════╗");
    log("║  SIEBEL SERVER                                        ║");
    log("╠═══════════════════════════════════════════════════════╣");
    log(`║  Port       : ${PORT}`);
    log("╠═══════════════════════════════════════════════════════╣");
    log("║  POST /api/send  – send SOAP to integration-layer     ║");
    log("║  GET  /health    – health check                       ║");
    log("╠═══════════════════════════════════════════════════════╣");
    log("║  Event listener active (Redis Pub/Sub)                ║");
    log("╚═══════════════════════════════════════════════════════╝");
    log("");
  });
}

main();
