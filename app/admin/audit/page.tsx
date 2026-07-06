import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import { formatDateTime, requirePilotOperationsAccess } from "@/lib/pilot/ops";

export const metadata: Metadata = {
  title: "Audit Trail",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type AuditLogRow = {
  id: string;
  action: string;
  actorId: string | null;
  actorType: string;
  createdAt: Date | string;
  entityId: string | null;
  entityType: string;
  metadataJson: unknown;
};

type AuditFilterRow = {
  action?: string;
  entityType?: string;
};

const AUDIT_CATEGORIES = [
  { value: "referral_intake", label: "Referral intake events" },
  { value: "duplicate_guard", label: "Duplicate guard" },
  { value: "unsafe_intake_notes", label: "Unsafe intake notes" },
  { value: "referral_readiness_changes", label: "Referral readiness changes" },
  { value: "therapist_field", label: "Therapist field actions" },
  { value: "blocked_notes", label: "Blocked notes" },
  { value: "visit_status_changes", label: "Visit status changes" },
  { value: "future_completion_warnings", label: "Future completion warnings" },
] as const;

type AuditCategory = (typeof AUDIT_CATEGORIES)[number]["value"];

const THERAPIST_FIELD_ACTIONS = [
  "therapist_visit_started",
  "therapist_visit_completed",
  "therapist_visit_no_show",
  "therapist_visit_canceled",
  "therapist_visit_note_blocked",
] as const;

const BLOCKED_NOTE_ACTIONS = ["operational_note_blocked", "therapist_visit_note_blocked"] as const;
const VISIT_STATUS_ACTIONS = ["visit_status_changed"] as const;
const REFERRAL_INTAKE_ACTIONS = [
  "referral_created",
  "referral_updated",
  "referral_status_changed",
  "therapist_assigned",
  "referral_duplicate_warning",
  "referral_duplicate_override",
  "operational_note_blocked",
] as const;
const DUPLICATE_GUARD_ACTIONS = ["referral_duplicate_warning", "referral_duplicate_override"] as const;
const REFERRAL_READINESS_ACTIONS = ["referral_created", "referral_updated", "referral_status_changed", "therapist_assigned"] as const;

const SAFE_METADATA_KEYS = new Set([
  "assignedTherapistId",
  "attemptedAction",
  "blockedReason",
  "cleanupMode",
  "classification",
  "count",
  "destinationHint",
  "duplicateCandidateCount",
  "duplicateHighestScore",
  "earlyCompletionWarning",
  "fieldLabel",
  "from",
  "hasOperationalNote",
  "matchedCategoryCount",
  "matchedCategories",
  "newStatus",
  "noteAdded",
  "oldStatus",
  "overrideReasonProvided",
  "reason",
  "readinessLevel",
  "referralCount",
  "referralId",
  "route",
  "severity",
  "source",
  "status",
  "suggestedOperationalRewriteAvailable",
  "therapistCount",
  "therapistId",
  "to",
  "visitCount",
  "visitId",
  "warningCodes",
  "workflow",
]);

function shortId(value: string | null | undefined) {
  if (!value) return "Not recorded";
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function isSafeMetadataKey(key: string) {
  const lowered = key.toLowerCase();
  if (lowered.includes("secret") || lowered.includes("token") || lowered.includes("password")) return false;
  if (lowered.includes("phone") || lowered.includes("sms") || lowered.includes("body") || lowered.includes("payload")) return false;
  if (lowered.includes("email") || lowered.includes("name") || lowered.includes("address")) return false;
  return SAFE_METADATA_KEYS.has(key);
}

function safeMetadataSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "No safe metadata";

  const entries = Object.entries(value)
    .filter(([key, item]) => isSafeMetadataKey(key) && (typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === null))
    .slice(0, 6);

  if (entries.length === 0) return "No safe metadata";

  return entries
    .map(([key, item]) => {
      const rendered = typeof item === "string" && key.toLowerCase().endsWith("id") ? shortId(item) : String(item);
      return `${key}: ${rendered}`;
    })
    .join(" · ");
}

function isAuditCategory(value: string | undefined): value is AuditCategory {
  return AUDIT_CATEGORIES.some((category) => category.value === value);
}

function auditCategoryFilter(category: AuditCategory): Prisma.AuditLogWhereInput {
  if (category === "referral_intake") return { action: { in: [...REFERRAL_INTAKE_ACTIONS] } };
  if (category === "duplicate_guard") return { action: { in: [...DUPLICATE_GUARD_ACTIONS] } };
  if (category === "unsafe_intake_notes") return { action: "operational_note_blocked", entityType: "PatientReferral" };
  if (category === "referral_readiness_changes") return { action: { in: [...REFERRAL_READINESS_ACTIONS] } };
  if (category === "therapist_field") return { action: { in: [...THERAPIST_FIELD_ACTIONS] } };
  if (category === "blocked_notes") return { action: { in: [...BLOCKED_NOTE_ACTIONS] } };
  if (category === "visit_status_changes") return { action: { in: [...VISIT_STATUS_ACTIONS] } };
  return { action: "therapist_visit_completed" };
}

function metadataObject(log: AuditLogRow) {
  if (!log.metadataJson || typeof log.metadataJson !== "object" || Array.isArray(log.metadataJson)) return {};
  return log.metadataJson as Record<string, unknown>;
}

function metadataBoolean(log: AuditLogRow, key: string) {
  const value = metadataObject(log)[key];
  return typeof value === "boolean" ? value : false;
}

function entityHref(log: AuditLogRow) {
  if (!log.entityId) return null;
  if (log.entityType === "PatientReferral") return `/admin/referrals/${log.entityId}`;
  if (log.entityType === "Visit") return `/admin/visits/${log.entityId}`;
  return null;
}

function auditWindowStart(window: string) {
  const now = new Date();
  if (window === "24h") {
    now.setHours(now.getHours() - 24);
    return now;
  }
  if (window === "7d") {
    now.setDate(now.getDate() - 7);
    return now;
  }
  return null;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams?: Promise<{ action?: string; category?: string; entityType?: string; window?: string }>;
}) {
  requirePilotOperationsAccess();

  const params = await searchParams;
  const selectedWindow = params?.window === "24h" || params?.window === "7d" ? params.window : "";
  const since = auditWindowStart(selectedWindow);
  const selectedAction = params?.action || "";
  const selectedCategory = isAuditCategory(params?.category) ? params.category : "";
  const selectedEntityType = params?.entityType || "";
  const auditFilters: Prisma.AuditLogWhereInput[] = [];

  if (selectedCategory) auditFilters.push(auditCategoryFilter(selectedCategory));
  if (selectedAction) auditFilters.push({ action: selectedAction });
  if (selectedEntityType) auditFilters.push({ entityType: selectedEntityType });
  if (since) auditFilters.push({ createdAt: { gte: since } });

  const prisma = getPrismaClient();
  const [logs, actionRows, entityTypeRows] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        action: true,
        actorId: true,
        actorType: true,
        createdAt: true,
        entityId: true,
        entityType: true,
        id: true,
        metadataJson: true,
      },
      take: 100,
      where: auditFilters.length > 0 ? { AND: auditFilters } : undefined,
    }),
    prisma.auditLog.findMany({
      distinct: ["action"],
      orderBy: { action: "asc" },
      select: { action: true },
      take: 200,
    }),
    prisma.auditLog.findMany({
      distinct: ["entityType"],
      orderBy: { entityType: "asc" },
      select: { entityType: true },
      take: 50,
    }),
  ]);

  const rawAuditLogs = logs as AuditLogRow[];
  const auditLogs = selectedCategory === "future_completion_warnings"
    ? rawAuditLogs.filter((log: AuditLogRow) => metadataBoolean(log, "earlyCompletionWarning"))
    : rawAuditLogs;
  const actionOptions = actionRows as AuditFilterRow[];
  const entityTypeOptions = entityTypeRows as AuditFilterRow[];

  return (
    <div className="grid gap-8">
      <div className="flex flex-col gap-5 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">Pilot admin</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.03em] text-ink sm:text-4xl">Audit trail</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Recent operational audit events with safe metadata only. PHI, secrets, raw SMS bodies, and provider payloads are intentionally excluded.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          <ShieldCheck size={18} />
          Admin only
        </div>
      </div>

      <form className="rounded-lg border border-line bg-white p-5">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm font-semibold text-ink">
            Category
            <select className="field" name="category" defaultValue={selectedCategory}>
              <option value="">All categories</option>
              {AUDIT_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-ink">
            Action
            <select className="field" name="action" defaultValue={selectedAction}>
              <option value="">All actions</option>
              {actionOptions.map((row: AuditFilterRow) => row.action ? <option key={row.action} value={row.action}>{row.action}</option> : null)}
            </select>
          </label>
          <label className="text-sm font-semibold text-ink">
            Entity type
            <select className="field" name="entityType" defaultValue={selectedEntityType}>
              <option value="">All entities</option>
              {entityTypeOptions.map((row: AuditFilterRow) => row.entityType ? <option key={row.entityType} value={row.entityType}>{row.entityType}</option> : null)}
            </select>
          </label>
          <label className="text-sm font-semibold text-ink">
            Window
            <select className="field" name="window" defaultValue={selectedWindow}>
              <option value="">Most recent</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button className="btn-primary w-full justify-center" type="submit">Apply</button>
            <Link href="/admin/audit" className="btn-secondary w-full justify-center">Reset</Link>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          {AUDIT_CATEGORIES.map((category) => (
            <Link
              key={category.value}
              href={`/admin/audit?category=${category.value}`}
              className={`rounded-md px-2.5 py-2 ring-1 ${selectedCategory === category.value ? "bg-blue text-white ring-blue" : "bg-slate-50 text-slate-700 ring-line"}`}
            >
              {category.label}
            </Link>
          ))}
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="min-w-full divide-y divide-line text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Safe metadata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {auditLogs.map((log: AuditLogRow) => {
              const href = entityHref(log);
              return (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(log.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-600">{log.actorType}{log.actorId ? ` · ${shortId(log.actorId)}` : ""}</td>
                  <td className="px-4 py-3 font-medium text-ink">{log.action}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="font-medium text-ink">{log.entityType}</span>
                    <span className="ml-2 font-mono text-xs">
                      {href ? <Link href={href} className="text-blue underline">{shortId(log.entityId)}</Link> : shortId(log.entityId)}
                    </span>
                  </td>
                  <td className="max-w-xl px-4 py-3 text-slate-600">{safeMetadataSummary(log.metadataJson)}</td>
                </tr>
              );
            })}
            {auditLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">No audit events match the current filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
