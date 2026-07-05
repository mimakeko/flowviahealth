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
assert.ok(sameCityFit.score >= 85);

const inactiveFit = scheduling.getTherapistFit({
  active: false,
  currentOpenVisitCount: 0,
  referralCity: "Plano",
  therapistName: "Inactive Therapist",
});
assert.equal(inactiveFit.label, "not_ready");
assert.equal(inactiveFit.reason, "inactive therapist");

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
assert.ok(windows.every((window) => !window.localInputValue.endsWith("09:30")));
assert.ok(windows.every((window) => window.source === "deterministic"));

const status = scheduling.getSchedulingIntelligenceStatus();
assert.equal(status.enabled, true);
assert.equal(status.externalApisEnabled, false);
assert.equal(status.geocodingEnabled, false);
assert.equal(status.autonomousSchedulingEnabled, false);
assert.equal(status.noPhiMode, true);

assertNoForbiddenOutput(renderedCards([...readyToSchedule.cards, ...optedOut.cards, ...conflict.cards]));
assertNoForbiddenOutput(JSON.stringify(windows));

console.log("Scheduling intelligence smoke passed: fit, readiness, conflicts, windows, deterministic source, and no external APIs verified.");
