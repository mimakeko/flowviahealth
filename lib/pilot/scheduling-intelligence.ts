import {
  FLOWVIA_OPERATIONS_TIME_ZONE,
  formatOperationsDateTimeLocalInput,
  parseOperationsDateTimeLocal,
} from "./time.ts";
import { recommendTherapists, type TherapistFitLevel } from "./therapist-recommendation.ts";

export type SchedulingPriority = "info" | "caution" | "blocker";
export type TherapistFitLabel = TherapistFitLevel;
export type SchedulingReadiness = "ready_to_schedule" | "needs_contact" | "needs_assignment" | "already_scheduled" | "blocked" | "archive_candidate";
export type ConflictLevel = "none" | "caution" | "blocker";

export type SchedulingCard = Readonly<{
  explanation: string;
  label: string;
  level: SchedulingPriority;
  nextAction: string;
  source: "deterministic";
}>;

export type TherapistFitInput = Readonly<{
  acceptedUnscheduledCount?: number;
  active: boolean;
  careType?: string | null;
  currentOpenVisitCount: number;
  hasOpenVisit?: boolean;
  intakeReadiness?: "ready" | "needs_review" | "blocked" | "unknown";
  knownConflictCount?: number;
  referralCity?: string | null;
  referralStatus?: string;
  referralZip?: string | null;
  reviewedWindowProvided?: boolean;
  serviceAreaNotes?: string | null;
  therapistId?: string | null;
  therapistName?: string | null;
}>;

export type TherapistFitResult = Readonly<{
  eligible: boolean;
  explanation: string;
  fitLabel: string;
  label: TherapistFitLabel;
  reason: string;
  score: number;
  uncertainty: "low" | "medium" | "high";
}>;

export type ScheduledVisitForConflict = Readonly<{
  id?: string;
  scheduledAt: Date | string | null;
  status: string;
}>;

export type VisitConflictInput = Readonly<{
  candidateVisitId?: string | null;
  candidateScheduledAt?: Date | string | null;
  durationMinutes?: number;
  referralStatus: string;
  scheduledVisits: readonly ScheduledVisitForConflict[];
  therapistActive: boolean;
  therapistId?: string | null;
}>;

export type VisitConflictResult = Readonly<{
  cards: SchedulingCard[];
  level: ConflictLevel;
}>;

export type SchedulingReadinessInput = Readonly<{
  assignedTherapistId?: string | null;
  futureVisitCount: number;
  referralStatus: string;
  smsConsentStatus?: string | null;
}>;

export type SchedulingReadinessResult = Readonly<{
  cards: SchedulingCard[];
  nextAction: string;
  readiness: SchedulingReadiness;
}>;

export type SuggestedWindowInput = Readonly<{
  candidateStart?: Date;
  durationMinutes?: number;
  scheduledVisits: readonly ScheduledVisitForConflict[];
}>;

export type SchedulingWindowActionPolicy = Readonly<{
  action: "fill_datetime_field_only";
  autonomousSchedulingEnabled: false;
  createsVisit: false;
  fieldName: "scheduledAt";
  requiresManualSubmit: true;
  sendsSms: false;
}>;

export type SchedulingQueueInput = Readonly<{
  archiveCandidates: number;
  capacityCautions: number;
  conflicts: number;
  contactedWithoutFutureVisit: number;
  intakeReviewNeeded?: number;
  optedOutContacts: number;
  possibleDuplicates?: number;
  readyToSchedule: number;
  unassignedReferrals: number;
  upcomingNextSevenDays: number;
}>;

export type SuggestedSchedulingWindow = Readonly<{
  businessDayKey: string;
  label: string;
  localInputValue: string;
  scheduledAt: Date;
  source: "deterministic";
}>;

const SUGGESTED_HOURS = [9, 11, 13, 15] as const;
const DEFAULT_DURATION_MINUTES = 60;
const CONFLICT_WINDOW_MINUTES = 90;
const SUGGESTED_BUSINESS_DAYS = 5;

function card(label: string, level: SchedulingPriority, explanation: string, nextAction: string): SchedulingCard {
  return { explanation, label, level, nextAction, source: "deterministic" };
}

export function getNeutralSchedulingGuidanceCards(): SchedulingCard[] {
  return [
    card(
      "Select referral",
      "info",
      "Select a referral to see readiness, therapist fit, and suggested business-day windows.",
      "Choose a referral in the manual form below. Nothing is created until you submit.",
    ),
  ];
}

export function getSchedulingWindowActionPolicy(): SchedulingWindowActionPolicy {
  return {
    action: "fill_datetime_field_only",
    autonomousSchedulingEnabled: false,
    createsVisit: false,
    fieldName: "scheduledAt",
    requiresManualSubmit: true,
    sendsSms: false,
  };
}

function maxConflictLevel(cards: readonly SchedulingCard[]): ConflictLevel {
  if (cards.some((item) => item.level === "blocker")) return "blocker";
  if (cards.some((item) => item.level === "caution")) return "caution";
  return "none";
}

function isOpenVisitStatus(status: string) {
  return status === "scheduled" || status === "in_progress";
}

function isTerminalReferralStatus(status: string) {
  return status === "completed" || status === "canceled";
}

function overlapsKnownVisit(candidate: Date, existing: ScheduledVisitForConflict, durationMinutes: number) {
  if (!existing.scheduledAt || !isOpenVisitStatus(existing.status)) return false;
  const existingDate = new Date(existing.scheduledAt);
  const minutesBetween = Math.abs(candidate.getTime() - existingDate.getTime()) / 60000;
  return minutesBetween < Math.max(CONFLICT_WINDOW_MINUTES, durationMinutes);
}

export function getTherapistFit(input: TherapistFitInput): TherapistFitResult {
  const recommendation = recommendTherapists({
    careType: input.careType,
    city: input.referralCity,
    hasOpenVisit: input.hasOpenVisit,
    intakeReadiness: input.intakeReadiness,
    referralStatus: input.referralStatus || "contacted",
    reviewedWindowProvided: input.reviewedWindowProvided,
    zip: input.referralZip,
  }, [{
    acceptedUnscheduledCount: input.acceptedUnscheduledCount,
    active: Boolean(input.therapistName) && input.active,
    id: input.therapistId || input.therapistName || "unassigned",
    knownConflictCount: input.knownConflictCount,
    name: input.therapistName || "Unassigned",
    openVisitCount: input.currentOpenVisitCount,
    serviceAreaNotes: input.serviceAreaNotes,
  }])[0];

  const reason = recommendation.eligibility.reasons[0] || recommendation.explanation[0] || "Insufficient information";
  return {
    eligible: recommendation.eligibility.eligible,
    explanation: [...recommendation.explanation, ...recommendation.uncertainty.reasons].join(". "),
    fitLabel: recommendation.eligibility.eligible ? recommendation.fitLabel : "Not Eligible",
    label: recommendation.fitLevel,
    reason,
    score: recommendation.score,
    uncertainty: recommendation.uncertainty.level,
  };
}

export function getSchedulingReadiness(input: SchedulingReadinessInput): SchedulingReadinessResult {
  const cards: SchedulingCard[] = [];

  if (isTerminalReferralStatus(input.referralStatus)) {
    return {
      cards: [card("Archive candidate", "info", "This fake referral is completed or canceled.", "Review audit history and archive through Data Stewardship when appropriate.")],
      nextAction: "Review and archive if appropriate.",
      readiness: "archive_candidate",
    };
  }

  if (input.referralStatus === "new") {
    cards.push(card("Needs contact", "caution", "This referral has not been contacted yet.", "Complete first-contact workflow before scheduling."));
    return { cards, nextAction: "Contact before scheduling.", readiness: "needs_contact" };
  }

  if (!input.assignedTherapistId) {
    cards.push(card("Needs therapist assignment", "caution", "This referral has no assigned therapist.", "Assign a therapist before creating a visit."));
    return { cards, nextAction: "Assign therapist before scheduling.", readiness: "needs_assignment" };
  }

  if (input.futureVisitCount > 0) {
    cards.push(card("Already scheduled", "info", "This referral already has an upcoming/open visit.", "Monitor the existing visit before creating another."));
    return { cards, nextAction: "Monitor existing visit.", readiness: "already_scheduled" };
  }

  if (input.smsConsentStatus === "opted_out") {
    cards.push(card("Opted out - non-SMS follow-up", "blocker", "This contact is opted out of SMS.", "Use non-SMS operational follow-up only."));
    return { cards, nextAction: "Use non-SMS operational follow-up only.", readiness: "blocked" };
  } else if (input.smsConsentStatus === "pending_confirmation") {
    cards.push(card("Consent pending", "caution", "SMS consent is pending confirmation.", "Use non-SMS follow-up until consent is active."));
  }

  cards.push(card("Intake ready", "info", "This referral is contacted or active, assigned, and has no future visit.", "Review suggested windows and create a visit manually only when therapist opportunity acceptance and other gates allow it."));
  return { cards, nextAction: "Review suggested windows and confirm visit-creation readiness manually.", readiness: "ready_to_schedule" };
}

export function detectVisitConflicts(input: VisitConflictInput, now: Date = new Date()): VisitConflictResult {
  const cards: SchedulingCard[] = [];
  const durationMinutes = input.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const candidate = input.candidateScheduledAt ? new Date(input.candidateScheduledAt) : null;

  if (!input.therapistId) {
    cards.push(card("Therapist not selected", "caution", "Conflict checks are limited until a therapist is selected.", "Select a therapist before confirming the visit."));
  }

  if (!input.therapistActive) {
    cards.push(card("Inactive therapist", "blocker", "The selected therapist is inactive.", "Choose an active therapist before scheduling."));
  }

  if (candidate && candidate < now) {
    cards.push(card("Past scheduled visit needs status update", "caution", "This visit time is in the past while the workflow is still open.", "Update visit status or select a future operational window."));
  }

  if (isTerminalReferralStatus(input.referralStatus)) {
    cards.push(card("Referral status incompatible", "blocker", "The parent referral is completed or canceled.", "Do not schedule unless the referral is intentionally reopened."));
  }

  if (candidate) {
    const conflictingVisits = input.scheduledVisits.filter((visit) => visit.id !== input.candidateVisitId && overlapsKnownVisit(candidate, visit, durationMinutes));
    if (conflictingVisits.length > 0) {
      cards.push(card("Therapist schedule conflict", "caution", `${conflictingVisits.length} open visit conflicts within ${CONFLICT_WINDOW_MINUTES} minutes.`, "Pick another deterministic window or review the existing visit manually."));
    }
  }

  return {
    cards,
    level: maxConflictLevel(cards),
  };
}

function zonedDateKey(date: Date) {
  const value = formatOperationsDateTimeLocalInput(date);
  return value.slice(0, 10);
}

function weekdayInOperationsZone(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: FLOWVIA_OPERATIONS_TIME_ZONE,
    weekday: "short",
  }).format(date);
}

function formatSuggestedWindowLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: FLOWVIA_OPERATIONS_TIME_ZONE,
    weekday: "short",
    year: "numeric",
  }).format(date);
}

function isBusinessDayInOperationsZone(date: Date) {
  const weekday = weekdayInOperationsZone(date);
  return weekday !== "Sat" && weekday !== "Sun";
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function getSuggestedSchedulingWindows(input: SuggestedWindowInput, now: Date = new Date()): SuggestedSchedulingWindow[] {
  const windows: SuggestedSchedulingWindow[] = [];
  const durationMinutes = input.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  let dayCursor = input.candidateStart ?? now;
  let businessDaysChecked = 0;
  let calendarDaysChecked = 0;

  while (businessDaysChecked < SUGGESTED_BUSINESS_DAYS && calendarDaysChecked < 14) {
    dayCursor = addDays(dayCursor, 1);
    calendarDaysChecked += 1;

    if (!isBusinessDayInOperationsZone(dayCursor)) continue;

    const dateKey = zonedDateKey(dayCursor);
    businessDaysChecked += 1;

    for (const hour of SUGGESTED_HOURS) {
      const localInputValue = `${dateKey}T${String(hour).padStart(2, "0")}:00`;
      const scheduledAt = parseOperationsDateTimeLocal(localInputValue);
      if (!scheduledAt || scheduledAt <= now) continue;
      const hasConflict = input.scheduledVisits.some((visit) => overlapsKnownVisit(scheduledAt, visit, durationMinutes));
      if (hasConflict) continue;

      windows.push({
        businessDayKey: dateKey,
        label: formatSuggestedWindowLabel(scheduledAt),
        localInputValue,
        scheduledAt,
        source: "deterministic",
      });
    }
  }

  return windows;
}

export function getSchedulingQueueCards(input: SchedulingQueueInput): SchedulingCard[] {
  const cards: SchedulingCard[] = [];

  if ((input.possibleDuplicates ?? 0) > 0) cards.push(card("Possible duplicate referrals", "caution", `${input.possibleDuplicates} referral${input.possibleDuplicates === 1 ? " has" : "s have"} deterministic local duplicate warnings.`, "Review safe duplicate signals before scheduling."));
  if ((input.intakeReviewNeeded ?? 0) > 0) cards.push(card("Needs intake review", "caution", `${input.intakeReviewNeeded} referral${input.intakeReviewNeeded === 1 ? " needs" : "s need"} intake checklist review before scheduling.`, "Complete missing contact, location, service area, assignment, and duplicate review steps."));
  if (input.readyToSchedule > 0) cards.push(card("Referrals ready for scheduling review", "info", `${input.readyToSchedule} referral${input.readyToSchedule === 1 ? " is" : "s are"} intake-ready and waiting for scheduling review.`, "Open the referral, confirm therapist opportunity state, and create a visit only when manual gates pass."));
  if (input.unassignedReferrals > 0) cards.push(card("Missing therapist assignment", "caution", `${input.unassignedReferrals} active referral${input.unassignedReferrals === 1 ? " has" : "s have"} no assigned therapist.`, "Assign a therapist before scheduling."));
  if (input.contactedWithoutFutureVisit > 0) cards.push(card("Contacted without future visit", "caution", `${input.contactedWithoutFutureVisit} contacted referral${input.contactedWithoutFutureVisit === 1 ? " has" : "s have"} no future visit.`, "Review scheduling readiness."));
  if (input.optedOutContacts > 0) cards.push(card("Opted-out non-SMS follow-up", "blocker", `${input.optedOutContacts} SMS enrollment${input.optedOutContacts === 1 ? " is" : "s are"} opted out.`, "Use non-SMS operational follow-up only."));
  if (input.conflicts > 0) cards.push(card("Schedule conflicts", "caution", `${input.conflicts} visit${input.conflicts === 1 ? " has" : "s have"} a deterministic conflict or status warning.`, "Review visit status, time, and therapist assignment."));
  if (input.upcomingNextSevenDays > 0) cards.push(card("Upcoming next 7 days", "info", `${input.upcomingNextSevenDays} visit${input.upcomingNextSevenDays === 1 ? " is" : "s are"} scheduled soon.`, "Monitor readiness and status updates."));
  if (input.capacityCautions > 0) cards.push(card("Therapist capacity caution", "caution", `${input.capacityCautions} therapist${input.capacityCautions === 1 ? " has" : "s have"} several open visits.`, "Review workload before assigning more visits."));
  if (input.archiveCandidates > 0) cards.push(card("Archive candidates", "info", `${input.archiveCandidates} completed/canceled referral${input.archiveCandidates === 1 ? " is" : "s are"} eligible for stewardship archive review.`, "Use Data Stewardship after audit review."));

  return cards.length > 0 ? cards : [card("Scheduling queue steady", "info", "No deterministic scheduling risk was detected.", "Continue normal operational review.")];
}

export function getSchedulingIntelligenceStatus() {
  return {
    autonomousSchedulingEnabled: false,
    enabled: true,
    externalAiEnabled: false,
    externalApisEnabled: false,
    geocodingEnabled: false,
    noPhiMode: true,
    suggestedBusinessDays: SUGGESTED_BUSINESS_DAYS,
    suggestedSlotsLocal: SUGGESTED_HOURS.map((hour) => `${String(hour).padStart(2, "0")}:00`),
    source: "deterministic",
    travelTimeApisEnabled: false,
    timeZone: FLOWVIA_OPERATIONS_TIME_ZONE,
  };
}
