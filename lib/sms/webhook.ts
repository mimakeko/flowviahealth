import {
  HELP_SMS,
  OPT_IN_CONFIRMED_SMS,
  OPT_OUT_CONFIRMED_SMS,
  getInboundKeyword,
  isHelpKeyword,
  isOptInKeyword,
  isOptOutKeyword,
  normalizeE164Phone,
  redactPhone,
} from "./compliance.ts";
import { activateEnrollment, findEnrollmentByPhone, logSmsMessage, optOutEnrollment, recordTelnyxWebhookEvent, updateMessageDeliveryStatus } from "./store.ts";
import { sendTransactionalSms } from "./telnyx.ts";
import { assertServerOnlyModule } from "./server-only.ts";

assertServerOnlyModule();

export type TelnyxWebhookEnvelope = {
  data?: {
    id?: string;
    event_type?: string;
    occurred_at?: string;
    payload?: TelnyxWebhookPayload;
  };
};

type TelnyxWebhookPayload = {
  id?: string;
  direction?: string;
  text?: string;
  body?: string;
  status?: string;
  from?: { phone_number?: string } | string;
  to?: Array<{ phone_number?: string; status?: string }> | { phone_number?: string; status?: string } | string;
};

function phoneFromParty(value: TelnyxWebhookPayload["from"] | TelnyxWebhookPayload["to"]) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0]?.phone_number ?? "";
  return value.phone_number ?? "";
}

function phoneLast4(phone: string) {
  return phone.length >= 4 ? phone.slice(-4) : "unknown";
}

function logWebhookDiagnostic(input: {
  action?: string;
  consentAfter?: string;
  consentBefore?: string;
  dryRun?: boolean;
  eventType: string;
  keyword?: string;
  phone?: string;
  responseSmsAttempted?: boolean;
}) {
  console.info("Flowvia Telnyx webhook processed.", {
    action: input.action ?? "recorded",
    consentAfter: input.consentAfter ?? "unknown",
    consentBefore: input.consentBefore ?? "unknown",
    eventType: input.eventType,
    keyword: input.keyword || undefined,
    phoneLast4: input.phone ? phoneLast4(input.phone) : "unknown",
    phoneMasked: input.phone ? redactPhone(input.phone) : "unknown",
    responseSmsAttempted: input.responseSmsAttempted ?? false,
    responseSmsMode: input.responseSmsAttempted ? (input.dryRun ? "dry_run" : "real") : "not_attempted",
  });
}

async function sendComplianceResponse(phone: string, body: string, input: {
  dryRun: boolean;
  eventType: string;
  parentEventType: string;
  keyword: string;
}) {
  try {
    await sendTransactionalSms(phone, body, {
      consentBypassReason: "compliance_auto_response",
      eventType: input.eventType,
      dryRun: input.dryRun,
    });
    return { sent: true };
  } catch (error) {
    console.error("Flowvia Telnyx webhook auto-response failed.", {
      error: error instanceof Error ? error.message : "unknown_error",
      eventType: input.parentEventType,
      keyword: input.keyword,
      phoneLast4: phoneLast4(phone),
      responseSmsMode: input.dryRun ? "dry_run" : "real",
    });
    return { sent: false };
  }
}

export function extractTelnyxWebhook(raw: TelnyxWebhookEnvelope) {
  const payload = raw.data?.payload ?? {};
  const eventType = raw.data?.event_type ?? "telnyx.webhook";
  const providerId = payload.id ?? raw.data?.id;
  const body = payload.text ?? payload.body ?? "";
  const inbound = eventType === "message.received" || payload.direction === "inbound";
  const phone = inbound ? phoneFromParty(payload.from) : phoneFromParty(payload.to);
  const toStatus = Array.isArray(payload.to) ? payload.to.find((item) => item.status)?.status : undefined;
  const status = payload.status ?? toStatus ?? eventType.split(".").at(-1);

  return {
    body,
    eventType,
    inbound,
    phone: normalizeE164Phone(phone),
    providerId,
    status: status || "received",
  };
}

export async function handleTelnyxWebhookEnvelope(envelope: TelnyxWebhookEnvelope, options: { dryRunResponses?: boolean } = {}) {
  const eventType = envelope.data?.event_type ?? "telnyx.webhook";
  const recordedEvent = await recordTelnyxWebhookEvent({
    telnyxEventId: envelope.data?.id,
    eventType,
    payload: envelope,
    processedAt: new Date().toISOString(),
  });

  if (!recordedEvent.created) {
    console.info("Flowvia Telnyx webhook duplicate ignored.", {
      eventType,
      telnyxEventId: recordedEvent.telnyxEventId,
    });
    return { ok: true, duplicate: true };
  }

  const webhook = extractTelnyxWebhook(envelope);
  if (!webhook.phone) return { ok: true, ignored: "missing_phone" };

  if (!webhook.inbound) {
    await updateMessageDeliveryStatus({
      providerId: webhook.providerId,
      phone: webhook.phone,
      status: webhook.status,
      eventType: webhook.eventType,
    });
    logWebhookDiagnostic({
      action: "delivery_status_recorded",
      eventType: webhook.eventType,
      phone: webhook.phone,
    });
    return { ok: true };
  }

  const enrollmentBefore = await findEnrollmentByPhone(webhook.phone);
  const inboundLog = await logSmsMessage({
    direction: "inbound",
    phone: webhook.phone,
    body: webhook.body,
    providerId: webhook.providerId,
    status: "received",
    eventType: webhook.eventType,
  });

  const keyword = getInboundKeyword(webhook.body);
  const dryRun = options.dryRunResponses ?? (process.env.NODE_ENV !== "production" && process.env.FLOWVIA_ALLOW_REAL_SMS_TEST !== "true");

  if (isOptInKeyword(keyword)) {
    const enrollment = await activateEnrollment(webhook.phone, "inbound_opt_in");
    const response = await sendComplianceResponse(webhook.phone, OPT_IN_CONFIRMED_SMS, {
      dryRun,
      eventType: "consent.opt_in_confirmed",
      keyword,
      parentEventType: webhook.eventType,
    });
    logWebhookDiagnostic({
      action: "activated",
      consentAfter: enrollment.status,
      consentBefore: enrollmentBefore?.status,
      dryRun,
      eventType: webhook.eventType,
      keyword,
      phone: webhook.phone,
      responseSmsAttempted: true,
    });
    return { ok: true, action: "activated", autoResponseSent: response.sent, enrollmentId: enrollment.id, inboundMessageId: inboundLog.id };
  }

  if (isOptOutKeyword(keyword)) {
    const enrollment = await optOutEnrollment(webhook.phone, "inbound_opt_out");
    const response = await sendComplianceResponse(webhook.phone, OPT_OUT_CONFIRMED_SMS, {
      dryRun,
      eventType: "consent.opt_out_confirmed",
      keyword,
      parentEventType: webhook.eventType,
    });
    logWebhookDiagnostic({
      action: "opted_out",
      consentAfter: enrollment.status,
      consentBefore: enrollmentBefore?.status,
      dryRun,
      eventType: webhook.eventType,
      keyword,
      phone: webhook.phone,
      responseSmsAttempted: true,
    });
    return { ok: true, action: "opted_out", autoResponseSent: response.sent, enrollmentId: enrollment.id, inboundMessageId: inboundLog.id };
  }

  if (isHelpKeyword(keyword)) {
    const response = await sendComplianceResponse(webhook.phone, HELP_SMS, {
      dryRun,
      eventType: "consent.help_response",
      keyword,
      parentEventType: webhook.eventType,
    });
    logWebhookDiagnostic({
      action: "help_sent",
      consentAfter: enrollmentBefore?.status,
      consentBefore: enrollmentBefore?.status,
      dryRun,
      eventType: webhook.eventType,
      keyword,
      phone: webhook.phone,
      responseSmsAttempted: true,
    });
    return { ok: true, action: "help_sent", autoResponseSent: response.sent, inboundMessageId: inboundLog.id };
  }

  logWebhookDiagnostic({
    action: "message_logged",
    consentAfter: enrollmentBefore?.status,
    consentBefore: enrollmentBefore?.status,
    dryRun,
    eventType: webhook.eventType,
    keyword,
    phone: webhook.phone,
  });
  return { ok: true, action: "message_logged", inboundMessageId: inboundLog.id };
}
