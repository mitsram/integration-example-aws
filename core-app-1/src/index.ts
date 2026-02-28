/**
 * Core App 1 – Planned Outage Notifier + Work Order Approval
 *
 * Express server that exposes:
 *   1. HTTP endpoint to trigger "Planned Outage" SOAP messages
 *   2. SOAP endpoint to receive work order requests from Core App 2
 *   3. REST API for the approval workflow Vue.js frontend
 *
 * Endpoints:
 *   POST /api/send                       – trigger a planned-outage SOAP message
 *   POST /soap/work-orders               – receive work order SOAP from Core App 2
 *   GET  /api/work-orders                – list all work orders
 *   GET  /api/work-orders/:id            – get a specific work order
 *   PATCH /api/work-orders/:id/approve   – approve a work order
 *   PATCH /api/work-orders/:id/reject    – reject a work order
 *   GET  /health                         – health check
 */

import express, { Request, Response } from "express";
import cors from "cors";
import { XMLParser } from "fast-xml-parser";

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

// ── Work Order types & store ────────────────────────────────────
interface WorkOrder {
  id: string;
  title: string;
  description: string;
  priority: string;
  requestedBy: string;
  department: string;
  dueDate: string;
  status: "SUBMITTED" | "APPROVED" | "REJECTED";
  createdAt: string;
  updatedAt: string;
  approvalNote?: string;
}

const workOrders: Map<string, WorkOrder> = new Map();

// ── SOAP Work Order parser ──────────────────────────────────────
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
});

function parseWorkOrderSoap(xml: string): WorkOrder | null {
  try {
    const parsed = xmlParser.parse(xml);
    const body = parsed?.Envelope?.Body;
    if (!body?.WorkOrderRequest) return null;

    const req = body.WorkOrderRequest;
    const now = new Date().toISOString();

    return {
      id: req.RequestId ?? `WO-${Date.now()}`,
      title: req.Title ?? "",
      description: req.Description ?? "",
      priority: req.Priority ?? "MEDIUM",
      requestedBy: req.RequestedBy ?? "",
      department: req.Department ?? "",
      dueDate: req.DueDate ?? "",
      status: "SUBMITTED",
      createdAt: now,
      updatedAt: now,
    };
  } catch (err) {
    log(`Failed to parse work order SOAP XML: ${err}`);
    return null;
  }
}

function buildWorkOrderResponse(
  status: string,
  message: string,
  requestId: string
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:wo="http://example.com/integration/workorder">
  <soapenv:Header/>
  <soapenv:Body>
    <wo:WorkOrderResponse>
      <wo:Status>${status}</wo:Status>
      <wo:Message>${message}</wo:Message>
      <wo:RequestId>${requestId}</wo:RequestId>
      <wo:Timestamp>${new Date().toISOString()}</wo:Timestamp>
    </wo:WorkOrderResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
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
app.use(cors());
app.use(express.json());
app.use(express.text({ type: "text/xml" }));

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
  res.json({ status: "ok", service: "core-app-1", workOrderCount: workOrders.size });
});

// ── SOAP Work Order endpoint (receives from Core App 2) ────────
app.post("/soap/work-orders", (req: Request, res: Response) => {
  const xml = typeof req.body === "string" ? req.body : "";

  if (!xml || !xml.includes("Envelope")) {
    const errorXml = buildWorkOrderResponse(
      "ERROR",
      "Invalid or missing SOAP envelope",
      ""
    );
    res.status(400).type("text/xml").send(errorXml);
    return;
  }

  const workOrder = parseWorkOrderSoap(xml);

  if (!workOrder) {
    const errorXml = buildWorkOrderResponse(
      "ERROR",
      "Failed to parse work order request",
      ""
    );
    res.status(400).type("text/xml").send(errorXml);
    return;
  }

  workOrders.set(workOrder.id, workOrder);

  log("╔═══════════════════════════════════════════════════════╗");
  log("║  WORK ORDER RECEIVED (via SOAP)                       ║");
  log("╠═══════════════════════════════════════════════════════╣");
  log(`║  ID          : ${workOrder.id}`);
  log(`║  Title       : ${workOrder.title}`);
  log(`║  Priority    : ${workOrder.priority}`);
  log(`║  Requested By: ${workOrder.requestedBy}`);
  log(`║  Department  : ${workOrder.department}`);
  log(`║  Due Date    : ${workOrder.dueDate}`);
  log("╚═══════════════════════════════════════════════════════╝");

  const responseXml = buildWorkOrderResponse(
    "RECEIVED",
    "Work order received and pending approval",
    workOrder.id
  );
  res.status(202).type("text/xml").send(responseXml);
});

// ── REST API: Work Order Approval Workflow ──────────────────────

/** GET /api/work-orders – list all work orders */
app.get("/api/work-orders", (_req: Request, res: Response) => {
  const orders = Array.from(workOrders.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json({ workOrders: orders });
});

/** GET /api/work-orders/:id – get a specific work order */
app.get("/api/work-orders/:id", (req: Request, res: Response) => {
  const wo = workOrders.get(req.params.id as string);
  if (!wo) {
    res.status(404).json({ error: "Work order not found" });
    return;
  }
  res.json({ workOrder: wo });
});

/** PATCH /api/work-orders/:id/approve – approve a work order */
app.patch("/api/work-orders/:id/approve", (req: Request, res: Response) => {
  const wo = workOrders.get(req.params.id as string);
  if (!wo) {
    res.status(404).json({ error: "Work order not found" });
    return;
  }
  if (wo.status !== "SUBMITTED") {
    res.status(400).json({ error: `Cannot approve – current status is ${wo.status}` });
    return;
  }

  wo.status = "APPROVED";
  wo.updatedAt = new Date().toISOString();
  wo.approvalNote = req.body?.note ?? "Approved";

  log(`✓ Work order ${wo.id} APPROVED – "${wo.title}"`);
  res.json({ workOrder: wo });
});

/** PATCH /api/work-orders/:id/reject – reject a work order */
app.patch("/api/work-orders/:id/reject", (req: Request, res: Response) => {
  const wo = workOrders.get(req.params.id as string);
  if (!wo) {
    res.status(404).json({ error: "Work order not found" });
    return;
  }
  if (wo.status !== "SUBMITTED") {
    res.status(400).json({ error: `Cannot reject – current status is ${wo.status}` });
    return;
  }

  wo.status = "REJECTED";
  wo.updatedAt = new Date().toISOString();
  wo.approvalNote = req.body?.note ?? "Rejected";

  log(`✗ Work order ${wo.id} REJECTED – "${wo.title}"`);
  res.json({ workOrder: wo });
});

// ── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  log("");
  log("╔═══════════════════════════════════════════════════════╗");
  log("║  CORE APP 1 – Outage Server + Approval Workflow       ║");
  log("╠═══════════════════════════════════════════════════════╣");
  log(`║  Port       : ${PORT}`);
  log(`║  Gateway    : ${GATEWAY_URL}`);
  log("╠═══════════════════════════════════════════════════════╣");
  log("║  POST /api/send                  – trigger outage      ║");
  log("║  POST /soap/work-orders          – receive work orders ║");
  log("║  GET  /api/work-orders           – list work orders    ║");
  log("║  PATCH /api/work-orders/:id/approve – approve          ║");
  log("║  PATCH /api/work-orders/:id/reject  – reject           ║");
  log("║  GET  /health                    – health check        ║");
  log("╚═══════════════════════════════════════════════════════╝");
  log("");
});
