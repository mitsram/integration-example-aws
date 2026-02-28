/**
 * Core App 2 – Work Order Server
 *
 * Express backend that provides REST endpoints for the Vue.js frontend
 * and sends work order requests to Core App 1 via SOAP for approval.
 *
 * Endpoints:
 *   POST /api/work-orders          – create & submit a work order via SOAP
 *   GET  /api/work-orders          – list all work orders
 *   GET  /api/work-orders/:id      – get a specific work order
 *   GET  /health                   – health check
 *
 * The work order status is polled from Core App 1 to stay in sync.
 */

import express, { Request, Response } from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { sendWorkOrderSoap, type WorkOrderPayload } from "./soap-client";

// ── Config ──────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3003);
const CORE_APP_1_URL = process.env.CORE_APP_1_URL ?? "http://localhost:3001";

// ── In-memory store ─────────────────────────────────────────────
interface WorkOrder {
  id: string;
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  requestedBy: string;
  department: string;
  dueDate: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  createdAt: string;
  updatedAt: string;
  approvalNote?: string;
}

const workOrders: Map<string, WorkOrder> = new Map();

// ── Helpers ─────────────────────────────────────────────────────
function log(msg: string) {
  console.log(`[CORE-APP-2] ${msg}`);
}

// ── Sync statuses from Core App 1 ──────────────────────────────
async function syncStatusesFromCoreApp1() {
  try {
    const res = await fetch(`${CORE_APP_1_URL}/api/work-orders`);
    if (!res.ok) return;
    const data: any = await res.json();
    const remoteOrders: WorkOrder[] = data.workOrders ?? [];

    for (const remote of remoteOrders) {
      const local = workOrders.get(remote.id);
      if (local && local.status !== remote.status) {
        local.status = remote.status;
        local.updatedAt = remote.updatedAt;
        local.approvalNote = remote.approvalNote;
        log(`Synced status for ${local.id}: ${local.status}`);
      }
    }
  } catch {
    // Core App 1 may not be running – that's ok
  }
}

// ── Express app ─────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

/**
 * POST /api/work-orders – Create a new work order and submit via SOAP
 */
app.post("/api/work-orders", async (req: Request, res: Response) => {
  const { title, description, priority, requestedBy, department, dueDate } = req.body;

  if (!title || !description || !requestedBy || !department || !dueDate) {
    res.status(400).json({ success: false, error: "Missing required fields" });
    return;
  }

  const id = `WO-${uuidv4().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  const workOrder: WorkOrder = {
    id,
    title,
    description,
    priority: priority ?? "MEDIUM",
    requestedBy,
    department,
    dueDate,
    status: "SUBMITTED",
    createdAt: now,
    updatedAt: now,
  };

  log("╔═══════════════════════════════════════════════════════╗");
  log("║  NEW WORK ORDER                                       ║");
  log("╠═══════════════════════════════════════════════════════╣");
  log(`║  ID          : ${workOrder.id}`);
  log(`║  Title       : ${workOrder.title}`);
  log(`║  Priority    : ${workOrder.priority}`);
  log(`║  Requested By: ${workOrder.requestedBy}`);
  log(`║  Department  : ${workOrder.department}`);
  log(`║  Due Date    : ${workOrder.dueDate}`);
  log("╚═══════════════════════════════════════════════════════╝");

  // Send via SOAP to Core App 1 for approval
  const soapPayload: WorkOrderPayload = {
    requestId: workOrder.id,
    title: workOrder.title,
    description: workOrder.description,
    priority: workOrder.priority,
    requestedBy: workOrder.requestedBy,
    department: workOrder.department,
    dueDate: workOrder.dueDate,
  };

  try {
    const { soapResponse } = await sendWorkOrderSoap(soapPayload);

    workOrders.set(id, workOrder);
    log(`✓ Work order ${id} submitted via SOAP – Response: ${soapResponse.status}`);

    res.status(201).json({
      success: true,
      workOrder,
      soapResponse: {
        status: soapResponse.status,
        message: soapResponse.message,
        requestId: soapResponse.requestId,
      },
    });
  } catch (err) {
    // Still save as SUBMITTED even if SOAP fails – can retry later
    workOrders.set(id, workOrder);
    log(`✗ SOAP submission failed for ${id}: ${err}`);

    res.status(201).json({
      success: true,
      workOrder,
      soapResponse: {
        status: "SOAP_ERROR",
        message: `Work order saved locally. SOAP delivery failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        requestId: id,
      },
    });
  }
});

/**
 * GET /api/work-orders – List all work orders (syncs status from Core App 1)
 */
app.get("/api/work-orders", async (_req: Request, res: Response) => {
  await syncStatusesFromCoreApp1();
  const orders = Array.from(workOrders.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json({ workOrders: orders });
});

/**
 * GET /api/work-orders/:id – Get a specific work order
 */
app.get("/api/work-orders/:id", async (req: Request, res: Response) => {
  await syncStatusesFromCoreApp1();
  const wo = workOrders.get(req.params.id as string);
  if (!wo) {
    res.status(404).json({ error: "Work order not found" });
    return;
  }
  res.json({ workOrder: wo });
});

/**
 * GET /health – Health check
 */
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "core-app-2", workOrderCount: workOrders.size });
});

// ── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  log("");
  log("╔═══════════════════════════════════════════════════════╗");
  log("║  CORE APP 2 – Work Order Server                       ║");
  log("╠═══════════════════════════════════════════════════════╣");
  log(`║  Port          : ${PORT}`);
  log(`║  Core App 1    : ${CORE_APP_1_URL}`);
  log("╠═══════════════════════════════════════════════════════╣");
  log("║  POST /api/work-orders     – create work order         ║");
  log("║  GET  /api/work-orders     – list work orders          ║");
  log("║  GET  /api/work-orders/:id – get work order            ║");
  log("║  GET  /health              – health check              ║");
  log("╚═══════════════════════════════════════════════════════╝");
  log("");
});
