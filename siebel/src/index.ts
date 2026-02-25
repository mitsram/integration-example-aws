/**
 * Siebel – Main entry point
 *
 * Runs both the SOAP sender and event listener together.
 * The listener starts first, then after a short delay the sender
 * fires a message so you can see the full round-trip.
 *
 * Usage:
 *   npx ts-node src/index.ts
 */

import { startEventListener } from "./event-listener";
import { sendSoapMessage } from "./soap-sender";

function log(msg: string) {
  console.log(`[SIEBEL] ${msg}`);
}

async function main(): Promise<void> {
  log("Starting Siebel simulation (listener + sender) …");
  log("");

  // Start listening for events from the message bus
  await startEventListener();

  // Give the listener a moment to subscribe, then fire a SOAP message
  log("Waiting 2s before sending SOAP message …");
  log("");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  await sendSoapMessage();

  log("");
  log("SOAP message sent. Waiting for event to arrive via message bus …");
  log("(press Ctrl+C to exit)");
}

main();
