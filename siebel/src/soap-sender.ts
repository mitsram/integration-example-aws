/**
 * Siebel – SOAP Sender
 *
 * Sends SOAP messages (e.g. service requests, account updates) to
 * the integration-layer pipeline via the API Gateway.
 *
 * Can be used standalone:
 *   npx ts-node src/soap-sender.ts
 *   npx ts-node src/soap-sender.ts --type AccountUpdate --account ACC-100
 *
 * Or imported and called with params:
 *   import { sendSoapMessage } from './soap-sender';
 *   await sendSoapMessage({ type: 'AccountUpdate', account: 'ACC-100' });
 */

// ── Config ──────────────────────────────────────────────────────
const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:8080/soap";

// ── Types ───────────────────────────────────────────────────────
export interface SiebelSendParams {
  type?: string;
  account?: string;
  contact?: string;
  service?: string;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  description?: string;
}

interface SiebelMessage {
  requestId: string;
  action: string;
  accountId: string;
  contactName: string;
  serviceType: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  description: string;
}

export interface SendResult {
  status: number;
  message: SiebelMessage;
  responseBody: string;
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
export async function sendSoapMessage(
  params?: SiebelSendParams
): Promise<SendResult> {
  // Use provided params, fall back to CLI args
  const args = params ?? parseArgs(process.argv) as SiebelSendParams;

  const now = new Date();
  const message: SiebelMessage = {
    requestId: `SBL-${now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`,
    action: args.type ?? "ServiceRequest",
    accountId: args.account ?? "ACC-2048",
    contactName: args.contact ?? "John Doe",
    serviceType: args.service ?? "Billing Inquiry",
    priority: args.priority ?? "NORMAL",
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

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: soapBody,
  });

  const responseBody = await response.text();

  if (response.status === 200 || response.status === 202) {
    log(`✓ Message accepted  [HTTP ${response.status}]`);
  } else {
    log(`✗ Unexpected response  [HTTP ${response.status}]`);
  }

  return { status: response.status, message, responseBody };
}

// Run if executed directly
if (require.main === module) {
  sendSoapMessage().catch((err) => {
    log(`✗ Failed: ${err}`);
    process.exit(1);
  });
}
