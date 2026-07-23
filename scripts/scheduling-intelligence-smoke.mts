import assert from "node:assert/strict";

const scheduling = await import("../lib/pilot/scheduling-intelligence.ts");

function renderedCards(cards: ReadonlyArray<{ explanation: string; label: string; nextAction: string }>) {
  return cards.map((card) => `${card.label} ${card.explanation} ${card.nextAction}`).join("\n");
}

function assertNoForbiddenOutput(value: string) {
  assert.doesNotMatch(value, /\b(api key|secret|diagnosis|treatment|medication|symptom|blood pressure|pain score|street address)\b/i);
}

const sameCityFit = scheduling.getTherapistFit({
  active: true,
  currentOpenVisitCount: 1,
  referralCity: "Plano",
  referralZip: "75024",
  serviceAreaNotes: "Demo service area: Plano and Frisco only.",
  therapistName: "Demo Therapist Plano/Frisco",
});
assert.equal(sameCityFit.label, "best_fit");
assert.ok(sameCityFit.score >= 75);

const inactiveFit = scheduling.getTherapistFit({
  active: false,
  currentOpenVisitCount: 0,
  referralCity: "Plano",
  therapistName: "Inactive Therapist",
});
assert.equal(inactiveFit.eligible, false);
assert.equal(inactiveFit.reason, "Therapist is inactive");

const needsAssignment = scheduling.getSchedulingReadiness({
  assignedTherapistId: null,
  futureVisitCount: 0,
  referralStatus: "contacted",
  smsConsentStatus: "active",
});
assert.equal(needsAssignment.readiness, "needs_assignment");

const readyToSchedule = scheduling.getSchedulingReadiness({
  assignedTherapistId: "therapist_123",
  futureVisitCount: 0,
  referralStatus: "contacted",
  smsConsentStatus: "active",
});
assert.equal(readyToSchedule.readiness, "ready_to_schedule");

const optedOut = scheduling.getSchedulingReadiness({
  assignedTherapistId: "therapist_123",
  futureVisitCount: 0,
  referralStatus: "contacted",
  smsConsentStatus: "opted_out",
});
assert.match(renderedCards(optedOut.cards), /non-SMS follow-up/i);

const conflict = scheduling.detectVisitConflicts({
  candidateScheduledAt: "2026-07-05T15:00:00.000Z",
  referralStatus: "scheduled",
  scheduledVisits: [
    { id: "other_visit", scheduledAt: "2026-07-05T15:30:00.000Z", status: "scheduled" },
  ],
  therapistActive: true,
  therapistId: "therapist_123",
}, new Date("2026-07-05T16:00:00.000Z"));
assert.equal(conflict.level, "caution");
assert.match(renderedCards(conflict.cards), /Past scheduled visit needs status update/);
assert.match(renderedCards(conflict.cards), /Therapist schedule conflict/);

const windows = scheduling.getSuggestedSchedulingWindows({
  candidateStart: new Date("2026-07-05T12:00:00.000Z"),
  scheduledVisits: [
    { id: "known_conflict", scheduledAt: "2026-07-06T14:00:00.000Z", status: "scheduled" },
  ],
}, new Date("2026-07-05T12:00:00.000Z"));
assert.ok(windows.length > 0);
assert.equal(new Set(windows.map((window) => window.businessDayKey)).size, 5);
assert.deepEqual([...new Set(windows.map((window) => window.businessDayKey))], [
  "2026-07-06",
  "2026-07-07",
  "2026-07-08",
  "2026-07-09",
  "2026-07-10",
]);
assert.ok(windows.every((window) => !/Sat|Sun/.test(window.label)));
assert.ok(windows.every((window) => /^(Mon|Tue|Wed|Thu|Fri), /.test(window.label)));
assert.ok(windows.every((window) => !window.localInputValue.endsWith("09:30")));
assert.ok(windows.every((window) => window.source === "deterministic"));
assert.equal(windows.some((window) => window.localInputValue === "2026-07-06T09:00"), false);

const weekendStartWindows = scheduling.getSuggestedSchedulingWindows({
  candidateStart: new Date("2026-07-03T17:00:00.000Z"),
  scheduledVisits: [],
}, new Date("2026-07-03T17:00:00.000Z"));
assert.deepEqual([...new Set(weekendStartWindows.map((window) => window.businessDayKey))], [
  "2026-07-06",
  "2026-07-07",
  "2026-07-08",
  "2026-07-09",
  "2026-07-10",
]);
assert.equal(weekendStartWindows.length, 20);

const neutralCards = scheduling.getNeutralSchedulingGuidanceCards();
assert.match(renderedCards(neutralCards), /Select a referral to see readiness, therapist fit, and suggested business-day windows/i);

const queueCards = scheduling.getSchedulingQueueCards({
  archiveCandidates: 0,
  capacityCautions: 0,
  conflicts: 0,
  contactedWithoutFutureVisit: 1,
  intakeReviewNeeded: 2,
  optedOutContacts: 0,
  possibleDuplicates: 1,
  readyToSchedule: 1,
  unassignedReferrals: 0,
  upcomingNextSevenDays: 0,
});
assert.match(renderedCards(queueCards), /Possible duplicate referrals/);
assert.match(renderedCards(queueCards), /Needs intake review/);
assert.match(renderedCards(queueCards), /Referrals ready for scheduling review/);

const actionPolicy = scheduling.getSchedulingWindowActionPolicy();
assert.equal(actionPolicy.action, "fill_datetime_field_only");
assert.equal(actionPolicy.fieldName, "scheduledAt");
assert.equal(actionPolicy.requiresManualSubmit, true);
assert.equal(actionPolicy.createsVisit, false);
assert.equal(actionPolicy.sendsSms, false);
assert.equal(actionPolicy.autonomousSchedulingEnabled, false);

const status = scheduling.getSchedulingIntelligenceStatus();
assert.equal(status.enabled, true);
assert.equal(status.externalAiEnabled, false);
assert.equal(status.externalApisEnabled, false);
assert.equal(status.geocodingEnabled, false);
assert.equal(status.autonomousSchedulingEnabled, false);
assert.equal(status.noPhiMode, true);
assert.equal(status.suggestedBusinessDays, 5);
assert.equal(status.travelTimeApisEnabled, false);

assertNoForbiddenOutput(renderedCards([...readyToSchedule.cards, ...optedOut.cards, ...conflict.cards, ...neutralCards, ...queueCards]));
assertNoForbiddenOutput(JSON.stringify({ actionPolicy, status, windows }));

console.log("Scheduling intelligence smoke passed: fit, readiness, conflicts, 5 business-day windows, neutral state, fill-only actions, deterministic source, and no external APIs verified.");
