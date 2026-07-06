import { loadLocalEnv } from "./load-local-env.mts";

function requirePostgres() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for data:inventory.");
  }
}

async function main() {
  loadLocalEnv();
  requirePostgres();

  const { getPrismaClient } = await import("../lib/db/prisma.ts");
  const { getPilotDataStewardshipSummary } = await import("../lib/pilot/data-stewardship.ts");
  const prisma = getPrismaClient();
  const summary = await getPilotDataStewardshipSummary(prisma);

  console.log("Flowvia data inventory (safe counts only)");
  console.log(`active_demo_referrals=${summary.activeDemoReferralCount}`);
  console.log(`active_smoke_test_referrals=${summary.activeSmokeReferralCount}`);
  console.log(`active_demo_visits=${summary.activeDemoVisitCount}`);
  console.log(`active_smoke_test_visits=${summary.activeSmokeVisitCount}`);
  console.log(`archived_fake_referrals=${summary.archivedFakeReferralCount}`);
  console.log(`archived_fake_visits=${summary.archivedFakeVisitCount}`);
  console.log(`terminal_demo_records=${summary.terminalDemoRecordCount}`);
  console.log(`latest_data_stewardship_action=${summary.lastStewardshipAudit?.action || "not_recorded"}`);
  console.log(`audit_preserved=${summary.auditPreservingCleanupEnabled}`);
  console.log(`sms_webhook_consent_preserved=${summary.smsLedgerPreservationEnforced && summary.webhookPreservationEnforced && summary.consentPreservationEnforced}`);
  console.log(`sms_enrollments=${summary.smsConsentEnrollmentCount}`);
  console.log(`sms_messages=${summary.smsMessageCount}`);
  console.log(`audit_logs=${summary.auditLogCount}`);
  console.log(`webhook_events=${summary.telnyxWebhookEventCount}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Data inventory failed.");
  process.exitCode = 1;
});
