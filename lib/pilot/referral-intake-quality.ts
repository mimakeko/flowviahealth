import { hasBlockedNoteClassification, type NoteClassificationResult } from "../compliance/note-classification.ts";
import { isArchivedOperationalRecord, isSmokeTestOperationalRecord } from "./data-stewardship.ts";
import { normalizeE164Phone, redactPhone } from "../sms/compliance.ts";

export type ReferralIntakeReadinessLevel = "ready" | "needs_review" | "blocked";
export type ReferralDuplicateScore = "high" | "medium" | "low";

export type ReferralIntakeWarningCode =
  | "missing_therapist_assignment"
  | "missing_phone"
  | "missing_city"
  | "missing_zip"
  | "missing_service_area"
  | "terminal_referral"
  | "opted_out_contact"
  | "possible_duplicate"
  | "missing_scheduling_readiness"
  | "unsafe_note_content";

export type ReferralDuplicateCandidate = Readonly<{
  createdAt?: Date | string | null;
  id: string;
  reasons: string[];
  score: ReferralDuplicateScore;
  status: string;
  therapistLabel: string;
}>;

export type ReferralIntakeDuplicateSource = Readonly<{
  assignedTherapistId?: string | null;
  assignedTherapistName?: string | null;
  city?: string | null;
  createdAt?: Date | string | null;
  futureOpenVisitCount?: number;
  id: string;
  patientName?: string | null;
  phone?: string | null;
  status: string;
  zip?: string | null;
}>;

export type ReferralIntakeInput = Readonly<{
  assignedTherapistId?: string | null;
  assignedTherapistName?: string | null;
  careType?: string | null;
  city?: string | null;
  duplicateCandidates?: readonly ReferralDuplicateCandidate[];
  noteClassification?: NoteClassificationResult | null;
  patientName?: string | null;
  phone?: string | null;
  smsConsentStatus?: string | null;
  status: string;
  zip?: string | null;
}>;

export type ReferralIntakeChecklist = Readonly<{
  hasAssignedTherapist: boolean;
  hasKnownSmsConsentStatus: boolean;
  hasNonTerminalStatus: boolean;
  hasNoDuplicateReviewWarning: boolean;
  hasRequiredContact: boolean;
  hasServiceArea: boolean;
  hasUsableLocation: boolean;
  statusIsScheduleReady: boolean;
}>;

export type ReferralIntakeQualityResult = Readonly<{
  checklist: ReferralIntakeChecklist;
  duplicateCandidates: readonly ReferralDuplicateCandidate[];
  duplicateReviewRequired: boolean;
  readinessLevel: ReferralIntakeReadinessLevel;
  readinessLabel: string;
  safeDisplay: {
    city: string;
    maskedPhone: string;
    referralStatus: string;
    therapistLabel: string;
    zip: string;
  };
  schedulingReady: boolean;
  warnings: readonly {
    code: ReferralIntakeWarningCode;
    label: string;
    level: "info" | "warning" | "blocker";
    nextAction: string;
  }[];
}>;

type ReferralIntakeWarning = ReferralIntakeQualityResult["warnings"][number];

export type CreateVisitGateSeverity = "info" | "caution" | "blocker";

export type CreateVisitGateInput = ReferralIntakeInput & Readonly<{
  activeWorkflowVisible?: boolean;
  futureVisitCount?: number;
  intakeQuality?: ReferralIntakeQualityResult;
  notes?: string | null;
  referralSource?: string | null;
}>;

export type CreateVisitGateResult = Readonly<{
  allowed: boolean;
  reasons: readonly string[];
  severity: CreateVisitGateSeverity;
}>;

export function getReferralIntakeQualityStatus() {
  return {
    autoAssignmentEnabled: false,
    autoVisitCreationEnabled: false,
    duplicateGuardEnabled: true,
    duplicateGuardMode: "warning-only",
    duplicateSource: "deterministic/local data",
    enabled: true,
    externalDuplicateApisEnabled: false,
    fullPhoneDisplayEnabled: false,
    guidedVisitCreationEnabled: true,
    intakePhiStorageEnabled: false,
    manualVisitCreateSubmitRequired: true,
    referralDetailCreateCtaGateEnabled: true,
    referralDetailDecisionWorkspaceEnabled: true,
    referralDetailReviewOnlyBlocksEnabled: true,
    referralDetailSafetyGuaranteesEnabled: true,
    schedulingReadyGateEnabled: true,
    schedulingReadyGateSource: "deterministic referral intake quality",
    visitCreateBlockedAuditEnabled: true,
    visitCreateBrowserSmokeCoverageEnabled: true,
    visitCreateMapsGeocodingTravelTimeEnabled: false,
    visitCreateReadyGateEnforced: true,
    visitCreateSmsSendingEnabled: false,
    smsSendingEnabled: false,
    source: "deterministic",
  };
}

function normalizedText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizedLabel(value: string | null | undefined) {
  return normalizedText(value).replace(/[^a-z0-9]/g, "");
}

function normalizedZip(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "").slice(0, 5);
}

function isTerminalReferralStatus(status: string) {
  return status === "completed" || status === "canceled";
}

function isScheduleReadyStatus(status: string) {
  return status === "contacted" || status === "active";
}

function closeCreationWindow(left: Date | string | null | undefined, right: Date | string | null | undefined) {
  if (!left || !right) return false;
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return false;
  return Math.abs(leftTime - rightTime) <= 14 * 24 * 60 * 60 * 1000;
}

function scoreRank(score: ReferralDuplicateScore) {
  if (score === "high") return 3;
  if (score === "medium") return 2;
  return 1;
}

function candidateScore(reasons: readonly string[]): ReferralDuplicateScore {
  if (reasons.some((reason) => reason.includes("phone") || reason.includes("same active label"))) return "high";
  if (reasons.length >= 2) return "medium";
  return "low";
}

function warning(code: ReferralIntakeWarningCode, label: string, level: "info" | "warning" | "blocker", nextAction: string) {
  return { code, label, level, nextAction };
}

export function getReferralDuplicateCandidates(input: {
  draft: ReferralIntakeDuplicateSource;
  sources: readonly ReferralIntakeDuplicateSource[];
}) {
  const draftPhone = normalizeE164Phone(input.draft.phone || "");
  const draftLabel = normalizedLabel(input.draft.patientName);
  const draftCity = normalizedText(input.draft.city);
  const draftZip = normalizedZip(input.draft.zip);
  const draftTherapistId = input.draft.assignedTherapistId || null;

  return input.sources
    .filter((source) => source.id !== input.draft.id)
    .map((source): ReferralDuplicateCandidate | null => {
      const reasons: string[] = [];
      const sourcePhone = normalizeE164Phone(source.phone || "");
      const sourceLabel = normalizedLabel(source.patientName);
      const sameCityZip = Boolean(draftCity && draftZip && normalizedText(source.city) === draftCity && normalizedZip(source.zip) === draftZip);
      const activeSource = !isTerminalReferralStatus(source.status);

      if (draftPhone && sourcePhone && draftPhone === sourcePhone) reasons.push("same masked phone");
      if (draftLabel && sourceLabel && draftLabel === sourceLabel && activeSource) reasons.push("same active label");
      if (sameCityZip && draftLabel && sourceLabel && (draftLabel.includes(sourceLabel) || sourceLabel.includes(draftLabel))) reasons.push("same city/ZIP with similar label");
      if (sameCityZip && draftTherapistId && source.assignedTherapistId === draftTherapistId && closeCreationWindow(input.draft.createdAt, source.createdAt)) reasons.push("same therapist and city/ZIP in close intake window");
      if ((source.futureOpenVisitCount || 0) > 0 && reasons.length > 0) reasons.push("existing open/future visit on possible match");

      if (reasons.length === 0) return null;

      return {
        createdAt: source.createdAt,
        id: source.id,
        reasons,
        score: candidateScore(reasons),
        status: source.status,
        therapistLabel: source.assignedTherapistName || "Unassigned",
      };
    })
    .filter((candidate): candidate is ReferralDuplicateCandidate => Boolean(candidate))
    .sort((left, right) => scoreRank(right.score) - scoreRank(left.score))
    .slice(0, 5);
}

export function evaluateReferralIntakeQuality(input: ReferralIntakeInput): ReferralIntakeQualityResult {
  const duplicateCandidates = input.duplicateCandidates || [];
  const duplicateReviewRequired = duplicateCandidates.some((candidate) => candidate.score === "high" || candidate.score === "medium");
  const checklist: ReferralIntakeChecklist = {
    hasAssignedTherapist: Boolean(input.assignedTherapistId),
    hasKnownSmsConsentStatus: Boolean(input.smsConsentStatus && input.smsConsentStatus !== "none"),
    hasNonTerminalStatus: !isTerminalReferralStatus(input.status),
    hasNoDuplicateReviewWarning: !duplicateReviewRequired,
    hasRequiredContact: Boolean(normalizeE164Phone(input.phone || "")),
    hasServiceArea: Boolean(normalizedText(input.careType)),
    hasUsableLocation: Boolean(normalizedText(input.city) && normalizedZip(input.zip)),
    statusIsScheduleReady: isScheduleReadyStatus(input.status),
  };
  const warnings: ReferralIntakeWarning[] = [];

  if (!checklist.hasAssignedTherapist) warnings.push(warning("missing_therapist_assignment", "Missing therapist assignment", "warning", "Assign an active therapist before scheduling."));
  if (!checklist.hasRequiredContact) warnings.push(warning("missing_phone", "Missing usable phone", "warning", "Add a fake/pilot contact phone before intake is ready."));
  if (!normalizedText(input.city)) warnings.push(warning("missing_city", "Missing city", "warning", "Add a fake target city for deterministic scheduling review."));
  if (!normalizedZip(input.zip)) warnings.push(warning("missing_zip", "Missing ZIP/postal code", "warning", "Add a fake ZIP/postal code for deterministic scheduling review."));
  if (!checklist.hasServiceArea) warnings.push(warning("missing_service_area", "Missing service area/workflow type", "warning", "Add operational service-area or workflow text."));
  if (!checklist.hasNonTerminalStatus) warnings.push(warning("terminal_referral", "Canceled/completed referral", "blocker", "Review audit history before reopening or scheduling."));
  if (input.smsConsentStatus === "opted_out") warnings.push(warning("opted_out_contact", "Opted out - non-SMS follow-up only", "warning", "Do not text. Use non-SMS operational follow-up only."));
  if (duplicateCandidates.length > 0) warnings.push(warning("possible_duplicate", "Possible duplicate - review before continuing", duplicateReviewRequired ? "warning" : "info", "Compare safe labels and audit history before creating or scheduling."));
  if (!checklist.statusIsScheduleReady || !checklist.hasAssignedTherapist || !checklist.hasUsableLocation || !checklist.hasNoDuplicateReviewWarning) {
    warnings.push(warning("missing_scheduling_readiness", "Needs scheduling readiness review", "warning", "Complete intake checklist before using the visit creation flow."));
  }
  if (input.noteClassification && hasBlockedNoteClassification(input.noteClassification)) {
    warnings.push(warning("unsafe_note_content", "Unsafe note content blocked", "blocker", "Rewrite the note with operational scheduling/access/status wording only."));
  }

  const blocked = warnings.some((item) => item.level === "blocker");
  const schedulingReady = Object.entries(checklist)
    .filter(([key]) => key !== "hasKnownSmsConsentStatus")
    .every(([, value]) => value);
  const readinessLevel: ReferralIntakeReadinessLevel = blocked ? "blocked" : schedulingReady && warnings.every((item) => item.level !== "warning") ? "ready" : "needs_review";

  return {
    checklist,
    duplicateCandidates,
    duplicateReviewRequired,
    readinessLevel,
    readinessLabel: readinessLevel === "ready" ? "Ready for scheduling" : readinessLevel === "blocked" ? "Blocked" : "Needs intake review",
    safeDisplay: {
      city: input.city || "Not provided",
      maskedPhone: redactPhone(input.phone || ""),
      referralStatus: input.status,
      therapistLabel: input.assignedTherapistName || "Unassigned",
      zip: input.zip || "Not provided",
    },
    schedulingReady,
    warnings,
  };
}

function gateReasonLabels(input: {
  futureVisitCount: number;
  input: CreateVisitGateInput;
  intakeQuality: ReferralIntakeQualityResult;
}) {
  const reasons: string[] = [];
  const quality = input.intakeQuality;
  const checklist = quality.checklist;

  if (input.input.activeWorkflowVisible === false) reasons.push("Not in active workflow queue");
  if (isArchivedOperationalRecord(input.input)) reasons.push("Archived operational record");
  if (isSmokeTestOperationalRecord(input.input)) reasons.push("Smoke/test operational record");
  if (!checklist.hasAssignedTherapist) reasons.push("Missing therapist");
  if (!checklist.hasRequiredContact) reasons.push("Missing usable fake/pilot phone");
  if (!normalizedText(input.input.city)) reasons.push("Missing city");
  if (!normalizedZip(input.input.zip)) reasons.push("Missing ZIP");
  if (!checklist.hasServiceArea) reasons.push("Missing service area/workflow type");
  if (!checklist.hasNonTerminalStatus) reasons.push("Terminal referral");
  if (!checklist.statusIsScheduleReady) reasons.push("Needs contacted/active status");
  if (input.futureVisitCount > 0) reasons.push("Existing open/future visit");
  if (quality.duplicateReviewRequired || quality.duplicateCandidates.length > 0) reasons.push("Duplicate review");
  if (input.input.smsConsentStatus === "opted_out") reasons.push("Non-SMS only");
  if (quality.readinessLevel !== "ready" || !quality.schedulingReady) reasons.push("Needs intake review");
  if (quality.warnings.some((item) => item.level === "blocker")) reasons.push("Blocked intake warning");

  return [...new Set(reasons)];
}

export function canCreateVisitForReferral(input: CreateVisitGateInput): CreateVisitGateResult {
  const intakeQuality = input.intakeQuality ?? evaluateReferralIntakeQuality(input);
  const reasons = gateReasonLabels({
    futureVisitCount: input.futureVisitCount ?? 0,
    input,
    intakeQuality,
  });
  const allowed = reasons.length === 0;

  return {
    allowed,
    reasons,
    severity: allowed ? "info" : reasons.some((reason) => reason.includes("Archived") || reason.includes("Smoke/test") || reason.includes("Terminal") || reason.includes("Non-SMS") || reason.includes("Blocked")) ? "blocker" : "caution",
  };
}
