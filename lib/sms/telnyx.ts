import { createPublicKey, verify } from "node:crypto";
import {
  ALLOWED_MESSAGE_CATEGORY,
  FLOWVIA_TELNYX_FROM_NUMBER,
  assertApprovedSmsTemplateBody,
  assertTransactionalMessage,
  assertValidE164Phone,
  normalizeE164Phone,
  redactPhone,
} from "./compliance.ts";
import { findEnrollmentByPhone, logSmsMessage } from "./store.ts";
import { assertServerOnlyModule } from "./server-only.ts";

const TELNYX_MESSAGES_URL = "https://api.telnyx.com/v2/messages";
const ED25519_SPKI_PREFIX = "302a300506032b6570032100";

assertServerOnlyModule();

type TelnyxSendMetadata = {
  category?: string;
  consentBypassReason?: "confirmation_request" | "compliance_auto_response" | "test_dry_run";
  eventType?: string;
  dryRun?: boolean;
};

type TelnyxProviderResponse = {
  id?: string;
  status?: string;
  dryRun?: boolean;
  request?: {
    to: string;
    from: string;
    messagingProfileConfigured: boolean;
  };
};

function getApiKey() {
  return process.env.TELNYX_API_KEY;
}

function realSmsTestsEnabled() {
  return process.env.FLOWVIA_ALLOW_REAL_SMS_TEST === "true";
}

function unsignedWebhookTestBypassEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST === "true";
}

function productionLikeRuntime() {
  return process.env.NODE_ENV === "production" || ["production", "preview"].includes((process.env.VERCEL_ENV || "").toLowerCase());
}

export function getTelnyxConfigStatus() {
  return {
    apiKeyConfigured: Boolean(process.env.TELNYX_API_KEY),
    messagingProfileConfigured: Boolean(process.env.TELNYX_MESSAGING_PROFILE_ID),
    fromNumber: process.env.TELNYX_FLOWVIA_FROM_NUMBER || FLOWVIA_TELNYX_FROM_NUMBER,
    webhookSigningConfigured: Boolean(process.env.TELNYX_WEBHOOK_SIGNING_SECRET),
    webhookSigningDevSkipped: !process.env.TELNYX_WEBHOOK_SIGNING_SECRET && !productionLikeRuntime(),
    unsignedWebhookTestBypassEnabled: unsignedWebhookTestBypassEnabled(),
    realSmsTestsEnabled: realSmsTestsEnabled(),
  };
}

function configuredFromNumber() {
  return process.env.TELNYX_FLOWVIA_FROM_NUMBER || FLOWVIA_TELNYX_FROM_NUMBER;
}

function canBypassActiveConsent(metadata?: TelnyxSendMetadata) {
  return metadata?.consentBypassReason === "confirmation_request" || metadata?.consentBypassReason === "compliance_auto_response";
}

async function assertCanSendToPhone(to: string, metadata?: TelnyxSendMetadata) {
  if (canBypassActiveConsent(metadata)) return;

  const enrollment = await findEnrollmentByPhone(to);
  if (!enrollment || enrollment.status !== "active") {
    throw new Error("Cannot send transactional SMS until consent is active.");
  }
}

export async function sendTransactionalSms(to: string, body: string, metadata: TelnyxSendMetadata = {}): Promise<TelnyxProviderResponse> {
  const normalizedTo = normalizeE164Phone(to);
  const from = configuredFromNumber();

  assertValidE164Phone(normalizedTo);
  assertValidE164Phone(from);

  if (from !== FLOWVIA_TELNYX_FROM_NUMBER) {
    throw new Error("Flowvia Telnyx sender number must remain +14692933948.");
  }

  assertTransactionalMessage(body, metadata.category ?? ALLOWED_MESSAGE_CATEGORY);
  assertApprovedSmsTemplateBody(body);
  await assertCanSendToPhone(normalizedTo, metadata);

  const dryRun = metadata.dryRun === true || metadata.consentBypassReason === "test_dry_run";
  const baseResponse = {
    dryRun,
    request: {
      to: redactPhone(normalizedTo),
      from,
      messagingProfileConfigured: Boolean(process.env.TELNYX_MESSAGING_PROFILE_ID),
    },
  };

  if (dryRun) {
    await logSmsMessage({
      direction: "outbound",
      phone: normalizedTo,
      body,
      status: "dry_run",
      eventType: metadata.eventType ?? "sms.dry_run",
      dryRun: true,
    });
    return baseResponse;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("TELNYX_API_KEY is required to send real SMS.");
  }

  const response = await fetch(TELNYX_MESSAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: normalizedTo,
      text: body,
      messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID || undefined,
      use_profile_webhooks: true,
    }),
  });

  const providerJson = (await response.json().catch(() => ({}))) as {
    data?: { id?: string; status?: string };
    errors?: unknown;
  };

  if (!response.ok) {
    throw new Error(`Telnyx SMS send failed with status ${response.status}.`);
  }

  await logSmsMessage({
    direction: "outbound",
    phone: normalizedTo,
    body,
    providerId: providerJson.data?.id,
    status: providerJson.data?.status ?? "sent",
    eventType: metadata.eventType ?? "message.sent",
    dryRun: false,
  });

  return {
    ...baseResponse,
    id: providerJson.data?.id,
    status: providerJson.data?.status,
  };
}

function decodeTelnyxPublicKey(value: string) {
  const compact = value.trim();
  const raw = /^[a-f0-9]{64}$/i.test(compact)
    ? Buffer.from(compact, "hex")
    : Buffer.from(compact, "base64");

  if (raw.length !== 32) {
    throw new Error("TELNYX_WEBHOOK_SIGNING_SECRET must contain the 32-byte Telnyx Ed25519 public key as hex or base64.");
  }

  return createPublicKey({
    key: Buffer.concat([Buffer.from(ED25519_SPKI_PREFIX, "hex"), raw]),
    format: "der",
    type: "spki",
  });
}

export function verifyTelnyxWebhookSignature(rawBody: string, headers: Headers) {
  const configuredKey = process.env.TELNYX_WEBHOOK_SIGNING_SECRET;
  if (!configuredKey) {
    if (productionLikeRuntime()) {
      console.error("Flowvia Telnyx webhook rejected because TELNYX_WEBHOOK_SIGNING_SECRET is required in production-like environments.");
      return false;
    }

    console.warn("Flowvia Telnyx webhook signature verification skipped because TELNYX_WEBHOOK_SIGNING_SECRET is not configured.");
    return true;
  }

  if (unsignedWebhookTestBypassEnabled()) {
    console.warn("Flowvia Telnyx webhook signature verification bypassed for local route smoke testing.");
    return true;
  }

  const signature = headers.get("telnyx-signature-ed25519");
  const timestamp = headers.get("telnyx-timestamp");
  if (!signature || !timestamp) return false;

  const signedPayload = Buffer.from(`${timestamp}|${rawBody}`, "utf8");
  return verify(null, signedPayload, decodeTelnyxPublicKey(configuredKey), Buffer.from(signature, "base64"));
}
