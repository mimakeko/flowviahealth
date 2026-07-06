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
  const smsConsentRows = normalizedPhones.length > 0
    ? await prisma.smsConsentEnrollment.findMany({
        select: { normalizedPhone: true, status: true },
        where: { normalizedPhone: { in: normalizedPhones } },
      })
    : [];
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

        <OperationsAssistantPanel
          cards={assistantCards}
          status={assistantStatus}
          summary="Referral queue signals are deterministic and based on safe workflow counts. Review before taking action."
          title="Operations Assistant"
        />

        <SchedulingIntelligencePanel
          cards={schedulingCards}
          summary="Referral scheduling signals are deterministic and based on safe workflow counts. Use existing visit forms for any scheduling action."
        />

        <form className="rounded-lg border border-line bg-white p-5">
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
                <option value="ready_scheduling">Ready for scheduling</option>
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
        </form>

        <div className="overflow-x-auto rounded-lg border border-line bg-white">
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
                    {referral.createVisitGate.allowed ? <p className="mt-1 text-xs font-semibold text-emerald-700">Ready for scheduling</p> : <p className="mt-1 text-xs text-slate-500">{referral.createVisitGate.reasons.slice(0, 2).join(" · ") || "Review checklist"}</p>}
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
    </div>
  );
}
