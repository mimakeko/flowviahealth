import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { OperationsAssistantPanel } from "@/components/operations-assistant-panel";
import { SchedulingIntelligencePanel } from "@/components/scheduling-intelligence-panel";
import { getOperationsAssistantV2Status, getQueueAssistantCards } from "@/lib/ai/operations-assistant-v2";
import { getPrismaClient } from "@/lib/db/prisma";
import { getSchedulingQueueCards } from "@/lib/pilot/scheduling-intelligence";
import {
  formatDate,
  REFERRAL_STATUSES,
  requirePilotOperationsAccess,
  statusClassName,
  statusLabel,
  type ReferralStatusValue,
} from "@/lib/pilot/ops";

export const metadata: Metadata = {
  title: "Referral Operations",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type ReferralListRow = {
  id: string;
  assignedTherapist: { name: string } | null;
  city: string | null;
  createdAt: Date | string;
  patientName: string;
  status: string;
  zip: string | null;
};

type TherapistFilterOption = {
  id: string;
  name: string;
};

export default async function AdminReferralsPage({
  searchParams,
}: {
  searchParams?: Promise<{ group?: string; status?: string; therapistId?: string }>;
}) {
  requirePilotOperationsAccess();

  const params = await searchParams;
  const selectedStatus = REFERRAL_STATUSES.includes(params?.status as ReferralStatusValue) ? (params?.status as ReferralStatusValue) : "";
  const selectedTherapistId = params?.therapistId || "";
  const selectedGroup = params?.group === "needs_scheduling" ? "needs_scheduling" : "";
  const needsSchedulingStatuses: ReferralStatusValue[] = ["new", "contacted"];
  const referralFilters: Prisma.PatientReferralWhereInput[] = [];
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
      include: { assignedTherapist: true },
      orderBy: { createdAt: "desc" },
      take: 100,
      where: referralFilters.length > 0 ? { AND: referralFilters } : undefined,
    }),
    prisma.therapist.findMany({
      orderBy: { name: "asc" },
      where: { active: true },
    }),
    prisma.patientReferral.count({
      where: {
        status: "contacted",
        visits: { none: { status: { in: ["scheduled", "in_progress"] } } },
      },
    }),
    prisma.visit.count({
      where: {
        scheduledAt: {
          gte: now,
          lte: sevenDaysFromNow,
        },
        status: { in: ["scheduled", "in_progress"] },
      },
    }),
    prisma.visit.count({
      where: {
        scheduledAt: { lt: now },
        status: { in: ["scheduled", "in_progress"] },
      },
    }),
    prisma.smsConsentEnrollment.count({ where: { status: "opted_out" } }),
    prisma.patientReferral.count({ where: { assignedTherapistId: null, status: { notIn: ["completed", "canceled"] } } }),
    prisma.patientReferral.count({
      where: {
        OR: [
          { referralSource: { contains: "smoke" } },
          { patientName: { startsWith: "Smoke" } },
          { patientName: { startsWith: "Ops Guardrail Smoke" } },
        ],
      },
    }),
    prisma.patientReferral.count({ where: { status: { in: ["completed", "canceled"] } } }),
    prisma.therapist.count({
      where: {
        active: true,
        visits: { some: { status: { in: ["scheduled", "in_progress"] } } },
      },
    }),
  ]);
  const referralRows = referrals as ReferralListRow[];
  const therapistOptions = therapists as TherapistFilterOption[];
  const assistantCards = getQueueAssistantCards({
    contactedNotScheduled,
    newReferrals: referralRows.filter((referral: ReferralListRow) => referral.status === "new").length,
    optedOutContacts,
    pastScheduledVisits,
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
    optedOutContacts,
    readyToSchedule: contactedNotScheduled,
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
                <th className="px-4 py-3">Therapist</th>
                <th className="px-4 py-3">City / ZIP</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {referralRows.map((referral: ReferralListRow) => (
                <tr key={referral.id}>
                  <td className="px-4 py-3 font-medium text-ink">{referral.patientName}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(referral.status)}`}>
                      {statusLabel(referral.status)}
                    </span>
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
              {referralRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
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
