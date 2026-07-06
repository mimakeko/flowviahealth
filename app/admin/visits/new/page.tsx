import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { BlockedNoteAlert } from "@/components/blocked-note-alert";
import { SchedulingIntelligencePanel } from "@/components/scheduling-intelligence-panel";
import { getPrismaClient } from "@/lib/db/prisma";
import { getBlockedOperationalNoteRedirectSearch } from "@/lib/pilot/note-guardrail";
import { requirePilotSession } from "@/lib/pilot/auth";
import {
  FLOWVIA_OPERATIONS_TIME_ZONE,
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
  city: string | null;
  id: string;
  phone: string;
  status: string;
  visits: { scheduledAt: Date | null; status: string }[];
  zip: string | null;
};

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
          status: visit.status,
          visitId: visit.id,
        },
      },
    }),
  ]);

  redirect(`/admin/visits/${visit.id}`);
}

export default async function NewVisitPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; noteCategory?: string; noteDestination?: string; noteSuggestion?: string; referralId?: string }>;
}) {
  requirePilotOperationsAccess();

  const params = await searchParams;
  const prisma = getPrismaClient();
  const [referrals, therapists, selectedReferralRecord] = await Promise.all([
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
      where: { status: { notIn: ["completed", "canceled"] } },
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
          therapistId: selectedReferral.assignedTherapistId,
          status: { in: ["scheduled", "in_progress"] },
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

      <div className="mt-8">
        {selectedReferral && schedulingReadiness ? (
          <SchedulingIntelligencePanel
            enableUseWindowAction
            fit={therapistFit}
            readiness={schedulingReadiness}
            summary="This read-only scheduling guidance uses the selected referral, assigned therapist, consent state, and known open visits. Use this window only fills the scheduled field; create still requires manual form submission."
            windows={suggestedWindows}
          />
        ) : (
          <SchedulingIntelligencePanel
            cards={getNeutralSchedulingGuidanceCards()}
            summary="Select a referral to see readiness, therapist fit, and suggested business-day windows. The manual visit form remains available."
          />
        )}
      </div>

      <form action={createVisitAction} className="mt-8 grid gap-6 rounded-lg border border-line bg-white p-6 md:grid-cols-2">
        <label className="text-sm font-semibold text-ink md:col-span-2">Referral<select className="field" name="referralId" defaultValue={params?.referralId || ""} required><option value="">Select referral</option>{referralOptions.map((referral: ReferralOption) => <option key={referral.id} value={referral.id}>{referral.patientName} · {statusLabel(referral.status)} · {[referral.city, referral.zip].filter(Boolean).join(" / ") || "Location not provided"}</option>)}</select></label>
        <label className="text-sm font-semibold text-ink">Therapist<select className="field" name="therapistId" defaultValue={selectedReferral?.assignedTherapistId || ""}><option value="">Unassigned</option>{therapistOptions.map((therapist: TherapistOption) => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}</select></label>
        <label className="text-sm font-semibold text-ink">Scheduled<input className="field" name="scheduledAt" type="datetime-local" /></label>
        <label className="text-sm font-semibold text-ink">Status<select className="field" name="status" defaultValue="scheduled">{VISIT_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
        <label className="text-sm font-semibold text-ink">Scheduling timezone<span className="field flex items-center text-slate-500">{FLOWVIA_OPERATIONS_TIME_ZONE}</span></label>
        <label className="text-sm font-semibold text-ink md:col-span-2">Operational note <span className="font-normal text-slate-400">(optional, no PHI or clinical detail)</span><textarea className="field min-h-28" name="notes" /></label>
        <div className="md:col-span-2"><button className="btn-primary" type="submit"><Save size={18} />Create visit</button></div>
      </form>
    </div>
  );
}
