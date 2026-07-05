export const FLOWVIA_TELNYX_FROM_NUMBER = "+14692933948";
export const CONSENT_TEXT_VERSION = "sms_consent_2026_07_02_v1";

export {
  APPOINTMENT_UPDATE_PLACEHOLDER_SMS,
  CONSENT_CONFIRMATION_SMS,
  HELP_SMS,
  OPT_IN_CONFIRMED_SMS,
  OPT_OUT_CONFIRMED_SMS,
  assertApprovedSmsTemplateBody,
  assertSmsTemplatesAreSafe,
  getApprovedSmsTemplates,
} from "./templates.ts";

export const ALLOWED_MESSAGE_CATEGORY = "transactional";

const E164_PATTERN = /^\+[1-9]\d{1,14}$/;
const MARKETING_PATTERN = /\b(marketing|advertising|fundraising|promotional|promo code|coupon|discount|flash sale|blast)\b/i;

export type MessageCategory = typeof ALLOWED_MESSAGE_CATEGORY;

export function normalizeE164Phone(value: string) {
  const trimmed = value.trim();
  if (E164_PATTERN.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return trimmed;
}

export function isValidE164Phone(value: string) {
  return E164_PATTERN.test(value);
}

export function assertValidE164Phone(value: string) {
  if (!isValidE164Phone(value)) {
    throw new Error("SMS phone numbers must be valid E.164 values.");
  }
}

export function assertTransactionalMessage(body: string, category: string = ALLOWED_MESSAGE_CATEGORY) {
  if (category !== ALLOWED_MESSAGE_CATEGORY) {
    throw new Error("Flowvia SMS messages must be categorized as transactional.");
  }

  if (MARKETING_PATTERN.test(body)) {
    throw new Error("Flowvia SMS messages cannot contain marketing, advertising, fundraising, or promotional copy.");
  }
}

export function getInboundKeyword(body: string) {
  return body.trim().split(/\s+/)[0]?.replace(/[^a-z]/gi, "").toUpperCase() ?? "";
}

export function isOptInKeyword(keyword: string) {
  return keyword === "YES" || keyword === "START";
}

export function isOptOutKeyword(keyword: string) {
  return ["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(keyword);
}

export function isHelpKeyword(keyword: string) {
  return keyword === "HELP" || keyword === "INFO";
}

export function redactPhone(phone: string) {
  if (phone.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
}

export function safeBodyPreview(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}
