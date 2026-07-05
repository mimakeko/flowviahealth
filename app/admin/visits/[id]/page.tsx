import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { BlockedNoteAlert } from "@/components/blocked-note-alert";
import { getPrismaClient } from "@/lib/db/prisma";
import { getBlockedOperationalNoteRedirectSearch } from "@/lib/pilot/note-guardrail";
import { requirePilotSession } from "@/lib/pilot/auth";
import {
  dateTimeLocalValue,
  formatDateTime,
  optionalDateField,
  optionalTextField,
  redactPhone,
  requirePilotOperationsAccess,
  statusClassName,
  statusLabel,
  textField,
  visitStatusField,
  VISIT_STATUSES,
} from "@/lib/pilot/ops";

export const metadata: Metadata = {
  title: "Visit Detail",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type TherapistOption = {
  id: string;
  name: string;
};

type AuditLogListItem = {
  id: string;
  action: string;
  actorType: string;
  createdAt: Date | string;
};

async function updateVisitAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  await requirePilotSession(["admin"], "/admin/visits");

  const prisma = getPrismaClient();
  const visitId = textField(formData.get("visitId"), 80);
  const therapistId = optionalTextField(formData.get("therapistId"), 80);
  const scheduledAt = optionalDateField(formData.get("scheduledAt"));
  const status = visitStatusField(formData.get("status"));
  const notes = optionalTextField(formData.get("notes"), 2000);

  if (!visitId) notFound();

  const blockedNoteSearch = await getBlockedOperationalNoteRedirectSearch({
    actorType: "pilot_admin",
    entityId: visitId,
    entityType: "Visit",
    extra: { status, therapistId: therapistId || null },
    fieldLabel: "Visit note",
    route: `/admin/visits/${visitId}`,
    value: notes,
    workflow: "visit_update",
  });
  if (blockedNoteSearch) redirect(`/admin/visits/${visitId}?${blockedNoteSearch}`);

  const existing = await prisma.visit.findUnique({
    select: { referralId: true, status: true },
    where: { id: visitId },
  });
  if (!existing) notFound();

  const visit = await prisma.visit.update({
    data: {
      notes,
      scheduledAt: scheduledAt || null,
      status,
      therapistId: therapistId || null,
    },
    where: { id: visitId },
  });

  await Promise.all([
    prisma.auditLog.create({
      data: {
        actorType: "pilot_admin",
        action: "visit_updated",
        entityType: "Visit",
        entityId: visit.id,
        metadataJson: {
          referralId: visit.referralId,
          status: visit.status,
          therapistId: visit.therapistId,
        },
      },
    }),
    existing.status !== visit.status
      ? prisma.auditLog.create({
          data: {
            actorType: "pilot_admin",
            action: "visit_status_changed",
            entityType: "Visit",
            entityId: visit.id,
            metadataJson: {
              from: existing.status,
              referralId: visit.referralId,
              to: visit.status,
            },
          },
        })
      : Promise.resolve(),
  ]);

  redirect(`/admin/visits/${visitId}`);
}

export default async function VisitDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; noteCategory?: string; noteDestination?: string; noteSuggestion?: string }>;
}) {
  requirePilotOperationsAccess();

  const { id } = await params;
  const query = await searchParams;
  const prisma = getPrismaClient();
  const [visit, therapists, auditLogs] = await Promise.all([
    prisma.visit.findUnique({
      include: {
        referral: {
          include: { assignedTherapist: true },
        },
        therapist: true,
      },
      where: { id },
    }),
    prisma.therapist.findMany({
      orderBy: { name: "asc" },
      where: { active: true },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      where: { entityType: "Visit", entityId: id },
    }),
  ]);

  if (!visit) notFound();

  const therapistOptions = therapists as TherapistOption[];
  const visitAuditLogs = auditLogs as AuditLogListItem[];

  return (
    <div>
      <Link href="/admin/visits" className="inline-flex items-center gap-2 text-sm font-semibold text-blue underline">
        <ArrowLeft size={16} />
        Back to visits
      </Link>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-lg border border-line bg-white p-6">
          <p className="eyebrow">Visit detail</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-.03em] text-ink">{visit.referral.patientName}</h1>
              <p className="mt-2 text-sm text-slate-600">{formatDateTime(visit.scheduledAt)} · {[visit.referral.city, visit.referral.zip].filter(Boolean).join(" / ") || "Location not provided"}</p>
            </div>
            <span className={`inline-flex w-fit rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(visit.status)}`}>{statusLabel(visit.status)}</span>
          </div>

          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold text-ink">Referral</dt><dd className="mt-1 text-slate-600"><Link href={`/admin/referrals/${visit.referral.id}`} className="font-semibold text-blue underline">Open referral</Link></dd></div>
            <div><dt className="font-semibold text-ink">Phone</dt><dd className="mt-1 text-slate-600">{redactPhone(visit.referral.phone)}</dd></div>
            <div><dt className="font-semibold text-ink">Referral status</dt><dd className="mt-1 text-slate-600">{statusLabel(visit.referral.status)}</dd></div>
            <div><dt className="font-semibold text-ink">Assigned therapist</dt><dd className="mt-1 text-slate-600">{visit.therapist?.name || visit.referral.assignedTherapist?.name || "Unassigned"}</dd></div>
          </dl>

          <BlockedNoteAlert className="mt-5" searchParams={query} />

          <form action={updateVisitAction} className="mt-8 grid gap-5 border-t border-line pt-6 md:grid-cols-2">
            <input type="hidden" name="visitId" value={visit.id} />
            <label className="text-sm font-semibold text-ink">Scheduled<input className="field" name="scheduledAt" type="datetime-local" defaultValue={dateTimeLocalValue(visit.scheduledAt)} /></label>
            <label className="text-sm font-semibold text-ink">Status<select className="field" name="status" defaultValue={visit.status}>{VISIT_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
            <label className="text-sm font-semibold text-ink md:col-span-2">Therapist<select className="field" name="therapistId" defaultValue={visit.therapistId || ""}><option value="">Unassigned</option>{therapistOptions.map((therapist: TherapistOption) => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}</select></label>
            <label className="text-sm font-semibold text-ink md:col-span-2">Operational note <span className="font-normal text-slate-400">(no PHI or clinical detail)</span><textarea className="field min-h-28" name="notes" defaultValue={visit.notes || ""} /></label>
            <div className="md:col-span-2"><button className="btn-primary" type="submit"><Save size={18} />Save visit</button></div>
          </form>
        </div>

        <aside className="rounded-lg border border-line bg-white p-6">
          <h2 className="text-xl font-semibold tracking-[-.02em] text-ink">Audit trail</h2>
          <div className="mt-5 space-y-3">
            {visitAuditLogs.map((log: AuditLogListItem) => (
              <div key={log.id} className="rounded-lg border border-line p-3 text-sm">
                <p className="font-semibold text-ink">{log.action}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(log.createdAt)} · {log.actorType}</p>
              </div>
            ))}
            {visitAuditLogs.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No audit events recorded for this visit yet.</p> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
