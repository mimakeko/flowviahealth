import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadLocalEnv } from "./load-local-env.mts";

const SMOKE_SOURCE = "flowvia_data_demo_smoke_v1";

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for data demo smoke.");
}

const { getPrismaClient } = await import("../lib/db/prisma.ts");
const {
  ARCHIVE_SMOKE_TEST_DATA_CONFIRMATION,
  DATA_STEWARDSHIP_HARD_DELETE_MODE,
  DATA_STEWARDSHIP_PROTECTED_TABLES,
  RESET_DEMO_SCENARIOS_CONFIRMATION,
  archiveSmokeTestOperationalRecords,
  getPilotDataStewardshipSummary,
  getPilotDemoResetStatus,
  resetDemoScenarios,
  validateStewardshipConfirmation,
} = await import("../lib/pilot/data-stewardship.ts");

const prisma = getPrismaClient();
const runId = randomUUID().slice(0, 8);
const phone = `+1555033${runId
  .split("")
  .map((char) => char.charCodeAt(0) % 10)
  .join("")
  .padEnd(4, "0")
  .slice(0, 4)}`;

function protectedCounts() {
  return Promise.all([
    prisma.auditLog.count(),
    prisma.smsMessage.count(),
    prisma.telnyxWebhookEvent.count(),
    prisma.smsConsentEnrollment.count(),
  ]);
}

function assertNoProtectedDeletes(before: readonly number[], after: readonly number[]) {
  assert.ok(after[0] >= before[0], "AuditLog rows must be preserved.");
  assert.ok(after[1] >= before[1], "SmsMessage rows must be preserved.");
  assert.ok(after[2] >= before[2], "TelnyxWebhookEvent rows must be preserved.");
  assert.ok(after[3] >= before[3], "SmsConsentEnrollment rows must be preserved.");
}

function assertNoForbiddenSourceTerms(source: string, label: string) {
  assert.doesNotMatch(source, /\b(new PrismaClient|sendSms|telnyx\.messages|fetch\s*\(|googlemaps|mapbox|geocodio|distanceMatrix)\b/i, `${label} must preserve Prisma wrapper use and avoid SMS/external API surfaces.`);
}

try {
  assert.equal(validateStewardshipConfirmation("RESET DEMO SCENARIOS", RESET_DEMO_SCENARIOS_CONFIRMATION), true);
  assert.equal(validateStewardshipConfirmation("reset demo scenarios", RESET_DEMO_SCENARIOS_CONFIRMATION), false);
  assert.equal(validateStewardshipConfirmation("ARCHIVE SMOKE TEST DATA", ARCHIVE_SMOKE_TEST_DATA_CONFIRMATION), true);
  assert.deepEqual([...DATA_STEWARDSHIP_PROTECTED_TABLES], ["AuditLog", "SmsConsentEnrollment", "SmsMessage", "TelnyxWebhookEvent"]);
  assert.equal(DATA_STEWARDSHIP_HARD_DELETE_MODE, "disabled");

  await assert.rejects(
    () => resetDemoScenarios(prisma, "data_demo_smoke", "RESET DEMO"),
    /RESET DEMO SCENARIOS/,
    "Demo reset must be confirmation-gated.",
  );
  await assert.rejects(
    () => archiveSmokeTestOperationalRecords(prisma, "data_demo_smoke", "ARCHIVE"),
    /ARCHIVE SMOKE TEST DATA/,
    "Smoke archive must be confirmation-gated.",
  );

  const protectedBeforeReset = await protectedCounts();
  const resetResult = await resetDemoScenarios(prisma, "data_demo_smoke", RESET_DEMO_SCENARIOS_CONFIRMATION);
  const protectedAfterReset = await protectedCounts();
  assertNoProtectedDeletes(protectedBeforeReset, protectedAfterReset);
  assert.equal(resetResult.seededReferralCount >= 8, true, "Demo reset should seed predictable referrals.");
  assert.equal(resetResult.seededVisitCount >= 4, true, "Demo reset should seed predictable visits.");
  assert.equal(resetResult.auditPreserved, true);
  assert.equal(resetResult.messageLedgerPreserved, true);
  assert.equal(resetResult.webhookPreserved, true);
  assert.equal(resetResult.consentPreserved, true);

  const therapist = await prisma.therapist.create({
    data: {
      active: true,
      email: `data.demo.smoke.${runId}@flowviahealth.test`,
      name: "Data Demo Smoke Therapist",
      phone,
      serviceAreaNotes: "Data demo smoke therapist. No PHI.",
    },
  });
  const referral = await prisma.patientReferral.create({
    data: {
      assignedTherapistId: therapist.id,
      careType: "Smoke test demo stewardship",
      city: "Plano",
      patientName: "Data Demo Smoke Patient",
      phone,
      referralSource: SMOKE_SOURCE,
      status: "contacted",
      zip: "75024",
    },
  });
  await prisma.visit.create({
    data: {
      notes: "Smoke test demo stewardship visit. No PHI.",
      referralId: referral.id,
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
      status: "scheduled",
      therapistId: therapist.id,
    },
  });

  const protectedBeforeArchive = await protectedCounts();
  const archiveResult = await archiveSmokeTestOperationalRecords(prisma, "data_demo_smoke", ARCHIVE_SMOKE_TEST_DATA_CONFIRMATION);
  const protectedAfterArchive = await protectedCounts();
  assertNoProtectedDeletes(protectedBeforeArchive, protectedAfterArchive);
  assert.ok(archiveResult.referralCount >= 1, "Smoke archive should identify smoke/test clutter.");
  assert.ok(archiveResult.visitCount >= 1, "Smoke archive should archive smoke/test visits.");

  const summary = await getPilotDataStewardshipSummary(prisma);
  assert.equal(summary.auditPreservingCleanupEnabled, true);
  assert.equal(summary.smsLedgerPreservationEnforced, true);
  assert.equal(summary.webhookPreservationEnforced, true);
  assert.equal(summary.consentPreservationEnforced, true);
  assert.equal(summary.hardDeleteMode, "disabled");
  assert.ok(summary.activeDemoReferralCount >= 1);
  assert.ok(summary.activeDemoVisitCount >= 1);
  assert.ok(summary.terminalDemoRecordCount >= 1);

  const resetStatus = getPilotDemoResetStatus();
  assert.equal(resetStatus.enabled, true);
  assert.equal(resetStatus.smokeTestArchiveEnabled, true);
  assert.equal(resetStatus.demoScenarioSeedingEnabled, true);
  assert.equal(resetStatus.auditPreservationEnforced, true);
  assert.equal(resetStatus.smsLedgerPreservationEnforced, true);
  assert.equal(resetStatus.webhookPreservationEnforced, true);
  assert.equal(resetStatus.consentPreservationEnforced, true);
  assert.equal(resetStatus.realDataResetEnabled, false);
  assert.equal(resetStatus.externalResetApisEnabled, false);

  const [helperSource, dataPageSource, healthSource, auditSource] = await Promise.all([
    readFile("lib/pilot/data-stewardship.ts", "utf8"),
    readFile("app/admin/data/page.tsx", "utf8"),
    readFile("app/admin/health/page.tsx", "utf8"),
    readFile("app/admin/audit/page.tsx", "utf8"),
  ]);
  for (const [label, source] of Object.entries({ auditSource, dataPageSource, healthSource, helperSource })) {
    assertNoForbiddenSourceTerms(source, label);
  }
  assert.doesNotMatch(helperSource, /Demo Scenario.*\b(diagnosis|medication|symptom|blood pressure|pain score)\b/i, "Demo scenario data should not include clinical content.");

  console.log("Data demo smoke passed: confirmation gates, demo reset, smoke archive, protected history preservation, health flags, no SMS, no external APIs, and Prisma wrapper usage verified.");
} finally {
  await prisma.$disconnect();
}
