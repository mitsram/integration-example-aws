/**
 * Core App 1 – Planned Outage Notifier
 *
 * Sends a "Planned Outage" SOAP message to the integration-layer
 * pipeline via the API Gateway.
 *
 * Usage:
 *   npx ts-node src/index.ts                          # defaults
 *   npx ts-node src/index.ts --region US-EAST-1       # custom region
 *   GATEWAY_URL=http://host:8080/soap npx ts-node src/index.ts
 */

// ── Config ──────────────────────────────────────────────────────
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:8080/soap";

// ── Types ───────────────────────────────────────────────────────
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
function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const value = argv[i + 1];
    if (key && value) args[key] = value;
  }
  return args;
}

function log(msg: string) {
  console.log(`[CORE-APP-1] ${msg}`);
}

// ── Main ────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  // Build a sample planned-outage notification
  const now = new Date();
  const startTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2 hours
  const endTime = new Date(now.getTime() + 4 * 60 * 60 * 1000);   // +4 hours

  const outage: OutageDetails = {
    outageId: `OUTAGE-${now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`,
    system: args.system ?? "Siebel CRM",
    region: args.region ?? "US-WEST-2",
    scheduledStart: startTime.toISOString(),
    scheduledEnd: endTime.toISOString(),
    severity: (args.severity as OutageDetails["severity"]) ?? "MEDIUM",
    description:
      args.description ??
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

  let response: Response;
  try {
    response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      body: soapBody,
    });
  } catch (err) {
    log(`✗ Failed to connect to ${GATEWAY_URL}`);
    log("  Make sure the integration-layer stack is running:");
    log("    cd integration-layer && docker compose up -d");
    process.exit(1);
  }

  const responseBody = await response.text();

  if (response.status === 200 || response.status === 202) {
    log(`✓ Outage notification accepted  [HTTP ${response.status}]`);
    log("");
    log("── SOAP Response ──────────────────────────────────────");
    log(responseBody);
    log("───────────────────────────────────────────────────────");
  } else {
    log(`✗ Unexpected response  [HTTP ${response.status}]`);
    log(responseBody);
    process.exit(1);
  }
}

main();
