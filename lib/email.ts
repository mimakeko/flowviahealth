import { Resend } from "resend";

export const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL ?? "support@flowviahealth.com";
export const CONTACT_FROM_EMAIL = process.env.CONTACT_FROM_EMAIL ?? "Flowvia Health Website <onboarding@resend.dev>";

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

export function renderRows(rows: Array<[string, string]>) {
  return rows
    .map(([label, value]) => `<tr><td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e5e7eb;">${escapeHtml(label)}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(value || "Not provided")}</td></tr>`)
    .join("");
}
