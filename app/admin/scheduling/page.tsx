import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ArrowRight } from "lucide-react";
import { SchedulingIntelligencePanel } from "@/components/scheduling-intelligence-panel";
import { getPrismaClient } from "@/lib/db/prisma";
import { formatDateTime, requirePilotOperationsAccess, statusClassName, statusLabel } from "@/lib/pilot/ops";
import { activeWorkflowVisitWhere, activeWorkflowWhereClause } from "@/lib/pilot/data-stewardship";
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
  opportunityAllowsVisitCreation,
  opportunityBadgeClassName,
  opportunityStateLabel,
  type OpportunityStateResult,
} from "@/lib/pilot/opportunity";
import {
  detectVisitConflicts,
  getSchedulingQueueCards,
  getSchedulingReadiness,
  getSuggestedSchedulingWindows,
  getTherapistFit,
} from "@/lib/pilot/scheduling-intelligence";
import { normalizeE164Phone } from "@/lib/sms/compliance";

export const metadata: Metadata = {
  title: "Scheduling Intelligence",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SchedulingReferralRow = {
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

type SchedulingQualityReferralRow = SchedulingReferralRow & {
  createVisitGate: CreateVisitGateResult;
  intakeQuality: ReferralIntakeQualityResult;
  opportunityState: OpportunityStateResult;
  smsConsentStatus: string;
};

type SchedulingVisitRow = {
  id: string;
  scheduledAt: Date | null;
  status: string;
  referral: {
    city: string | null;
    patientName: string;
    status: string;
    zip: string | null;
  };
  therapist: {
    active: boolean;
    name: string;
  } | null;
  therapistId: string | null;
};

function duplicateSources(rows: SchedulingReferralRow[]): ReferralIntakeDuplicateSource[] {
  return rows.map((row: SchedulingReferralRow) => ({
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

export default async function AdminSchedulingPage() {
  requirePilotOperationsAccess();

  const prisma = getPrismaClient();
  const now = new Date();
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const [
    schedulingReferrals,
    upcomingVisits,
    contactedWithoutFutureVisit,
    unassignedReferrals,
    optedOutContacts,
    archiveCandidates,
    capacityCautions,
    openVisits,
  ] = await Promise.all([
    prisma.patientReferral.findMany({
      include: {
        assignedTherapist: true,
        visits: {
          select: { scheduledAt: true, status: true },
          where: { status: { in: ["scheduled", "in_progress"] } },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 25,
      where: {
        AND: [
          activeWorkflowWhereClause(),
          {
            status: { in: ["new", "contacted", "active"] },
            visits: { none: { status: { in: ["scheduled", "in_progress"] } } },
          },
        ],
      },
    }),
    prisma.visit.findMany({
      include: {
        referral: {
          select: { city: true, patientName: true, status: true, zip: true },
        },
        therapist: {
          select: { active: true, name: true },
        },
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      take: 20,
      where: activeWorkflowVisitWhere({ status: { in: ["scheduled", "in_progress"] } }),
    }),
    prisma.patientReferral.count({
      where: activeWorkflowWhereClause({
        status: "contacted",
        visits: { none: { status: { in: ["scheduled", "in_progress"] } } },
      }),
    }),
    prisma.patientReferral.count({ where: activeWorkflowWhereClause({ assignedTherapistId: null, status: { notIn: ["completed", "canceled"] } }) }),
    prisma.smsConsentEnrollment.count({ where: { status: "opted_out" } }),
    prisma.patientReferral.count({ where: activeWorkflowWhereClause({ status: { in: ["completed", "canceled"] } }) }),
    prisma.therapist.count({ where: { active: true, visits: { some: activeWorkflowVisitWhere({ status: { in: ["scheduled", "in_progress"] } }) } } }),
    prisma.visit.findMany({
      select: { id: true, scheduledAt: true, status: true, therapistId: true },
      where: activeWorkflowVisitWhere({ status: { in: ["scheduled", "in_progress"] } }),
    }),
  ]);

  const referralRows = schedulingReferrals as SchedulingReferralRow[];
  const duplicateSourceRows = duplicateSources(referralRows);
  const normalizedPhones = Array.from(new Set(referralRows.map((referral: SchedulingReferralRow) => normalizeE164Phone(referral.phone)).filter(Boolean)));
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
            entityId: { in: referralRows.map((referral: SchedulingReferralRow) => referral.id) },
            entityType: "PatientReferral",
          },
        })
      : Promise.resolve([]),
  ]);
  const opportunityStates = getOpportunityStatesByReferralId(opportunityLogs);
  const smsConsentByPhone = Object.fromEntries(smsConsentRows.map((row) => [row.normalizedPhone, row.status]));
  const qualityRows: SchedulingQualityReferralRow[] = referralRows.map((referral: SchedulingReferralRow) => {
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
  const readyToCreateRows = qualityRows.filter((referral: SchedulingQualityReferralRow) => referral.createVisitGate.allowed && opportunityAllowsVisitCreation({ opportunityState: referral.opportunityState.state, referralSource: referral.referralSource }));
  const awaitingAcceptanceRows = qualityRows.filter((referral: SchedulingQualityReferralRow) => referral.createVisitGate.allowed && !opportunityAllowsVisitCreation({ opportunityState: referral.opportunityState.state, referralSource: referral.referralSource }));
  const needsReviewRows = qualityRows.filter((referral: SchedulingQualityReferralRow) => !referral.createVisitGate.allowed);
  const visitRows = upcomingVisits as SchedulingVisitRow[];
  const pastOpenVisits = visitRows.filter((visit: SchedulingVisitRow) => visit.scheduledAt && visit.scheduledAt < now).length;
  const schedulingCards = getSchedulingQueueCards({
    archiveCandidates,
    capacityCautions,
    conflicts: pastOpenVisits,
    contactedWithoutFutureVisit,
    intakeReviewNeeded: needsReviewRows.length,
    optedOutContacts,
    possibleDuplicates: qualityRows.filter((referral: SchedulingQualityReferralRow) => referral.intakeQuality.duplicateReviewRequired || referral.intakeQuality.duplicateCandidates.length > 0).length,
    readyToSchedule: readyToCreateRows.length,
    unassignedReferrals,
    upcomingNextSevenDays: visitRows.filter((visit: SchedulingVisitRow) => visit.scheduledAt && visit.scheduledAt >= now && visit.scheduledAt <= sevenDaysFromNow).length,
  });
  const firstReadyReferral = readyToCreateRows[0];
  const firstReferralTherapistVisits = firstReadyReferral?.assignedTherapistId
    ? openVisits.filter((visit) => visit.therapistId === firstReadyReferral.assignedTherapistId)
    : [];
  const firstReferralWindows = firstReadyReferral ? getSuggestedSchedulingWindows({ scheduledVisits: firstReferralTherapistVisits }) : [];

  return (
    <div className="grid gap-8">
      <div className="flex flex-col gap-5 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">Pilot admin</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.03em] text-ink sm:text-4xl">Scheduling Intelligence</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Read-only deterministic scheduling guidance for fake pilot referrals and visits. No maps, geocoding, travel-time calculation, or autonomous scheduling.
          </p>
        </div>
        <Link href="/admin/visits/new" className="btn-primary">
          <CalendarClock size={18} />
          New visit
        </Link>
      </div>

      <SchedulingIntelligencePanel cards={schedulingCards} summary="Scheduling queue intelligence is generated from safe counts and open visit timing only." windows={firstReferralWindows} />

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div>
          <h2 className="mb-3 text-xl font-semibold tracking-[-.02em] text-ink">Ready-to-schedule referrals</h2>
          <div data-testid="scheduling-ready-referrals" className="overflow-hidden rounded-lg border border-line bg-white">
            {readyToCreateRows.map((referral: SchedulingQualityReferralRow) => {
              const readiness = getSchedulingReadiness({
                assignedTherapistId: referral.assignedTherapistId,
                futureVisitCount: referral.visits.length,
                referralStatus: referral.status,
                smsConsentStatus: referral.smsConsentStatus,
              });
              const fit = getTherapistFit({
                active: referral.assignedTherapist?.active ?? false,
                currentOpenVisitCount: referral.assignedTherapistId ? openVisits.filter((visit) => visit.therapistId === referral.assignedTherapistId).length : 0,
                referralCity: referral.city,
                referralZip: referral.zip,
                serviceAreaNotes: referral.assignedTherapist?.serviceAreaNotes,
                therapistName: referral.assignedTherapist?.name,
              });
              return (
                <div key={referral.id} className="grid gap-3 border-b border-line p-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{referral.patientName}</p>
                      <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(referral.status)}`}>{statusLabel(referral.status)}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{referral.intakeQuality.readinessLabel} · {readiness.readiness.replaceAll("_", " ")} · {fit.label.replaceAll("_", " ")} · {referral.assignedTherapist?.name || "Unassigned"}</p>
                    <span className={`mt-2 inline-flex rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${opportunityBadgeClassName(referral.opportunityState.state)}`}>{opportunityStateLabel(referral.opportunityState.state)}</span>
                    <p className="mt-1 text-xs text-slate-500">{[referral.city, referral.zip].filter(Boolean).join(" / ") || "Location not provided"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/admin/referrals/${referral.id}`} className="font-semibold text-blue underline">Open</Link>
                    <Link href={`/admin/visits/new?referralId=${referral.id}`} className="inline-flex items-center gap-1 font-semibold text-blue underline">Create visit <ArrowRight size={14} /></Link>
                  </div>
                </div>
              );
            })}
            {readyToCreateRows.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No create-ready referrals found.</p> : null}
          </div>

          <h2 className="mb-3 mt-6 text-xl font-semibold tracking-[-.02em] text-ink">Awaiting therapist acceptance</h2>
          <div data-testid="scheduling-awaiting-opportunity-acceptance" className="overflow-hidden rounded-lg border border-line bg-white">
            {awaitingAcceptanceRows.map((referral: SchedulingQualityReferralRow) => (
              <div key={referral.id} className="grid gap-3 border-b border-line p-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{referral.patientName}</p>
                    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ${opportunityBadgeClassName(referral.opportunityState.state)}`}>{opportunityStateLabel(referral.opportunityState.state)}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">Ready gate passed, but therapist acceptance is required before Create visit is shown for this demo/opportunity row.</p>
                </div>
                <Link href={`/admin/referrals/${referral.id}`} className="font-semibold text-blue underline">Open</Link>
              </div>
            ))}
            {awaitingAcceptanceRows.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No ready referrals are awaiting therapist acceptance.</p> : null}
          </div>

          <h2 className="mb-3 mt-6 text-xl font-semibold tracking-[-.02em] text-ink">Needs review before scheduling</h2>
          <div data-testid="scheduling-review-referrals" className="overflow-hidden rounded-lg border border-line bg-white">
            {needsReviewRows.map((referral: SchedulingQualityReferralRow) => (
              <div key={referral.id} className="grid gap-3 border-b border-line p-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{referral.patientName}</p>
                    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(referral.status)}`}>{statusLabel(referral.status)}</span>
                    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ${referral.createVisitGate.severity === "blocker" ? "bg-rose-50 text-rose-800 ring-rose-200" : "bg-amber-50 text-amber-800 ring-amber-200"}`}>Review only</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{referral.intakeQuality.readinessLabel} · {referral.assignedTherapist?.name || "Unassigned"}</p>
                  <p className="mt-1 text-xs text-slate-500">{[referral.city, referral.zip].filter(Boolean).join(" / ") || "Location not provided"}</p>
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-950">{referral.createVisitGate.reasons.slice(0, 3).join(" · ") || "Needs intake review"}.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/referrals/${referral.id}`} className="font-semibold text-blue underline">Open</Link>
                </div>
              </div>
            ))}
            {needsReviewRows.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No review-only referrals in the scheduling queue.</p> : null}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold tracking-[-.02em] text-ink">Upcoming/open visits</h2>
          <div data-testid="scheduling-upcoming-visits" className="overflow-hidden rounded-lg border border-line bg-white">
            {visitRows.map((visit: SchedulingVisitRow) => {
              const therapistVisits = visit.therapistId ? openVisits.filter((item) => item.therapistId === visit.therapistId) : [];
              const conflict = detectVisitConflicts({
                candidateScheduledAt: visit.scheduledAt,
                candidateVisitId: visit.id,
                referralStatus: visit.referral.status,
                scheduledVisits: therapistVisits,
                therapistActive: visit.therapist?.active ?? false,
                therapistId: visit.therapistId,
              });
              return (
                <Link key={visit.id} href={`/admin/visits/${visit.id}`} className="grid gap-3 border-b border-line p-4 transition last:border-b-0 hover:bg-slate-50 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{visit.referral.patientName}</p>
                      <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(visit.status)}`}>{statusLabel(visit.status)}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{visit.therapist?.name || "Unassigned"} · conflict level: {conflict.level}</p>
                    <p className="mt-1 text-xs text-slate-500">{[visit.referral.city, visit.referral.zip].filter(Boolean).join(" / ") || "Location not provided"}</p>
                  </div>
                  <p className="text-sm text-slate-500">{formatDateTime(visit.scheduledAt)}</p>
                </Link>
              );
            })}
            {visitRows.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No upcoming/open visits found.</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
