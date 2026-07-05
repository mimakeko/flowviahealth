import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarPlus, Save } from "lucide-react";
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
  referralStatusField,
  REFERRAL_STATUSES,
  requirePilotOperationsAccess,
  statusClassName,
  statusLabel,
  textField,
  visitStatusField,
  VISIT_STATUSES,
} from "@/lib/pilot/ops";
import { normalizeE164Phone } from "@/lib/sms/compliance";
import { getTelnyxConfigStatus } from "@/lib/sms/telnyx";

export const metadata: Metadata = {
  title: "Referral Detail",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type TherapistOption = {
  id: string;
  name: string;
};

type ReferralDetailVisit = {
  id: string;
  notes: string | null;
  scheduledAt: Date | string | null;
  status: string;
  therapistId: string | null;
};

type AuditLogListItem = {
  id: string;
  action: string;
  actorType: string;
  createdAt: Date | string;
};

async function updateReferralAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  await requirePilotSession(["admin"], "/admin/referrals");

  const prisma = getPrismaClient();
  const referralId = textField(formData.get("referralId"), 80);
  const assignedTherapistId = optionalTextField(formData.get("assignedTherapistId"), 80);
  const status = referralStatusField(formData.get("status"));
  const notes = optionalTextField(formData.get("notes"), 3000);

  if (!referralId) notFound();

  const blockedNoteSearch = await getBlockedOperationalNoteRedirectSearch({
    actorType: "pilot_admin",
    entityId: referralId,
    entityType: "PatientReferral",
    extra: { assignedTherapistId: assignedTherapistId || null, status },
    fieldLabel: "Referral note",
    route: `/admin/referrals/${referralId}`,
    value: notes,
    workflow: "referral_update",
  });
  if (blockedNoteSearch) redirect(`/admin/referrals/${referralId}?${blockedNoteSearch}`);

  const existing = await prisma.patientReferral.findUnique({
    select: { assignedTherapistId: true, status: true },
    where: { id: referralId },
  });
  if (!existing) notFound();

  const updated = await prisma.patientReferral.update({
    where: { id: referralId },
    data: {
      assignedTherapistId: assignedTherapistId || null,
      notes,
      status,
    },
  });

  await Promise.all([
    prisma.auditLog.create({
      data: {
        actorType: "pilot_admin",
        action: "referral_updated",
        entityType: "PatientReferral",
        entityId: referralId,
        metadataJson: {
          assignedTherapistId: updated.assignedTherapistId,
          hasOperationalNote: Boolean(notes),
          status: updated.status,
        },
      },
    }),
    existing.status !== updated.status
      ? prisma.auditLog.create({
          data: {
            actorType: "pilot_admin",
            action: "referral_status_changed",
            entityType: "PatientReferral",
            entityId: referralId,
            metadataJson: { from: existing.status, to: updated.status },
          },
        })
      : Promise.resolve(),
    existing.assignedTherapistId !== updated.assignedTherapistId
      ? prisma.auditLog.create({
          data: {
            actorType: "pilot_admin",
            action: "therapist_assigned",
            entityType: "PatientReferral",
            entityId: referralId,
            metadataJson: { assignedTherapistId: updated.assignedTherapistId },
          },
        })
      : Promise.resolve(),
  ]);

  redirect(`/admin/referrals/${referralId}`);
}

async function saveVisitAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  await requirePilotSession(["admin"], "/admin/referrals");

  const prisma = getPrismaClient();
  const referralId = textField(formData.get("referralId"), 80);
  const visitId = optionalTextField(formData.get("visitId"), 80);
  const therapistId = optionalTextField(formData.get("therapistId"), 80);
  const scheduledAt = optionalDateField(formData.get("scheduledAt"));
  const status = visitStatusField(formData.get("status"));
  const notes = optionalTextField(formData.get("notes"), 2000);

  if (!referralId) notFound();

  const blockedNoteSearch = await getBlockedOperationalNoteRedirectSearch({
    actorType: "pilot_admin",
    entityId: visitId || null,
    entityType: "Visit",
    extra: { referralId, status, therapistId: therapistId || null },
    fieldLabel: "Visit note",
    route: `/admin/referrals/${referralId}`,
    value: notes,
    workflow: visitId ? "referral_visit_update" : "referral_visit_create",
  });
  if (blockedNoteSearch) redirect(`/admin/referrals/${referralId}?${blockedNoteSearch}`);

  const existingVisit = visitId ? await prisma.visit.findUnique({ select: { status: true }, where: { id: visitId } }) : null;
  const visit = visitId
    ? await prisma.visit.update({
        where: { id: visitId },
        data: {
          notes,
          scheduledAt: scheduledAt || null,
          status,
          therapistId: therapistId || null,
        },
      })
    : await prisma.visit.create({
        data: {
          notes,
          referralId,
          scheduledAt,
          status,
          therapistId,
        },
      });

  await Promise.all([
    prisma.auditLog.create({
      data: {
        actorType: "pilot_admin",
        action: visitId ? "visit_updated" : "visit_created",
        entityType: "Visit",
        entityId: visit.id,
        metadataJson: {
          referralId,
          status: visit.status,
          therapistId: visit.therapistId,
        },
      },
    }),
    existingVisit && existingVisit.status !== visit.status
      ? prisma.auditLog.create({
          data: {
            actorType: "pilot_admin",
            action: "visit_status_changed",
            entityType: "Visit",
            entityId: visit.id,
            metadataJson: {
              from: existingVisit.status,
              referralId,
              to: visit.status,
            },
          },
        })
      : Promise.resolve(),
    prisma.auditLog.create({
      data: {
        actorType: "pilot_admin",
        action: visitId ? "referral_visit_updated" : "referral_visit_created",
        entityType: "PatientReferral",
        entityId: referralId,
        metadataJson: {
          status: visit.status,
          visitId: visit.id,
        },
      },
    }),
  ]);

  redirect(`/admin/referrals/${referralId}`);
}

export default async function ReferralDetailPage({
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
  const [referral, therapists] = await Promise.all([
    prisma.patientReferral.findUnique({
      where: { id },
      include: {
        assignedTherapist: true,
        visits: {
          include: { therapist: true },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.therapist.findMany({
      orderBy: { name: "asc" },
      where: { active: true },
    }),
  ]);

  if (!referral) notFound();

  const referralVisits = referral.visits as ReferralDetailVisit[];
  const referralVisitIds = referralVisits.map((visit: ReferralDetailVisit) => visit.id);
  const therapistOptions = therapists as TherapistOption[];

  const [auditLogs, smsConsent] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      where: {
        OR: [
          { entityType: "PatientReferral", entityId: referral.id },
          { entityType: "Visit", entityId: { in: referralVisitIds } },
        ],
      },
    }),
    prisma.smsConsentEnrollment.findUnique({
      where: { normalizedPhone: normalizeE164Phone(referral.phone) },
    }),
  ]);
  const referralAuditLogs = auditLogs as AuditLogListItem[];
  const telnyx = getTelnyxConfigStatus();

  return (
    <div>
      <Link href="/admin/referrals" className="inline-flex items-center gap-2 text-sm font-semibold text-blue underline">
        <ArrowLeft size={16} />
        Back to referrals
      </Link>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-lg border border-line bg-white p-6">
          <p className="eyebrow">Referral detail</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-.03em] text-ink">{referral.patientName}</h1>
              <p className="mt-2 text-sm text-slate-600">{[referral.city, referral.zip].filter(Boolean).join(" / ") || "Location not provided"}</p>
            </div>
            <span className={`inline-flex w-fit rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(referral.status)}`}>
              {statusLabel(referral.status)}
            </span>
          </div>

          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold text-ink">Phone</dt><dd className="mt-1 text-slate-600">{redactPhone(referral.phone)}</dd></div>
            <div><dt className="font-semibold text-ink">Email</dt><dd className="mt-1 text-slate-600">{referral.email || "Not provided"}</dd></div>
            <div><dt className="font-semibold text-ink">Service area / workflow type</dt><dd className="mt-1 text-slate-600">{referral.careType || "Not provided"}</dd></div>
            <div><dt className="font-semibold text-ink">Referral source</dt><dd className="mt-1 text-slate-600">{referral.referralSource || "Not provided"}</dd></div>
            <div><dt className="font-semibold text-ink">Assigned therapist</dt><dd className="mt-1 text-slate-600">{referral.assignedTherapist?.name || "Unassigned"}</dd></div>
            <div><dt className="font-semibold text-ink">Created</dt><dd className="mt-1 text-slate-600">{formatDateTime(referral.createdAt)}</dd></div>
          </dl>

          <div className="mt-5 rounded-lg border border-line bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            <p className="font-semibold text-ink">SMS readiness only</p>
            <p className="mt-1">Consent: {smsConsent?.status ? statusLabel(smsConsent.status) : "No enrollment found"} · Template: safe transactional templates available · Real SMS gate: {telnyx.realSmsTestsEnabled ? "On" : "Off"}</p>
            <p className="mt-1 text-xs text-slate-500">SMS send disabled in this workflow. Controlled SMS tests require `FLOWVIA_ALLOW_REAL_SMS_TEST=true`, personal-number-only testing, and no PHI.</p>
          </div>

          <BlockedNoteAlert className="mt-5" searchParams={query} />

          {referral.address ? (
            <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
              A full address is stored for this fake referral, but it is not displayed broadly. Keep pilot data fake and non-PHI.
            </p>
          ) : null}

          <form action={updateReferralAction} className="mt-8 grid gap-5 border-t border-line pt-6 md:grid-cols-2">
            <input type="hidden" name="referralId" value={referral.id} />
            <label className="text-sm font-semibold text-ink">Status<select className="field" name="status" defaultValue={referral.status}>{REFERRAL_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
            <label className="text-sm font-semibold text-ink">Assigned therapist<select className="field" name="assignedTherapistId" defaultValue={referral.assignedTherapistId || ""}><option value="">Unassigned</option>{therapistOptions.map((therapist: TherapistOption) => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}</select></label>
            <label className="text-sm font-semibold text-ink md:col-span-2">Internal operational note <span className="font-normal text-slate-400">(no PHI or clinical detail)</span><textarea className="field min-h-32" name="notes" defaultValue={referral.notes || ""} /></label>
            <div className="md:col-span-2"><button className="btn-primary" type="submit"><Save size={18} />Save referral</button></div>
          </form>
        </div>

        <aside className="rounded-lg border border-line bg-white p-6">
          <h2 className="text-xl font-semibold tracking-[-.02em] text-ink">Audit trail</h2>
          <div className="mt-5 space-y-3">
            {referralAuditLogs.map((log: AuditLogListItem) => (
              <div key={log.id} className="rounded-lg border border-line p-3 text-sm">
                <p className="font-semibold text-ink">{log.action}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(log.createdAt)} · {log.actorType}</p>
              </div>
            ))}
            {referralAuditLogs.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No audit events recorded for this referral yet.</p> : null}
          </div>
        </aside>
      </div>

      <section className="mt-8 rounded-lg border border-line bg-white p-6">
        <h2 className="text-xl font-semibold tracking-[-.02em] text-ink">Visits</h2>
        <div className="mt-5 space-y-5">
          {referralVisits.map((visit: ReferralDetailVisit) => (
            <form key={visit.id} action={saveVisitAction} className="grid gap-4 rounded-lg border border-line p-4 md:grid-cols-4">
              <input type="hidden" name="referralId" value={referral.id} />
              <input type="hidden" name="visitId" value={visit.id} />
              <label className="text-sm font-semibold text-ink">Scheduled<input className="field" name="scheduledAt" type="datetime-local" defaultValue={dateTimeLocalValue(visit.scheduledAt)} /></label>
              <label className="text-sm font-semibold text-ink">Status<select className="field" name="status" defaultValue={visit.status}>{VISIT_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
              <label className="text-sm font-semibold text-ink">Therapist<select className="field" name="therapistId" defaultValue={visit.therapistId || ""}><option value="">Unassigned</option>{therapistOptions.map((therapist: TherapistOption) => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}</select></label>
              <label className="text-sm font-semibold text-ink">Operational note<input className="field" name="notes" defaultValue={visit.notes || ""} /></label>
              <div className="md:col-span-4"><button className="btn-secondary" type="submit"><Save size={18} />Update visit</button></div>
            </form>
          ))}
          {referralVisits.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No visits created yet.</p> : null}
        </div>

        <form action={saveVisitAction} className="mt-6 grid gap-4 border-t border-line pt-6 md:grid-cols-4">
          <input type="hidden" name="referralId" value={referral.id} />
          <label className="text-sm font-semibold text-ink">Scheduled<input className="field" name="scheduledAt" type="datetime-local" /></label>
          <label className="text-sm font-semibold text-ink">Status<select className="field" name="status" defaultValue="scheduled">{VISIT_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
          <label className="text-sm font-semibold text-ink">Therapist<select className="field" name="therapistId" defaultValue={referral.assignedTherapistId || ""}><option value="">Unassigned</option>{therapistOptions.map((therapist: TherapistOption) => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}</select></label>
          <label className="text-sm font-semibold text-ink">Operational note<input className="field" name="notes" placeholder="No PHI" /></label>
          <div className="md:col-span-4"><button className="btn-primary" type="submit"><CalendarPlus size={18} />Create visit</button></div>
        </form>
      </section>
    </div>
  );
}
