import type { Prisma } from "@prisma/client";
import type { CreateVisitGateResult, ReferralIntakeQualityResult } from "./referral-intake-quality.ts";

export const OPPORTUNITY_ACTIONS = [
  "opportunity_offered",
  "opportunity_accepted",
  "opportunity_declined",
  "opportunity_action_blocked",
] as const;

export const OPPORTUNITY_DECLINE_REASONS = [
  "outside_territory",
  "schedule_full",
  "not_available_today",
  "discipline_mismatch",
  "need_more_intake_info",
  "patient_unreachable",
  "other_operational_reason",
] as const;

export type OpportunityAction = (typeof OPPORTUNITY_ACTIONS)[number];
export type OpportunityDeclineReason = (typeof OPPORTUNITY_DECLINE_REASONS)[number];
export type OpportunityState = "not_offered" | "offered" | "accepted" | "declined" | "expired_or_review_needed";

export type OpportunityAuditLog = {
  action: string;
  actorId?: string | null;
  actorType: string;
  createdAt: Date | string;
  entityId?: string | null;
  metadataJson: unknown;
};

export type OpportunityStateResult = {
  actorId?: string | null;
  actorType?: string;
  blockedReason?: string | null;
  declinedReason?: OpportunityDeclineReason | null;
  lastAction?: OpportunityAction;
  lastActionAt?: Date | string;
  noteAdded?: boolean;
  offeredTherapistId?: string | null;
  state: OpportunityState;
};

export type OpportunityStatus = {
  aiOpportunityDecisionsEnabled: false;
  autoAcceptanceEnabled: false;
  autoAssignmentEnabled: false;
  deterministicManualSource: true;
  enabled: true;
  externalMatchingApisEnabled: false;
  mapsGeocodingTravelTimeApisEnabled: false;
  manualAcceptDeclineEnabled: true;
  safeAuditEnabled: true;
  smsSendingEnabled: false;
};

export type OfferGateInput = {
  activeWorkflowVisible: boolean;
  assignedTherapistId?: string | null;
  createVisitGate: CreateVisitGateResult;
  intakeQuality: ReferralIntakeQualityResult;
  opportunityState: OpportunityState;
  status: string;
};

export type OfferGateResult = {
  allowed: boolean;
  reasons: readonly string[];
};

export type OpportunityTimelineItem = {
  action: OpportunityAction;
  actorId?: string | null;
  actorType: string;
  blockerReason?: string | null;
  createdAt: Date | string;
  declinedReason?: OpportunityDeclineReason | null;
  noteAdded: boolean;
  source?: string | null;
  therapistId?: string | null;
};

function metadataObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function metadataString(value: unknown, key: string) {
  const item = metadataObject(value)[key];
  return typeof item === "string" ? item : null;
}

function metadataBoolean(value: unknown, key: string) {
  const item = metadataObject(value)[key];
  return typeof item === "boolean" ? item : false;
}

function stateActionPriority(action: string) {
  if (action === "opportunity_accepted" || action === "opportunity_declined") return 2;
  if (action === "opportunity_offered") return 1;
  return 0;
}

export function isOpportunityAction(value: string): value is OpportunityAction {
  return OPPORTUNITY_ACTIONS.includes(value as OpportunityAction);
}

export function isOpportunityDeclineReason(value: string): value is OpportunityDeclineReason {
  return OPPORTUNITY_DECLINE_REASONS.includes(value as OpportunityDeclineReason);
}

export function opportunityDeclineReasonLabel(value: OpportunityDeclineReason | string | null | undefined) {
  if (!value) return "Not recorded";
  const labels: Record<OpportunityDeclineReason, string> = {
    discipline_mismatch: "Discipline mismatch",
    need_more_intake_info: "Need more intake info",
    not_available_today: "Not available today",
    other_operational_reason: "Other operational reason",
    outside_territory: "Outside territory",
    patient_unreachable: "Patient unreachable",
    schedule_full: "Schedule full",
  };
  return isOpportunityDeclineReason(value) ? labels[value] : value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function opportunityStateLabel(value: OpportunityState) {
  if (value === "not_offered") return "Not offered";
  if (value === "expired_or_review_needed") return "Blocked / review needed";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function opportunityActionLabel(value: OpportunityAction | string | null | undefined) {
  if (value === "opportunity_offered") return "Offered";
  if (value === "opportunity_accepted") return "Accepted";
  if (value === "opportunity_declined") return "Declined";
  if (value === "opportunity_action_blocked") return "Blocked action";
  return "Opportunity event";
}

export function opportunitySchedulingContext(input: {
  createVisitGateAllowed?: boolean;
  declinedReason?: OpportunityDeclineReason | null;
  opportunityState: OpportunityState;
}) {
  if (input.opportunityState === "accepted" && input.createVisitGateAllowed) return "Opportunity accepted";
  if (input.opportunityState === "accepted") return "Opportunity accepted";
  if (input.opportunityState === "offered") return "Awaiting therapist acceptance";
  if (input.opportunityState === "declined") return `Needs reassignment/review: ${opportunityDeclineReasonLabel(input.declinedReason).toLowerCase()}`;
  if (input.opportunityState === "expired_or_review_needed") return "Blocked: review-only";
  return "Not offered";
}

export function opportunityVisitCreationReadinessLabel(input: {
  createVisitGateAllowed: boolean;
  declinedReason?: OpportunityDeclineReason | null;
  opportunityState: OpportunityState;
  referralSource?: string | null;
}) {
  const opportunityReady = opportunityAllowsVisitCreation({
    opportunityState: input.opportunityState,
    referralSource: input.referralSource,
  });

  if (input.createVisitGateAllowed && input.opportunityState === "accepted" && opportunityReady) return "Ready for visit creation";
  if (input.opportunityState === "offered") return "Create visit suppressed until therapist acceptance is recorded";
  if (input.opportunityState === "declined") return "Needs reassignment/review";
  if (input.opportunityState === "expired_or_review_needed") return "Review-only";
  if (!input.createVisitGateAllowed) return "Review-only";
  return "Review before visit creation";
}

export function opportunityCreateVisitBlockerMessage(input: {
  createVisitGateReasons?: readonly string[];
  declinedReason?: OpportunityDeclineReason | null;
  opportunityState: OpportunityState;
}) {
  if (input.opportunityState === "offered") return "Awaiting therapist acceptance before visit creation.";
  if (input.opportunityState === "declined") return `Therapist declined: ${opportunityDeclineReasonLabel(input.declinedReason).toLowerCase()}.`;
  if (input.opportunityState === "expired_or_review_needed") return "Needs intake cleanup before offering or scheduling.";
  if (input.opportunityState === "not_offered") return "Create visit is suppressed until therapist acceptance is recorded.";
  return input.createVisitGateReasons?.[0] || "Create visit is suppressed until readiness checks pass.";
}

export function opportunityBadgeClassName(value: OpportunityState) {
  if (value === "accepted") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (value === "offered") return "bg-blue-50 text-blue-800 ring-blue-200";
  if (value === "declined") return "bg-rose-50 text-rose-800 ring-rose-200";
  if (value === "expired_or_review_needed") return "bg-amber-50 text-amber-900 ring-amber-200";
  return "bg-slate-50 text-slate-700 ring-slate-200";
}

export function getOpportunityStatus(): OpportunityStatus {
  return {
    aiOpportunityDecisionsEnabled: false,
    autoAcceptanceEnabled: false,
    autoAssignmentEnabled: false,
    deterministicManualSource: true,
    enabled: true,
    externalMatchingApisEnabled: false,
    mapsGeocodingTravelTimeApisEnabled: false,
    manualAcceptDeclineEnabled: true,
    safeAuditEnabled: true,
    smsSendingEnabled: false,
  };
}

export function getOpportunityStateFromAuditLogs(logs: readonly OpportunityAuditLog[]): OpportunityStateResult {
  const stateEvent = [...logs]
    .filter((log) => log.action === "opportunity_offered" || log.action === "opportunity_accepted" || log.action === "opportunity_declined")
    .sort((left, right) => {
      const timeDiff = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      return timeDiff || stateActionPriority(right.action) - stateActionPriority(left.action);
    })[0];
  const blockedEvent = [...logs]
    .filter((log) => log.action === "opportunity_action_blocked")
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
  const event = stateEvent || blockedEvent;

  if (!event) return { state: "not_offered" };

  const therapistId = metadataString(event.metadataJson, "therapistId") || metadataString(event.metadataJson, "assignedTherapistId");
  const declineReason = metadataString(event.metadataJson, "declineReason");
  const blockedReason = metadataString(event.metadataJson, "reason") || metadataString(event.metadataJson, "blockedReason");
  const state: OpportunityState =
    event.action === "opportunity_accepted" ? "accepted" :
    event.action === "opportunity_declined" ? "declined" :
    event.action === "opportunity_offered" ? "offered" :
    "expired_or_review_needed";

  return {
    actorId: event.actorId,
    actorType: event.actorType,
    blockedReason,
    declinedReason: declineReason && isOpportunityDeclineReason(declineReason) ? declineReason : null,
    lastAction: event.action as OpportunityAction,
    lastActionAt: event.createdAt,
    noteAdded: metadataBoolean(event.metadataJson, "noteAdded"),
    offeredTherapistId: therapistId,
    state,
  };
}

export function getOpportunityTimelineFromAuditLogs(logs: readonly OpportunityAuditLog[]): OpportunityTimelineItem[] {
  return [...logs]
    .filter((log) => isOpportunityAction(log.action))
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .map((log) => {
      const declineReason = metadataString(log.metadataJson, "declineReason");
      return {
        action: log.action as OpportunityAction,
        actorId: log.actorId,
        actorType: log.actorType,
        blockerReason: metadataString(log.metadataJson, "reason") || metadataString(log.metadataJson, "blockedReason"),
        createdAt: log.createdAt,
        declinedReason: declineReason && isOpportunityDeclineReason(declineReason) ? declineReason : null,
        noteAdded: metadataBoolean(log.metadataJson, "noteAdded"),
        source: metadataString(log.metadataJson, "source"),
        therapistId: metadataString(log.metadataJson, "therapistId") || metadataString(log.metadataJson, "assignedTherapistId"),
      };
    });
}

export function getOpportunityStatesByReferralId(logs: readonly OpportunityAuditLog[]) {
  const byId = new Map<string, OpportunityAuditLog[]>();
  for (const log of logs) {
    if (!log.entityId || !isOpportunityAction(log.action)) continue;
    const existing = byId.get(log.entityId) || [];
    existing.push(log);
    byId.set(log.entityId, existing);
  }

  const states = new Map<string, OpportunityStateResult>();
  for (const [id, items] of byId.entries()) {
    states.set(id, getOpportunityStateFromAuditLogs(items));
  }
  return states;
}

export function getAcceptedOpportunityCountsByTherapistId(logs: readonly OpportunityAuditLog[]) {
  const counts = new Map<string, number>();
  for (const opportunity of getOpportunityStatesByReferralId(logs).values()) {
    if (opportunity.state !== "accepted" || !opportunity.offeredTherapistId) continue;
    counts.set(opportunity.offeredTherapistId, (counts.get(opportunity.offeredTherapistId) || 0) + 1);
  }
  return counts;
}

export function canOfferReferralOpportunity(input: OfferGateInput): OfferGateResult {
  const reasons: string[] = [];
  const gateReasons = input.createVisitGate.reasons.join(" | ");

  if (!input.activeWorkflowVisible) reasons.push("Not in active workflow queue");
  if (!input.assignedTherapistId) reasons.push("Missing assigned therapist");
  if (input.status === "completed" || input.status === "canceled") reasons.push("Terminal referral");
  if (gateReasons.includes("Archived")) reasons.push("Archived operational record");
  if (gateReasons.includes("Smoke/test")) reasons.push("Smoke/test operational record");
  if (gateReasons.includes("Duplicate review")) reasons.push("Duplicate review");
  if (gateReasons.includes("Non-SMS only")) reasons.push("Non-SMS operational follow-up only");
  if (gateReasons.includes("Existing open/future visit")) reasons.push("Existing open/future visit");
  if (!input.intakeQuality.checklist.hasUsableLocation) reasons.push("Missing city/ZIP");
  if (!input.intakeQuality.checklist.hasServiceArea) reasons.push("Missing service area/workflow type");
  if (input.intakeQuality.warnings.some((warning) => warning.level === "blocker")) reasons.push("Blocked intake warning");
  if (input.opportunityState === "offered") reasons.push("Already offered");
  if (input.opportunityState === "accepted") reasons.push("Already accepted");

  return {
    allowed: reasons.length === 0,
    reasons: [...new Set(reasons)],
  };
}

export function opportunityAcceptanceRequiredForReferral(input: {
  opportunityState: OpportunityState;
  referralSource?: string | null;
}) {
  return input.referralSource === "flowvia_demo_scenarios_v1" || input.opportunityState !== "not_offered";
}

export function opportunityAllowsVisitCreation(input: {
  opportunityState: OpportunityState;
  referralSource?: string | null;
}) {
  return !opportunityAcceptanceRequiredForReferral(input) || input.opportunityState === "accepted";
}

export function opportunityWhereClause(): Prisma.AuditLogWhereInput {
  return { action: { in: [...OPPORTUNITY_ACTIONS] } };
}
