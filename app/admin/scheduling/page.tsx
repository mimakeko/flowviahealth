import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ArrowRight } from "lucide-react";
import { SchedulingIntelligencePanel } from "@/components/scheduling-intelligence-panel";
import { getPrismaClient } from "@/lib/db/prisma";
import { formatDateTime, requirePilotOperationsAccess, statusClassName, statusLabel } from "@/lib/pilot/ops";
import {
  detectVisitConflicts,
  getSchedulingQueueCards,
  getSchedulingReadiness,
  getSuggestedSchedulingWindows,
  getTherapistFit,
} from "@/lib/pilot/scheduling-intelligence";

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
  city: string | null;
  id: string;
  patientName: string;
  status: string;
  visits: { scheduledAt: Date | null; status: string }[];
  zip: string | null;
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

export default async function AdminSchedulingPage() {
  requirePilotOperationsAccess();

  const prisma = getPrismaClient();
  const now = new Date();
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const [
    readyReferrals,
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
      take: 10,
      where: {
        assignedTherapistId: { not: null },
        status: { in: ["contacted", "active"] },
        visits: { none: { status: { in: ["scheduled", "in_progress"] } } },
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
      where: { status: { in: ["scheduled", "in_progress"] } },
    }),
    prisma.patientReferral.count({
      where: {
        status: "contacted",
        visits: { none: { status: { in: ["scheduled", "in_progress"] } } },
      },
    }),
    prisma.patientReferral.count({ where: { assignedTherapistId: null, status: { notIn: ["completed", "canceled"] } } }),
    prisma.smsConsentEnrollment.count({ where: { status: "opted_out" } }),
    prisma.patientReferral.count({ where: { status: { in: ["completed", "canceled"] } } }),
    prisma.therapist.count({ where: { active: true, visits: { some: { status: { in: ["scheduled", "in_progress"] } } } } }),
    prisma.visit.findMany({
      select: { id: true, scheduledAt: true, status: true, therapistId: true },
      where: { status: { in: ["scheduled", "in_progress"] } },
    }),
  ]);

  const referralRows = readyReferrals as SchedulingReferralRow[];
  const visitRows = upcomingVisits as SchedulingVisitRow[];
  const pastOpenVisits = visitRows.filter((visit: SchedulingVisitRow) => visit.scheduledAt && visit.scheduledAt < now).length;
  const schedulingCards = getSchedulingQueueCards({
    archiveCandidates,
    capacityCautions,
    conflicts: pastOpenVisits,
    contactedWithoutFutureVisit,
    optedOutContacts,
    readyToSchedule: referralRows.length,
    unassignedReferrals,
    upcomingNextSevenDays: visitRows.filter((visit: SchedulingVisitRow) => visit.scheduledAt && visit.scheduledAt >= now && visit.scheduledAt <= sevenDaysFromNow).length,
  });
  const firstReadyReferral = referralRows[0];
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
          <div className="overflow-hidden rounded-lg border border-line bg-white">
            {referralRows.map((referral: SchedulingReferralRow) => {
              const readiness = getSchedulingReadiness({
                assignedTherapistId: referral.assignedTherapistId,
                futureVisitCount: referral.visits.length,
                referralStatus: referral.status,
                smsConsentStatus: null,
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
                    <p className="mt-1 text-sm text-slate-600">{readiness.readiness.replaceAll("_", " ")} · {fit.label.replaceAll("_", " ")} · {referral.assignedTherapist?.name || "Unassigned"}</p>
                    <p className="mt-1 text-xs text-slate-500">{[referral.city, referral.zip].filter(Boolean).join(" / ") || "Location not provided"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/admin/referrals/${referral.id}`} className="font-semibold text-blue underline">Open</Link>
                    <Link href={`/admin/visits/new?referralId=${referral.id}`} className="inline-flex items-center gap-1 font-semibold text-blue underline">Create visit <ArrowRight size={14} /></Link>
                  </div>
                </div>
              );
            })}
            {referralRows.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No ready-to-schedule referrals found.</p> : null}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold tracking-[-.02em] text-ink">Upcoming/open visits</h2>
          <div className="overflow-hidden rounded-lg border border-line bg-white">
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
