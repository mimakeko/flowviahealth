import type { OpportunityState } from "./opportunity.ts";

export type ReferralWorkflowStage =
  | "needs_contact"
  | "needs_assignment"
  | "needs_intake_review"
  | "ready_to_offer"
  | "awaiting_therapist_response"
  | "needs_staffing_review"
  | "ready_to_schedule"
  | "scheduled"
  | "visit_in_progress"
  | "completed"
  | "canceled"
  | "review_only";

export type ReferralWorkflowTone = "info" | "caution" | "positive" | "critical" | "neutral";

export type ReferralWorkflowStateInput = Readonly<{
  activeWorkflowVisible?: boolean;
  assignedTherapistId?: string | null;
  createVisitGateAllowed?: boolean;
  createVisitGateReasons?: readonly string[];
  intakeReadiness?: "ready" | "needs_review" | "blocked" | "unknown";
  openVisitStatuses?: readonly string[];
  opportunityState?: OpportunityState;
  referralSource?: string | null;
  status: string;
}>;

export type ReferralWorkflowState = Readonly<{
  canCreateVisit: boolean;
  detail: string;
  label: string;
  nextAction: string;
  stage: ReferralWorkflowStage;
  tone: ReferralWorkflowTone;
}>;

function state(
  stage: ReferralWorkflowStage,
  label: string,
  detail: string,
  nextAction: string,
  tone: ReferralWorkflowTone,
  canCreateVisit = false,
): ReferralWorkflowState {
  return { canCreateVisit, detail, label, nextAction, stage, tone };
}

function firstUsefulGateReason(reasons: readonly string[] | undefined) {
  return reasons?.find((reason) => !reason.includes("Needs intake review") && !reason.includes("Blocked intake warning")) || reasons?.[0];
}

function opportunityAcceptanceRequired(input: ReferralWorkflowStateInput) {
  const opportunityState = input.opportunityState ?? "not_offered";
  return input.referralSource === "flowvia_demo_scenarios_v1" || opportunityState !== "not_offered";
}

/**
 * Canonical, side-effect-free referral state precedence used by every workspace.
 * It intentionally combines referral, assignment, intake, opportunity, readiness,
 * and visit lifecycle facts so a lower-level helper cannot contradict the visible action.
 */
export function getReferralWorkflowState(input: ReferralWorkflowStateInput): ReferralWorkflowState {
  const opportunityState = input.opportunityState ?? "not_offered";
  const openVisitStatuses = input.openVisitStatuses ?? [];
  const hasInProgressVisit = openVisitStatuses.includes("in_progress");
  const hasOpenVisit = openVisitStatuses.some((status) => status === "scheduled" || status === "in_progress" || status === "unscheduled");

  if (input.status === "completed") {
    return state("completed", "Completed", "The referral workflow is complete and remains available for historical review.", "Review history only; reopen intentionally if more work is required.", "neutral");
  }
  if (input.status === "canceled") {
    return state("canceled", "Canceled", "The referral is outside the active workflow.", "Review history only; reopen intentionally before taking another action.", "neutral");
  }
  if (input.activeWorkflowVisible === false) {
    return state("review_only", "Review only", "This referral is not in the active operational queue.", "Review its audit and stewardship history before changing workflow state.", "critical");
  }
  if (hasInProgressVisit) {
    return state("visit_in_progress", "Visit in progress", "An assigned visit is currently in progress.", "Complete or update the current visit before creating another.", "positive");
  }
  if (hasOpenVisit || input.status === "scheduled") {
    return state("scheduled", "Visit scheduled", "An open or upcoming visit already carries this referral forward.", "Monitor the existing visit and update its lifecycle when work changes.", "positive");
  }
  if (opportunityState === "declined") {
    return state("needs_staffing_review", "Staffing review needed", "The assigned therapist declined this opportunity.", "Review the decline, then reassign or re-offer manually.", "critical");
  }
  if (opportunityState === "expired_or_review_needed") {
    return state("review_only", "Opportunity review needed", "The latest opportunity event is blocked or needs review.", "Resolve the recorded opportunity blocker before offering or scheduling.", "critical");
  }
  if (input.status === "new") {
    return state("needs_contact", "Needs contact", "First-contact readiness is not complete.", "Complete contact readiness and safe intake review.", "caution");
  }
  if (!input.assignedTherapistId) {
    return state("needs_assignment", "Needs therapist assignment", "No therapist is assigned to this referral.", "Review recommendations and assign an active therapist manually.", "caution");
  }

  const gateKnownBlocked = input.createVisitGateAllowed === false;
  const intakeNotReady = input.intakeReadiness === "blocked" || input.intakeReadiness === "needs_review";
  if (gateKnownBlocked || intakeNotReady) {
    const reason = firstUsefulGateReason(input.createVisitGateReasons);
    return state(
      "needs_intake_review",
      input.intakeReadiness === "blocked" ? "Intake blocked" : "Needs intake review",
      reason ? `Scheduling readiness is blocked by: ${reason}.` : "One or more intake or scheduling readiness checks still need review.",
      reason ? `Resolve ${reason.toLowerCase()} before continuing.` : "Resolve the visible intake blockers before continuing.",
      input.intakeReadiness === "blocked" ? "critical" : "caution",
    );
  }

  if (opportunityState === "accepted") {
    return state("ready_to_schedule", "Accepted — ready to schedule", "The assigned therapist accepted and readiness checks pass.", "Create the visit manually after final schedule review.", "positive", true);
  }
  if (opportunityState === "offered") {
    return state("awaiting_therapist_response", "Awaiting therapist response", "The opportunity is assigned and offered, but no therapist decision is recorded yet.", "Wait for the therapist to accept or decline; do not create a visit yet.", "info");
  }
  if (opportunityAcceptanceRequired(input)) {
    return state("ready_to_offer", "Ready to offer", "The referral is intake-ready and has an assigned therapist.", "Offer the opportunity to the assigned therapist manually.", "info");
  }

  return state("ready_to_schedule", "Ready to schedule", "Assignment and available readiness checks pass.", "Create the visit manually after final schedule review.", "positive", true);
}

export function referralWorkflowToneClassName(tone: ReferralWorkflowTone) {
  if (tone === "positive") return "bg-emerald-50 text-emerald-900 ring-emerald-200";
  if (tone === "critical") return "bg-rose-50 text-rose-900 ring-rose-200";
  if (tone === "caution") return "bg-amber-50 text-amber-950 ring-amber-200";
  if (tone === "info") return "bg-blue-50 text-blue-900 ring-blue-200";
  return "bg-slate-50 text-slate-700 ring-slate-200";
}
