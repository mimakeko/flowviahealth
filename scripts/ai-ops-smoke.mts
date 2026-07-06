import assert from "node:assert/strict";

process.env.FLOWVIA_AI_ENABLED = "false";
process.env.FLOWVIA_AI_PROVIDER = "mock";
process.env.FLOWVIA_AI_NO_PHI_MODE = "true";
process.env.FLOWVIA_AI_AUDIT_ONLY = "true";

const assistant = await import("../lib/ai/operations-assistant-v2.ts");

function renderedCards(cards: ReturnType<typeof assistant.getReferralAssistantCards>) {
  return cards.map((card) => `${card.label} ${card.explanation} ${card.nextAction}`).join("\n");
}

function assertNoRestrictedTerms(cards: ReturnType<typeof assistant.getReferralAssistantCards>) {
  const rendered = renderedCards(cards);
  assert.doesNotMatch(rendered, /\b(diagnosis|treatment|medication|symptom|blood pressure|pain score|api key|secret)\b/i);
}

const referralInput = {
  assignedTherapistId: null,
  smsConsentStatus: "opted_out",
  status: "contacted",
  upcomingVisitCount: 0,
};
const referralCardsA = assistant.getReferralAssistantCards(referralInput);
const referralCardsB = assistant.getReferralAssistantCards(referralInput);
assert.deepEqual(referralCardsA, referralCardsB, "referral assistant cards must be deterministic");
assert.match(renderedCards(referralCardsA), /Opted out - do not text/);
assert.match(renderedCards(referralCardsA), /Therapist assignment missing/);
assertNoRestrictedTerms(referralCardsA);

const pastVisitCards = assistant.getVisitAssistantCards({
  referralStatus: "scheduled",
  scheduledAt: "2026-01-01T12:00:00.000Z",
  status: "scheduled",
  therapistId: "therapist_123",
}, new Date("2026-07-05T12:00:00.000Z"));
assert.match(renderedCards(pastVisitCards), /Past scheduled visit needs status update/);
assertNoRestrictedTerms(pastVisitCards);

const queueCards = assistant.getQueueAssistantCards({
  contactedNotScheduled: 2,
  intakeReviewNeeded: 2,
  newReferrals: 1,
  optedOutContacts: 1,
  pastScheduledVisits: 1,
  possibleDuplicates: 1,
  readyForScheduling: 1,
  scheduledVisitsNextSevenDays: 3,
  smokeTestRecords: 1,
  unassignedReferrals: 1,
});
assert.match(renderedCards(queueCards), /Opted-out contacts should not receive SMS/);
assert.match(renderedCards(queueCards), /Possible duplicate referrals/);
assert.match(renderedCards(queueCards), /Intake review needed/);
assert.match(renderedCards(queueCards), /Ready for scheduling/);
assert.match(renderedCards(queueCards), /Smoke\/test data present/);
assertNoRestrictedTerms(queueCards);

const status = assistant.getOperationsAssistantV2Status();
assert.equal(status.providerLabel, "mock / deterministic");
assert.equal(status.externalApiCallsEnabled, false);
assert.equal(status.autonomousActionsEnabled, false);
assert.equal(status.noPhiMode, true);
assert.equal(status.realProviderCallsEnabled, false);

console.log("AI operations smoke passed: deterministic cards, no external API calls, no autonomous actions, and safe wording verified.");
