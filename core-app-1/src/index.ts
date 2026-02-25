/**
 * Core App 1 – Planned Outage Notifier
 *
 * Express server that exposes an HTTP endpoint to trigger sending
 * "Planned Outage" SOAP messages to the integration-layer pipeline.
 *
 * Endpoints:
 *   POST /api/send   – trigger a planned-outage SOAP message
 *   GET  /health     – health check
 *
 * Usage:
 *   npx ts-node src/index.ts                     # start server on port 3001
 *   PORT=3001 npx ts-node src/index.ts
 */

import express, { Request, Response } from "express";

// ── Config ──────────────────────────────────────────────────────
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:8080/soap";
const PORT = Number(process.env.PORT ?? 3001);

// ── Types ───────────────────────────────────────────────────────
interface OutageParams {
  system?: string;
  region?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description?: string;
}

interface OutageDetails {
  outageId: string;
  system: string;
  region: string;
  scheduledStart: string;
  scheduledEnd: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
}

// ── SOAP builder ────────────────────────────────────────────────
function buildPlannedOutageSoap(details: OutageDetails): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:req="http://example.com/integration/request">
  <soapenv:Header/>
  <soapenv:Body>
    <req:ProcessRequest>
      <req:RequestId>${details.outageId}</req:RequestId>
      <req:Action>PlannedOutage</req:Action>
      <req:System>${details.system}</req:System>
      <req:Region>${details.region}</req:Region>
      <req:ScheduledStart>${details.scheduledStart}</req:ScheduledStart>
      <req:ScheduledEnd>${details.scheduledEnd}</req:ScheduledEnd>
      <req:Severity>${details.severity}</req:Severity>
      <req:Description>${details.description}</req:Description>
    </req:ProcessRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// ── Helpers ─────────────────────────────────────────────────────
function log(msg: string) {
  console.log(`[CORE-APP-1] ${msg}`);
}

// ── Send outage notification ────────────────────────────────────
async function sendOutageNotification(
  params: OutageParams = {}
): Promise<{ status: number; outage: OutageDetails; responseBody: string }> {
  const now = new Date();
  const startTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2 hours
  const endTime = new Date(now.getTime() + 4 * 60 * 60 * 1000); // +4 hours

  const outage: OutageDetails = {
    outageId: `OUTAGE-${now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`,
    system: params.system ?? "Siebel CRM",
    region: params.region ?? "US-WEST-2",
    scheduledStart: startTime.toISOString(),
    scheduledEnd: endTime.toISOString(),
    severity: params.severity ?? "MEDIUM",
    description:
      params.description ??
      "Planned maintenance window for database migration and security patching",
  };

  const soapBody = buildPlannedOutageSoap(outage);

  log("╔═══════════════════════════════════════════════════════╗");
  log("║  PLANNED OUTAGE NOTIFICATION                          ║");
  log("╠═══════════════════════════════════════════════════════╣");
  log(`║  Outage ID : ${outage.outageId}`);
  log(`║  System    : ${outage.system}`);
  log(`║  Region    : ${outage.region}`);
  log(`║  Start     : ${outage.scheduledStart}`);
  log(`║  End       : ${outage.scheduledEnd}`);
  log(`║  Severity  : ${outage.severity}`);
  log(`║  Target    : ${GATEWAY_URL}`);
  log("╚═══════════════════════════════════════════════════════╝");
  log("");
  log("Sending SOAP request …");

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: soapBody,
  });

  const responseBody = await response.text();

  if (response.status === 200 || response.status === 202) {
    log(`✓ Outage notification accepted  [HTTP ${response.status}]`);
  } else {
    log(`✗ Unexpected response  [HTTP ${response.status}]`);
  }

  return { status: response.status, outage, responseBody };
}

// ── Express app ─────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.post("/api/send", async (req: Request, res: Response) => {
  const params: OutageParams = {
    system: req.body?.system,
    region: req.body?.region,
    severity: req.body?.severity,
    description: req.body?.description,
  };

  try {
    const result = await sendOutageNotification(params);
    res.status(200).json({
      success: result.status === 200 || result.status === 202,
      outage: result.outage,
      integrationResponse: {
        status: result.status,
        body: result.responseBody,
      },
    });
  } catch (err) {
    log(`✗ Failed to send outage notification: ${err}`);
    res.status(502).json({
      success: false,
      error: `Failed to connect to integration layer at ${GATEWAY_URL}`,
    });
  }
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "core-app-1" });
});

// ── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  log("");
  log("╔═══════════════════════════════════════════════════════╗");
  log("║  CORE APP 1 – Planned Outage Server                   ║");
  log("╠═══════════════════════════════════════════════════════╣");
  log(`║  Port       : ${PORT}`);
  log(`║  Gateway    : ${GATEWAY_URL}`);
  log("╠═══════════════════════════════════════════════════════╣");
  log("║  POST /api/send  – trigger outage notification         ║");
  log("║  GET  /health    – health check                        ║");
  log("╚═══════════════════════════════════════════════════════╝");
  log("");
});
