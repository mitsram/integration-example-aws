/**
 * SOAP Client for Work Orders
 *
 * Builds SOAP XML messages for work order requests and sends them
 * to Core App 1's SOAP endpoint for the approval workflow.
 */

export interface WorkOrderPayload {
  requestId: string;
  title: string;
  description: string;
  priority: string;
  requestedBy: string;
  department: string;
  dueDate: string;
}

export interface SoapResponse {
  status: string;
  message: string;
  requestId: string;
  timestamp: string;
}

const CORE_APP_1_SOAP_URL =
  process.env.CORE_APP_1_SOAP_URL ?? "http://localhost:3001/soap/work-orders";

/**
 * Build SOAP XML envelope for a work order request.
 */
export function buildWorkOrderSoap(payload: WorkOrderPayload): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:wo="http://example.com/integration/workorder">
  <soapenv:Header/>
  <soapenv:Body>
    <wo:WorkOrderRequest>
      <wo:RequestId>${payload.requestId}</wo:RequestId>
      <wo:Title>${escapeXml(payload.title)}</wo:Title>
      <wo:Description>${escapeXml(payload.description)}</wo:Description>
      <wo:Priority>${payload.priority}</wo:Priority>
      <wo:RequestedBy>${escapeXml(payload.requestedBy)}</wo:RequestedBy>
      <wo:Department>${escapeXml(payload.department)}</wo:Department>
      <wo:DueDate>${payload.dueDate}</wo:DueDate>
    </wo:WorkOrderRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Send a work order SOAP request to Core App 1.
 */
export async function sendWorkOrderSoap(
  payload: WorkOrderPayload
): Promise<{ httpStatus: number; soapResponse: SoapResponse }> {
  const soapXml = buildWorkOrderSoap(payload);

  console.log(`[SOAP-CLIENT] Sending work order ${payload.requestId} to ${CORE_APP_1_SOAP_URL}`);

  const response = await fetch(CORE_APP_1_SOAP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "WorkOrderRequest",
    },
    body: soapXml,
  });

  const responseXml = await response.text();
  const soapResponse = parseSoapResponse(responseXml);

  console.log(
    `[SOAP-CLIENT] Response: HTTP ${response.status} – ${soapResponse.status}: ${soapResponse.message}`
  );

  return { httpStatus: response.status, soapResponse };
}

/**
 * Parse the SOAP response XML from Core App 1.
 */
function parseSoapResponse(xml: string): SoapResponse {
  const extract = (tag: string): string => {
    const match = xml.match(new RegExp(`<wo:${tag}>([^<]*)</wo:${tag}>`));
    return match ? match[1] : "";
  };

  return {
    status: extract("Status") || "UNKNOWN",
    message: extract("Message") || "No response message",
    requestId: extract("RequestId") || "",
    timestamp: extract("Timestamp") || new Date().toISOString(),
  };
}

/**
 * Escape special XML characters.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
