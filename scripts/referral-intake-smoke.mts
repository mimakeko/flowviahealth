import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadLocalEnv } from "./load-local-env.mts";

const SMOKE_SOURCE = "flowvia_referral_intake_smoke_v1";

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for referral intake smoke.");
}

const { classifyOperationalNote, getSafeBlockedNoteAuditMetadata, hasBlockedNoteClassification } = await import("../lib/compliance/note-classification.ts");
const {
  evaluateReferralIntakeQuality,
  getReferralDuplicateCandidates,
  getReferralIntakeQualityStatus,
} = await import("../lib/pilot/referral-intake-quality.ts");
const { getPrismaClient } = await import("../lib/db/prisma.ts");

const prisma = getPrismaClient();
const runId = randomUUID().slice(0, 8);
const phoneSuffix = runId
  .split("")
  .map((char) => char.charCodeAt(0) % 10)
  .join("")
  .padEnd(4, "0")
  .slice(0, 4);
const phone = `+1555022${phoneSuffix}`;
const therapistEmail = `referral.intake.smoke.${runId}@flowviahealth.test`;
const smsBefore = await prisma.smsMessage.count();

function assertNoForbiddenSourceTerms(source: string, label: string) {
  assert.doesNotMatch(source, /\b(sendSms|telnyx\.messages|fetch\s*\(|googlemaps|mapbox|geocodio|distanceMatrix)\b/i, `${label} must not send SMS or call external scheduling/duplicate APIs.`);
}

try {
  await prisma.patientReferral.deleteMany({ where: { referralSource: SMOKE_SOURCE } });
  await prisma.therapist.deleteMany({ where: { email: { startsWith: "referral.intake.smoke." } } });
  await prisma.smsConsentEnrollment.deleteMany({ where: { normalizedPhone: phone } });

  const therapist = await prisma.therapist.create({
    data: {
      active: true,
      email: therapistEmail,
      name: "Referral Intake Smoke Therapist",
      phone,
      serviceAreaNotes: "Referral intake smoke service area: Plano 75024. No PHI.",
    },
  });

  const existingReferral = await prisma.patientReferral.create({
    data: {
      assignedTherapistId: therapist.id,
      careType: "Demo intake visit",
      city: "Plano",
      patientName: "Referral Intake Smoke Patient",
      phone,
      referralSource: SMOKE_SOURCE,
      status: "contacted",
      zip: "75024",
    },
  });

  await prisma.smsConsentEnrollment.create({
    data: {
      consentTextVersion: "referral_intake_smoke_v1",
      fullName: "Referral Intake Smoke Patient",
      normalizedPhone: phone,
      phone,
      source: "sms_consent_page",
      status: "active",
    },
  });

  const sourceRows = [
    {
      assignedTherapistId: existingReferral.assignedTherapistId,
      assignedTherapistName: therapist.name,
      city: existingReferral.city,
      createdAt: existingReferral.createdAt,
      futureOpenVisitCount: 0,
      id: existingReferral.id,
      patientName: existingReferral.patientName,
      phone: existingReferral.phone,
      status: existingReferral.status,
      zip: existingReferral.zip,
    },
  ];
  const duplicateCandidates = getReferralDuplicateCandidates({
    draft: {
      assignedTherapistId: therapist.id,
      city: "Plano",
      createdAt: new Date(),
      id: "referral_intake_smoke_draft",
      patientName: "Referral Intake Smoke Patient",
      phone,
      status: "contacted",
      zip: "75024",
    },
    sources: sourceRows,
  });
  assert.equal(duplicateCandidates.length, 1, "Duplicate guard should find a local deterministic match.");
  assert.equal(duplicateCandidates[0].score, "high");
  assert.doesNotMatch(JSON.stringify(duplicateCandidates), /\+1555022\d{4}/, "Duplicate candidates must not expose full phone numbers.");

  const missingQuality = evaluateReferralIntakeQuality({
    city: null,
    phone: "",
    status: "new",
    zip: null,
  });
  assert.equal(missingQuality.readinessLevel, "needs_review");
  assert.ok(missingQuality.warnings.some((warning) => warning.code === "missing_therapist_assignment"));
  assert.ok(missingQuality.warnings.some((warning) => warning.code === "missing_phone"));
  assert.ok(missingQuality.warnings.some((warning) => warning.code === "missing_city"));
  assert.ok(missingQuality.warnings.some((warning) => warning.code === "missing_zip"));

  const duplicateQuality = evaluateReferralIntakeQuality({
    assignedTherapistId: therapist.id,
    assignedTherapistName: therapist.name,
    careType: "Demo intake visit",
    city: "Plano",
    duplicateCandidates,
    patientName: "Referral Intake Smoke Patient",
    phone,
    smsConsentStatus: "active",
    status: "contacted",
    zip: "75024",
  });
  assert.equal(duplicateQuality.duplicateReviewRequired, true);
  assert.equal(duplicateQuality.schedulingReady, false);

  const readyQuality = evaluateReferralIntakeQuality({
    assignedTherapistId: therapist.id,
    assignedTherapistName: therapist.name,
    careType: "Demo intake visit",
    city: "Plano",
    duplicateCandidates: [],
    patientName: "Referral Intake Ready Smoke",
    phone: "+15550229999",
    smsConsentStatus: "active",
    status: "contacted",
    zip: "75024",
  });
  assert.equal(readyQuality.readinessLevel, "ready");
  assert.equal(readyQuality.schedulingReady, true);

  const unsafeNote = "Patient has diabetes and medication changes.";
  const unsafeClassification = classifyOperationalNote(unsafeNote, { fieldLabel: "Referral note" });
  assert.equal(hasBlockedNoteClassification(unsafeClassification), true);
  const safeMetadata = getSafeBlockedNoteAuditMetadata(unsafeClassification, {
    fieldLabel: "Referral note",
    route: "/admin/referrals/new",
    workflow: "referral_intake_smoke",
    extra: {
      duplicateCandidateCount: duplicateCandidates.length,
      duplicateHighestScore: duplicateCandidates[0].score,
      readinessLevel: duplicateQuality.readinessLevel,
      warningCodes: duplicateQuality.warnings.map((warning) => warning.code).join(","),
    },
  });
  assert.doesNotMatch(JSON.stringify(safeMetadata), /diabetes|medication changes/i, "Blocked note audit metadata must not include raw note text.");
  await prisma.auditLog.create({
    data: {
      action: "operational_note_blocked",
      actorId: runId,
      actorType: "referral_intake_smoke",
      entityId: existingReferral.id,
      entityType: "PatientReferral",
      metadataJson: safeMetadata,
    },
  });

  const status = getReferralIntakeQualityStatus();
  assert.equal(status.enabled, true);
  assert.equal(status.duplicateGuardEnabled, true);
  assert.equal(status.duplicateGuardMode, "warning-only");
  assert.equal(status.autoAssignmentEnabled, false);
  assert.equal(status.autoVisitCreationEnabled, false);
  assert.equal(status.externalDuplicateApisEnabled, false);
  assert.equal(status.smsSendingEnabled, false);
  assert.equal(status.fullPhoneDisplayEnabled, false);

  const [helperSource, newReferralSource, detailReferralSource, listReferralSource, schedulingSource, newVisitSource] = await Promise.all([
    readFile("lib/pilot/referral-intake-quality.ts", "utf8"),
    readFile("app/admin/referrals/new/page.tsx", "utf8"),
    readFile("app/admin/referrals/[id]/page.tsx", "utf8"),
    readFile("app/admin/referrals/page.tsx", "utf8"),
    readFile("app/admin/scheduling/page.tsx", "utf8"),
    readFile("app/admin/visits/new/page.tsx", "utf8"),
  ]);
  assert.doesNotMatch(`${newReferralSource}\n${detailReferralSource}\n${listReferralSource}\n${schedulingSource}\n${newVisitSource}`, /new PrismaClient/i, "Pages must use the shared Prisma wrapper.");
  for (const [label, source] of Object.entries({
    detailReferralSource,
    helperSource,
    listReferralSource,
    newReferralSource,
    newVisitSource,
    schedulingSource,
  })) {
    assertNoForbiddenSourceTerms(source, label);
  }

  const smsAfter = await prisma.smsMessage.count();
  assert.equal(smsAfter, smsBefore, "Referral intake smoke must not send or record SMS.");

  console.log("Referral intake smoke passed: checklist, duplicate warnings, safe blocked-note metadata, health flags, no SMS, no external APIs, and Prisma wrapper use verified.");
} finally {
  await prisma.$disconnect();
}
