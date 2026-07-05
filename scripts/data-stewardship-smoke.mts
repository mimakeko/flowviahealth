import assert from "node:assert/strict";

const stewardship = await import("../lib/pilot/data-stewardship.ts");

assert.equal(stewardship.validateStewardshipConfirmation("CLEAR TEST DATA", stewardship.CLEAR_TEST_DATA_CONFIRMATION), true);
assert.equal(stewardship.validateStewardshipConfirmation("clear test data", stewardship.CLEAR_TEST_DATA_CONFIRMATION), false);
assert.equal(stewardship.validateStewardshipConfirmation(" CLEAR TEST DATA ", stewardship.CLEAR_TEST_DATA_CONFIRMATION), true);

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
assert.doesNotMatch(smokeWhere, /AuditLog|SmsMessage|SmsConsentEnrollment|TelnyxWebhookEvent/);

assert.equal(stewardship.DATA_STEWARDSHIP_CLEANUP_MODE, "archive_only");
assert.deepEqual([...stewardship.DATA_STEWARDSHIP_PROTECTED_TABLES], ["AuditLog", "SmsConsentEnrollment", "SmsMessage", "TelnyxWebhookEvent"]);

console.log("Data stewardship smoke passed: confirmations, target filters, archive-only cleanup, and protected tables verified.");
