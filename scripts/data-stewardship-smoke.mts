import assert from "node:assert/strict";

const stewardship = await import("../lib/pilot/data-stewardship.ts");

assert.equal(stewardship.validateStewardshipConfirmation("CLEAR TEST DATA", stewardship.CLEAR_TEST_DATA_CONFIRMATION), true);
assert.equal(stewardship.validateStewardshipConfirmation("clear test data", stewardship.CLEAR_TEST_DATA_CONFIRMATION), false);
assert.equal(stewardship.validateStewardshipConfirmation(" CLEAR TEST DATA ", stewardship.CLEAR_TEST_DATA_CONFIRMATION), true);
assert.equal(stewardship.validateStewardshipConfirmation("ARCHIVE SMOKE TEST DATA", stewardship.ARCHIVE_SMOKE_TEST_DATA_CONFIRMATION), true);
assert.equal(stewardship.validateStewardshipConfirmation("RESET DEMO SCENARIOS", stewardship.RESET_DEMO_SCENARIOS_CONFIRMATION), true);
assert.equal(stewardship.validateStewardshipConfirmation("RESET DEMO", stewardship.RESET_DEMO_SCENARIOS_CONFIRMATION), false);

assert.equal(
  stewardship.isExplicitSmokeTestReferralLike({
    patientName: "Smoke Patient",
    referralSource: "flowvia_db_smoke_v1",
  }),
  true,
);
assert.equal(
  stewardship.isExplicitSmokeTestReferralLike({
    patientName: "Arbitrary Person",
    referralSource: "community_referral",
  }),
  false,
);
assert.equal(
  stewardship.isExplicitFakePilotReferralLike({
    patientName: "Demo Patient Alpha",
    referralSource: "flowvia_demo_seed_v1",
  }),
  true,
);
assert.equal(
  stewardship.isExplicitFakePilotReferralLike({
    patientName: "Personal Test Contact",
    referralSource: "sms_consent_page",
  }),
  false,
);

const smokeWhere = JSON.stringify(stewardship.smokeOperationalReferralWhere());
assert.match(smokeWhere, /flowvia_db_smoke_v1/);
assert.match(smokeWhere, /flowvia_ops_guardrail_smoke_v1/);
assert.match(smokeWhere, /smoke/);
assert.doesNotMatch(smokeWhere, /AuditLog|SmsMessage|SmsConsentEnrollment|TelnyxWebhookEvent/);

assert.equal(stewardship.DATA_STEWARDSHIP_CLEANUP_MODE, "archive_only");
assert.equal(stewardship.DATA_STEWARDSHIP_HARD_DELETE_MODE, "disabled");
assert.deepEqual([...stewardship.DATA_STEWARDSHIP_PROTECTED_TABLES], ["AuditLog", "SmsConsentEnrollment", "SmsMessage", "TelnyxWebhookEvent"]);
assert.equal(stewardship.DEMO_SCENARIO_OPTIONS.length, 8);

const resetStatus = stewardship.getPilotDemoResetStatus();
assert.equal(resetStatus.enabled, true);
assert.equal(resetStatus.smokeTestArchiveEnabled, true);
assert.equal(resetStatus.demoScenarioSeedingEnabled, true);
assert.equal(resetStatus.auditPreservationEnforced, true);
assert.equal(resetStatus.smsLedgerPreservationEnforced, true);
assert.equal(resetStatus.webhookPreservationEnforced, true);
assert.equal(resetStatus.consentPreservationEnforced, true);
assert.equal(resetStatus.realDataResetEnabled, false);
assert.equal(resetStatus.externalResetApisEnabled, false);

console.log("Data stewardship smoke passed: confirmations, target filters, archive-only cleanup, demo reset flags, and protected tables verified.");
