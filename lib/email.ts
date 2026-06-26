import { Resend } from "resend";

export const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL ?? "support@flowviahealth.com";
export const CONTACT_FROM_EMAIL = process.env.CONTACT_FROM_EMAIL ?? "Flowvia Health Website <onboarding@resend.dev>";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

type RateBucket = {
  count: number;
  resetAt: number;
};

const rateBuckets = new Map<string, RateBucket>();

export function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function textField(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isReasonableLength(value: string, maxLength: number) {
  return value.length > 0 && value.length <= maxLength;
}

export function renderRows(rows: Array<[string, string]>) {
  return rows
    .map(([label, value]) => `<tr><td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e5e7eb;">${escapeHtml(label)}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(value || "Not provided")}</td></tr>`)
    .join("");
}

export function getClientKey(request: Request, email: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return `${forwardedFor || realIp || "unknown"}:${email.toLowerCase()}`;
}

export function isRateLimited(key: string) {
  const now = Date.now();

  for (const [bucketKey, bucket] of rateBuckets.entries()) {
    if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
  }

  const bucket = rateBuckets.get(key);
  if (!bucket) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}
