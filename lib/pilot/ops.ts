export { getPilotPrincipal, requirePilotOperationsAccess } from "./access.ts";
export { redactPhone } from "@/lib/sms/compliance";
export {
  OPERATIONAL_NOTE_PHI_ERROR,
  assertOperationalTextSafe,
  getOperationalTextGuardrailViolation,
  hasForbiddenOperationalText,
} from "@/lib/compliance/operational-text";
export { FLOWVIA_OPERATIONS_TIME_ZONE } from "./time";
import {
  formatOperationsDate,
  formatOperationsDateTime,
  formatOperationsDateTimeLocalInput,
  parseOperationsDateTimeLocal,
} from "./time";

export const REFERRAL_STATUSES = ["new", "contacted", "scheduled", "active", "completed", "canceled"] as const;
export const VISIT_STATUSES = ["unscheduled", "scheduled", "in_progress", "completed", "canceled", "no_show"] as const;

export type ReferralStatusValue = (typeof REFERRAL_STATUSES)[number];
export type VisitStatusValue = (typeof VISIT_STATUSES)[number];

export function textField(value: FormDataEntryValue | null, maxLength = 2000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export function optionalTextField(value: FormDataEntryValue | null, maxLength = 2000) {
  const text = textField(value, maxLength);
  return text || undefined;
}

export function referralStatusField(value: FormDataEntryValue | null): ReferralStatusValue {
  const status = textField(value, 40);
  return REFERRAL_STATUSES.includes(status as ReferralStatusValue) ? (status as ReferralStatusValue) : "new";
}

export function visitStatusField(value: FormDataEntryValue | null): VisitStatusValue {
  const status = textField(value, 40);
  return VISIT_STATUSES.includes(status as VisitStatusValue) ? (status as VisitStatusValue) : "unscheduled";
}

export function optionalDateField(value: FormDataEntryValue | null) {
  const text = textField(value, 80);
  return parseOperationsDateTimeLocal(text);
}

export function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDate(value: Date | string | null | undefined) {
  return formatOperationsDate(value);
}

export function formatDateTime(value: Date | string | null | undefined) {
  return formatOperationsDateTime(value);
}

export function dateTimeLocalValue(value: Date | string | null | undefined) {
  return formatOperationsDateTimeLocalInput(value);
}

export function statusClassName(status: string) {
  if (status === "completed" || status === "active") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (status === "canceled" || status === "no_show") return "bg-rose-50 text-rose-800 ring-rose-200";
  if (status === "scheduled" || status === "in_progress") return "bg-blue-50 text-blue-800 ring-blue-200";
  if (status === "contacted") return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-slate-50 text-slate-700 ring-slate-200";
}

export function appendOperationalNote(existingNotes: string | null | undefined, addition: string) {
  const timestamp = new Date().toISOString();
  return [existingNotes?.trim(), `[${timestamp}] ${addition}`].filter(Boolean).join("\n");
}
