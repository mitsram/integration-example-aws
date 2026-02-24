/**
 * SOAP Test Client
 * Sends a sample SOAP request to the API Gateway and prints the response.
 * Uses native fetch (Node 22+).
 */

const API_GATEWAY_URL = "http://localhost:8080/soap";

const SOAP_REQUEST = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:req="http://example.com/integration/request">
    <soapenv:Header/>
    <soapenv:Body>
        <req:ProcessRequest>
            <req:RequestId>REQ-20260225-001</req:RequestId>
            <req:Action>CreateOrder</req:Action>
            <req:CustomerId>CUST-42</req:CustomerId>
            <req:OrderTotal>129.99</req:OrderTotal>
            <req:Currency>USD</req:Currency>
            <req:Description>Integration test order from Siebel CRM</req:Description>
        </req:ProcessRequest>
    </soapenv:Body>
</soapenv:Envelope>`;

async function sendSoapRequest(): Promise<void> {
  console.log("=".repeat(60));
  console.log("  SOAP Test Client");
  console.log("=".repeat(60));
  console.log(`\n→ Sending SOAP request to ${API_GATEWAY_URL}\n`);
  console.log("── Request XML ────────────────────────────────────────");
  console.log(SOAP_REQUEST);
  console.log("────────────────────────────────────────────────────────\n");

  let response: Response;
  try {
    response = await fetch(API_GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      body: SOAP_REQUEST,
    });
  } catch (err) {
    console.log(`✗ Could not connect to API Gateway at ${API_GATEWAY_URL}`);
    console.log("  Make sure the Docker Compose stack is running:");
    console.log("    docker compose up -d");
    process.exit(1);
  }

  const body = await response.text();

  console.log(`← Response  [HTTP ${response.status}]\n`);
  console.log("── Response XML ───────────────────────────────────────");
  console.log(body);
  console.log("────────────────────────────────────────────────────────\n");

  if (response.status === 200 || response.status === 202) {
    console.log(
      "✓ SOAP request accepted – check docker compose logs for the full pipeline:"
    );
    console.log("    docker compose logs -f");
  } else {
    console.log(`✗ Unexpected status code: ${response.status}`);
  }
}

sendSoapRequest();
