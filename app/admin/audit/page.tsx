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

const SAFE_METADATA_KEYS = new Set([
  "assignedTherapistId",
  "cleanupMode",
  "count",
  "from",
  "hasOperationalNote",
  "noteAdded",
  "reason",
  "referralCount",
  "referralId",
  "route",
  "source",
  "status",
  "therapistCount",
  "therapistId",
  "to",
  "visitCount",
  "visitId",
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
  searchParams?: Promise<{ action?: string; entityType?: string; window?: string }>;
}) {
  requirePilotOperationsAccess();

  const params = await searchParams;
  const selectedWindow = params?.window === "24h" || params?.window === "7d" ? params.window : "";
  const since = auditWindowStart(selectedWindow);
  const selectedAction = params?.action || "";
  const selectedEntityType = params?.entityType || "";
  const auditFilters: Prisma.AuditLogWhereInput[] = [];

  if (selectedAction) auditFilters.push({ action: selectedAction });
  if (selectedEntityType) auditFilters.push({ entityType: selectedEntityType });
  if (since) auditFilters.push({ createdAt: { gte: since } });

  const prisma = getPrismaClient();
  const [logs, actionRows, entityTypeRows] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
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

  const auditLogs = logs as AuditLogRow[];
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
        <div className="grid gap-4 md:grid-cols-4">
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
