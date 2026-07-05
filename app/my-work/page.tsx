import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BriefcaseMedical, CircleAlert, Save } from "lucide-react";
import { BlockedNoteAlert } from "@/components/blocked-note-alert";
import { getPrismaClient } from "@/lib/db/prisma";
import { requirePilotSession } from "@/lib/pilot/auth";
import { getBlockedOperationalNoteRedirectSearch } from "@/lib/pilot/note-guardrail";
import {
  appendOperationalNote,
  formatDateTime,
  redactPhone,
  requirePilotOperationsAccess,
  statusClassName,
  statusLabel,
  textField,
} from "@/lib/pilot/ops";

export const metadata: Metadata = {
  title: "My Work",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const THERAPIST_ACTIONS = [
  { value: "contacted", label: "Contacted", status: "contacted" },
  { value: "ready_to_schedule", label: "Ready to schedule", status: "contacted" },
  { value: "scheduled", label: "Scheduled", status: "scheduled" },
  { value: "visited_completed", label: "Visited / completed", status: "completed" },
  { value: "unable_to_reach", label: "Unable to reach", status: null },
  { value: "needs_admin_help", label: "Needs admin help", status: null },
] as const;

const THERAPIST_VISIT_STATUSES = ["in_progress", "completed", "no_show"] as const;
type TherapistVisitStatus = (typeof THERAPIST_VISIT_STATUSES)[number];
type TherapistAction = (typeof THERAPIST_ACTIONS)[number];

type TherapistOption = {
  id: string;
  name: string;
};

type TherapistWorkVisit = {
  id: string;
  notes: string | null;
  scheduledAt: Date | string | null;
  status: string;
};

type TherapistWorkReferral = {
  id: string;
  careType: string | null;
  city: string | null;
  notes: string | null;
  patientName: string;
  phone: string;
  status: string;
  visits: TherapistWorkVisit[];
  zip: string | null;
};

async function therapistReferralAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  const session = await requirePilotSession(["admin", "therapist"], "/my-work");

  const prisma = getPrismaClient();
  const therapistId = textField(formData.get("therapistId"), 80);
  const referralId = textField(formData.get("referralId"), 80);
  const action = textField(formData.get("action"), 80);
  const note = textField(formData.get("note"), 1000);
  const actionConfig = THERAPIST_ACTIONS.find((item: TherapistAction) => item.value === action);

  if (!therapistId || !referralId || !actionConfig) {
    redirect("/my-work");
  }

  const blockedNoteSearch = await getBlockedOperationalNoteRedirectSearch({
    actorId: session.role === "therapist" ? session.email : therapistId,
    actorType: session.role === "admin" ? "pilot_admin" : "therapist_pilot",
    entityId: referralId,
    entityType: "PatientReferral",
    extra: { action },
    fieldLabel: "Therapist note",
    route: "/my-work",
    value: note,
    workflow: "therapist_referral_action",
  });
  if (blockedNoteSearch) redirect(`/my-work?therapistId=${encodeURIComponent(therapistId)}&${blockedNoteSearch}`);

  if (session.role === "therapist") {
    const therapist = await prisma.therapist.findFirst({
      where: {
        active: true,
        email: session.email,
      },
    });

    if (!therapist || therapist.id !== therapistId) {
      await prisma.auditLog.create({
        data: {
          actorType: "therapist_pilot",
          actorId: therapist?.id || session.email,
          action: "permission_denied",
          entityType: "PatientReferral",
          entityId: referralId,
          metadataJson: { route: "/my-work", reason: "therapist_scope_mismatch" },
        },
      }).catch(() => undefined);
      redirect("/unauthorized");
    }
  }

  const referral = await prisma.patientReferral.findFirst({
    where: {
      id: referralId,
      assignedTherapistId: therapistId,
    },
  });

  if (!referral) {
    redirect(`/my-work?therapistId=${therapistId}&error=not_assigned`);
  }

  const operationalNote = note || actionConfig.label;
  const updatedNotes = actionConfig.status
    ? note
      ? appendOperationalNote(referral.notes, `Therapist note: ${note}`)
      : referral.notes
    : appendOperationalNote(referral.notes, `Therapist action: ${actionConfig.label}. ${operationalNote}`);

  const updated = await prisma.patientReferral.update({
    where: { id: referralId },
    data: {
      status: actionConfig.status || referral.status,
      notes: updatedNotes,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorType: "therapist_pilot",
      actorId: therapistId,
      action: `therapist_${actionConfig.value}`,
      entityType: "PatientReferral",
      entityId: referralId,
      metadataJson: {
        status: updated.status,
        noteAdded: Boolean(note || !actionConfig.status),
      },
    },
  });

  redirect(`/my-work?therapistId=${therapistId}`);
}

async function therapistVisitAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  const session = await requirePilotSession(["admin", "therapist"], "/my-work");

  const prisma = getPrismaClient();
  const therapistId = textField(formData.get("therapistId"), 80);
  const visitId = textField(formData.get("visitId"), 80);
  const status = textField(formData.get("status"), 80) as TherapistVisitStatus;
  const note = textField(formData.get("note"), 1000);

  if (!therapistId || !visitId || !THERAPIST_VISIT_STATUSES.includes(status)) {
    redirect("/my-work");
  }

  const blockedNoteSearch = await getBlockedOperationalNoteRedirectSearch({
    actorId: session.role === "therapist" ? session.email : therapistId,
    actorType: session.role === "admin" ? "pilot_admin" : "therapist_pilot",
    entityId: visitId,
    entityType: "Visit",
    extra: { status },
    fieldLabel: "Visit note",
    route: "/my-work",
    value: note,
    workflow: "therapist_visit_update",
  });
  if (blockedNoteSearch) redirect(`/my-work?therapistId=${encodeURIComponent(therapistId)}&${blockedNoteSearch}`);

  if (session.role === "therapist") {
    const therapist = await prisma.therapist.findFirst({
      where: {
        active: true,
        email: session.email,
      },
    });

    if (!therapist || therapist.id !== therapistId) {
      await prisma.auditLog.create({
        data: {
          actorType: "therapist_pilot",
          actorId: therapist?.id || session.email,
          action: "permission_denied",
          entityType: "Visit",
          entityId: visitId,
          metadataJson: { route: "/my-work", reason: "therapist_scope_mismatch" },
        },
      }).catch(() => undefined);
      redirect("/unauthorized");
    }
  }

  const visit = await prisma.visit.findFirst({
    include: { referral: true },
    where: {
      id: visitId,
      therapistId,
    },
  });

  if (!visit) {
    redirect(`/my-work?therapistId=${therapistId}&error=not_assigned`);
  }

  const updated = await prisma.visit.update({
    where: { id: visitId },
    data: {
      notes: note ? appendOperationalNote(visit.notes, `Therapist visit note: ${note}`) : visit.notes,
      status,
    },
  });

  const referralStatus = status === "in_progress" ? "active" : status === "completed" ? "completed" : visit.referral.status;
  if (referralStatus !== visit.referral.status) {
    await prisma.patientReferral.update({
      where: { id: visit.referralId },
      data: { status: referralStatus },
    });
  }

  await Promise.all([
    prisma.auditLog.create({
      data: {
        actorType: "therapist_pilot",
        actorId: therapistId,
        action: "therapist_status_update",
        entityType: "Visit",
        entityId: visitId,
        metadataJson: {
          referralId: visit.referralId,
          status: updated.status,
        },
      },
    }),
    visit.status !== updated.status
      ? prisma.auditLog.create({
          data: {
            actorType: "therapist_pilot",
            actorId: therapistId,
            action: "visit_status_changed",
            entityType: "Visit",
            entityId: visitId,
            metadataJson: {
              from: visit.status,
              referralId: visit.referralId,
              to: updated.status,
            },
          },
        })
      : Promise.resolve(),
  ]);

  redirect(`/my-work?therapistId=${therapistId}`);
}

export default async function MyWorkPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; noteCategory?: string; noteDestination?: string; noteSuggestion?: string; therapistId?: string }>;
}) {
  requirePilotOperationsAccess();

  const session = await requirePilotSession(["admin", "therapist"], "/my-work");
  const params = await searchParams;
  const prisma = getPrismaClient();
  const therapists = session.role === "admin"
    ? await prisma.therapist.findMany({
        where: {
          active: true,
          name: { startsWith: "Demo Therapist" },
        },
        orderBy: { name: "asc" },
      })
    : await prisma.therapist.findMany({
        where: {
          active: true,
          email: session.email,
        },
        orderBy: { name: "asc" },
      });

  const therapistOptions = therapists as TherapistOption[];
  const selectedTherapistId = session.role === "admin" && params?.therapistId && therapistOptions.some((therapist: TherapistOption) => therapist.id === params.therapistId)
    ? params.therapistId
    : therapistOptions[0]?.id;

  const referrals = selectedTherapistId
    ? await prisma.patientReferral.findMany({
        where: { assignedTherapistId: selectedTherapistId },
        include: {
          visits: {
            orderBy: { scheduledAt: "asc" },
            take: 3,
          },
        },
        orderBy: { updatedAt: "desc" },
      })
    : [];
  const assignedReferrals = referrals as TherapistWorkReferral[];

  return (
    <div>
        <div className="border-b border-line pb-8">
          <p className="eyebrow">Pilot therapist</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.03em] text-ink sm:text-4xl">My work</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Demo therapist worklist for the 1-2 therapist pilot. No SMS internals or send controls are exposed here.
          </p>
        </div>

        <BlockedNoteAlert searchParams={params} />

        {params?.error === "not_assigned" ? (
          <p role="alert" className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">
            That referral or visit is not assigned to the selected demo therapist.
          </p>
        ) : null}

        {session.role === "admin" ? (
          <form className="mt-8 rounded-lg border border-line bg-white p-5">
            <label className="text-sm font-semibold text-ink">
              Demo therapist selector
              <select className="field" name="therapistId" defaultValue={selectedTherapistId || ""}>
                {therapistOptions.map((therapist: TherapistOption) => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}
              </select>
            </label>
            <button className="btn-secondary mt-4" type="submit"><BriefcaseMedical size={18} />Load work</button>
          </form>
        ) : (
          <div className="mt-8 rounded-lg border border-line bg-white p-5">
            <p className="text-sm font-semibold text-ink">{therapistOptions[0]?.name || "Therapist record not linked"}</p>
            <p className="mt-2 text-sm text-slate-600">Signed in as {session.email}. This view is limited to the matching active therapist record.</p>
          </div>
        )}

        {therapistOptions.length === 0 ? (
          <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
            <CircleAlert className="mb-3" size={24} />
            <h2 className="text-lg font-semibold">{session.role === "admin" ? "No demo therapists found" : "Therapist record not linked"}</h2>
            <p className="mt-2 text-sm leading-6">{session.role === "admin" ? "Run `pnpm db:seed` to create demo pilot therapists before using this page." : "Ask a pilot admin to create or activate a Therapist row with this login email."}</p>
          </div>
        ) : null}

        <div className="mt-8 grid gap-5">
          {assignedReferrals.map((referral: TherapistWorkReferral) => (
            <article key={referral.id} className="rounded-lg border border-line bg-white p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-.02em] text-ink">{referral.patientName}</h2>
                  <p className="mt-1 text-sm text-slate-600">{[referral.city, referral.zip].filter(Boolean).join(" / ") || "Location not provided"}</p>
                </div>
                <span className={`inline-flex w-fit rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(referral.status)}`}>
                  {statusLabel(referral.status)}
                </span>
              </div>

              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
                <div><dt className="font-semibold text-ink">Phone</dt><dd className="mt-1 text-slate-600">{redactPhone(referral.phone)}</dd></div>
                <div><dt className="font-semibold text-ink">Service area</dt><dd className="mt-1 text-slate-600">{referral.careType || "Not provided"}</dd></div>
                <div><dt className="font-semibold text-ink">Next visit</dt><dd className="mt-1 text-slate-600">{formatDateTime(referral.visits[0]?.scheduledAt)}</dd></div>
              </dl>

              {referral.visits.length > 0 ? (
                <div className="mt-5 grid gap-3">
                  <h3 className="text-sm font-semibold text-ink">Assigned visits</h3>
                  {referral.visits.map((visit: TherapistWorkVisit) => (
                    <div key={visit.id} className="rounded-lg border border-line p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-semibold text-ink">{formatDateTime(visit.scheduledAt)}</p>
                        <span className={`inline-flex w-fit rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(visit.status)}`}>{statusLabel(visit.status)}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{visit.notes || "No operational visit note."}</p>
                      <form action={therapistVisitAction} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                        <input type="hidden" name="therapistId" value={selectedTherapistId || ""} />
                        <input type="hidden" name="visitId" value={visit.id} />
                        <label className="text-sm font-semibold text-ink">Visit status<select className="field" name="status" defaultValue={visit.status}>{THERAPIST_VISIT_STATUSES.map((item: TherapistVisitStatus) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select></label>
                        <label className="text-sm font-semibold text-ink">Operational note <span className="font-normal text-slate-400">(optional)</span><input className="field" name="note" placeholder="No PHI" /></label>
                        <div className="flex items-end"><button className="btn-secondary w-full" type="submit"><Save size={18} />Update visit</button></div>
                      </form>
                    </div>
                  ))}
                </div>
              ) : null}

              {referral.notes ? (
                <p className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600">{referral.notes}</p>
              ) : null}

              <form action={therapistReferralAction} className="mt-5 grid gap-4 border-t border-line pt-5 md:grid-cols-[1fr_1fr_auto]">
                <input type="hidden" name="therapistId" value={selectedTherapistId || ""} />
                <input type="hidden" name="referralId" value={referral.id} />
                <label className="text-sm font-semibold text-ink">Action<select className="field" name="action" defaultValue="contacted">{THERAPIST_ACTIONS.map((action: TherapistAction) => <option key={action.value} value={action.value}>{action.label}</option>)}</select></label>
                <label className="text-sm font-semibold text-ink">Note <span className="font-normal text-slate-400">(optional)</span><input className="field" name="note" placeholder="No PHI in pilot notes" /></label>
                <div className="flex items-end"><button className="btn-primary w-full" type="submit"><Save size={18} />Save</button></div>
              </form>
            </article>
          ))}
          {selectedTherapistId && assignedReferrals.length === 0 ? (
            <div className="rounded-lg border border-line bg-white p-8 text-center">
              <BriefcaseMedical className="mx-auto mb-3 text-slate-400" size={28} />
              <p className="font-semibold text-ink">No assigned referrals</p>
              <p className="mt-1 text-sm text-slate-500">Assign a referral to this demo therapist from the admin referral detail page.</p>
            </div>
          ) : null}
        </div>
    </div>
  );
}
