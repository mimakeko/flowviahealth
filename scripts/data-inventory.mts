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
  const prisma = getPrismaClient();
  const [
    referrals,
    visits,
    therapists,
    smsEnrollments,
    smsMessages,
    auditLogs,
    webhookEvents,
  ] = await Promise.all([
    prisma.patientReferral.count(),
    prisma.visit.count(),
    prisma.therapist.count(),
    prisma.smsConsentEnrollment.count(),
    prisma.smsMessage.count(),
    prisma.auditLog.count(),
    prisma.telnyxWebhookEvent.count(),
  ]);

  console.log("Flowvia data inventory (safe counts only)");
  console.log(`referrals=${referrals}`);
  console.log(`visits=${visits}`);
  console.log(`therapists=${therapists}`);
  console.log(`sms_enrollments=${smsEnrollments}`);
  console.log(`sms_messages=${smsMessages}`);
  console.log(`audit_logs=${auditLogs}`);
  console.log(`webhook_events=${webhookEvents}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Data inventory failed.");
  process.exitCode = 1;
});
