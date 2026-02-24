/**
 * Lambda 1 – SOAP Processor
 * Receives SOAP XML from API Gateway, parses it, and pushes a JSON
 * message onto the SQS-compatible queue (ElasticMQ).
 */

import express, { Request, Response } from "express";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { XMLParser } from "fast-xml-parser";

// ── Config ──────────────────────────────────────────────────────
const SQS_ENDPOINT = process.env.SQS_ENDPOINT ?? "http://localhost:9324";
const SQS_QUEUE_URL =
  process.env.SQS_QUEUE_URL ??
  "http://localhost:9324/queue/integration-queue";
const PORT = Number(process.env.PORT ?? 5000);

// ── SQS client (points at ElasticMQ) ────────────────────────────
const sqs = new SQSClient({
  endpoint: SQS_ENDPOINT,
  region: "us-east-1",
  credentials: { accessKeyId: "dummy", secretAccessKey: "dummy" },
});

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
});

const app = express();
app.use(express.raw({ type: "text/xml", limit: "1mb" }));
app.use(express.text({ type: "application/xml", limit: "1mb" }));

// ── Helpers ─────────────────────────────────────────────────────

function log(msg: string, ...args: unknown[]) {
  const ts = new Date().toISOString();
  console.log(`${ts} [SOAP-PROCESSOR] ${msg}`, ...args);
}

function buildSoapResponse(
  status: string,
  message: string,
  requestId: string
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:res="http://example.com/integration/response">
    <soapenv:Header/>
    <soapenv:Body>
        <res:ProcessResponse>
            <res:Status>${status}</res:Status>
            <res:Message>${message}</res:Message>
            <res:RequestId>${requestId}</res:RequestId>
            <res:Timestamp>${new Date().toISOString()}</res:Timestamp>
        </res:ProcessResponse>
    </soapenv:Body>
</soapenv:Envelope>`;
}

function extractPayload(parsed: Record<string, unknown>): Record<string, string> {
  const payload: Record<string, string> = {};

  function walk(obj: unknown) {
    if (obj && typeof obj === "object") {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (typeof value === "string" || typeof value === "number") {
          payload[key] = String(value);
        } else {
          walk(value);
        }
      }
    }
  }

  walk(parsed);
  return payload;
}

// ── Routes ──────────────────────────────────────────────────────

app.post("/soap", async (req: Request, res: Response) => {
  const rawXml =
    typeof req.body === "string" ? req.body : req.body?.toString("utf-8") ?? "";

  log(`Received SOAP request (${rawXml.length} bytes)`);

  // Parse XML
  let parsed: Record<string, unknown>;
  try {
    parsed = xmlParser.parse(rawXml);
  } catch (err) {
    log(`Invalid XML: ${err}`);
    res
      .status(400)
      .type("text/xml")
      .send(buildSoapResponse("Error", `Invalid XML: ${err}`, "N/A"));
    return;
  }

  // Extract body content
  const envelope = (parsed as any)?.Envelope;
  const body = envelope?.Body;
  if (!body) {
    res
      .status(400)
      .type("text/xml")
      .send(buildSoapResponse("Error", "Missing SOAP Body", "N/A"));
    return;
  }

  const payload = extractPayload(body);
  const requestId =
    payload.RequestId ??
    new Date().toISOString().replace(/[-:T.Z]/g, "");

  // Push message to SQS (ElasticMQ)
  const message = {
    requestId,
    source: "soap-processor",
    timestamp: new Date().toISOString(),
    payload,
  };

  try {
    const result = await sqs.send(
      new SendMessageCommand({
        QueueUrl: SQS_QUEUE_URL,
        MessageBody: JSON.stringify(message),
      })
    );
    log(
      `Message sent to queue  [MessageId=${result.MessageId}, RequestId=${requestId}]`
    );
  } catch (err) {
    log(`Failed to send message to queue: ${err}`);
    res
      .status(500)
      .type("text/xml")
      .send(buildSoapResponse("Error", `Queue error: ${err}`, requestId));
    return;
  }

  res
    .status(202)
    .type("text/xml")
    .send(buildSoapResponse("Accepted", "Message queued successfully", requestId));
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "soap-processor" });
});

// ── Start ───────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  log(`Listening on port ${PORT}`);
});
