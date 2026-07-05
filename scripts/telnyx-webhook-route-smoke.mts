import assert from "node:assert/strict";
import { loadLocalEnv } from "./load-local-env.mts";

loadLocalEnv();

process.env.FLOWVIA_SMS_STORE_MODE = "test";

const store = await import("../lib/sms/store.ts");

const baseUrl = (process.env.FLOWVIA_TELNYX_WEBHOOK_SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const uniqueSuffix = Date.now().toString().slice(-6);
const testPhone = `+15553${uniqueSuffix.slice(-5)}`;
const fromNumber = "+14692933948";

type TelnyxSmokeEvent = {
  data: {
    id: string;
    event_type: string;
    occurred_at: string;
    payload: Record<string, unknown>;
  };
};

async function postWebhook(event: TelnyxSmokeEvent, label: string) {
  const response = await fetch(`${baseUrl}/api/telnyx/webhook`, {
    body: JSON.stringify(event),
    headers: { "content-type": "application/json" },
    method: "POST",
    redirect: "manual",
  });

  if (response.status === 401) {
    throw new Error(`${label} returned 401. For local synthetic smoke with a configured signing key, start the dev server with FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST=true.`);
  }

  if (response.status < 200 || response.status >= 300) {
    const body = await response.text().catch(() => "");
    throw new Error(`${label} expected HTTP 2xx but got ${response.status}. Response body length: ${body.length}.`);
  }

  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

function inboundEvent(id: string, text: string): TelnyxSmokeEvent {
  return {
    data: {
      id,
      event_type: "message.received",
      occurred_at: new Date().toISOString(),
      payload: {
        id: `${id}_message`,
        direction: "inbound",
        from: { phone_number: testPhone },
        text,
        to: [{ phone_number: fromNumber }],
      },
    },
  };
}

function deliveryEvent(id: string, providerMessageId: string): TelnyxSmokeEvent {
  return {
    data: {
      id,
      event_type: "message.finalized",
      occurred_at: new Date().toISOString(),
      payload: {
        id: providerMessageId,
        to: [{ phone_number: testPhone, status: "delivered" }],
      },
    },
  };
}

await store.resetSmsStoreForTests();
await store.upsertPendingConsent({
  email: `telnyx-smoke-${uniqueSuffix}@example.test`,
  name: `Telnyx Webhook Smoke ${uniqueSuffix}`,
  phone: testPhone,
});

const yes = inboundEvent(`evt_yes_${uniqueSuffix}`, "YES");
const yesResult = await postWebhook(yes, "inbound YES");
assert.equal(yesResult.action, "activated");

const afterYes = await store.getSmsStoreSnapshot();
const messageCountAfterYes = afterYes.messages.length;
const duplicateYesResult = await postWebhook(yes, "duplicate inbound YES");
assert.equal(duplicateYesResult.duplicate, true);

const afterDuplicate = await store.getSmsStoreSnapshot();
assert.equal(afterDuplicate.messages.length, messageCountAfterYes);

const helpResult = await postWebhook(inboundEvent(`evt_help_${uniqueSuffix}`, "HELP"), "inbound HELP");
assert.equal(helpResult.action, "help_sent");

const stopResult = await postWebhook(inboundEvent(`evt_stop_${uniqueSuffix}`, "STOP"), "inbound STOP");
assert.equal(stopResult.action, "opted_out");

await postWebhook(deliveryEvent(`evt_delivered_${uniqueSuffix}`, `provider_${uniqueSuffix}`), "delivery status");

const snapshot = await store.getSmsStoreSnapshot();
const enrollment = await store.findEnrollmentByPhone(testPhone);

assert.equal(enrollment?.status, "opted_out");
assert.ok(snapshot.webhookEvents?.some((event) => event.telnyxEventId === yes.data.id));
assert.ok(snapshot.messages.some((message) => message.direction === "inbound" && message.bodyPreview === "YES"));
assert.ok(snapshot.messages.some((message) => message.direction === "inbound" && message.bodyPreview === "HELP"));
assert.ok(snapshot.messages.some((message) => message.direction === "inbound" && message.bodyPreview === "STOP"));
assert.ok(snapshot.messages.some((message) => message.eventType === "consent.opt_in_confirmed" && message.status === "dry_run"));
assert.ok(snapshot.messages.some((message) => message.eventType === "consent.help_response" && message.status === "dry_run"));
assert.ok(snapshot.messages.some((message) => message.eventType === "consent.opt_out_confirmed" && message.status === "dry_run"));
assert.ok(snapshot.messages.some((message) => message.eventType === "message.finalized" && message.status === "delivered"));

console.log("Telnyx webhook route smoke passed: inbound YES/HELP/STOP, duplicate idempotency, delivery status, ledger records, and consent state verified.");
