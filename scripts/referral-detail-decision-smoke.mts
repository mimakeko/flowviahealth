import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadLocalEnv } from "./load-local-env.mts";

const TEMP_SOURCE = "flowvia_referral_detail_decision_validation_v1";

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for referral detail decision smoke.");
}

const { getPrismaClient } = await import("../lib/db/prisma.ts");
const {
  DB_SMOKE_SOURCE,
  RESET_DEMO_SCENARIOS_CONFIRMATION,
  STEWARDSHIP_ARCHIVE_MARKER,
  activeWorkflowWhereClause,
  resetDemoScenarios,
} = await import("../lib/pilot/data-stewardship.ts");
const {
  canCreateVisitForReferral,
  evaluateReferralIntakeQuality,
  getReferralDuplicateCandidates,
  getReferralIntakeQualityStatus,
} = await import("../lib/pilot/referral-intake-quality.ts");
const { normalizeE164Phone } = await import("../lib/sms/compliance.ts");

const prisma = getPrismaClient();
const runId = randomUUID().slice(0, 8);
const phoneSuffix = runId
  .split("")
  .map((char) => char.charCodeAt(0) % 10)
  .join("")
  .padEnd(4, "0")
  .slice(0, 4);

type DetailReferralRow = {
  assignedTherapist: { name: string } | null;
  assignedTherapistId: string | null;
  careType: string | null;
  city: string | null;
  createdAt: Date | string;
  id: string;
  notes: string | null;
  patientName: string;
  phone: string;
  referralSource: string | null;
  status: string;
  visits: { id: string; status: string }[];
  zip: string | null;
};

function duplicateSources(rows: DetailReferralRow[]) {
  return rows.map((row) => ({
    assignedTherapistId: row.assignedTherapistId,
    assignedTherapistName: row.assignedTherapist?.name,
    city: row.city,
    createdAt: row.createdAt,
    futureOpenVisitCount: row.visits.length,
    id: row.id,
    patientName: row.patientName,
    phone: row.phone,
    status: row.status,
    zip: row.zip,
  }));
}

async function buildGate(row: DetailReferralRow, duplicateSourceRows: DetailReferralRow[]) {
  const smsConsent = await prisma.smsConsentEnrollment.findUnique({
    select: { status: true },
    where: { normalizedPhone: normalizeE164Phone(row.phone) },
  });
  const duplicateCandidates = getReferralDuplicateCandidates({
    draft: {
      assignedTherapistId: row.assignedTherapistId,
      assignedTherapistName: row.assignedTherapist?.name,
      city: row.city,
      createdAt: row.createdAt,
      id: row.id,
      patientName: row.patientName,
      phone: row.phone,
      status: row.status,
      zip: row.zip,
    },
    sources: duplicateSources(duplicateSourceRows),
  });
  const smsConsentStatus = smsConsent?.status || "none";
  const intakeQuality = evaluateReferralIntakeQuality({
    assignedTherapistId: row.assignedTherapistId,
    assignedTherapistName: row.assignedTherapist?.name,
    careType: row.careType,
    city: row.city,
    duplicateCandidates,
    patientName: row.patientName,
    phone: row.phone,
    smsConsentStatus,
    status: row.status,
    zip: row.zip,
  });
  const activeWorkflowVisible = await prisma.patientReferral.count({ where: activeWorkflowWhereClause({ id: row.id }) });

  return {
    duplicateCandidates,
    gate: canCreateVisitForReferral({
      activeWorkflowVisible: activeWorkflowVisible > 0,
      assignedTherapistId: row.assignedTherapistId,
      assignedTherapistName: row.assignedTherapist?.name,
      careType: row.careType,
      city: row.city,
      duplicateCandidates,
      futureVisitCount: row.visits.length,
      intakeQuality,
      notes: row.notes,
      patientName: row.patientName,
      phone: row.phone,
      referralSource: row.referralSource,
      smsConsentStatus,
      status: row.status,
      zip: row.zip,
    }),
    intakeQuality,
    smsConsentStatus,
  };
}

function byName(rows: DetailReferralRow[], patientName: string) {
  const row = rows.find((item) => item.patientName === patientName);
  assert.ok(row, `${patientName} should exist.`);
  return row;
}

function assertReviewOnly(label: string, gate: ReturnType<typeof canCreateVisitForReferral>, reasonPattern: RegExp) {
  assert.equal(gate.allowed, false, `${label} must be review-only.`);
  assert.match(gate.reasons.join(" "), reasonPattern, `${label} should explain the blocker.`);
}

function assertNoForbiddenSourceTerms(source: string, label: string) {
  assert.doesNotMatch(source, /\b(sendSms|sendSmsMessage|telnyx\.messages|smsMessage\.create|fetch\s*\(|new\s+OpenAI|openai\.chat|googlemaps|google\.maps|mapbox|geocodio|distanceMatrix|travelTime|geocod)\b/i, `${label} must not add SMS sends, external AI, maps/geocoding/travel-time, or external duplicate API calls.`);
  assert.doesNotMatch(source, /\bnew PrismaClient\b/i, `${label} must use the shared Prisma wrapper.`);
}

try {
  const smsBefore = await prisma.smsMessage.count();

  await prisma.visit.deleteMany({ where: { referral: { referralSource: TEMP_SOURCE } } });
  await prisma.patientReferral.deleteMany({ where: { referralSource: TEMP_SOURCE } });
  await prisma.therapist.deleteMany({ where: { email: { startsWith: "referral.detail.decision." } } });

  await resetDemoScenarios(prisma, "referral_detail_decision_smoke", RESET_DEMO_SCENARIOS_CONFIRMATION);

  const therapist = await prisma.therapist.create({
    data: {
      active: true,
      email: `referral.detail.decision.${runId}@flowviahealth.test`,
      name: "Referral Detail Decision Therapist",
      phone: `+1555061${phoneSuffix}`,
      serviceAreaNotes: "Referral detail decision smoke service area. Fake pilot data only.",
    },
  });
  const missingTherapist = await prisma.patientReferral.create({
    data: {
      assignedTherapistId: null,
      careType: "Demo detail decision visit",
      city: "Plano",
      patientName: "Referral Detail Decision Missing Therapist",
      phone: `+1555062${phoneSuffix}`,
      referralSource: TEMP_SOURCE,
      status: "contacted",
      zip: "75024",
    },
  });
  const archivedReferral = await prisma.patientReferral.create({
    data: {
      assignedTherapistId: therapist.id,
      careType: "Demo detail decision archived",
      city: "Dallas",
      notes: `Archived detail decision smoke. ${STEWARDSHIP_ARCHIVE_MARKER}`,
      patientName: "Referral Detail Decision Archived",
      phone: `+1555063${phoneSuffix}`,
      referralSource: TEMP_SOURCE,
      status: "contacted",
      zip: "75230",
    },
  });
  const smokeReferral = await prisma.patientReferral.create({
    data: {
      assignedTherapistId: therapist.id,
      careType: "Smoke test detail decision",
      city: "Dallas",
      patientName: "Smoke Referral Detail Decision",
      phone: `+1555064${phoneSuffix}`,
      referralSource: DB_SMOKE_SOURCE,
      status: "contacted",
      zip: "75230",
    },
  });

  const rows = await prisma.patientReferral.findMany({
    include: {
      assignedTherapist: { select: { name: true } },
      visits: {
        select: { id: true, status: true },
        where: { status: { in: ["scheduled", "in_progress"] } },
      },
    },
    orderBy: { createdAt: "desc" },
    where: {
      OR: [
        { patientName: { startsWith: "Demo Scenario" } },
        { id: { in: [missingTherapist.id, archivedReferral.id, smokeReferral.id] } },
      ],
    },
  }) as DetailReferralRow[];
  const duplicateSourceRows = await prisma.patientReferral.findMany({
    include: {
      assignedTherapist: { select: { name: true } },
      visits: {
        select: { id: true, status: true },
        where: { status: { in: ["scheduled", "in_progress"] } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 150,
    where: activeWorkflowWhereClause({ status: { notIn: ["completed", "canceled"] } }),
  }) as DetailReferralRow[];

  const ready = await buildGate(byName(rows, "Demo Scenario Ready Schedule"), duplicateSourceRows);
  assert.equal(ready.gate.allowed, true, "Ready demo referral must pass the detail decision gate.");
  assert.equal(ready.gate.reasons.length, 0, "Ready demo referral should have no blockers.");

  const duplicateA = await buildGate(byName(rows, "Demo Scenario Duplicate A"), duplicateSourceRows);
  assertReviewOnly("Duplicate demo referral", duplicateA.gate, /Duplicate review/);
  assert.equal(duplicateA.intakeQuality.duplicateReviewRequired, true);
  assert.ok(duplicateA.duplicateCandidates.length > 0, "Duplicate demo referral should expose safe duplicate signals.");
  assert.doesNotMatch(JSON.stringify(duplicateA.duplicateCandidates), /\+15550102104/, "Duplicate summary must not expose the full phone.");

  const optedOut = await buildGate(byName(rows, "Demo Scenario Non SMS Follow Up"), duplicateSourceRows);
  assertReviewOnly("Opted-out demo referral", optedOut.gate, /Non-SMS only/);
  assert.equal(optedOut.smsConsentStatus, "opted_out");

  const missingTherapistGate = await buildGate(byName(rows, "Referral Detail Decision Missing Therapist"), duplicateSourceRows);
  assertReviewOnly("Missing therapist referral", missingTherapistGate.gate, /Missing therapist/);

  const missingIntake = await buildGate(byName(rows, "Demo Scenario Intake Review"), duplicateSourceRows);
  assertReviewOnly("Missing intake demo referral", missingIntake.gate, /Missing therapist|Missing city|Missing ZIP|Needs intake review/);
  assert.ok(missingIntake.intakeQuality.warnings.some((warning) => warning.code === "missing_city"));
  assert.ok(missingIntake.intakeQuality.warnings.some((warning) => warning.code === "missing_zip"));

  const completed = await buildGate(byName(rows, "Demo Scenario Completed Recently"), duplicateSourceRows);
  assertReviewOnly("Terminal completed demo referral", completed.gate, /Terminal referral|Needs contacted\/active status/);

  const archived = await buildGate(byName(rows, "Referral Detail Decision Archived"), duplicateSourceRows);
  assertReviewOnly("Archived referral", archived.gate, /Not in active workflow queue|Archived operational record/);

  const smoke = await buildGate(byName(rows, "Smoke Referral Detail Decision"), duplicateSourceRows);
  assertReviewOnly("Smoke/test referral", smoke.gate, /Not in active workflow queue|Smoke\/test operational record/);

  const status = getReferralIntakeQualityStatus();
  assert.equal(status.referralDetailDecisionWorkspaceEnabled, true);
  assert.equal(status.referralDetailCreateCtaGateEnabled, true);
  assert.equal(status.referralDetailReviewOnlyBlocksEnabled, true);
  assert.equal(status.referralDetailSafetyGuaranteesEnabled, true);
  assert.equal(status.smsSendingEnabled, false);
  assert.equal(status.externalDuplicateApisEnabled, false);
  assert.equal(status.autoAssignmentEnabled, false);
  assert.equal(status.autoVisitCreationEnabled, false);
  assert.equal(status.fullPhoneDisplayEnabled, false);

  const [detailSource, helperSource, healthSource, packageSource] = await Promise.all([
    readFile("app/admin/referrals/[id]/page.tsx", "utf8"),
    readFile("lib/pilot/referral-intake-quality.ts", "utf8"),
    readFile("app/admin/health/page.tsx", "utf8"),
    readFile("package.json", "utf8"),
  ]);

  for (const [label, source] of Object.entries({ detailSource, healthSource, helperSource })) {
    assertNoForbiddenSourceTerms(source, label);
  }

  assert.match(detailSource, /Referral decision/);
  assert.match(detailSource, /createVisitGate\.allowed/);
  assert.match(detailSource, /\/admin\/visits\/new\?referralId=\$\{referral\.id\}/);
  assert.match(detailSource, /Create visit is suppressed until review blockers are resolved/);
  assert.match(detailSource, /Safety guarantees/);
  assert.match(detailSource, /No SMS sent/);
  assert.match(detailSource, /No autonomous scheduling/);
  assert.match(detailSource, /No external duplicate API/);
  assert.match(detailSource, /No maps\/geocoding\/travel-time API/);
  assert.match(detailSource, /No PHI storage in notes/);
  assert.match(detailSource, /Manual admin review required/);
  assert.match(detailSource, /visit_create_blocked/);
  assert.match(detailSource, /redactPhone\(referral\.phone\)|safeDisplay\.maskedPhone/);
  assert.doesNotMatch(detailSource, /\{referral\.address\}/, "Detail page must not render full address.");
  assert.doesNotMatch(detailSource, /<dd[^>]*>\{referral\.phone\}/, "Detail page must not render full phone.");
  assert.doesNotMatch(detailSource, /select:\s*\{[^}]*body/i, "Detail page must not select raw SMS bodies.");
  assert.doesNotMatch(detailSource, /telnyxWebhookEvent|payloadJson/i, "Detail page must not expose provider payloads.");
  assert.doesNotMatch(detailSource, /process\.env|DATABASE_URL|TELNYX_|OPENAI_|NEXT_REDIRECT|stack trace|Prisma error/i, "Detail page must not expose secrets, framework internals, stack traces, raw Prisma errors, or NEXT_REDIRECT.");
  assert.doesNotMatch(detailSource, /type=["']submit["'][^>]*>\s*[^<]*(send|sms)/i, "Detail page must not add SMS send controls.");

  assert.match(healthSource, /Referral detail decision workspace/);
  assert.match(healthSource, /Referral detail create CTA gate/);
  assert.match(healthSource, /Referral detail review-only blocks/);
  assert.match(healthSource, /Referral detail safety guarantees/);
  assert.match(packageSource, /referral:detail-smoke/);

  const smsAfter = await prisma.smsMessage.count();
  assert.equal(smsAfter, smsBefore, "Referral detail decision smoke must not send or record SMS.");

  console.log("Referral detail decision smoke passed: ready CTA eligibility, review-only blockers, duplicate/non-SMS/missing/terminal/archived/smoke gates, health flags, no SMS, no external APIs, and audit-safe rendering verified.");
} finally {
  await prisma.visit.deleteMany({ where: { referral: { referralSource: TEMP_SOURCE } } });
  await prisma.patientReferral.deleteMany({ where: { referralSource: TEMP_SOURCE } });
  await prisma.therapist.deleteMany({ where: { email: { startsWith: "referral.detail.decision." } } });
  await prisma.$disconnect();
}
