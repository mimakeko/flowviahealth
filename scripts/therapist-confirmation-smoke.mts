import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadLocalEnv } from "./load-local-env.mts";

const SMOKE_SOURCE = "flowvia_therapist_confirmation_smoke_v1";

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for therapist confirmation smoke.");
}

const { classifyOperationalNote, getSafeBlockedNoteAuditMetadata, hasBlockedNoteClassification } = await import("../lib/compliance/note-classification.ts");
const { getPrismaClient } = await import("../lib/db/prisma.ts");
const {
  getTherapistFieldWorkflowStatus,
  isTherapistFieldVisitActionConfirmed,
  resolveTherapistFieldVisitAction,
  THERAPIST_FIELD_CONFIRMATION_INTENT,
} = await import("../lib/pilot/therapist-field-workflow.ts");

const prisma = getPrismaClient();
const runId = randomUUID().slice(0, 8);
const phone = "+15550113001";
const unsafeRawNote = "Patient insulin dose changed before visit.";
const smsBefore = await prisma.smsMessage.count();

try {
  await prisma.patientReferral.deleteMany({ where: { referralSource: SMOKE_SOURCE } });
  await prisma.therapist.deleteMany({ where: { email: { startsWith: "therapist.confirmation.smoke." } } });

  assert.equal(isTherapistFieldVisitActionConfirmed({
    action: "mark_completed",
    confirmationIntent: THERAPIST_FIELD_CONFIRMATION_INTENT,
  }), true, "Valid therapist field action and intent should satisfy confirmation.");
  assert.equal(isTherapistFieldVisitActionConfirmed({
    action: "mark_completed",
    confirmationIntent: null,
  }), false, "Missing confirmation intent must not satisfy confirmation.");
  assert.equal(isTherapistFieldVisitActionConfirmed({
    action: "delete_visit",
    confirmationIntent: THERAPIST_FIELD_CONFIRMATION_INTENT,
  }), false, "Unknown actions must not satisfy confirmation.");

  const therapist = await prisma.therapist.create({
    data: {
      active: true,
      email: `therapist.confirmation.smoke.${runId}@flowviahealth.test`,
      name: "Therapist Confirmation Smoke",
      phone,
      serviceAreaNotes: "Therapist confirmation smoke. No PHI.",
    },
  });
  const referral = await prisma.patientReferral.create({
    data: {
      assignedTherapistId: therapist.id,
      city: "Plano",
      patientName: "Therapist Confirmation Smoke Patient",
      phone,
      referralSource: SMOKE_SOURCE,
      status: "scheduled",
      zip: "75024",
    },
  });
  const visit = await prisma.visit.create({
    data: {
      referralId: referral.id,
      scheduledAt: new Date("2026-07-15T15:00:00.000Z"),
      status: "scheduled",
      therapistId: therapist.id,
    },
  });

  const futureCompletion = resolveTherapistFieldVisitAction({
    action: "mark_completed",
    now: new Date("2026-07-10T15:00:00.000Z"),
    scheduledAt: visit.scheduledAt,
    status: visit.status,
  });
  assert.equal(futureCompletion?.allowed, true, "Future completion remains human-confirmed rather than automatically blocked.");
  assert.equal(futureCompletion?.earlyCompletionWarning, true, "Future completion must keep an auditable warning flag.");

  const terminalProtection = resolveTherapistFieldVisitAction({
    action: "mark_completed",
    scheduledAt: visit.scheduledAt,
    status: "completed",
  });
  assert.equal(terminalProtection?.allowed, false, "Terminal visits must remain locked.");
  assert.equal(terminalProtection?.terminalWarning, true, "Terminal lock should expose a terminal warning.");

  const unsafe = classifyOperationalNote(unsafeRawNote, { fieldLabel: "Visit note" });
  assert.equal(hasBlockedNoteClassification(unsafe), true, "PHI-like/clinical visit notes must be blocked.");
  const safeMetadata = getSafeBlockedNoteAuditMetadata(unsafe, {
    extra: {
      attemptedAction: "mark_completed",
      referralId: referral.id,
      status: visit.status,
      therapistId: therapist.id,
    },
    fieldLabel: "Visit note",
    route: "/my-work",
    workflow: "therapist_field_visit_action",
  });
  const serializedSafeMetadata = JSON.stringify(safeMetadata);
  assert.match(serializedSafeMetadata, /attemptedAction/);
  assert.match(serializedSafeMetadata, /blockedReason/);
  assert.doesNotMatch(serializedSafeMetadata, /Patient insulin dose changed before visit/i, "Safe audit metadata must not include the raw blocked note.");
  assert.doesNotMatch(serializedSafeMetadata, /\binsulin\b/i, "Safe audit metadata must not include matched clinical terms.");

  await prisma.auditLog.create({
    data: {
      action: "therapist_visit_note_blocked",
      actorId: therapist.id,
      actorType: "therapist_pilot",
      entityId: visit.id,
      entityType: "Visit",
      metadataJson: safeMetadata,
    },
  });

  const reloadedVisit = await prisma.visit.findUnique({ select: { notes: true, status: true }, where: { id: visit.id } });
  assert.equal(reloadedVisit?.notes, null, "Blocked note body must not be persisted to the visit.");
  assert.equal(reloadedVisit?.status, "scheduled", "Blocked note path must not change visit status.");

  const myWorkPage = await readFile(new URL("../app/my-work/page.tsx", import.meta.url), "utf8");
  const fieldWorkflowSource = await readFile(new URL("../lib/pilot/therapist-field-workflow.ts", import.meta.url), "utf8");
  const adminVisitPage = await readFile(new URL("../app/admin/visits/[id]/page.tsx", import.meta.url), "utf8");
  const adminAuditPage = await readFile(new URL("../app/admin/audit/page.tsx", import.meta.url), "utf8");
  const adminHealthPage = await readFile(new URL("../app/admin/health/page.tsx", import.meta.url), "utf8");

  assert.match(myWorkPage, /THERAPIST_FIELD_CONFIRMATION_INTENT/, "My Work form must submit the confirmation intent.");
  assert.match(myWorkPage, /confirmation_required/, "My Work must show a safe confirmation-required error.");
  assert.match(myWorkPage, /action\.confirmLabel/, "Completion writes must render the configured confirmation submit label.");
  assert.match(fieldWorkflowSource, /Confirm complete/, "Completion writes must use a confirmation submit label.");
  assert.match(myWorkPage, /<details/, "Visit actions must open an inline confirmation disclosure.");
  assert.match(myWorkPage, /Review visit action/, "Next field action panel must jump to the visit card.");
  assert.match(myWorkPage, /role="status"/, "Successful visit actions must show a safe success banner.");
  assert.match(myWorkPage, /role="alert"/, "Validation failures must show a safe error banner.");
  assert.match(myWorkPage, /redactPhone\(visit\.referral\.phone\)/, "Visit phone display must stay masked.");
  assert.doesNotMatch(myWorkPage, /\b(confirm\(|alert\(|sendSms|telnyx\.messages|fetch\(|axios|mapbox|geocode|directionsService)\b/i);

  assert.match(adminVisitPage, /Current field state/);
  assert.match(adminVisitPage, /Therapist field activity/);
  assert.match(adminVisitPage, /Raw blocked note text is not stored or shown here/);

  assert.match(adminAuditPage, /Therapist field actions/);
  assert.match(adminAuditPage, /Blocked notes/);
  assert.match(adminAuditPage, /Visit status changes/);
  assert.match(adminAuditPage, /Future completion warnings/);
  assert.match(adminAuditPage, /blockedReason/);
  assert.match(adminAuditPage, /matchedCategoryCount/);

  assert.match(adminHealthPage, /Therapist field confirmations/);
  assert.match(adminHealthPage, /Mobile action UX/);
  assert.match(adminHealthPage, /Blocked note safe feedback/);
  assert.match(adminHealthPage, /Field activity audit/);
  assert.match(adminHealthPage, /Autonomous field actions/);
  assert.match(adminHealthPage, /External AI\/API for field notes/);
  assert.match(adminHealthPage, /PHI note storage/);

  const fieldStatus = getTherapistFieldWorkflowStatus();
  assert.equal(fieldStatus.therapistFieldConfirmationsEnabled, true);
  assert.equal(fieldStatus.mobileActionUxEnabled, true);
  assert.equal(fieldStatus.safeBlockedNoteFeedbackEnabled, true);
  assert.equal(fieldStatus.therapistFieldActivityAuditEnabled, true);
  assert.equal(fieldStatus.autonomousStatusChangesEnabled, false);
  assert.equal(fieldStatus.externalApisEnabled, false);
  assert.equal(fieldStatus.externalAiEnabled, false);
  assert.equal(fieldStatus.phiNoteStorageEnabled, false);

  const smsAfter = await prisma.smsMessage.count();
  assert.equal(smsAfter, smsBefore, "Therapist confirmation smoke must not send or record SMS.");

  console.log("Therapist confirmation smoke passed: inline confirmation, safe banners, blocked-note metadata, terminal locks, field activity surfaces, health flags, no SMS, and no external API surfaces verified.");
} finally {
  await prisma.$disconnect();
}
