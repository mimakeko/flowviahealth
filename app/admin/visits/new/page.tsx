import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import type { PrismaClient } from "@prisma/client";
import { BlockedNoteAlert } from "@/components/blocked-note-alert";
import { SchedulingIntelligencePanel } from "@/components/scheduling-intelligence-panel";
import { getPrismaClient } from "@/lib/db/prisma";
import { activeWorkflowVisitWhere, activeWorkflowWhereClause } from "@/lib/pilot/data-stewardship";
import { getBlockedOperationalNoteRedirectSearch } from "@/lib/pilot/note-guardrail";
import { requirePilotSession } from "@/lib/pilot/auth";
import {
  FLOWVIA_OPERATIONS_TIME_ZONE,
  statusClassName,
  optionalDateField,
  optionalTextField,
  requirePilotOperationsAccess,
  statusLabel,
  textField,
  visitStatusField,
  VISIT_STATUSES,
} from "@/lib/pilot/ops";
import {
  getNeutralSchedulingGuidanceCards,
  getSchedulingReadiness,
  getSuggestedSchedulingWindows,
  getTherapistFit,
} from "@/lib/pilot/scheduling-intelligence";
import {
  canCreateVisitForReferral,
  evaluateReferralIntakeQuality,
  getReferralDuplicateCandidates,
  type CreateVisitGateResult,
  type ReferralIntakeDuplicateSource,
  type ReferralIntakeQualityResult,
} from "@/lib/pilot/referral-intake-quality";
import {
  getOpportunityStateFromAuditLogs,
  opportunityAllowsVisitCreation,
} from "@/lib/pilot/opportunity";
import { normalizeE164Phone } from "@/lib/sms/compliance";

export const metadata: Metadata = {
  title: "New Visit",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type ReferralOption = {
  id: string;
  city: string | null;
  patientName: string;
  status: string;
  zip: string | null;
};

type TherapistOption = {
  id: string;
  name: string;
};

type SelectedReferral = {
  assignedTherapist: {
    active: boolean;
    name: string;
    serviceAreaNotes: string | null;
  } | null;
  assignedTherapistId: string | null;
  careType: string | null;
  city: string | null;
  createdAt: Date | string;
  id: string;
  notes: string | null;
  patientName: string;
  phone: string;
  referralSource: string | null;
  status: string;
  visits: { scheduledAt: Date | null; status: string }[];
  zip: string | null;
};

type DuplicateReferralRow = {
  assignedTherapist: { name: string } | null;
  assignedTherapistId: string | null;
  city: string | null;
  createdAt: Date | string;
  id: string;
  patientName: string;
  phone: string;
  status: string;
  visits: { id: string }[];
  zip: string | null;
};

function visitCreateErrorMessage(error: string | undefined) {
  if (error === "visit_create_blocked") return "Visit creation was blocked by the deterministic scheduling ready gate. Review the referral before trying again.";
  if (error === "missing_required") return "Referral, therapist, and scheduled datetime are required before a visit can be created.";
  return null;
}

function gateToneClassName(allowed: boolean) {
  return allowed ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-rose-200 bg-rose-50 text-rose-950";
}

async function getCreateVisitGateForReferral(prisma: PrismaClient, referralId: string): Promise<CreateVisitGateResult | null> {
  const referral = await prisma.patientReferral.findUnique({
    include: {
      assignedTherapist: { select: { name: true } },
      visits: {
        select: { scheduledAt: true, status: true },
        where: { status: { in: ["scheduled", "in_progress"] } },
      },
    },
    where: { id: referralId },
  });
  if (!referral) return null;

  const [activeWorkflowVisible, smsConsent, duplicateRows] = await Promise.all([
    prisma.patientReferral.count({ where: activeWorkflowWhereClause({ id: referralId }) }),
    prisma.smsConsentEnrollment.findUnique({
      select: { status: true },
      where: { normalizedPhone: normalizeE164Phone(referral.phone) },
    }),
    prisma.patientReferral.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        assignedTherapist: { select: { name: true } },
        assignedTherapistId: true,
        city: true,
        createdAt: true,
        id: true,
        patientName: true,
        phone: true,
        status: true,
        visits: {
          select: { id: true },
          where: { status: { in: ["scheduled", "in_progress"] } },
        },
        zip: true,
      },
      take: 150,
      where: activeWorkflowWhereClause({ status: { notIn: ["completed", "canceled"] } }),
    }),
  ]);
  const duplicateCandidates = getReferralDuplicateCandidates({
    draft: {
      assignedTherapistId: referral.assignedTherapistId,
      assignedTherapistName: referral.assignedTherapist?.name,
      city: referral.city,
      createdAt: referral.createdAt,
      id: referral.id,
      patientName: referral.patientName,
      phone: referral.phone,
      status: referral.status,
      zip: referral.zip,
    },
    sources: duplicateSources(duplicateRows as DuplicateReferralRow[]),
  });
  const intakeQuality = evaluateReferralIntakeQuality({
    assignedTherapistId: referral.assignedTherapistId,
    assignedTherapistName: referral.assignedTherapist?.name,
    careType: referral.careType,
    city: referral.city,
    duplicateCandidates,
    patientName: referral.patientName,
    phone: referral.phone,
    smsConsentStatus: smsConsent?.status || "none",
    status: referral.status,
    zip: referral.zip,
  });

  return canCreateVisitForReferral({
    activeWorkflowVisible: activeWorkflowVisible > 0,
    assignedTherapistId: referral.assignedTherapistId,
    assignedTherapistName: referral.assignedTherapist?.name,
    careType: referral.careType,
    city: referral.city,
    duplicateCandidates,
    futureVisitCount: referral.visits.length,
    intakeQuality,
    notes: referral.notes,
    patientName: referral.patientName,
    phone: referral.phone,
    referralSource: referral.referralSource,
    smsConsentStatus: smsConsent?.status || "none",
    status: referral.status,
    zip: referral.zip,
  });
}

function duplicateSources(rows: DuplicateReferralRow[]): ReferralIntakeDuplicateSource[] {
  return rows.map((row: DuplicateReferralRow) => ({
    assignedTherapistId: row.assignedTherapistId,
    assignedTherapistName: row.assignedTherapist?.name,
    city: row.city,
    createdAt: row.createdAt,
    futureOpenVisitCount: row.visits.length,
    id: row.id,
    patientName: row.patientName,
    phone: row.phone,
    status: row.status,
    zip: row.zip,
  }));
}

async function createVisitAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  await requirePilotSession(["admin"], "/admin/visits/new");

  const prisma = getPrismaClient();
  const referralId = textField(formData.get("referralId"), 80);
  const therapistId = optionalTextField(formData.get("therapistId"), 80);
  const scheduledAt = optionalDateField(formData.get("scheduledAt"));
  const status = visitStatusField(formData.get("status"));
  const notes = optionalTextField(formData.get("notes"), 2000);

  if (!referralId) notFound();
  if (!therapistId || !scheduledAt) {
    redirect(`/admin/visits/new?referralId=${encodeURIComponent(referralId)}&error=missing_required`);
  }

  const blockedNoteSearch = await getBlockedOperationalNoteRedirectSearch({
    actorType: "pilot_admin",
    entityType: "Visit",
    extra: { referralId, status, therapistId: therapistId || null },
    fieldLabel: "Visit note",
    route: "/admin/visits/new",
    value: notes,
    workflow: "visit_create",
  });
  if (blockedNoteSearch) redirect(`/admin/visits/new?referralId=${encodeURIComponent(referralId)}&${blockedNoteSearch}`);

  const createVisitGate = await getCreateVisitGateForReferral(prisma, referralId);
  if (!createVisitGate) notFound();
  if (!createVisitGate.allowed) {
    await prisma.auditLog.create({
      data: {
        actorType: "pilot_admin",
        action: "visit_create_blocked",
        entityType: "PatientReferral",
        entityId: referralId,
        metadataJson: {
          reason: createVisitGate.reasons.slice(0, 5).join(","),
          route: "/admin/visits/new",
          severity: createVisitGate.severity,
          source: "guided_visit_creation",
        },
      },
    });
    redirect(`/admin/visits/new?referralId=${encodeURIComponent(referralId)}&error=visit_create_blocked`);
  }
  const [referralOpportunitySource, opportunityLogs] = await Promise.all([
    prisma.patientReferral.findUnique({
      select: { referralSource: true },
      where: { id: referralId },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      where: {
        action: { in: ["opportunity_offered", "opportunity_accepted", "opportunity_declined", "opportunity_action_blocked"] },
        entityId: referralId,
        entityType: "PatientReferral",
      },
    }),
  ]);
  if (!referralOpportunitySource) notFound();
  const opportunityState = getOpportunityStateFromAuditLogs(opportunityLogs);
  if (!opportunityAllowsVisitCreation({ opportunityState: opportunityState.state, referralSource: referralOpportunitySource.referralSource })) {
    await prisma.auditLog.create({
      data: {
        actorType: "pilot_admin",
        action: "visit_create_blocked",
        entityType: "PatientReferral",
        entityId: referralId,
        metadataJson: {
          reason: "Therapist opportunity acceptance required",
          route: "/admin/visits/new",
          severity: "caution",
          source: "guided_visit_creation",
        },
      },
    });
    redirect(`/admin/visits/new?referralId=${encodeURIComponent(referralId)}&error=visit_create_blocked`);
  }

  const visit = await prisma.visit.create({
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
        action: "visit_created",
        entityType: "Visit",
        entityId: visit.id,
        metadataJson: {
          referralId,
          readyGateEnforced: true,
          source: "guided_visit_creation",
          status: visit.status,
          therapistId: visit.therapistId,
        },
      },
    }),
    prisma.auditLog.create({
      data: {
        actorType: "pilot_admin",
        action: "referral_visit_created",
        entityType: "PatientReferral",
        entityId: referralId,
        metadataJson: {
          readyGateEnforced: true,
          source: "guided_visit_creation",
          status: visit.status,
          visitId: visit.id,
        },
      },
    }),
  ]);

  redirect(`/admin/visits/${visit.id}?created=1`);
}

export default async function NewVisitPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; noteCategory?: string; noteDestination?: string; noteSuggestion?: string; referralId?: string }>;
}) {
  requirePilotOperationsAccess();

  const params = await searchParams;
  const prisma = getPrismaClient();
  const [referrals, therapists, selectedReferralRecord, duplicateRows] = await Promise.all([
    prisma.patientReferral.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        city: true,
        id: true,
        patientName: true,
        status: true,
        zip: true,
      },
      take: 100,
      where: activeWorkflowWhereClause({ status: { notIn: ["completed", "canceled"] } }),
    }),
    prisma.therapist.findMany({
      orderBy: { name: "asc" },
      where: { active: true },
    }),
    params?.referralId
      ? prisma.patientReferral.findUnique({
          include: {
            assignedTherapist: true,
            visits: {
              select: { scheduledAt: true, status: true },
              where: { status: { in: ["scheduled", "in_progress"] } },
            },
          },
          where: { id: params.referralId },
        })
      : Promise.resolve(null),
    params?.referralId
      ? prisma.patientReferral.findMany({
          orderBy: { createdAt: "desc" },
          select: {
            assignedTherapist: { select: { name: true } },
            assignedTherapistId: true,
            city: true,
            createdAt: true,
            id: true,
            patientName: true,
            phone: true,
            status: true,
            visits: {
              select: { id: true },
              where: { status: { in: ["scheduled", "in_progress"] } },
            },
            zip: true,
          },
          take: 150,
          where: activeWorkflowWhereClause({ status: { notIn: ["completed", "canceled"] } }),
        })
      : Promise.resolve([]),
  ]);
  const referralOptions = referrals as ReferralOption[];
  const therapistOptions = therapists as TherapistOption[];
  const selectedReferral = selectedReferralRecord as SelectedReferral | null;
  const smsConsent = selectedReferral
    ? await prisma.smsConsentEnrollment.findUnique({
        select: { status: true },
        where: { normalizedPhone: normalizeE164Phone(selectedReferral.phone) },
      })
    : null;
  const therapistOpenVisits = selectedReferral?.assignedTherapistId
    ? await prisma.visit.findMany({
        orderBy: { scheduledAt: "asc" },
        select: { id: true, scheduledAt: true, status: true },
      where: {
          ...activeWorkflowVisitWhere({
            therapistId: selectedReferral.assignedTherapistId,
            status: { in: ["scheduled", "in_progress"] },
          }),
      },
    })
    : [];
  const schedulingReadiness = selectedReferral
    ? getSchedulingReadiness({
        assignedTherapistId: selectedReferral.assignedTherapistId,
        futureVisitCount: selectedReferral.visits.length,
        referralStatus: selectedReferral.status,
        smsConsentStatus: smsConsent?.status || null,
      })
    : null;
  const duplicateCandidates = selectedReferral
    ? getReferralDuplicateCandidates({
        draft: {
          assignedTherapistId: selectedReferral.assignedTherapistId,
          assignedTherapistName: selectedReferral.assignedTherapist?.name,
          city: selectedReferral.city,
          createdAt: selectedReferral.createdAt,
          id: selectedReferral.id,
          patientName: selectedReferral.patientName,
          phone: selectedReferral.phone,
          status: selectedReferral.status,
          zip: selectedReferral.zip,
        },
        sources: duplicateSources(duplicateRows as DuplicateReferralRow[]),
      })
    : [];
  const intakeQuality: ReferralIntakeQualityResult | null = selectedReferral
    ? evaluateReferralIntakeQuality({
        assignedTherapistId: selectedReferral.assignedTherapistId,
        assignedTherapistName: selectedReferral.assignedTherapist?.name,
        careType: selectedReferral.careType,
        city: selectedReferral.city,
        duplicateCandidates,
        patientName: selectedReferral.patientName,
        phone: selectedReferral.phone,
        smsConsentStatus: smsConsent?.status || "none",
        status: selectedReferral.status,
        zip: selectedReferral.zip,
      })
    : null;
  const createVisitGate = selectedReferral && intakeQuality
    ? canCreateVisitForReferral({
        activeWorkflowVisible: await prisma.patientReferral.count({ where: activeWorkflowWhereClause({ id: selectedReferral.id }) }) > 0,
        assignedTherapistId: selectedReferral.assignedTherapistId,
        assignedTherapistName: selectedReferral.assignedTherapist?.name,
        careType: selectedReferral.careType,
        city: selectedReferral.city,
        duplicateCandidates,
        futureVisitCount: selectedReferral.visits.length,
        intakeQuality,
        notes: selectedReferral.notes,
        patientName: selectedReferral.patientName,
        phone: selectedReferral.phone,
        referralSource: selectedReferral.referralSource,
        smsConsentStatus: smsConsent?.status || "none",
        status: selectedReferral.status,
        zip: selectedReferral.zip,
      })
    : null;
  const selectedOpportunityLogs = selectedReferral
    ? await prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        where: {
          action: { in: ["opportunity_offered", "opportunity_accepted", "opportunity_declined", "opportunity_action_blocked"] },
          entityId: selectedReferral.id,
          entityType: "PatientReferral",
        },
      })
    : [];
  const selectedOpportunityState = getOpportunityStateFromAuditLogs(selectedOpportunityLogs);
  const opportunityAllowsCreateVisit = selectedReferral
    ? opportunityAllowsVisitCreation({ opportunityState: selectedOpportunityState.state, referralSource: selectedReferral.referralSource })
    : true;
  const effectiveCreateVisitAllowed = Boolean(createVisitGate?.allowed && opportunityAllowsCreateVisit);
  const therapistFit = selectedReferral
    ? getTherapistFit({
        active: selectedReferral.assignedTherapist?.active ?? false,
        currentOpenVisitCount: therapistOpenVisits.length,
        referralCity: selectedReferral.city,
        referralZip: selectedReferral.zip,
        serviceAreaNotes: selectedReferral.assignedTherapist?.serviceAreaNotes,
        therapistName: selectedReferral.assignedTherapist?.name,
      })
    : null;
  const suggestedWindows = selectedReferral ? getSuggestedSchedulingWindows({ scheduledVisits: therapistOpenVisits }) : [];
  const visitCreateError = visitCreateErrorMessage(params?.error);

  return (
    <div className="max-w-4xl">
      <Link href="/admin/visits" className="inline-flex items-center gap-2 text-sm font-semibold text-blue underline">
        <ArrowLeft size={16} />
        Back to visits
      </Link>
      <div className="mt-6 border-b border-line pb-6">
        <p className="eyebrow">Pilot admin</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-.03em] text-ink">Create visit</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Schedule a fake/test operational visit. Do not enter PHI, diagnosis, treatment detail, or clinical notes.</p>
      </div>

      <BlockedNoteAlert searchParams={params} />

      {visitCreateError ? (
        <section className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-950">
          {visitCreateError}
        </section>
      ) : null}

      {selectedReferral && createVisitGate ? (
        <section
          data-testid={effectiveCreateVisitAllowed ? "ready-referral-selected-panel" : "blocked-referral-selected-panel"}
          className={`mt-4 rounded-lg border p-4 sm:mt-6 sm:p-5 ${gateToneClassName(effectiveCreateVisitAllowed)}`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">{effectiveCreateVisitAllowed ? "Ready referral selected" : "Referral is not ready for visit creation"}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-.02em] text-ink sm:text-2xl">{selectedReferral.patientName}</h2>
              <p className="mt-2 text-sm font-semibold leading-6">
                {effectiveCreateVisitAllowed ? "Manual visit creation is available." : `Manual create blocked: ${!opportunityAllowsCreateVisit ? "Therapist opportunity acceptance required" : createVisitGate.reasons.join(" · ") || "Review required"}`}
              </p>
            </div>
            <span className="inline-flex w-fit rounded-md bg-white/70 px-2.5 py-1 text-xs font-semibold ring-1 ring-current">
              Manual review required
            </span>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg bg-white/70 p-3">
              <dt className="font-semibold text-ink">Referral status</dt>
              <dd className="mt-1">
                <span className={`inline-flex w-fit rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(selectedReferral.status)}`}>{statusLabel(selectedReferral.status)}</span>
              </dd>
            </div>
            <div className="rounded-lg bg-white/70 p-3">
              <dt className="font-semibold text-ink">City / ZIP</dt>
              <dd className="mt-1">{[selectedReferral.city, selectedReferral.zip].filter(Boolean).join(" / ") || "Location not provided"}</dd>
            </div>
            <div className="rounded-lg bg-white/70 p-3">
              <dt className="font-semibold text-ink">Assigned therapist</dt>
              <dd className="mt-1">{selectedReferral.assignedTherapist?.name || "Unassigned"}</dd>
            </div>
            <div className="rounded-lg bg-white/70 p-3 md:col-span-3">
              <dt className="font-semibold text-ink">Readiness state</dt>
              <dd className="mt-1">{effectiveCreateVisitAllowed ? "Ready for guided manual visit creation" : `Blocked: ${!opportunityAllowsCreateVisit ? "Therapist opportunity acceptance required" : createVisitGate.reasons.join(" · ") || "Review required"}`}</dd>
            </div>
          </dl>
          {!effectiveCreateVisitAllowed ? (
            <div className="mt-4 rounded-lg bg-white/70 p-4 text-sm leading-6">
              <p className="font-semibold text-ink">Deterministic blockers</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {(!opportunityAllowsCreateVisit ? ["Therapist opportunity acceptance required"] : createVisitGate.reasons).map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <form data-testid="guided-visit-create-form" action={createVisitAction} className="mt-6 grid gap-5 rounded-lg border border-line bg-white p-4 sm:p-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <h2 className="text-lg font-semibold tracking-[-.02em] text-ink">Visit form</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">Manual review required. No auto-scheduling or auto-assignment.</p>
        </div>
        <label className="text-sm font-semibold text-ink md:col-span-2">Referral<select data-testid="visit-referral-select" className="field" name="referralId" defaultValue={params?.referralId || ""} required><option value="">Select referral</option>{referralOptions.map((referral: ReferralOption) => <option key={referral.id} value={referral.id}>{referral.patientName} · {statusLabel(referral.status)} · {[referral.city, referral.zip].filter(Boolean).join(" / ") || "Location not provided"}</option>)}</select></label>
        <label className="text-sm font-semibold text-ink">Therapist<select data-testid="visit-therapist-select" className="field" name="therapistId" defaultValue={selectedReferral?.assignedTherapistId || ""} required><option value="">Unassigned</option>{therapistOptions.map((therapist: TherapistOption) => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}</select></label>
        <label className="text-sm font-semibold text-ink">Scheduled<input data-testid="visit-scheduled-at-input" className="field" name="scheduledAt" type="datetime-local" required /></label>
        <label className="text-sm font-semibold text-ink">Status<select className="field" name="status" defaultValue="scheduled">{VISIT_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
        <label className="text-sm font-semibold text-ink">Scheduling timezone<span className="field flex items-center text-slate-500">{FLOWVIA_OPERATIONS_TIME_ZONE}</span></label>
        <label className="text-sm font-semibold text-ink md:col-span-2">Operational note <span className="font-normal text-slate-400">(optional, no PHI or clinical detail)</span><textarea className="field min-h-28" name="notes" /></label>
        <div className="md:col-span-2">
          {createVisitGate && !effectiveCreateVisitAllowed ? (
            <button data-testid="visit-create-submit" className="btn-secondary w-full cursor-not-allowed justify-center opacity-70 sm:w-auto" type="submit" disabled><Save size={18} />Review referral first</button>
          ) : (
            <button data-testid="visit-create-submit" className="btn-primary w-full justify-center sm:w-auto" type="submit"><Save size={18} />Create visit</button>
          )}
        </div>
      </form>

      <details className="mt-4 rounded-lg border border-line bg-white p-4 sm:mt-6 sm:p-5">
        <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">Scheduling checks</summary>
        <div className="mt-4">
          {selectedReferral && schedulingReadiness ? (
            <SchedulingIntelligencePanel
              enableUseWindowAction
              fit={therapistFit}
              readiness={schedulingReadiness}
              summary="Read-only guidance. Use this window only fills the scheduled field; create still requires manual form submission."
              windows={suggestedWindows}
            />
          ) : (
            <SchedulingIntelligencePanel
              cards={getNeutralSchedulingGuidanceCards()}
              summary="Select a referral to see readiness, therapist fit, and suggested business-day windows. The manual visit form remains available."
            />
          )}
        </div>
      </details>

      {intakeQuality ? (
        <details className={`mt-4 rounded-lg border p-4 text-sm leading-6 sm:mt-6 sm:p-5 ${createVisitGate?.allowed ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
          <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">Intake checks: {intakeQuality.readinessLabel}</summary>
          <div className="mt-3">
            <p>Deterministic local checks only. This panel does not auto-create visits, assign therapists, send SMS, or call external duplicate APIs.</p>
            <span className="mt-3 inline-flex w-fit rounded-md bg-white/70 px-2.5 py-1 text-xs font-semibold ring-1 ring-current">{effectiveCreateVisitAllowed ? "create-ready" : "review-only"}</span>
            {createVisitGate && !effectiveCreateVisitAllowed ? (
              <p className="mt-3 rounded-md bg-white/70 p-2 font-semibold">Create visit blocked: <span className="font-normal">{!opportunityAllowsCreateVisit ? "Therapist opportunity acceptance required" : createVisitGate.reasons.join(" · ")}</span></p>
            ) : null}
            {intakeQuality.warnings.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {intakeQuality.warnings.slice(0, 4).map((item) => (
                  <p key={item.code} className="rounded-md bg-white/70 p-2 font-semibold">{item.label}: <span className="font-normal">{item.nextAction}</span></p>
                ))}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
