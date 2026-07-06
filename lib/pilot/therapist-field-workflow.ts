export type TherapistFieldVisitAction = "start_visit" | "mark_completed" | "mark_no_show" | "mark_canceled";
export type TherapistFieldVisitStatus = "scheduled" | "in_progress" | "completed" | "no_show" | "canceled";

export type TherapistFieldVisitActionConfig = Readonly<{
  action: TherapistFieldVisitAction;
  auditAction: "therapist_visit_started" | "therapist_visit_completed" | "therapist_visit_no_show" | "therapist_visit_canceled";
  buttonLabel: string;
  helper: string;
  nextStatus: TherapistFieldVisitStatus;
  allowedFrom: readonly TherapistFieldVisitStatus[];
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
    helper: "Move this fake/test visit from scheduled to in progress.",
    nextStatus: "in_progress",
  },
  {
    action: "mark_completed",
    allowedFrom: ["scheduled", "in_progress"],
    auditAction: "therapist_visit_completed",
    buttonLabel: "Mark completed",
    helper: "Complete the fake/test operational visit after manual review.",
    nextStatus: "completed",
  },
  {
    action: "mark_no_show",
    allowedFrom: ["scheduled", "in_progress"],
    auditAction: "therapist_visit_no_show",
    buttonLabel: "Mark no-show",
    helper: "Record that the fake/test visit did not occur.",
    nextStatus: "no_show",
  },
  {
    action: "mark_canceled",
    allowedFrom: ["scheduled", "in_progress"],
    auditAction: "therapist_visit_canceled",
    buttonLabel: "Mark canceled",
    helper: "Cancel this fake/test visit workflow.",
    nextStatus: "canceled",
  },
] as const;

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
    manualOnly: true,
    noPhiMode: true,
    smsSendingEnabled: false,
    source: "deterministic",
    travelTimeApisEnabled: false,
  };
}
