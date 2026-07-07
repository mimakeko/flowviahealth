import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { OperationsAssistantPanel } from "@/components/operations-assistant-panel";
import { SchedulingIntelligencePanel } from "@/components/scheduling-intelligence-panel";
import { getOperationsAssistantV2Status, getQueueAssistantCards } from "@/lib/ai/operations-assistant-v2";
import { getPrismaClient } from "@/lib/db/prisma";
import { activeWorkflowVisitWhere, activeWorkflowWhereClause, smokeOperationalReferralWhere } from "@/lib/pilot/data-stewardship";
import { getSchedulingQueueCards } from "@/lib/pilot/scheduling-intelligence";
import {
  canCreateVisitForReferral,
  evaluateReferralIntakeQuality,
  getReferralDuplicateCandidates,
  type CreateVisitGateResult,
  type ReferralIntakeDuplicateSource,
  type ReferralIntakeQualityResult,
} from "@/lib/pilot/referral-intake-quality";
import {
  getOpportunityStatesByReferralId,
  opportunityBadgeClassName,
  opportunityCreateVisitBlockerMessage,
  opportunityDeclineReasonLabel,
  opportunitySchedulingContext,
  opportunityVisitCreationReadinessLabel,
  opportunityStateLabel,
  type OpportunityStateResult,
} from "@/lib/pilot/opportunity";
import {
  formatDate,
  REFERRAL_STATUSES,
  requirePilotOperationsAccess,
  statusClassName,
  statusLabel,
  type ReferralStatusValue,
} from "@/lib/pilot/ops";
import { normalizeE164Phone } from "@/lib/sms/compliance";

export const metadata: Metadata = {
  title: "Referral Operations",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type ReferralListRow = {
  id: string;
  assignedTherapist: { name: string } | null;
  assignedTherapistId: string | null;
  careType: string | null;
  city: string | null;
  createdAt: Date | string;
  patientName: string;
  notes: string | null;
  phone: string;
  referralSource: string | null;
  status: string;
  visits: { id: string }[];
  zip: string | null;
};

type TherapistFilterOption = {
  id: string;
  name: string;
};

type ReferralListQualityRow = ReferralListRow & {
  createVisitGate: CreateVisitGateResult;
  intakeQuality: ReferralIntakeQualityResult;
  opportunityState: OpportunityStateResult;
  smsConsentStatus: string;
};

function duplicateSources(rows: ReferralListRow[]): ReferralIntakeDuplicateSource[] {
  return rows.map((row: ReferralListRow) => ({
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

function intakeBadgeClass(readiness: ReferralIntakeQualityResult["readinessLevel"]) {
  if (readiness === "ready") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (readiness === "blocked") return "bg-rose-50 text-rose-800 ring-rose-200";
  return "bg-amber-50 text-amber-800 ring-amber-200";
}

function intakeSummary(referral: ReferralListQualityRow) {
  if (referral.intakeQuality.readinessLevel === "ready") return "Intake ready for scheduling review";
  if (referral.intakeQuality.readinessLevel === "blocked") return "Blocked";
  return referral.createVisitGate.reasons.slice(0, 2).join(" · ") || "Review checklist";
}

function schedulingSummary(referral: ReferralListQualityRow) {
  const label = opportunityVisitCreationReadinessLabel({
    createVisitGateAllowed: referral.createVisitGate.allowed,
    declinedReason: referral.opportunityState.declinedReason,
    opportunityState: referral.opportunityState.state,
    referralSource: referral.referralSource,
  });

  if (label === "Ready for visit creation") return label;
  if (label === "Needs reassignment/review") return label;
  if (label === "Review-only") return "Review-only. Create visit suppressed until gates pass.";
  if (label === "Create visit suppressed until therapist acceptance is recorded") return label;
  return opportunityCreateVisitBlockerMessage({
    createVisitGateReasons: referral.createVisitGate.reasons,
    declinedReason: referral.opportunityState.declinedReason,
    opportunityState: referral.opportunityState.state,
  });
}

function hasReferralReviewSignal(referral: ReferralListQualityRow) {
  return (
    referral.intakeQuality.readinessLevel !== "ready" ||
    referral.intakeQuality.duplicateCandidates.length > 0 ||
    !referral.assignedTherapistId ||
    referral.smsConsentStatus === "opted_out"
  );
}

function ReferralFilterFields({
  selectedGroup,
  selectedStatus,
  selectedTherapistId,
  therapistOptions,
}: {
  selectedGroup: string;
  selectedStatus: string;
  selectedTherapistId: string;
  therapistOptions: TherapistFilterOption[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <label className="text-sm font-semibold text-ink">
        Referral status
        <select className="field" name="status" defaultValue={selectedStatus}>
          <option value="">All statuses</option>
          {REFERRAL_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold text-ink">
        Therapist
        <select className="field" name="therapistId" defaultValue={selectedTherapistId}>
          <option value="">All therapists</option>
          <option value="unassigned">Unassigned</option>
          {therapistOptions.map((therapist: TherapistFilterOption) => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold text-ink">
        Queue
        <select className="field" name="group" defaultValue={selectedGroup}>
          <option value="">All referrals</option>
          <option value="needs_scheduling">Needs scheduling</option>
          <option value="ready_scheduling">Intake ready</option>
          <option value="needs_intake_review">Needs intake review</option>
          <option value="possible_duplicate">Possible duplicate</option>
          <option value="missing_therapist">Missing therapist</option>
          <option value="opted_out">Opted out / non-SMS</option>
        </select>
      </label>
      <div className="flex items-end gap-2">
        <button className="btn-primary w-full" type="submit">Apply</button>
        <Link href="/admin/referrals" className="btn-secondary w-full justify-center">Reset</Link>
      </div>
    </div>
  );
}

export default async function AdminReferralsPage({
  searchParams,
}: {
  searchParams?: Promise<{ group?: string; status?: string; therapistId?: string }>;
}) {
  requirePilotOperationsAccess();

  const params = await searchParams;
  const selectedStatus = REFERRAL_STATUSES.includes(params?.status as ReferralStatusValue) ? (params?.status as ReferralStatusValue) : "";
  const selectedTherapistId = params?.therapistId || "";
  const intakeGroups = ["needs_scheduling", "ready_scheduling", "needs_intake_review", "possible_duplicate", "missing_therapist", "opted_out"] as const;
  const selectedGroup = intakeGroups.includes(params?.group as (typeof intakeGroups)[number]) ? (params?.group as (typeof intakeGroups)[number]) : "";
  const needsSchedulingStatuses: ReferralStatusValue[] = ["new", "contacted"];
  const referralFilters: Prisma.PatientReferralWhereInput[] = [activeWorkflowWhereClause()];
  const now = new Date();
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  if (selectedStatus) referralFilters.push({ status: selectedStatus });
  if (selectedTherapistId === "unassigned") referralFilters.push({ assignedTherapistId: null });
  if (selectedTherapistId && selectedTherapistId !== "unassigned") referralFilters.push({ assignedTherapistId: selectedTherapistId });
  if (selectedGroup === "needs_scheduling") {
    referralFilters.push({ status: { in: needsSchedulingStatuses }, visits: { none: {} } });
  }

  const prisma = getPrismaClient();
  const [referrals, therapists, contactedNotScheduled, scheduledVisitsNextSevenDays, pastScheduledVisits, optedOutContacts, unassignedReferrals, smokeTestRecords, archiveCandidates, capacityCautions] = await Promise.all([
    prisma.patientReferral.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        assignedTherapist: { select: { name: true } },
        assignedTherapistId: true,
        careType: true,
        city: true,
        createdAt: true,
        id: true,
        notes: true,
        patientName: true,
        phone: true,
        referralSource: true,
        status: true,
        visits: {
          select: { id: true },
          where: { status: { in: ["scheduled", "in_progress"] } },
        },
        zip: true,
      },
      take: 100,
      where: referralFilters.length > 0 ? { AND: referralFilters } : undefined,
    }),
    prisma.therapist.findMany({
      orderBy: { name: "asc" },
      where: { active: true },
    }),
    prisma.patientReferral.count({
      where: {
        AND: [
          activeWorkflowWhereClause(),
          {
            status: "contacted",
            visits: { none: { status: { in: ["scheduled", "in_progress"] } } },
          },
        ],
      },
    }),
    prisma.visit.count({
      where: {
        AND: [
          activeWorkflowVisitWhere(),
          {
            scheduledAt: {
              gte: now,
              lte: sevenDaysFromNow,
            },
            status: { in: ["scheduled", "in_progress"] },
          },
        ],
      },
    }),
    prisma.visit.count({
      where: {
        AND: [
          activeWorkflowVisitWhere(),
          {
            scheduledAt: { lt: now },
            status: { in: ["scheduled", "in_progress"] },
          },
        ],
      },
    }),
    prisma.smsConsentEnrollment.count({ where: { status: "opted_out" } }),
    prisma.patientReferral.count({ where: activeWorkflowWhereClause({ assignedTherapistId: null, status: { notIn: ["completed", "canceled"] } }) }),
    prisma.patientReferral.count({
      where: activeWorkflowWhereClause(smokeOperationalReferralWhere()),
    }),
    prisma.patientReferral.count({ where: activeWorkflowWhereClause({ status: { in: ["completed", "canceled"] } }) }),
    prisma.therapist.count({
      where: {
        active: true,
        visits: { some: activeWorkflowVisitWhere({ status: { in: ["scheduled", "in_progress"] } }) },
      },
    }),
  ]);
  const referralRows = referrals as ReferralListRow[];
  const duplicateSourceRows = duplicateSources(referralRows);
  const normalizedPhones = Array.from(new Set(referralRows.map((referral: ReferralListRow) => normalizeE164Phone(referral.phone)).filter(Boolean)));
  const [smsConsentRows, opportunityLogs] = await Promise.all([
    normalizedPhones.length > 0
      ? prisma.smsConsentEnrollment.findMany({
        select: { normalizedPhone: true, status: true },
        where: { normalizedPhone: { in: normalizedPhones } },
      })
      : Promise.resolve([]),
    referralRows.length > 0
      ? prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          select: { action: true, actorId: true, actorType: true, createdAt: true, entityId: true, metadataJson: true },
          where: {
            action: { in: ["opportunity_offered", "opportunity_accepted", "opportunity_declined", "opportunity_action_blocked"] },
            entityId: { in: referralRows.map((referral: ReferralListRow) => referral.id) },
            entityType: "PatientReferral",
          },
        })
      : Promise.resolve([]),
  ]);
  const opportunityStates = getOpportunityStatesByReferralId(opportunityLogs);
  const smsConsentByPhone = Object.fromEntries(smsConsentRows.map((row) => [row.normalizedPhone, row.status]));
  const qualityRows: ReferralListQualityRow[] = referralRows.map((referral: ReferralListRow) => {
    const smsConsentStatus = smsConsentByPhone[normalizeE164Phone(referral.phone)] || "none";
    const duplicateCandidates = getReferralDuplicateCandidates({
      draft: duplicateSourceRows.find((source) => source.id === referral.id) || {
        id: referral.id,
        phone: referral.phone,
        status: referral.status,
      },
      sources: duplicateSourceRows,
    });
    const intakeQuality = evaluateReferralIntakeQuality({
      assignedTherapistId: referral.assignedTherapistId,
      assignedTherapistName: referral.assignedTherapist?.name,
      careType: referral.careType,
      city: referral.city,
      duplicateCandidates,
      patientName: referral.patientName,
      phone: referral.phone,
      smsConsentStatus,
      status: referral.status,
      zip: referral.zip,
    });
    return {
      ...referral,
      createVisitGate: canCreateVisitForReferral({
        activeWorkflowVisible: true,
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
        smsConsentStatus,
        status: referral.status,
        zip: referral.zip,
      }),
      intakeQuality,
      opportunityState: opportunityStates.get(referral.id) || { state: "not_offered" },
      smsConsentStatus,
    };
  });
  const displayedReferralRows = qualityRows.filter((referral: ReferralListQualityRow) => {
    if (selectedGroup === "ready_scheduling") return referral.createVisitGate.allowed;
    if (selectedGroup === "needs_intake_review") return referral.intakeQuality.readinessLevel !== "ready";
    if (selectedGroup === "possible_duplicate") return referral.intakeQuality.duplicateCandidates.length > 0;
    if (selectedGroup === "missing_therapist") return !referral.assignedTherapistId;
    if (selectedGroup === "opted_out") return referral.smsConsentStatus === "opted_out";
    return true;
  });
  const therapistOptions = therapists as TherapistFilterOption[];
  const assistantCards = getQueueAssistantCards({
    contactedNotScheduled,
    intakeReviewNeeded: qualityRows.filter((referral: ReferralListQualityRow) => referral.intakeQuality.readinessLevel !== "ready").length,
    newReferrals: referralRows.filter((referral: ReferralListRow) => referral.status === "new").length,
    optedOutContacts,
    possibleDuplicates: qualityRows.filter((referral: ReferralListQualityRow) => referral.intakeQuality.duplicateCandidates.length > 0).length,
    pastScheduledVisits,
    readyForScheduling: qualityRows.filter((referral: ReferralListQualityRow) => referral.createVisitGate.allowed).length,
    scheduledVisitsNextSevenDays,
    smokeTestRecords,
    unassignedReferrals,
  });
  const assistantStatus = getOperationsAssistantV2Status();
  const schedulingCards = getSchedulingQueueCards({
    archiveCandidates,
    capacityCautions,
    conflicts: pastScheduledVisits,
    contactedWithoutFutureVisit: contactedNotScheduled,
    intakeReviewNeeded: qualityRows.filter((referral: ReferralListQualityRow) => !referral.createVisitGate.allowed).length,
    optedOutContacts,
    possibleDuplicates: qualityRows.filter((referral: ReferralListQualityRow) => referral.intakeQuality.duplicateCandidates.length > 0).length,
    readyToSchedule: qualityRows.filter((referral: ReferralListQualityRow) => referral.createVisitGate.allowed).length,
    unassignedReferrals,
    upcomingNextSevenDays: scheduledVisitsNextSevenDays,
  });
  const needsReviewCount = qualityRows.filter((referral: ReferralListQualityRow) => referral.intakeQuality.readinessLevel !== "ready").length;
  const readyForSchedulingCount = qualityRows.filter((referral: ReferralListQualityRow) => referral.createVisitGate.allowed).length;
  const waitingContactCount = qualityRows.filter((referral: ReferralListQualityRow) => referral.status === "new").length;
  const blockedSafetyCount = qualityRows.filter((referral: ReferralListQualityRow) => (
    referral.intakeQuality.readinessLevel === "blocked" ||
    referral.intakeQuality.duplicateCandidates.length > 0 ||
    referral.smsConsentStatus === "opted_out"
  )).length;
  const summaryCards = [
    { label: "Needs review", value: needsReviewCount, href: "/admin/referrals?group=needs_intake_review" },
    { label: "Ready for scheduling", value: readyForSchedulingCount, href: "/admin/referrals?group=ready_scheduling" },
    { label: "Waiting contact", value: waitingContactCount, href: "/admin/referrals?status=new" },
    { label: "Blocked / safety", value: blockedSafetyCount, href: "/admin/referrals?group=possible_duplicate" },
  ];
  const mobileReferralRows = [...displayedReferralRows].sort((a, b) => Number(hasReferralReviewSignal(b)) - Number(hasReferralReviewSignal(a)));
  const initialMobileReferralRows = mobileReferralRows.slice(0, 12);
  const remainingMobileReferralRows = mobileReferralRows.slice(12);

  return (
    <div className="grid gap-8">
        <div className="flex flex-col gap-5 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">Pilot admin</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-.03em] text-ink sm:text-4xl">Referral operations</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Small field-pilot referral queue. Full addresses are intentionally excluded from this list view.
            </p>
          </div>
          <Link href="/admin/referrals/new" className="btn-primary">
            <Plus size={18} />
            New referral
          </Link>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <Link key={card.label} href={card.href} className="rounded-lg border border-line bg-white p-4 transition hover:border-blue/40 hover:bg-slate-50">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{card.label}</p>
              <p className="mt-2 text-3xl font-semibold tracking-[-.03em] text-ink">{card.value}</p>
            </Link>
          ))}
        </section>

        <section>
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">Referral queue</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-.02em] text-ink">Referral queue ({displayedReferralRows.length})</h2>
            </div>
            <p className="text-xs font-semibold text-slate-500 md:hidden">Showing review signals first on mobile.</p>
          </div>

          <div className="grid gap-3 md:hidden">
            {initialMobileReferralRows.map((referral: ReferralListQualityRow) => (
              <Link key={referral.id} href={`/admin/referrals/${referral.id}`} className="rounded-lg border border-line bg-white p-4 transition hover:border-blue/40 hover:bg-slate-50">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-ink">{referral.patientName}</p>
                  <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(referral.status)}`}>
                    {statusLabel(referral.status)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-700">{referral.intakeQuality.readinessLabel}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{intakeSummary(referral)}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {referral.intakeQuality.duplicateCandidates.length > 0 ? <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">Possible duplicate</span> : null}
                  {!referral.assignedTherapistId ? <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">Missing therapist</span> : null}
                  {referral.smsConsentStatus === "opted_out" ? <span className="rounded-md bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-900 ring-1 ring-rose-200">Non-SMS only</span> : null}
                  {referral.createVisitGate.allowed ? <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200">Ready for scheduling</span> : null}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>{[referral.city, referral.zip].filter(Boolean).join(" / ") || "Location not provided"}</span>
                  <span className="font-semibold text-blue underline">Open</span>
                </div>
              </Link>
            ))}
            {remainingMobileReferralRows.length > 0 ? (
              <details className="rounded-lg border border-line bg-white p-4">
                <summary className="cursor-pointer text-sm font-semibold text-ink">Show more referrals ({remainingMobileReferralRows.length})</summary>
                <div className="mt-4 grid gap-3">
                  {remainingMobileReferralRows.map((referral: ReferralListQualityRow) => (
                    <Link key={referral.id} href={`/admin/referrals/${referral.id}`} className="rounded-lg border border-line bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{referral.patientName}</p>
                        <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(referral.status)}`}>
                          {statusLabel(referral.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{intakeSummary(referral)}</p>
                      <p className="mt-2 text-xs text-slate-500">{[referral.city, referral.zip].filter(Boolean).join(" / ") || "Location not provided"}</p>
                    </Link>
                  ))}
                </div>
              </details>
            ) : null}
            {displayedReferralRows.length === 0 ? (
              <div className="rounded-lg border border-line bg-white p-8 text-center">
                <ClipboardList className="mx-auto mb-3 text-slate-400" size={28} />
                <p className="font-semibold text-ink">No referrals yet</p>
                <p className="mt-1 text-sm text-slate-500">Seed fake pilot data or create a manual referral to start testing.</p>
              </div>
            ) : null}
          </div>

          <div className="hidden overflow-x-auto rounded-lg border border-line bg-white md:block">
            <table className="min-w-full divide-y divide-line text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Intake</th>
                  <th className="px-4 py-3">Therapist</th>
                  <th className="px-4 py-3">City / ZIP</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {displayedReferralRows.map((referral: ReferralListQualityRow) => (
                  <tr key={referral.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{referral.patientName}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {referral.intakeQuality.duplicateCandidates.length > 0 ? <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">Possible duplicate</span> : null}
                        {!referral.assignedTherapistId ? <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">Missing therapist</span> : null}
                        {referral.smsConsentStatus === "opted_out" ? <span className="rounded-md bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-900 ring-1 ring-rose-200">Non-SMS only</span> : null}
                        {!referral.createVisitGate.allowed && referral.intakeQuality.duplicateCandidates.length === 0 && referral.assignedTherapistId && referral.smsConsentStatus !== "opted_out" ? <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">Needs intake review</span> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(referral.status)}`}>
                        {statusLabel(referral.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ${intakeBadgeClass(referral.intakeQuality.readinessLevel)}`}>
                        {referral.intakeQuality.readinessLabel}
                      </span>
                      <p className={`mt-1 text-xs ${referral.intakeQuality.readinessLevel === "ready" ? "font-semibold text-emerald-700" : "text-slate-500"}`}>Intake: {intakeSummary(referral)}</p>
                      <span className={`mt-2 inline-flex rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${opportunityBadgeClassName(referral.opportunityState.state)}`}>
                        {opportunityStateLabel(referral.opportunityState.state)}
                      </span>
                      <p className="mt-1 text-xs text-slate-500">
                        Opportunity: {opportunitySchedulingContext({ createVisitGateAllowed: referral.createVisitGate.allowed, declinedReason: referral.opportunityState.declinedReason, opportunityState: referral.opportunityState.state })}
                        {referral.opportunityState.state === "declined" ? ` · ${opportunityDeclineReasonLabel(referral.opportunityState.declinedReason)}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Scheduling: {schedulingSummary(referral)}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{referral.assignedTherapist?.name || "Unassigned"}</td>
                    <td className="px-4 py-3 text-slate-600">{[referral.city, referral.zip].filter(Boolean).join(" / ") || "Not provided"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(referral.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/referrals/${referral.id}`} className="font-semibold text-blue underline">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
                {displayedReferralRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <ClipboardList className="mx-auto mb-3 text-slate-400" size={28} />
                      <p className="font-semibold text-ink">No referrals yet</p>
                      <p className="mt-1 text-sm text-slate-500">Seed fake pilot data or create a manual referral to start testing.</p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <details className="rounded-lg border border-line bg-white p-4 md:hidden">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Filters</summary>
          <form className="mt-4">
            <ReferralFilterFields
              selectedGroup={selectedGroup}
              selectedStatus={selectedStatus}
              selectedTherapistId={selectedTherapistId}
              therapistOptions={therapistOptions}
            />
          </form>
        </details>

        <form className="hidden rounded-lg border border-line bg-white p-5 md:block">
          <ReferralFilterFields
            selectedGroup={selectedGroup}
            selectedStatus={selectedStatus}
            selectedTherapistId={selectedTherapistId}
            therapistOptions={therapistOptions}
          />
        </form>

        <OperationsAssistantPanel
          cards={assistantCards}
          mobileCollapsed
          mobileSummaryLabel="Operational checks"
          status={assistantStatus}
          summary="Referral queue checks use safe workflow counts. Manual review required before action."
          title="Operations Assistant"
        />

        <SchedulingIntelligencePanel
          cards={schedulingCards}
          mobileCollapsed
          mobileSummaryLabel="Scheduling checks"
          summary="Referral scheduling checks use safe workflow counts. Use existing visit forms for any scheduling action."
        />
    </div>
  );
}
