import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadLocalEnv } from "./load-local-env.mts";

const SMOKE_SOURCE = "flowvia_visits_workflow_smoke_v1";

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for visits workflow smoke.");
}

const { getPrismaClient } = await import("../lib/db/prisma.ts");
const {
  isTherapistFieldVisitActionConfirmed,
  resolveTherapistFieldVisitAction,
  THERAPIST_FIELD_CONFIRMATION_INTENT,
} = await import("../lib/pilot/therapist-field-workflow.ts");
const prisma = getPrismaClient();
const runId = randomUUID().slice(0, 8);
const phoneSuffix = runId
  .split("")
  .map((char) => char.charCodeAt(0) % 10)
  .join("")
  .slice(0, 4);
const phone = `+1555011${phoneSuffix}`;
const smsBefore = await prisma.smsMessage.count();

try {
  await prisma.patientReferral.deleteMany({ where: { referralSource: SMOKE_SOURCE } });
  await prisma.therapist.deleteMany({ where: { email: { startsWith: "visits.workflow.smoke." } } });

  const therapist = await prisma.therapist.create({
    data: {
      active: true,
      email: `visits.workflow.smoke.${runId}@flowviahealth.test`,
      name: "Visits Workflow Smoke Therapist",
      phone,
      serviceAreaNotes: "Visits workflow smoke. No PHI.",
    },
  });
  const referral = await prisma.patientReferral.create({
    data: {
      assignedTherapistId: therapist.id,
      city: "Plano",
      patientName: "Visits Workflow Smoke Patient",
      phone,
      referralSource: SMOKE_SOURCE,
      status: "scheduled",
      zip: "75024",
    },
  });

  const scheduledVisit = await prisma.visit.create({
    data: {
      referralId: referral.id,
      scheduledAt: new Date("2026-07-10T15:00:00.000Z"),
      status: "scheduled",
      therapistId: therapist.id,
    },
  });
  const noShowVisit = await prisma.visit.create({
    data: {
      referralId: referral.id,
      scheduledAt: new Date("2026-07-11T15:00:00.000Z"),
      status: "scheduled",
      therapistId: therapist.id,
    },
  });

  assert.equal(isTherapistFieldVisitActionConfirmed({
    action: "start_visit",
    confirmationIntent: THERAPIST_FIELD_CONFIRMATION_INTENT,
  }), true, "Visit lifecycle actions should require a valid therapist confirmation intent.");
  assert.equal(isTherapistFieldVisitActionConfirmed({
    action: "start_visit",
    confirmationIntent: null,
  }), false, "Visit lifecycle actions should reject missing therapist confirmation intent.");

  const start = resolveTherapistFieldVisitAction({ action: "start_visit", now: new Date("2026-07-10T15:30:00.000Z"), scheduledAt: scheduledVisit.scheduledAt, status: scheduledVisit.status });
  assert.equal(start?.allowed, true);
  const inProgress = await prisma.visit.update({ where: { id: scheduledVisit.id }, data: { status: start!.nextStatus } });

  const complete = resolveTherapistFieldVisitAction({ action: "mark_completed", now: new Date("2026-07-10T16:00:00.000Z"), scheduledAt: inProgress.scheduledAt, status: inProgress.status });
  assert.equal(complete?.allowed, true);
  const completed = await prisma.visit.update({ where: { id: inProgress.id }, data: { status: complete!.nextStatus } });

  const noShow = resolveTherapistFieldVisitAction({ action: "mark_no_show", now: new Date("2026-07-11T16:00:00.000Z"), scheduledAt: noShowVisit.scheduledAt, status: noShowVisit.status });
  assert.equal(noShow?.allowed, true);
  const noShowUpdated = await prisma.visit.update({ where: { id: noShowVisit.id }, data: { status: noShow!.nextStatus } });

  await Promise.all([
    prisma.auditLog.create({
      data: {
        action: "visit_status_changed",
        actorId: runId,
        actorType: "visits_workflow_smoke",
        entityId: completed.id,
        entityType: "Visit",
        metadataJson: { from: scheduledVisit.status, referralId: referral.id, to: completed.status, visitId: completed.id },
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "visit_status_changed",
        actorId: runId,
        actorType: "visits_workflow_smoke",
        entityId: noShowUpdated.id,
        entityType: "Visit",
        metadataJson: { from: noShowVisit.status, referralId: referral.id, to: noShowUpdated.status, visitId: noShowUpdated.id },
      },
    }),
  ]);

  const adminVisibleVisits = await prisma.visit.findMany({ where: { referral: { referralSource: SMOKE_SOURCE } } });
  assert.equal(adminVisibleVisits.length, 2);
  assert.ok(adminVisibleVisits.some((visit) => visit.status === "completed"));
  assert.ok(adminVisibleVisits.some((visit) => visit.status === "no_show"));

  const smsAfter = await prisma.smsMessage.count();
  assert.equal(smsAfter, smsBefore, "Visit workflow smoke must not send or record SMS.");

  console.log("Visits workflow smoke passed: lifecycle statuses, admin visibility, audit entries, and no SMS verified.");
} finally {
  await prisma.$disconnect();
}
