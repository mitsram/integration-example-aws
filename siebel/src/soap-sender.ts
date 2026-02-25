/**
 * Siebel – SOAP Sender
 *
 * Sends SOAP messages (e.g. service requests, account updates) to
 * the integration-layer pipeline via the API Gateway.
 *
 * Usage:
 *   npx ts-node src/soap-sender.ts
 *   npx ts-node src/soap-sender.ts --type AccountUpdate --account ACC-100
 *   GATEWAY_URL=http://host:8080/soap npx ts-node src/soap-sender.ts
 */

// ── Config ──────────────────────────────────────────────────────
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:8080/soap";

// ── Types ───────────────────────────────────────────────────────
interface SiebelMessage {
  requestId: string;
  action: string;
  accountId: string;
  contactName: string;
  serviceType: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  description: string;
}

// ── SOAP builder ────────────────────────────────────────────────
function buildSiebelSoap(msg: SiebelMessage): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:req="http://example.com/integration/request">
  <soapenv:Header/>
  <soapenv:Body>
    <req:ProcessRequest>
      <req:RequestId>${msg.requestId}</req:RequestId>
      <req:Action>${msg.action}</req:Action>
      <req:AccountId>${msg.accountId}</req:AccountId>
      <req:ContactName>${msg.contactName}</req:ContactName>
      <req:ServiceType>${msg.serviceType}</req:ServiceType>
      <req:Priority>${msg.priority}</req:Priority>
      <req:Description>${msg.description}</req:Description>
      <req:Source>Siebel CRM</req:Source>
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
  console.log(`[SIEBEL-SENDER] ${msg}`);
}

// ── Main ────────────────────────────────────────────────────────
export async function sendSoapMessage(): Promise<void> {
  const args = parseArgs(process.argv);

  const now = new Date();
  const message: SiebelMessage = {
    requestId: `SBL-${now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`,
    action: args.type ?? "ServiceRequest",
    accountId: args.account ?? "ACC-2048",
    contactName: args.contact ?? "John Doe",
    serviceType: args.service ?? "Billing Inquiry",
    priority: (args.priority as SiebelMessage["priority"]) ?? "NORMAL",
    description:
      args.description ??
      "Customer requesting invoice correction for account overcharge",
  };

  const soapBody = buildSiebelSoap(message);

  log("╔═══════════════════════════════════════════════════════╗");
  log("║  SIEBEL SOAP MESSAGE                                  ║");
  log("╠═══════════════════════════════════════════════════════╣");
  log(`║  Request ID  : ${message.requestId}`);
  log(`║  Action      : ${message.action}`);
  log(`║  Account     : ${message.accountId}`);
  log(`║  Contact     : ${message.contactName}`);
  log(`║  Service     : ${message.serviceType}`);
  log(`║  Priority    : ${message.priority}`);
  log(`║  Target      : ${GATEWAY_URL}`);
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
  } catch {
    log(`✗ Failed to connect to ${GATEWAY_URL}`);
    log("  Make sure the integration-layer stack is running:");
    log("    cd integration-layer && docker compose up -d");
    process.exit(1);
  }

  const responseBody = await response.text();

  if (response.status === 200 || response.status === 202) {
    log(`✓ Message accepted  [HTTP ${response.status}]`);
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

// Run if executed directly
if (require.main === module) {
  sendSoapMessage();
}
