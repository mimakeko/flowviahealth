import { randomUUID } from "node:crypto";
import { loadLocalEnv } from "./load-local-env.mts";
import { requireSmokeEnv, smokeErrorSummary, smokeFailToken, withTimeout } from "./smoke-harness.mts";

const SMOKE_SOURCE = "flowvia_db_smoke_v1";
const SMOKE_ACTOR = "smoke_test";
const SMOKE_PHONE = "+15550101990";
const SMOKE_REFERRAL_PHONE = "+15550101991";
const SCRIPT_TOKEN = "DB_SMOKE";
const DB_TIMEOUT_MS = 15_000;
const TRANSACTION_TIMEOUT_MS = 45_000;

function db<T>(promise: Promise<T>, label: string, timeoutMs = DB_TIMEOUT_MS) {
  return withTimeout(promise, timeoutMs, label);
}

async function main() {
  loadLocalEnv();
  if (!requireSmokeEnv(SCRIPT_TOKEN, ["DATABASE_URL"])) return;

  const { getPrismaClient } = await import("../lib/db/prisma.ts");
  const prisma = getPrismaClient();
  const runId = randomUUID().slice(0, 8);
  const therapistEmail = `smoke.therapist.${runId}@flowviahealth.test`;
  const telnyxEventId = `smoke_${runId}`;

  try {
    await db(prisma.$connect(), "prisma.$connect db smoke");
    await db(prisma.smsMessage.count(), "smsMessage.count db smoke connectivity probe");

    await db(prisma.$transaction(async (tx) => {
    await tx.telnyxWebhookEvent.deleteMany({ where: { eventType: "smoke.webhook" } });
    await tx.smsMessage.deleteMany({ where: { eventType: "smoke.sms.dry_run" } });
    await tx.smsConsentEnrollment.deleteMany({ where: { fullName: "Smoke SMS Contact" } });
    await tx.patientReferral.deleteMany({ where: { referralSource: SMOKE_SOURCE } });
    await tx.therapist.deleteMany({
      where: {
        name: "Smoke Therapist",
        email: { endsWith: "@flowviahealth.test" },
      },
    });

    await Promise.all([
      tx.therapist.count(),
      tx.patientReferral.count(),
      tx.visit.count(),
      tx.smsConsentEnrollment.count(),
      tx.smsMessage.count(),
      tx.telnyxWebhookEvent.count(),
      tx.auditLog.count(),
    ]);

    const therapist = await tx.therapist.create({
      data: {
        name: "Smoke Therapist",
        email: therapistEmail,
        phone: SMOKE_PHONE,
        active: true,
        serviceAreaNotes: "Smoke test fake therapist. No PHI.",
      },
    });

    const readTherapist = await tx.therapist.findUniqueOrThrow({
      where: { id: therapist.id },
    });

    const updatedTherapist = await tx.therapist.update({
      where: { id: readTherapist.id },
      data: { serviceAreaNotes: "Smoke test update confirmed. No PHI." },
    });

    const referral = await tx.patientReferral.create({
      data: {
        patientName: "Smoke Patient",
        phone: SMOKE_REFERRAL_PHONE,
        email: "smoke.patient@example.test",
        city: "Plano",
        zip: "75024",
        referralSource: SMOKE_SOURCE,
        careType: "Smoke test care type",
        notes: "Smoke test fake referral. No PHI.",
        status: "new",
        assignedTherapistId: updatedTherapist.id,
      },
    });

    const readReferral = await tx.patientReferral.findUniqueOrThrow({
      where: { id: referral.id },
    });

    const updatedReferral = await tx.patientReferral.update({
      where: { id: readReferral.id },
      data: { status: "contacted" },
    });

    const visit = await tx.visit.create({
      data: {
        referralId: updatedReferral.id,
        therapistId: updatedTherapist.id,
        scheduledAt: new Date("2026-07-10T16:00:00.000Z"),
        status: "scheduled",
        notes: "Smoke test fake visit. No PHI.",
      },
    });

    const consent = await tx.smsConsentEnrollment.create({
      data: {
        phone: SMOKE_REFERRAL_PHONE,
        normalizedPhone: SMOKE_REFERRAL_PHONE,
        fullName: "Smoke SMS Contact",
        email: "smoke.sms@example.test",
        status: "pending_confirmation",
        source: "sms_consent_page",
        consentTextVersion: "smoke_test_v1",
      },
    });

    await tx.smsConsentEnrollment.findUniqueOrThrow({
      where: { id: consent.id },
    });

    const message = await tx.smsMessage.create({
      data: {
        phone: SMOKE_REFERRAL_PHONE,
        direction: "outbound",
        eventType: "smoke.sms.dry_run",
        body: "Flowvia Health smoke test message. Not sent. No PHI.",
        providerMessageId: `smoke_msg_${runId}`,
        status: "dry_run",
        dryRun: true,
      },
    });

    await tx.smsMessage.findUniqueOrThrow({
      where: { id: message.id },
    });

    await tx.telnyxWebhookEvent.create({
      data: {
        telnyxEventId,
        eventType: "smoke.webhook",
        payloadJson: { source: SMOKE_SOURCE, runId },
        processedAt: new Date(),
      },
    });

    const updatedVisit = await tx.visit.update({
      where: { id: visit.id },
      data: { status: "in_progress" },
    });

    await Promise.all([
      tx.auditLog.create({
        data: {
          actorType: SMOKE_ACTOR,
          actorId: runId,
          action: "referral_created",
          entityType: "PatientReferral",
          entityId: referral.id,
          metadataJson: { status: referral.status },
        },
      }),
      tx.auditLog.create({
        data: {
          actorType: SMOKE_ACTOR,
          actorId: runId,
          action: "referral_status_changed",
          entityType: "PatientReferral",
          entityId: updatedReferral.id,
          metadataJson: { from: referral.status, to: updatedReferral.status },
        },
      }),
      tx.auditLog.create({
        data: {
          actorType: SMOKE_ACTOR,
          actorId: runId,
          action: "therapist_assigned",
          entityType: "PatientReferral",
          entityId: updatedReferral.id,
          metadataJson: { assignedTherapistId: updatedTherapist.id },
        },
      }),
      tx.auditLog.create({
        data: {
          actorType: SMOKE_ACTOR,
          actorId: runId,
          action: "visit_created",
          entityType: "Visit",
          entityId: visit.id,
          metadataJson: { referralId: updatedReferral.id, status: visit.status },
        },
      }),
      tx.auditLog.create({
        data: {
          actorType: SMOKE_ACTOR,
          actorId: runId,
          action: "visit_status_changed",
          entityType: "Visit",
          entityId: visit.id,
          metadataJson: { from: visit.status, referralId: updatedReferral.id, to: updatedVisit.status },
        },
      }),
      tx.auditLog.create({
        data: {
          actorType: SMOKE_ACTOR,
          actorId: updatedTherapist.id,
          action: "therapist_status_update",
          entityType: "Visit",
          entityId: visit.id,
          metadataJson: { referralId: updatedReferral.id, status: updatedVisit.status },
        },
      }),
      tx.auditLog.create({
        data: {
          actorType: SMOKE_ACTOR,
          actorId: runId,
          action: "db_smoke_completed",
          entityType: "SmokeTest",
          entityId: runId,
          metadataJson: {
            referralId: updatedReferral.id,
            smsConsentEnrollmentId: consent.id,
            smsMessageId: message.id,
            therapistId: updatedTherapist.id,
            visitId: updatedVisit.id,
          },
        },
      }),
    ]);

    const dashboardAuditSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      dashboardOpenReferrals,
      dashboardReadyScheduledReferrals,
      dashboardActiveCompletedReferrals,
      dashboardPendingSmsConsent,
      dashboardRecentAuditActivity,
      dashboardActiveTherapists,
      dashboardUpcomingVisits,
      dashboardRecentReferrals,
      referralStatusGroups,
      completedVisitCount,
      optedOutSmsConsent,
      recentSmsMessages,
      workflowVisitQuery,
      therapistScopedReferrals,
      therapistScopedVisits,
      referralConsent,
    ] = await Promise.all([
      tx.patientReferral.count({ where: { status: { in: ["new", "contacted"] } } }),
      tx.patientReferral.count({ where: { status: "scheduled" } }),
      tx.patientReferral.count({ where: { status: { in: ["active", "completed"] } } }),
      tx.smsConsentEnrollment.count({ where: { status: "pending_confirmation" } }),
      tx.auditLog.count({ where: { createdAt: { gte: dashboardAuditSince } } }),
      tx.therapist.count({ where: { active: true } }),
      tx.visit.findMany({
        include: {
          referral: { select: { city: true, patientName: true, zip: true } },
          therapist: { select: { name: true } },
        },
        orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
        take: 5,
        where: { status: { in: ["scheduled", "in_progress"] } },
      }),
      tx.patientReferral.findMany({
        include: {
          assignedTherapist: { select: { name: true } },
          visits: {
            orderBy: { scheduledAt: "asc" },
            select: { scheduledAt: true, status: true },
            take: 1,
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      tx.patientReferral.groupBy({ by: ["status"], _count: { _all: true } }),
      tx.visit.count({ where: { status: "completed" } }),
      tx.smsConsentEnrollment.count({ where: { status: "opted_out" } }),
      tx.smsMessage.findMany({
        orderBy: { createdAt: "desc" },
        select: { direction: true, eventType: true, phone: true, status: true },
        take: 5,
      }),
      tx.visit.findMany({
        include: {
          referral: { select: { city: true, patientName: true, phone: true, zip: true } },
          therapist: { select: { email: true, name: true } },
        },
        where: { status: { in: ["scheduled", "in_progress", "completed", "no_show"] } },
      }),
      tx.patientReferral.findMany({
        where: { assignedTherapistId: updatedTherapist.id },
        include: { visits: true },
      }),
      tx.visit.findMany({
        where: { therapistId: updatedTherapist.id },
        include: { referral: true },
      }),
      tx.smsConsentEnrollment.findUnique({ where: { normalizedPhone: updatedReferral.phone } }),
    ]);

    if (
      dashboardOpenReferrals < 1 ||
      dashboardPendingSmsConsent < 1 ||
      dashboardRecentAuditActivity < 1 ||
      dashboardActiveTherapists < 1 ||
      dashboardUpcomingVisits.length < 1 ||
      dashboardRecentReferrals.length < 1 ||
      referralStatusGroups.length < 1 ||
      typeof completedVisitCount !== "number" ||
      typeof optedOutSmsConsent !== "number" ||
      recentSmsMessages.length < 1 ||
      workflowVisitQuery.length < 1 ||
      therapistScopedReferrals.length < 1 ||
      therapistScopedVisits.length < 1 ||
      referralConsent?.status !== "pending_confirmation" ||
      typeof dashboardReadyScheduledReferrals !== "number" ||
      typeof dashboardActiveCompletedReferrals !== "number"
    ) {
      throw new Error("Dashboard smoke queries did not return the expected fake operational data.");
    }

    if (workflowVisitQuery.some((item) => !item.referral.phone.startsWith("+1555"))) {
      throw new Error("Workflow smoke data must use fake/test phone numbers only.");
    }

    await Promise.all([
      tx.auditLog.findFirstOrThrow({ where: { actorType: SMOKE_ACTOR, actorId: runId, action: "db_smoke_completed" } }),
      tx.auditLog.findFirstOrThrow({ where: { actorType: SMOKE_ACTOR, action: "referral_status_changed" } }),
      tx.auditLog.findFirstOrThrow({ where: { actorType: SMOKE_ACTOR, action: "therapist_assigned" } }),
      tx.auditLog.findFirstOrThrow({ where: { actorType: SMOKE_ACTOR, action: "visit_status_changed" } }),
      tx.auditLog.findFirstOrThrow({ where: { actorType: SMOKE_ACTOR, action: "therapist_status_update" } }),
    ]);
    }, {
      maxWait: 10_000,
      timeout: TRANSACTION_TIMEOUT_MS,
    }), "prisma.$transaction db smoke", TRANSACTION_TIMEOUT_MS + 15_000);

    console.log("PASS_DB_SMOKE");
    console.log("DB smoke passed: Postgres models are queryable and fake create/read/update checks completed without sending SMS.");
  } catch (error) {
    console.error(`${smokeFailToken(SCRIPT_TOKEN, error)} ${smokeErrorSummary(error)}`);
    process.exitCode = 1;
  } finally {
    await withTimeout(prisma.$disconnect(), 5_000, "prisma.$disconnect db smoke").catch((error) => {
      console.error(`WARN_DB_SMOKE_DISCONNECT ${smokeErrorSummary(error)}`);
    });
    if (process.exitCode) process.exit(process.exitCode);
  }
}

main().catch((error) => {
  console.error(`FAIL_DB_SMOKE_UNEXPECTED ${smokeErrorSummary(error)}`);
  process.exit(1);
});
