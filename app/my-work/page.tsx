import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  BriefcaseMedical,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Save,
  ShieldAlert,
  Smartphone,
  Tablet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { BlockedNoteAlert } from "@/components/blocked-note-alert";
import { OperationsAssistantPanel } from "@/components/operations-assistant-panel";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { SchedulingIntelligencePanel } from "@/components/scheduling-intelligence-panel";
import { TransientActionBanner } from "@/components/transient-action-banner";
import { getOperationsAssistantV2Status, getTherapistAssistantCards } from "@/lib/ai/operations-assistant-v2";
import {
  buildBlockedNoteSearchParams,
  classifyOperationalNote,
  getSafeBlockedNoteAuditMetadata,
  hasBlockedNoteClassification,
} from "@/lib/compliance/note-classification";
import { getPrismaClient } from "@/lib/db/prisma";
import { getSchedulingQueueCards } from "@/lib/pilot/scheduling-intelligence";
import { requirePilotSession } from "@/lib/pilot/auth";
import { getBlockedOperationalNoteRedirectSearch } from "@/lib/pilot/note-guardrail";
import {
  getAllowedTherapistFieldVisitActions,
  isTerminalFieldVisitStatus,
  isTherapistFieldVisitActionConfirmed,
  getTherapistFieldVisitSuccessMessage,
  resolveTherapistFieldVisitAction,
  THERAPIST_FIELD_CONFIRMATION_INTENT,
  type TherapistFieldVisitActionConfig,
} from "@/lib/pilot/therapist-field-workflow";
import {
  getFieldVisitQueueCopy,
  getFieldWorkspaceEmptyState,
  getTherapistWorkspacePhoneDisplay,
  isReferralNeedingTherapistAction,
  THERAPIST_WORKSPACE_REFERRAL_SELECT,
  THERAPIST_WORKSPACE_THERAPIST_SELECT,
  THERAPIST_WORKSPACE_VISIT_ACTION_SELECT,
  THERAPIST_WORKSPACE_VISIT_SELECT,
  type FieldVisitQueue,
  type FieldWorkspaceEmptyStateKey,
} from "@/lib/pilot/therapist-workspace";
import {
  appendOperationalNote,
  formatDateTime,
  requirePilotOperationsAccess,
  statusClassName,
  statusLabel,
  textField,
} from "@/lib/pilot/ops";
import { normalizeE164Phone } from "@/lib/sms/compliance";

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

type TherapistFieldVisit = {
  id: string;
  notes: string | null;
  scheduledAt: Date | string | null;
  status: string;
  referral: {
    city: string | null;
    id: string;
    patientName: string;
    phone: string;
    status: string;
    zip: string | null;
  };
};

type SmsConsentLookup = Record<string, string | undefined>;

function isSameOperationsDay(value: Date | string | null | undefined) {
  if (!value) return false;
  const itemDate = new Date(value);
  const now = new Date();
  return itemDate.toDateString() === now.toDateString();
}

function isPastOrToday(value: Date | string | null | undefined) {
  if (!value) return false;
  return new Date(value).getTime() <= Date.now();
}

function isFutureVisit(value: Date | string | null | undefined) {
  if (!value) return false;
  return new Date(value).getTime() > Date.now();
}

function referralWorkLabel(referral: TherapistWorkReferral) {
  if (referral.status === "new") return "Needs contact";
  if (referral.status === "contacted") return "Ready to schedule";
  if (referral.status === "scheduled") return "Upcoming visit";
  if (referral.status === "active") return "In progress";
  if (referral.status === "completed") return "Completed recently";
  return statusLabel(referral.status);
}

function visitWorkLabel(visit: TherapistWorkVisit) {
  if (visit.status === "scheduled") return "Upcoming visit";
  if (visit.status === "in_progress") return "In progress";
  if (visit.status === "completed") return isSameOperationsDay(visit.scheduledAt) ? "Completed today" : "Completed recently";
  return statusLabel(visit.status);
}

function fieldVisitSection(visit: TherapistFieldVisit) {
  if (visit.status === "completed" || visit.status === "no_show" || visit.status === "canceled") return "completed";
  if (isSameOperationsDay(visit.scheduledAt) || visit.status === "in_progress") return "today";
  return "upcoming";
}

function visitTimestamp(value: Date | string | null | undefined) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function visitPriority(visit: TherapistFieldVisit) {
  if (visit.status === "in_progress") return 0;
  if (visit.status === "scheduled" && isPastOrToday(visit.scheduledAt)) return 1;
  if (visit.status === "scheduled") return 2;
  if (visit.status === "no_show") return 3;
  if (visit.status === "completed") return 4;
  return 5;
}

function nextFieldVisit(visits: TherapistFieldVisit[]) {
  return [...visits].sort((left, right) => visitPriority(left) - visitPriority(right) || visitTimestamp(left.scheduledAt) - visitTimestamp(right.scheduledAt))[0] || null;
}

function shortId(value: string | null | undefined) {
  if (!value) return "not recorded";
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function visitDomId(visitId: string) {
  return `visit-${visitId}`;
}

function visitSuccessMessage(status: string | null | undefined) {
  return getTherapistFieldVisitSuccessMessage(status);
}

function visitErrorMessage(error: string | null | undefined) {
  if (error === "not_assigned") return "That referral or visit is not assigned to the selected demo therapist.";
  if (error === "visit_terminal") return "That visit is already terminal and cannot be changed from the therapist field workflow.";
  if (error === "invalid_transition") return "That visit action is not available for the current status.";
  if (error === "confirmation_required") return "Review the visit action details and use the confirmation button before submitting.";
  return null;
}

function actionIcon(action: TherapistFieldVisitActionConfig["action"]) {
  if (action === "start_visit") return <Clock3 size={16} />;
  if (action === "mark_completed") return <CheckCircle2 size={16} />;
  if (action === "mark_no_show") return <ShieldAlert size={16} />;
  return <XCircle size={16} />;
}

function VisitWarnings({ smsConsentStatus, visit }: { smsConsentStatus?: string; visit: TherapistFieldVisit }) {
  const isTerminal = isTerminalFieldVisitStatus(visit.status);
  const isFuture = isFutureVisit(visit.scheduledAt);

  return (
    <div className="mt-4 grid gap-2 text-sm">
      {isTerminal ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 font-semibold text-amber-950">This visit is terminal. No therapist field action is available.</p>
      ) : null}
      {smsConsentStatus === "opted_out" ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-950">SMS consent is opted out. Use non-SMS operational follow-up only.</p>
      ) : null}
      {isFuture ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 font-semibold text-amber-950">This visit is scheduled in the future. Completing early will be audited as an operational warning.</p>
      ) : null}
    </div>
  );
}

function VisitActionForm({
  selectedTherapistId,
  visit,
}: {
  selectedTherapistId: string;
  visit: TherapistFieldVisit;
}) {
  const allowedActions = getAllowedTherapistFieldVisitActions(visit.status);

  if (allowedActions.length === 0) return null;

  return (
    <form action={therapistVisitAction} className="mt-4 grid gap-3">
      <input type="hidden" name="therapistId" value={selectedTherapistId} />
      <input type="hidden" name="visitId" value={visit.id} />
      <input type="hidden" name="confirmationIntent" value={THERAPIST_FIELD_CONFIRMATION_INTENT} />
      <label className="text-sm font-semibold text-ink">
        Operational note <span className="font-normal text-slate-400">(optional, no PHI)</span>
        <textarea className="field min-h-24 resize-y" name="note" placeholder="Example: Arrived at site, access issue, or scheduling follow-up needed." />
      </label>
      <p className="rounded-lg border border-line bg-slate-50 p-3 text-sm leading-6 text-slate-600">
        No PHI in notes. Use scheduling, access, or status wording only.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
        {allowedActions.map((action: TherapistFieldVisitActionConfig) => (
          <details key={action.action} className="group rounded-lg border border-line bg-white">
            <summary className={`${action.action === "mark_completed" ? "btn-primary" : "btn-secondary"} min-h-14 w-full cursor-pointer list-none px-4 text-[15px] [&::-webkit-details-marker]:hidden`}>
              {actionIcon(action.action)}
              <span className="truncate">{action.buttonLabel}</span>
            </summary>
            <div className="grid gap-3 border-t border-line p-4 text-sm leading-6 text-slate-700">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Selected action</p>
                <p className="mt-1 font-semibold text-ink">{action.buttonLabel}</p>
              </div>
              <dl className="grid gap-2">
                <div className="flex justify-between gap-3"><dt className="font-semibold text-ink">Visit</dt><dd className="text-right">Referral {shortId(visit.referral.id)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="font-semibold text-ink">Phone</dt><dd className="text-right">{getTherapistWorkspacePhoneDisplay(visit.referral.phone)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="font-semibold text-ink">Scheduled</dt><dd className="text-right">{formatDateTime(visit.scheduledAt)}</dd></div>
              </dl>
              {action.terminalResult ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 font-semibold text-amber-950">This action moves the visit to a terminal status. It cannot be changed from the therapist field workflow afterward.</p>
              ) : null}
              {action.action === "mark_completed" && isFutureVisit(visit.scheduledAt) ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 font-semibold text-amber-950">This visit is scheduled in the future. Confirming completion will be audited as an operational warning.</p>
              ) : null}
              <PendingSubmitButton className="btn-primary min-h-14 w-full" name="action" pendingLabel="Submitting..." value={action.action}>
                {action.confirmLabel}
              </PendingSubmitButton>
            </div>
          </details>
        ))}
      </div>
    </form>
  );
}

function FieldVisitCard({
  selectedTherapistId,
  smsConsentStatus,
  visit,
}: {
  selectedTherapistId: string;
  smsConsentStatus?: string;
  visit: TherapistFieldVisit;
}) {
  return (
    <article id={visitDomId(visit.id)} className="scroll-mt-6 min-w-0 rounded-lg border border-line bg-white p-4 sm:p-5" data-field-visit-card="true">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Assigned visit</p>
          <h3 className="break-words text-lg font-semibold tracking-[-.02em] text-ink">{visit.referral.patientName}</h3>
          <p className="mt-1 break-words text-sm leading-6 text-slate-600">{formatDateTime(visit.scheduledAt)} · {[visit.referral.city, visit.referral.zip].filter(Boolean).join(" / ") || "Location not provided"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex w-fit rounded-md bg-ice px-2 py-1 text-xs font-semibold text-blue ring-1 ring-blue/15">{visitWorkLabel(visit)}</span>
          <span className={`inline-flex w-fit rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(visit.status)}`}>{statusLabel(visit.status)}</span>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="font-semibold text-ink">Phone</dt><dd className="mt-1 text-slate-600">{getTherapistWorkspacePhoneDisplay(visit.referral.phone)}</dd></div>
        <div><dt className="font-semibold text-ink">Referral status</dt><dd className="mt-1 text-slate-600">{statusLabel(visit.referral.status)}</dd></div>
        <div><dt className="font-semibold text-ink">Visit id</dt><dd className="mt-1 font-mono text-xs text-slate-500">{visit.id.slice(0, 8)}...{visit.id.slice(-4)}</dd></div>
      </dl>

      <VisitWarnings smsConsentStatus={smsConsentStatus} visit={visit} />
      <VisitActionForm selectedTherapistId={selectedTherapistId} visit={visit} />

      {visit.notes ? <p className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600">{visit.notes}</p> : null}
    </article>
  );
}

function NextFieldActionPanel({
  visit,
}: {
  visit: TherapistFieldVisit | null;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-blue/20 bg-white p-4 shadow-[0_14px_34px_rgba(10,37,64,0.08)] sm:p-5" data-field-next-action="true">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Next field action</p>
          <h2 className="mt-2 break-words text-xl font-semibold tracking-[-.02em] text-ink">{visit ? visit.referral.patientName : "No assigned visit action"}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{visit ? "Manual, audited, no-PHI." : "No actionable assigned visit is waiting."}</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">
          <ShieldAlert size={14} />
          Manual submit
        </span>
      </div>

      {visit ? (
        <>
          <dl className="mt-4 grid gap-2 text-sm">
            <div className="flex justify-between gap-3 rounded-lg border border-line bg-slate-50 p-3"><dt className="font-semibold text-ink">When</dt><dd className="text-right text-slate-600">{formatDateTime(visit.scheduledAt)}</dd></div>
            <div className="flex justify-between gap-3 rounded-lg border border-line bg-slate-50 p-3"><dt className="font-semibold text-ink">Area</dt><dd className="break-words text-right text-slate-600">{[visit.referral.city, visit.referral.zip].filter(Boolean).join(" / ") || "Location not provided"}</dd></div>
            <div className="flex justify-between gap-3 rounded-lg border border-line bg-slate-50 p-3"><dt className="font-semibold text-ink">Phone</dt><dd className="text-right text-slate-600">{getTherapistWorkspacePhoneDisplay(visit.referral.phone)}</dd></div>
            <div className="flex justify-between gap-3 rounded-lg border border-line bg-slate-50 p-3"><dt className="font-semibold text-ink">Status</dt><dd className="text-right text-slate-600">{statusLabel(visit.status)}</dd></div>
          </dl>
          <a href={`#${visitDomId(visit.id)}`} className="btn-primary mt-4 min-h-14 w-full justify-center">
            Review visit action
          </a>
        </>
      ) : null}
    </section>
  );
}

function FieldMetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-white p-4">
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <p className="mt-2 break-words text-3xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function FieldWorkspaceEmptyState({ stateKey }: { stateKey: FieldWorkspaceEmptyStateKey }) {
  const emptyState = getFieldWorkspaceEmptyState(stateKey);

  return (
    <div className="rounded-lg border border-line bg-white p-5 text-sm leading-6 text-slate-600">
      <p className="font-semibold text-ink">{emptyState.title}</p>
      <p className="mt-1">{emptyState.detail}</p>
      <p className="mt-3 font-semibold text-blue">{emptyState.action}</p>
    </div>
  );
}

function FieldVisitSection({
  icon: Icon,
  queue,
  selectedTherapistId,
  smsConsentByPhone,
  title,
  visits,
}: {
  icon: LucideIcon;
  queue: FieldVisitQueue;
  selectedTherapistId: string;
  smsConsentByPhone: SmsConsentLookup;
  title: string;
  visits: TherapistFieldVisit[];
}) {
  return (
    <section className="grid min-w-0 gap-4" data-field-visit-section={queue}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-2">
          <Icon size={18} className="text-blue" />
          <h2 className="text-xl font-semibold tracking-[-.02em] text-ink">{title}</h2>
        </div>
        <p className="hidden text-sm leading-6 text-slate-500 sm:block">{getFieldVisitQueueCopy(queue)}</p>
      </div>
      {visits.map((visit: TherapistFieldVisit) => (
        <FieldVisitCard
          key={visit.id}
          selectedTherapistId={selectedTherapistId}
          smsConsentStatus={smsConsentByPhone[normalizeE164Phone(visit.referral.phone)]}
          visit={visit}
        />
      ))}
      {visits.length === 0 ? <FieldWorkspaceEmptyState stateKey={queue} /> : null}
    </section>
  );
}

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
  const action = textField(formData.get("action"), 80);
  const confirmationIntent = textField(formData.get("confirmationIntent"), 120);
  const note = textField(formData.get("note"), 1000);

  if (!therapistId || !visitId || !action) {
    redirect("/my-work");
  }

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
    select: THERAPIST_WORKSPACE_VISIT_ACTION_SELECT,
    where: {
      id: visitId,
      therapistId,
    },
  });

  if (!visit) {
    redirect(`/my-work?therapistId=${therapistId}&error=not_assigned`);
  }

  const transition = resolveTherapistFieldVisitAction({
    action,
    scheduledAt: visit.scheduledAt,
    status: visit.status,
  });

  if (!transition || !transition.allowed) {
    await prisma.auditLog.create({
      data: {
        actorType: session.role === "admin" ? "pilot_admin" : "therapist_pilot",
        actorId: therapistId,
        action: "permission_denied",
        entityType: "Visit",
        entityId: visitId,
        metadataJson: {
          attemptedAction: action,
          reason: transition?.terminalWarning ? "visit_terminal" : "invalid_visit_transition",
          referralId: visit.referralId,
          status: visit.status,
        },
      },
    }).catch(() => undefined);
    redirect(`/my-work?therapistId=${encodeURIComponent(therapistId)}&error=${transition?.terminalWarning ? "visit_terminal" : "invalid_transition"}`);
  }

  if (!isTherapistFieldVisitActionConfirmed({ action, confirmationIntent })) {
    redirect(`/my-work?therapistId=${encodeURIComponent(therapistId)}&error=confirmation_required`);
  }

  const noteClassification = classifyOperationalNote(note, { fieldLabel: "Visit note" });
  if (hasBlockedNoteClassification(noteClassification)) {
    await prisma.auditLog.create({
      data: {
        actorType: session.role === "admin" ? "pilot_admin" : "therapist_pilot",
        actorId: therapistId,
        action: "therapist_visit_note_blocked",
        entityType: "Visit",
        entityId: visitId,
        metadataJson: getSafeBlockedNoteAuditMetadata(noteClassification, {
          extra: {
            attemptedAction: action,
            referralId: visit.referralId,
            status: visit.status,
            therapistId,
          },
          fieldLabel: "Visit note",
          route: "/my-work",
          workflow: "therapist_field_visit_action",
        }),
      },
    }).catch(() => undefined);
    redirect(`/my-work?therapistId=${encodeURIComponent(therapistId)}&${buildBlockedNoteSearchParams(noteClassification)}`);
  }

  const updated = await prisma.visit.update({
    where: { id: visitId },
    data: {
      notes: note ? appendOperationalNote(visit.notes, `Therapist field note: ${note}`) : visit.notes,
      status: transition.nextStatus,
    },
  });

  const referralStatus = transition.nextStatus === "in_progress" ? "active" : transition.nextStatus === "completed" ? "completed" : visit.referral.status;
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
        action: transition.auditAction,
        entityType: "Visit",
        entityId: visitId,
        metadataJson: {
          earlyCompletionWarning: transition.earlyCompletionWarning,
          newStatus: updated.status,
          oldStatus: visit.status,
          referralId: visit.referralId,
          therapistId,
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

  redirect(`/my-work?therapistId=${encodeURIComponent(therapistId)}&success=${encodeURIComponent(transition.nextStatus)}`);
}

export default async function MyWorkPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; noteCategory?: string; noteDestination?: string; noteSuggestion?: string; success?: string; therapistId?: string }>;
}) {
  requirePilotOperationsAccess();

  const session = await requirePilotSession(["admin", "therapist"], "/my-work");
  const params = await searchParams;
  const prisma = getPrismaClient();
  const therapists = session.role === "admin"
    ? await prisma.therapist.findMany({
        select: THERAPIST_WORKSPACE_THERAPIST_SELECT,
        where: {
          active: true,
          name: { startsWith: "Demo Therapist" },
        },
        orderBy: { name: "asc" },
      })
    : await prisma.therapist.findMany({
        select: THERAPIST_WORKSPACE_THERAPIST_SELECT,
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

  const [referrals, visits] = selectedTherapistId
    ? await Promise.all([
        prisma.patientReferral.findMany({
          where: { assignedTherapistId: selectedTherapistId },
          select: THERAPIST_WORKSPACE_REFERRAL_SELECT,
          orderBy: { updatedAt: "desc" },
        }),
        prisma.visit.findMany({
          select: THERAPIST_WORKSPACE_VISIT_SELECT,
          orderBy: [{ scheduledAt: "asc" }, { updatedAt: "desc" }],
          take: 100,
          where: { therapistId: selectedTherapistId },
        }),
      ])
    : [[], []];
  const assignedReferrals = referrals as TherapistWorkReferral[];
  const assignedVisits = visits as TherapistFieldVisit[];
  const normalizedPhones = Array.from(new Set(assignedVisits.map((visit: TherapistFieldVisit) => normalizeE164Phone(visit.referral.phone)).filter(Boolean)));
  const smsConsentRows = normalizedPhones.length > 0
    ? await prisma.smsConsentEnrollment.findMany({
        select: { normalizedPhone: true, status: true },
        where: { normalizedPhone: { in: normalizedPhones } },
      })
    : [];
  const smsConsentByPhone: SmsConsentLookup = Object.fromEntries(smsConsentRows.map((row) => [row.normalizedPhone, row.status]));
  const actionReferrals = assignedReferrals.filter(isReferralNeedingTherapistAction);
  const todayVisits = assignedVisits.filter((visit: TherapistFieldVisit) => fieldVisitSection(visit) === "today");
  const upcomingVisits = assignedVisits.filter((visit: TherapistFieldVisit) => fieldVisitSection(visit) === "upcoming");
  const completedVisits = assignedVisits.filter((visit: TherapistFieldVisit) => fieldVisitSection(visit) === "completed");
  const nextVisit = nextFieldVisit(assignedVisits);
  const assignedVisitCount = assignedVisits.length;
  const inProgressVisitCount = assignedVisits.filter((visit: TherapistFieldVisit) => visit.status === "in_progress").length;
  const completedRecentlyVisitCount = assignedVisits.filter((visit: TherapistFieldVisit) => visit.status === "completed").length;
  const noShowVisitCount = assignedVisits.filter((visit: TherapistFieldVisit) => visit.status === "no_show").length;
  const optedOutContactCount = assignedVisits.filter((visit: TherapistFieldVisit) => smsConsentByPhone[normalizeE164Phone(visit.referral.phone)] === "opted_out").length;
  const readyToStartVisitCount = assignedVisits.filter((visit: TherapistFieldVisit) => visit.status === "scheduled" && isPastOrToday(visit.scheduledAt)).length;
  const recentlyCompletedCount = assignedReferrals.filter((referral: TherapistWorkReferral) => referral.status === "completed").length + completedRecentlyVisitCount;
  const assistantCards = getTherapistAssistantCards({
    completedRecentlyVisits: completedRecentlyVisitCount,
    inProgressVisits: inProgressVisitCount,
    needsContact: assignedReferrals.filter((referral: TherapistWorkReferral) => referral.status === "new").length,
    noShowVisits: noShowVisitCount,
    optedOutContacts: optedOutContactCount,
    readyToSchedule: assignedReferrals.filter((referral: TherapistWorkReferral) => referral.status === "contacted").length,
    recentlyCompleted: recentlyCompletedCount,
    readyToStartVisits: readyToStartVisitCount,
    upcomingVisits: assignedVisits.filter((visit: TherapistFieldVisit) => visit.status === "scheduled").length,
  });
  const schedulingCards = getSchedulingQueueCards({
    archiveCandidates: assignedReferrals.filter((referral: TherapistWorkReferral) => referral.status === "completed" || referral.status === "canceled").length,
    capacityCautions: assignedVisitCount >= 6 ? 1 : 0,
    conflicts: inProgressVisitCount,
    contactedWithoutFutureVisit: actionReferrals.filter((referral: TherapistWorkReferral) => referral.status === "contacted" && referral.visits.length === 0).length,
    optedOutContacts: optedOutContactCount,
    readyToSchedule: actionReferrals.filter((referral: TherapistWorkReferral) => referral.status === "contacted" && referral.visits.length === 0).length,
    unassignedReferrals: 0,
    upcomingNextSevenDays: assignedVisits.filter((visit: TherapistFieldVisit) => visit.status === "scheduled" || visit.status === "in_progress").length,
  });
  const assistantStatus = getOperationsAssistantV2Status();
  const successMessage = visitSuccessMessage(params?.success);
  const errorMessage = visitErrorMessage(params?.error);

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

        {successMessage ? (
          <TransientActionBanner message={successMessage} tone="success" />
        ) : null}

        {errorMessage ? (
          <TransientActionBanner message={errorMessage} tone="error" />
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

        {selectedTherapistId ? (
          <div className="mt-8 grid min-w-0 gap-5" data-therapist-field-workspace="phone-ipad">
            <section className="grid min-w-0 gap-4 rounded-lg border border-line bg-white p-4 sm:grid-cols-3 sm:p-5">
              <div className="flex min-w-0 items-start gap-3 sm:col-span-2">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ice text-blue"><Smartphone size={19} /></span>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold tracking-[-.02em] text-ink">Phone and iPad field workspace</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">One-column on phone, tablet-readable on iPad, and manual-only everywhere.</p>
                </div>
              </div>
              <div className="grid gap-2 text-xs font-semibold text-slate-600 sm:justify-end">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2.5 py-2 ring-1 ring-line"><Tablet size={14} /> iPad ready</span>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2.5 py-2 ring-1 ring-line"><ShieldAlert size={14} /> No-PHI notes</span>
              </div>
            </section>

            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-start">
              <div className="grid min-w-0 gap-5">
                <div className="xl:hidden">
                  <NextFieldActionPanel visit={nextVisit} />
                </div>

                <FieldVisitSection
                  icon={CalendarClock}
                  queue="today"
                  selectedTherapistId={selectedTherapistId}
                  smsConsentByPhone={smsConsentByPhone}
                  title="Today"
                  visits={todayVisits}
                />

                <FieldVisitSection
                  icon={Clock3}
                  queue="upcoming"
                  selectedTherapistId={selectedTherapistId}
                  smsConsentByPhone={smsConsentByPhone}
                  title="Upcoming"
                  visits={upcomingVisits}
                />

                <section className="grid min-w-0 gap-5 xl:hidden">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FieldMetricCard label="Assigned referrals" value={assignedReferrals.length} />
                    <FieldMetricCard label="Assigned visits" value={assignedVisitCount} />
                  </div>
                  <OperationsAssistantPanel
                    cards={assistantCards}
                    status={assistantStatus}
                    summary="Deterministic, therapist-scoped guidance for safe field work. Human review is required."
                    title="Operations Assistant"
                  />
                  <SchedulingIntelligencePanel
                    cards={schedulingCards}
                    summary="Read-only scheduling context for assigned fake pilot work. No visits are created here."
                  />
                </section>

                <FieldVisitSection
                  icon={CheckCircle2}
                  queue="completed"
                  selectedTherapistId={selectedTherapistId}
                  smsConsentByPhone={smsConsentByPhone}
                  title="Completed recently"
                  visits={completedVisits}
                />

                {actionReferrals.length > 0 ? (
                  <section className="grid min-w-0 gap-4">
                    <div className="flex items-center gap-2">
                      <BriefcaseMedical size={18} className="text-blue" />
                      <h2 className="text-xl font-semibold tracking-[-.02em] text-ink">Assigned referrals</h2>
                    </div>
                    {actionReferrals.map((referral: TherapistWorkReferral) => (
                      <article key={referral.id} className="min-w-0 rounded-lg border border-line bg-white p-4 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Assigned referral</p>
                            <h3 className="break-words text-xl font-semibold tracking-[-.02em] text-ink">{referral.patientName}</h3>
                            <p className="mt-1 break-words text-sm text-slate-600">{[referral.city, referral.zip].filter(Boolean).join(" / ") || "Location not provided"}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="inline-flex w-fit rounded-md bg-ice px-2 py-1 text-xs font-semibold text-blue ring-1 ring-blue/15">
                              {referralWorkLabel(referral)}
                            </span>
                            <span className={`inline-flex w-fit rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(referral.status)}`}>
                              {statusLabel(referral.status)}
                            </span>
                          </div>
                        </div>

                        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
                          <div><dt className="font-semibold text-ink">Phone</dt><dd className="mt-1 text-slate-600">{getTherapistWorkspacePhoneDisplay(referral.phone)}</dd></div>
                          <div><dt className="font-semibold text-ink">Service area</dt><dd className="mt-1 break-words text-slate-600">{referral.careType || "Not provided"}</dd></div>
                          <div><dt className="font-semibold text-ink">Next visit</dt><dd className="mt-1 text-slate-600">{formatDateTime(referral.visits[0]?.scheduledAt)}</dd></div>
                        </dl>

                        {referral.notes ? (
                          <p className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600">{referral.notes}</p>
                        ) : null}

                        <form action={therapistReferralAction} className="mt-5 grid gap-4 border-t border-line pt-5 lg:grid-cols-[1fr_1fr_auto]">
                          <input type="hidden" name="therapistId" value={selectedTherapistId} />
                          <input type="hidden" name="referralId" value={referral.id} />
                          <label className="text-sm font-semibold text-ink">Action<select className="field" name="action" defaultValue="contacted">{THERAPIST_ACTIONS.map((action: TherapistAction) => <option key={action.value} value={action.value}>{action.label}</option>)}</select></label>
                          <label className="text-sm font-semibold text-ink">Note <span className="font-normal text-slate-400">(optional, no PHI)</span><input className="field" name="note" placeholder="No PHI in pilot notes" /></label>
                          <div className="flex items-end">
                            <PendingSubmitButton className="btn-primary min-h-14 w-full" pendingLabel="Saving...">
                              <Save size={18} />Save
                            </PendingSubmitButton>
                          </div>
                        </form>
                      </article>
                    ))}
                  </section>
                ) : (
                  <FieldWorkspaceEmptyState stateKey="referrals" />
                )}
              </div>

              <aside className="hidden min-w-0 gap-5 xl:grid">
                <div className="sticky top-6 grid gap-5">
                  <NextFieldActionPanel visit={nextVisit} />
                  <div className="grid gap-4">
                    <FieldMetricCard label="Assigned referrals" value={assignedReferrals.length} />
                    <FieldMetricCard label="Assigned visits" value={assignedVisitCount} />
                  </div>
                  <OperationsAssistantPanel
                    cards={assistantCards}
                    status={assistantStatus}
                    summary="Deterministic, therapist-scoped guidance for safe field work. Human review is required."
                    title="Operations Assistant"
                  />
                  <SchedulingIntelligencePanel
                    cards={schedulingCards}
                    summary="Read-only scheduling context for assigned fake pilot work. No visits are created here."
                  />
                </div>
              </aside>
            </div>
          </div>
        ) : null}
    </div>
  );
}
