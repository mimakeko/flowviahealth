import { unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testStorePath = path.join(repoRoot, "data", "flowvia-sms-store.test.json");

process.env.FLOWVIA_SMS_STORE_MODE = "test";
process.env.TELNYX_FLOWVIA_FROM_NUMBER = "+14692933948";
process.env.FLOWVIA_ALLOW_REAL_SMS_TEST ||= "false";

const compliance = await import("../lib/sms/compliance.ts");
const store = await import("../lib/sms/store.ts");
const telnyx = await import("../lib/sms/telnyx.ts");
const webhook = await import("../lib/sms/webhook.ts");

const TEST_PHONE = "+15551234567";

async function expectRejectsWithMessage(fn: () => Promise<unknown>, message: RegExp) {
  await assert.rejects(fn, message);
}

await store.resetSmsStoreForTests();

assert.equal(compliance.normalizeE164Phone("(555) 123-4567"), TEST_PHONE);
assert.equal(compliance.isValidE164Phone(TEST_PHONE), true);
assert.equal(compliance.isValidE164Phone("555-123-4567"), false);

await store.upsertPendingConsent({ phone: "(555) 123-4567", name: "Test Patient", email: "patient@example.com" });
let enrollment = await store.findEnrollmentByPhone(TEST_PHONE);
assert.equal(enrollment?.status, "pending_confirmation");

await expectRejectsWithMessage(
  () => telnyx.sendTransactionalSms(TEST_PHONE, compliance.APPOINTMENT_UPDATE_PLACEHOLDER_SMS, { dryRun: true }),
  /Cannot send transactional SMS until consent is active/,
);

await expectRejectsWithMessage(
  () => telnyx.sendTransactionalSms(TEST_PHONE, "Flowvia Health: promotional discount.", {
    dryRun: true,
    consentBypassReason: "confirmation_request",
  }),
  /cannot contain marketing/i,
);

await telnyx.sendTransactionalSms(TEST_PHONE, compliance.CONSENT_CONFIRMATION_SMS, {
  dryRun: true,
  consentBypassReason: "confirmation_request",
  eventType: "test.confirmation_request",
});

const yesResult = await webhook.handleTelnyxWebhookEnvelope({
  data: {
    event_type: "message.received",
    payload: {
      id: "msg_yes",
      direction: "inbound",
      from: { phone_number: TEST_PHONE },
      to: [{ phone_number: "+14692933948" }],
      text: "YES",
    },
  },
}, { dryRunResponses: true });
assert.equal(yesResult.action, "activated");

enrollment = await store.findEnrollmentByPhone(TEST_PHONE);
assert.equal(enrollment?.status, "active");

await telnyx.sendTransactionalSms(TEST_PHONE, compliance.APPOINTMENT_UPDATE_PLACEHOLDER_SMS, {
  dryRun: true,
  eventType: "test.active_transactional_send",
});

const helpResult = await webhook.handleTelnyxWebhookEnvelope({
  data: {
    event_type: "message.received",
    payload: {
      id: "msg_help",
      direction: "inbound",
      from: { phone_number: TEST_PHONE },
      to: [{ phone_number: "+14692933948" }],
      text: "HELP",
    },
  },
}, { dryRunResponses: true });
assert.equal(helpResult.action, "help_sent");

const stopResult = await webhook.handleTelnyxWebhookEnvelope({
  data: {
    event_type: "message.received",
    payload: {
      id: "msg_stop",
      direction: "inbound",
      from: { phone_number: TEST_PHONE },
      to: [{ phone_number: "+14692933948" }],
      text: "STOP",
    },
  },
}, { dryRunResponses: true });
assert.equal(stopResult.action, "opted_out");

enrollment = await store.findEnrollmentByPhone(TEST_PHONE);
assert.equal(enrollment?.status, "opted_out");

await expectRejectsWithMessage(
  () => telnyx.sendTransactionalSms(TEST_PHONE, compliance.APPOINTMENT_UPDATE_PLACEHOLDER_SMS, { dryRun: true }),
  /Cannot send transactional SMS until consent is active/,
);

await webhook.handleTelnyxWebhookEnvelope({
  data: {
    event_type: "message.finalized",
    payload: {
      id: "provider-message-id",
      to: [{ phone_number: TEST_PHONE, status: "delivered" }],
    },
  },
}, { dryRunResponses: true });

const snapshot = await store.getSmsStoreSnapshot();
assert.ok(snapshot.messages.some((message) => message.eventType === "consent.help_response"));
assert.ok(snapshot.messages.every((message) => !message.body?.includes(process.env.TELNYX_API_KEY ?? "__missing__")));

await unlink(testStorePath).catch(() => undefined);

console.log("PASS telnyx messaging engine dry-run tests");
