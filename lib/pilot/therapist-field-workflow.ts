export type TherapistFieldVisitAction = "start_visit" | "mark_completed" | "mark_no_show" | "mark_canceled";
export type TherapistFieldVisitStatus = "scheduled" | "in_progress" | "completed" | "no_show" | "canceled";

export type TherapistFieldVisitActionConfig = Readonly<{
  action: TherapistFieldVisitAction;
  auditAction: "therapist_visit_started" | "therapist_visit_completed" | "therapist_visit_no_show" | "therapist_visit_canceled";
  buttonLabel: string;
  confirmLabel: string;
  helper: string;
  nextStatus: TherapistFieldVisitStatus;
  allowedFrom: readonly TherapistFieldVisitStatus[];
  successMessage: string;
  terminalResult: boolean;
}>;

export type TherapistFieldVisitActionResult = Readonly<{
  action: TherapistFieldVisitAction;
  allowed: boolean;
  auditAction: TherapistFieldVisitActionConfig["auditAction"];
  earlyCompletionWarning: boolean;
  nextStatus: TherapistFieldVisitStatus;
  terminalWarning: boolean;
}>;

export const THERAPIST_FIELD_VISIT_ACTIONS: readonly TherapistFieldVisitActionConfig[] = [
  {
    action: "start_visit",
    allowedFrom: ["scheduled"],
    auditAction: "therapist_visit_started",
    buttonLabel: "Start visit",
    confirmLabel: "Confirm start",
    helper: "Move this fake/test visit from scheduled to in progress.",
    nextStatus: "in_progress",
    successMessage: "Visit marked in progress",
    terminalResult: false,
  },
  {
    action: "mark_completed",
    allowedFrom: ["scheduled", "in_progress"],
    auditAction: "therapist_visit_completed",
    buttonLabel: "Mark completed",
    confirmLabel: "Confirm complete",
    helper: "Complete the fake/test operational visit after manual review.",
    nextStatus: "completed",
    successMessage: "Visit marked completed",
    terminalResult: true,
  },
  {
    action: "mark_no_show",
    allowedFrom: ["scheduled", "in_progress"],
    auditAction: "therapist_visit_no_show",
    buttonLabel: "Mark no-show",
    confirmLabel: "Confirm no-show",
    helper: "Record that the fake/test visit did not occur.",
    nextStatus: "no_show",
    successMessage: "Visit marked no-show",
    terminalResult: true,
  },
  {
    action: "mark_canceled",
    allowedFrom: ["scheduled", "in_progress"],
    auditAction: "therapist_visit_canceled",
    buttonLabel: "Mark canceled",
    confirmLabel: "Confirm cancel",
    helper: "Cancel this fake/test visit workflow.",
    nextStatus: "canceled",
    successMessage: "Visit marked canceled",
    terminalResult: true,
  },
] as const;

export const THERAPIST_FIELD_CONFIRMATION_INTENT = "field_visit_confirmation_v1";

const TERMINAL_VISIT_STATUSES = new Set(["completed", "no_show", "canceled"]);

export function isTerminalFieldVisitStatus(status: string) {
  return TERMINAL_VISIT_STATUSES.has(status);
}

export function getTherapistFieldVisitActionConfig(action: string | null | undefined) {
  return THERAPIST_FIELD_VISIT_ACTIONS.find((item) => item.action === action);
}

export function getAllowedTherapistFieldVisitActions(status: string) {
  return THERAPIST_FIELD_VISIT_ACTIONS.filter((action) => action.allowedFrom.includes(status as TherapistFieldVisitStatus));
}

export function isTherapistFieldVisitActionConfirmed(input: {
  action: string | null | undefined;
  confirmationIntent: string | null | undefined;
}) {
  return Boolean(getTherapistFieldVisitActionConfig(input.action) && input.confirmationIntent === THERAPIST_FIELD_CONFIRMATION_INTENT);
}

export function getTherapistFieldVisitSuccessMessage(status: string | null | undefined) {
  const match = THERAPIST_FIELD_VISIT_ACTIONS.find((action) => action.nextStatus === status);
  return match?.successMessage ?? null;
}

export function resolveTherapistFieldVisitAction(input: {
  action: string;
  now?: Date;
  scheduledAt?: Date | string | null;
  status: string;
}): TherapistFieldVisitActionResult | null {
  const config = getTherapistFieldVisitActionConfig(input.action);
  if (!config) return null;

  const terminalWarning = isTerminalFieldVisitStatus(input.status);
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const now = input.now ?? new Date();

  return {
    action: config.action,
    allowed: !terminalWarning && config.allowedFrom.includes(input.status as TherapistFieldVisitStatus),
    auditAction: config.auditAction,
    earlyCompletionWarning: config.action === "mark_completed" && Boolean(scheduledAt && scheduledAt > now),
    nextStatus: config.nextStatus,
    terminalWarning,
  };
}

export function getTherapistFieldWorkflowStatus() {
  return {
    autonomousStatusChangesEnabled: false,
    enabled: true,
    externalAiEnabled: false,
    externalApisEnabled: false,
    geocodingEnabled: false,
    ipadLayoutEnabled: true,
    manualOnly: true,
    mobileActionUxEnabled: true,
    noPhiMode: true,
    noPhiNotesEnforced: true,
    phiNoteStorageEnabled: false,
    phoneLayoutEnabled: true,
    safeBlockedNoteFeedbackEnabled: true,
    smsSendingEnabled: false,
    source: "deterministic",
    therapistFieldConfirmationsEnabled: true,
    therapistFieldActivityAuditEnabled: true,
    terminalVisitLockEnabled: true,
    travelTimeApisEnabled: false,
  };
}
