import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getReferralWorkflowState } from "../lib/pilot/referral-workflow-state.ts";
import { recommendTherapists } from "../lib/pilot/therapist-recommendation.ts";

const accepted = getReferralWorkflowState({
  assignedTherapistId: "therapist_a",
  createVisitGateAllowed: true,
  intakeReadiness: "ready",
  opportunityState: "accepted",
  referralSource: "flowvia_demo_scenarios_v1",
  status: "contacted",
});
assert.equal(accepted.stage, "ready_to_schedule");
assert.equal(accepted.canCreateVisit, true);
assert.doesNotMatch(accepted.nextAction, /assign a therapist/i);

const offered = getReferralWorkflowState({
  assignedTherapistId: "therapist_a",
  createVisitGateAllowed: true,
  intakeReadiness: "ready",
  opportunityState: "offered",
  status: "contacted",
});
assert.equal(offered.stage, "awaiting_therapist_response");
assert.equal(offered.canCreateVisit, false);

const missingAssignment = getReferralWorkflowState({
  createVisitGateAllowed: false,
  createVisitGateReasons: ["Missing therapist"],
  intakeReadiness: "needs_review",
  opportunityState: "not_offered",
  status: "contacted",
});
assert.equal(missingAssignment.stage, "needs_assignment");

const inProgress = getReferralWorkflowState({
  assignedTherapistId: "therapist_a",
  openVisitStatuses: ["in_progress"],
  opportunityState: "accepted",
  status: "active",
});
assert.equal(inProgress.stage, "visit_in_progress");
assert.equal(inProgress.canCreateVisit, false);

const context = {
  careType: "Physical therapy",
  city: "Plano",
  intakeReadiness: "ready" as const,
  referralStatus: "contacted",
  zip: "75024",
};
const candidates = [
  { active: true, id: "z", name: "Zeta Therapist", openVisitCount: 1, serviceAreaNotes: "Plano 75024 physical therapy" },
  { active: true, id: "a", name: "Alpha Therapist", openVisitCount: 1, serviceAreaNotes: "Plano 75024 physical therapy" },
  { active: true, id: "busy", name: "Busy Therapist", openVisitCount: 6, acceptedUnscheduledCount: 2, serviceAreaNotes: "Plano 75024 physical therapy" },
];
const ranked = recommendTherapists(context, candidates);
assert.deepEqual(ranked.map((item) => item.therapistId), ["a", "z", "busy"]);
assert.equal(ranked[0].fitLevel, "best_fit");
assert.equal(ranked[0].uncertainty.level, "medium");
assert.ok(ranked[0].explanation.some((item) => /City matches/i.test(item)));
assert.ok(ranked[0].uncertainty.reasons.some((item) => /Travel time/i.test(item)));
assert.ok(ranked[2].score < ranked[0].score);

const insufficient = recommendTherapists({ referralStatus: "contacted" }, [
  { active: true, id: "unknown", name: "Unknown Area", openVisitCount: 0 },
])[0];
assert.equal(insufficient.fitLevel, "insufficient_information");
assert.equal(insufficient.uncertainty.level, "high");

const inactive = recommendTherapists(context, [
  { active: false, id: "inactive", name: "Inactive Therapist", openVisitCount: 0, serviceAreaNotes: "Plano" },
])[0];
assert.equal(inactive.eligibility.eligible, false);
assert.match(inactive.eligibility.reasons.join(" "), /inactive/i);

const conflict = recommendTherapists({ ...context, reviewedWindowProvided: true }, [
  { active: true, id: "conflict", knownConflictCount: 1, name: "Conflict Therapist", openVisitCount: 0, serviceAreaNotes: "Plano" },
])[0];
assert.equal(conflict.eligibility.eligible, false);
assert.match(conflict.eligibility.reasons.join(" "), /conflict/i);

const source = await readFile(new URL("../lib/pilot/therapist-recommendation.ts", import.meta.url), "utf8");
for (const forbidden of ["fetch(", "openai", "telnyx", "resend", "geocod", "travel time api", "prisma."]) {
  assert.equal(source.toLowerCase().includes(forbidden), false, `recommendation engine must not include ${forbidden}`);
}

console.log("Workspace clarity unit smoke passed: canonical state precedence, recommendation eligibility, explanations, uncertainty, workload, conflicts, stable ordering, and no external side effects verified.");
