import { getOperationsAssistantStatus } from "./operations-assistant.ts";

export type OperationsAssistantPriority = "info" | "warning" | "blocker";
export type OperationsAssistantCard = Readonly<{
  explanation: string;
  label: string;
  nextAction: string;
  priority: OperationsAssistantPriority;
  source: "deterministic" | "mock";
}>;

export type ReferralAssistantInput = Readonly<{
  assignedTherapistId?: string | null;
  noteClassification?: string | null;
  smsConsentStatus?: string | null;
  status: string;
  upcomingVisitCount: number;
}>;

export type VisitAssistantInput = Readonly<{
  noteClassification?: string | null;
  referralStatus: string;
  scheduledAt?: Date | string | null;
  status: string;
  therapistId?: string | null;
}>;

export type QueueAssistantInput = Readonly<{
  contactedNotScheduled: number;
  newReferrals: number;
  optedOutContacts: number;
  pastScheduledVisits: number;
  scheduledVisitsNextSevenDays: number;
  smokeTestRecords: number;
  unassignedReferrals: number;
}>;

export type TherapistAssistantInput = Readonly<{
  inProgressVisits: number;
  needsContact: number;
  readyToSchedule: number;
  recentlyCompleted: number;
  upcomingVisits: number;
}>;

function card(label: string, priority: OperationsAssistantPriority, explanation: string, nextAction: string): OperationsAssistantCard {
  return {
    explanation,
    label,
    nextAction,
    priority,
    source: "deterministic",
  };
}

function hasBlockedNote(classification?: string | null) {
  return classification === "phi_like_or_clinical" || classification === "sms_forbidden";
}

export function getOperationsAssistantV2Status() {
  const status = getOperationsAssistantStatus();
  return {
    ...status,
    autonomousActionsEnabled: false,
    externalApiCallsEnabled: false,
    providerLabel: "mock / deterministic",
    versionLabel: "Operations Assistant V2",
  };
}

export function getReferralAssistantCards(input: ReferralAssistantInput): OperationsAssistantCard[] {
  const cards: OperationsAssistantCard[] = [];

  if (input.status === "new") {
    cards.push(card("Needs first contact", "warning", "This referral is still at the first workflow step.", "Contact through approved operational workflow and document only scheduling context."));
  }

  if (input.status === "contacted" && input.upcomingVisitCount === 0) {
    cards.push(card("Ready to schedule", "info", "The referral has been contacted and has no upcoming visit.", "Review scheduling readiness and create a visit when operational details are complete."));
  }

  if (!input.assignedTherapistId && !["completed", "canceled"].includes(input.status)) {
    cards.push(card("Therapist assignment missing", "warning", "This active workflow has no therapist assigned.", "Assign an active therapist before scheduling or moving field work forward."));
  }

  if (input.smsConsentStatus === "pending_confirmation") {
    cards.push(card("Consent pending", "warning", "SMS consent is not active yet.", "Use non-SMS follow-up until consent is active."));
  }

  if (input.smsConsentStatus === "opted_out") {
    cards.push(card("Opted out - do not text", "blocker", "This contact is opted out of SMS.", "Use non-SMS operational follow-up only."));
  }

  if (input.status === "scheduled") {
    cards.push(card("Scheduled - monitor visit", "info", "A visit workflow is scheduled.", "Monitor the upcoming visit and update status after the visit window."));
  }

  if (input.status === "active") {
    cards.push(card("Active - check follow-up readiness", "info", "This workflow is active.", "Confirm whether the current visit should be completed or followed by another scheduled visit."));
  }

  if (input.status === "completed" || input.status === "canceled") {
    cards.push(card("Completed/canceled - archive eligible", "info", "This fake workflow is in a terminal status.", "Review audit history and use Data Stewardship archive when appropriate."));
  }

  if (hasBlockedNote(input.noteClassification)) {
    cards.push(card("Operational note needs rewrite", "blocker", "A blocked note classification is present.", "Use the suggested operational rewrite and keep restricted details out of this field."));
  }

  return cards.length > 0 ? cards : [card("No immediate assistant signal", "info", "No deterministic risk signal was detected.", "Continue normal operational review.")];
}

export function getVisitAssistantCards(input: VisitAssistantInput, now: Date = new Date()): OperationsAssistantCard[] {
  const cards: OperationsAssistantCard[] = [];
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const isPastScheduled = Boolean(scheduledAt && scheduledAt < now && ["scheduled", "in_progress"].includes(input.status));

  if (input.status === "scheduled" && !isPastScheduled) {
    cards.push(card("Upcoming visit", "info", "This visit is scheduled.", "Monitor readiness and update status after the visit window."));
  }

  if (isPastScheduled) {
    cards.push(card("Past scheduled visit needs status update", "warning", "The scheduled time has passed while the visit remains open.", "Update the visit status to completed, no-show, canceled, or rescheduled as appropriate."));
  }

  if (input.status === "in_progress") {
    cards.push(card("In progress - complete or reschedule if needed", "warning", "This visit is still in progress.", "Complete the visit or reschedule the operational workflow if needed."));
  }

  if (input.status === "no_show" || input.status === "canceled") {
    cards.push(card("No show/canceled - review operational workflow", "warning", "The visit did not proceed as scheduled.", "Review whether follow-up scheduling is needed."));
  }

  if (input.status === "completed") {
    cards.push(card("Completed - no action unless follow-up is needed", "info", "This visit is completed.", "Review whether the referral workflow needs a follow-up visit."));
  }

  if (!input.therapistId && !["completed", "canceled", "no_show"].includes(input.status)) {
    cards.push(card("Therapist assignment missing", "warning", "This open visit has no assigned therapist.", "Assign an active therapist before field workflow."));
  }

  if (input.referralStatus === "canceled") {
    cards.push(card("Referral canceled", "blocker", "The parent referral is canceled.", "Do not advance this visit unless the referral workflow is intentionally reopened."));
  }

  if (hasBlockedNote(input.noteClassification)) {
    cards.push(card("Operational note needs rewrite", "blocker", "A blocked note classification is present.", "Use the suggested operational rewrite and keep restricted details out of this field."));
  }

  return cards.length > 0 ? cards : [card("No immediate assistant signal", "info", "No deterministic risk signal was detected.", "Continue normal operational review.")];
}

export function getQueueAssistantCards(input: QueueAssistantInput): OperationsAssistantCard[] {
  const cards: OperationsAssistantCard[] = [];

  if (input.newReferrals > 0) cards.push(card("New referrals waiting", "warning", `${input.newReferrals} referral${input.newReferrals === 1 ? " is" : "s are"} waiting for first contact.`, "Prioritize first contact and assignment review."));
  if (input.contactedNotScheduled > 0) cards.push(card("Contacted referrals not scheduled", "warning", `${input.contactedNotScheduled} contacted referral${input.contactedNotScheduled === 1 ? " has" : "s have"} no upcoming visit.`, "Review scheduling readiness and create visits where appropriate."));
  if (input.scheduledVisitsNextSevenDays > 0) cards.push(card("Scheduled visits in next 7 days", "info", `${input.scheduledVisitsNextSevenDays} visit${input.scheduledVisitsNextSevenDays === 1 ? " is" : "s are"} scheduled soon.`, "Monitor readiness and therapist assignment."));
  if (input.pastScheduledVisits > 0) cards.push(card("Past scheduled visits need update", "warning", `${input.pastScheduledVisits} visit${input.pastScheduledVisits === 1 ? " is" : "s are"} past scheduled time and still open.`, "Update visit status or reschedule operationally."));
  if (input.optedOutContacts > 0) cards.push(card("Opted-out contacts should not receive SMS", "blocker", `${input.optedOutContacts} contact${input.optedOutContacts === 1 ? " is" : "s are"} opted out.`, "Use non-SMS operational follow-up only."));
  if (input.unassignedReferrals > 0) cards.push(card("Unassigned referrals", "warning", `${input.unassignedReferrals} referral${input.unassignedReferrals === 1 ? " has" : "s have"} no therapist assignment.`, "Assign therapists before scheduling field work."));
  if (input.smokeTestRecords > 0) cards.push(card("Smoke/test data present", "info", `${input.smokeTestRecords} explicit smoke/test operational record${input.smokeTestRecords === 1 ? " is" : "s are"} present.`, "Use Data Stewardship archive when cleanup is needed."));

  return cards.length > 0 ? cards : [card("Queue looks steady", "info", "No deterministic queue risk signal was detected.", "Continue normal operational review.")];
}

export function getTherapistAssistantCards(input: TherapistAssistantInput): OperationsAssistantCard[] {
  const cards: OperationsAssistantCard[] = [];

  if (input.needsContact > 0) cards.push(card("Your next best operational step", "warning", `${input.needsContact} assigned referral${input.needsContact === 1 ? " needs" : "s need"} first contact.`, "Start with first-contact workflow and keep notes operational."));
  if (input.readyToSchedule > 0) cards.push(card("Ready to schedule", "info", `${input.readyToSchedule} assigned referral${input.readyToSchedule === 1 ? " is" : "s are"} ready for scheduling review.`, "Flag scheduling readiness for admin if no visit exists."));
  if (input.upcomingVisits > 0) cards.push(card("Upcoming visit", "info", `${input.upcomingVisits} assigned visit${input.upcomingVisits === 1 ? " is" : "s are"} scheduled or open.`, "Review timing and update status after the visit window."));
  if (input.inProgressVisits > 0) cards.push(card("In progress", "warning", `${input.inProgressVisits} assigned visit${input.inProgressVisits === 1 ? " is" : "s are"} in progress.`, "Complete or update operational status when finished."));
  if (input.recentlyCompleted > 0) cards.push(card("Completed recently", "info", `${input.recentlyCompleted} assigned item${input.recentlyCompleted === 1 ? " was" : "s were"} completed recently.`, "Review whether any follow-up scheduling is needed."));

  return cards.length > 0 ? cards : [card("Your next best operational step", "info", "No assigned urgent workflow signal was detected.", "Continue normal worklist review.")];
}
