import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadLocalEnv } from "./load-local-env.mts";
import { requireSmokeEnv, smokeErrorSummary, smokeFailToken, withTimeout } from "./smoke-harness.mts";

const SMOKE_SOURCE = "flowvia_therapist_field_smoke_v1";
const SCRIPT_TOKEN = "THERAPIST_FIELD_SMOKE";
const DB_TIMEOUT_MS = 15_000;

loadLocalEnv();

if (!requireSmokeEnv(SCRIPT_TOKEN, ["DATABASE_URL"])) process.exit(0);

const { classifyOperationalNote, getSafeBlockedNoteAuditMetadata, hasBlockedNoteClassification } = await import("../lib/compliance/note-classification.ts");
const { getTherapistAssistantCards } = await import("../lib/ai/operations-assistant-v2.ts");
const { getPrismaClient } = await import("../lib/db/prisma.ts");
const {
  getTherapistFieldWorkflowStatus,
  isTherapistFieldVisitActionConfirmed,
  resolveTherapistFieldVisitAction,
  THERAPIST_FIELD_CONFIRMATION_INTENT,
} = await import("../lib/pilot/therapist-field-workflow.ts");

const prisma = getPrismaClient();
const runId = randomUUID().slice(0, 8);
const phoneA = "+15550112001";
const phoneB = "+15550112002";
let smsBefore = 0;

function db<T>(promise: Promise<T>, label: string) {
  return withTimeout(promise, DB_TIMEOUT_MS, label);
}

function assertSafeRendered(value: string) {
  assert.doesNotMatch(value, /\b(diagnosis|treatment|medication|symptom|blood pressure|pain score|api key|secret|full address)\b/i);
}

try {
  smsBefore = await db(prisma.smsMessage.count(), "smsMessage.count initial guard");

  await db(prisma.patientReferral.deleteMany({ where: { referralSource: SMOKE_SOURCE } }), "patientReferral.deleteMany cleanup");
  await db(prisma.smsConsentEnrollment.deleteMany({ where: { fullName: { startsWith: "Therapist Field Smoke" } } }), "smsConsentEnrollment.deleteMany cleanup");
  await db(prisma.therapist.deleteMany({ where: { email: { startsWith: "therapist.field.smoke." } } }), "therapist.deleteMany cleanup");

  const [therapistA, therapistB] = await db(Promise.all([
    prisma.therapist.create({
      data: {
        active: true,
        email: `therapist.field.smoke.a.${runId}@flowviahealth.test`,
        name: "Therapist Field Smoke A",
        phone: phoneA,
        serviceAreaNotes: "Therapist field smoke. No PHI.",
      },
    }),
    prisma.therapist.create({
      data: {
        active: true,
        email: `therapist.field.smoke.b.${runId}@flowviahealth.test`,
        name: "Therapist Field Smoke B",
        phone: phoneB,
        serviceAreaNotes: "Therapist field smoke. No PHI.",
      },
    }),
  ]), "therapist.create setup");

  const [referralA, referralB] = await db(Promise.all([
    prisma.patientReferral.create({
      data: {
        assignedTherapistId: therapistA.id,
        city: "Plano",
        patientName: "Therapist Field Smoke Patient A",
        phone: phoneA,
        referralSource: SMOKE_SOURCE,
        status: "scheduled",
        zip: "75024",
      },
    }),
    prisma.patientReferral.create({
      data: {
        assignedTherapistId: therapistB.id,
        city: "Frisco",
        patientName: "Therapist Field Smoke Patient B",
        phone: phoneB,
        referralSource: SMOKE_SOURCE,
        status: "scheduled",
        zip: "75034",
      },
    }),
  ]), "patientReferral.create setup");

  const [scheduledVisit, noShowVisit, otherTherapistVisit] = await db(Promise.all([
    prisma.visit.create({
      data: {
        referralId: referralA.id,
        scheduledAt: new Date("2026-07-10T15:00:00.000Z"),
        status: "scheduled",
        therapistId: therapistA.id,
      },
    }),
    prisma.visit.create({
      data: {
        referralId: referralA.id,
        scheduledAt: new Date("2026-07-11T15:00:00.000Z"),
        status: "scheduled",
        therapistId: therapistA.id,
      },
    }),
    prisma.visit.create({
      data: {
        referralId: referralB.id,
        scheduledAt: new Date("2026-07-12T15:00:00.000Z"),
        status: "scheduled",
        therapistId: therapistB.id,
      },
    }),
    prisma.smsConsentEnrollment.create({
      data: {
        consentTextVersion: "therapist_field_smoke_v1",
        fullName: "Therapist Field Smoke Opted Out",
        normalizedPhone: phoneA,
        phone: phoneA,
        source: "sms_consent_page",
        status: "opted_out",
      },
    }),
  ]), "visit and smsConsentEnrollment.create setup");

  const assignedVisit = await db(prisma.visit.findFirst({ where: { id: scheduledVisit.id, therapistId: therapistA.id } }), "visit.findFirst assigned scope");
  assert.ok(assignedVisit, "Therapist should be able to scope assigned visit.");

  assert.equal(isTherapistFieldVisitActionConfirmed({
    action: "mark_completed",
    confirmationIntent: THERAPIST_FIELD_CONFIRMATION_INTENT,
  }), true, "Valid confirmation should allow a manual therapist field action.");
  assert.equal(isTherapistFieldVisitActionConfirmed({
    action: "mark_completed",
    confirmationIntent: null,
  }), false, "Missing confirmation should block a manual therapist field action.");

  const unassignedVisit = await db(prisma.visit.findFirst({ where: { id: otherTherapistVisit.id, therapistId: therapistA.id } }), "visit.findFirst cross-therapist scope");
  assert.equal(unassignedVisit, null, "Therapist must not scope another therapist visit.");

  const start = resolveTherapistFieldVisitAction({ action: "start_visit", now: new Date("2026-07-10T15:30:00.000Z"), scheduledAt: scheduledVisit.scheduledAt, status: scheduledVisit.status });
  assert.equal(start?.allowed, true);
  const inProgress = await db(prisma.visit.update({ where: { id: scheduledVisit.id }, data: { status: start!.nextStatus } }), "visit.update start");
  await db(prisma.auditLog.create({
    data: {
      action: start!.auditAction,
      actorId: therapistA.id,
      actorType: "therapist_pilot",
      entityId: scheduledVisit.id,
      entityType: "Visit",
      metadataJson: { newStatus: inProgress.status, oldStatus: scheduledVisit.status, referralId: referralA.id, therapistId: therapistA.id },
    },
  }), "auditLog.create visit started");

  const complete = resolveTherapistFieldVisitAction({ action: "mark_completed", now: new Date("2026-07-10T16:00:00.000Z"), scheduledAt: inProgress.scheduledAt, status: inProgress.status });
  assert.equal(complete?.allowed, true);
  const completed = await db(prisma.visit.update({ where: { id: inProgress.id }, data: { status: complete!.nextStatus } }), "visit.update complete");
  await db(prisma.auditLog.create({
    data: {
      action: complete!.auditAction,
      actorId: therapistA.id,
      actorType: "therapist_pilot",
      entityId: completed.id,
      entityType: "Visit",
      metadataJson: { earlyCompletionWarning: complete.earlyCompletionWarning, newStatus: completed.status, oldStatus: inProgress.status, referralId: referralA.id, therapistId: therapistA.id },
    },
  }), "auditLog.create visit completed");

  const noShow = resolveTherapistFieldVisitAction({ action: "mark_no_show", now: new Date("2026-07-11T16:00:00.000Z"), scheduledAt: noShowVisit.scheduledAt, status: noShowVisit.status });
  assert.equal(noShow?.allowed, true);
  const noShowUpdated = await db(prisma.visit.update({ where: { id: noShowVisit.id }, data: { status: noShow!.nextStatus } }), "visit.update no-show");
  await db(prisma.auditLog.create({
    data: {
      action: noShow!.auditAction,
      actorId: therapistA.id,
      actorType: "therapist_pilot",
      entityId: noShowUpdated.id,
      entityType: "Visit",
      metadataJson: { newStatus: noShowUpdated.status, oldStatus: noShowVisit.status, referralId: referralA.id, therapistId: therapistA.id },
    },
  }), "auditLog.create visit no-show");

  await db(prisma.auditLog.create({
    data: {
      action: "permission_denied",
      actorId: therapistA.id,
      actorType: "therapist_pilot",
      entityId: otherTherapistVisit.id,
      entityType: "Visit",
      metadataJson: { reason: "therapist_scope_mismatch", route: "/my-work" },
    },
  }), "auditLog.create permission denied");

  const unsafe = classifyOperationalNote("Patient medication list changed.", { fieldLabel: "Visit note" });
  assert.equal(hasBlockedNoteClassification(unsafe), true);
  await db(prisma.auditLog.create({
    data: {
      action: "therapist_visit_note_blocked",
      actorId: therapistA.id,
      actorType: "therapist_pilot",
      entityId: completed.id,
      entityType: "Visit",
      metadataJson: getSafeBlockedNoteAuditMetadata(unsafe, {
        extra: { attemptedAction: "mark_completed", referralId: referralA.id, status: completed.status, therapistId: therapistA.id },
        fieldLabel: "Visit note",
        route: "/my-work",
        workflow: "therapist_field_visit_action",
      }),
    },
  }), "auditLog.create blocked note");

  const auditActions = await db(prisma.auditLog.findMany({
    select: { action: true },
    where: {
      action: { in: ["therapist_visit_started", "therapist_visit_completed", "therapist_visit_no_show", "therapist_visit_note_blocked", "permission_denied"] },
      actorId: therapistA.id,
      entityType: "Visit",
    },
  }), "auditLog.findMany action verification");
  const actionSet = new Set(auditActions.map((item) => item.action));
  assert.equal(actionSet.has("therapist_visit_started"), true);
  assert.equal(actionSet.has("therapist_visit_completed"), true);
  assert.equal(actionSet.has("therapist_visit_no_show"), true);
  assert.equal(actionSet.has("therapist_visit_note_blocked"), true);
  assert.equal(actionSet.has("permission_denied"), true);

  const assistantCards = getTherapistAssistantCards({
    completedRecentlyVisits: 1,
    inProgressVisits: 0,
    needsContact: 0,
    noShowVisits: 1,
    optedOutContacts: 1,
    readyToSchedule: 0,
    recentlyCompleted: 1,
    readyToStartVisits: 0,
    upcomingVisits: 0,
  });
  const renderedAssistant = assistantCards.map((card) => `${card.label} ${card.explanation} ${card.nextAction}`).join("\n");
  assert.match(renderedAssistant, /No-show follow-up needed/);
  assert.match(renderedAssistant, /Opted-out contact - non-SMS follow-up only/);
  assertSafeRendered(renderedAssistant);

  const fieldStatus = getTherapistFieldWorkflowStatus();
  assert.equal(fieldStatus.enabled, true);
  assert.equal(fieldStatus.therapistFieldConfirmationsEnabled, true);
  assert.equal(fieldStatus.mobileActionUxEnabled, true);
  assert.equal(fieldStatus.safeBlockedNoteFeedbackEnabled, true);
  assert.equal(fieldStatus.therapistFieldActivityAuditEnabled, true);
  assert.equal(fieldStatus.manualOnly, true);
  assert.equal(fieldStatus.noPhiMode, true);
  assert.equal(fieldStatus.smsSendingEnabled, false);
  assert.equal(fieldStatus.externalApisEnabled, false);
  assert.equal(fieldStatus.externalAiEnabled, false);
  assert.equal(fieldStatus.geocodingEnabled, false);
  assert.equal(fieldStatus.travelTimeApisEnabled, false);
  assert.equal(fieldStatus.autonomousStatusChangesEnabled, false);

  const adminLayout = await readFile(new URL("../app/admin/layout.tsx", import.meta.url), "utf8");
  assert.match(adminLayout, /requirePilotSession\(\["admin"\]/, "Admin layout must remain admin-only.");

  const smsAfter = await db(prisma.smsMessage.count(), "smsMessage.count final no-SMS guard");
  assert.equal(smsAfter, smsBefore, "Therapist field workflow must not send or record SMS.");

  console.log("PASS_THERAPIST_FIELD_SMOKE");
  console.log("Therapist field smoke passed: assigned-only updates, lifecycle actions, unsafe note block audit, no SMS, deterministic safety gates, and admin RBAC contract verified.");
} catch (error) {
  console.error(`${smokeFailToken(SCRIPT_TOKEN, error)} ${smokeErrorSummary(error)}`);
  process.exitCode = 1;
} finally {
  await withTimeout(prisma.$disconnect(), 5_000, "prisma.$disconnect therapist field smoke").catch((error) => {
    console.error(`WARN_THERAPIST_FIELD_SMOKE_DISCONNECT ${smokeErrorSummary(error)}`);
  });
  if (process.exitCode) process.exit(process.exitCode);
}
