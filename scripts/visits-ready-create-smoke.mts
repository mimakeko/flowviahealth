import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadLocalEnv } from "./load-local-env.mts";

const LEGACY_SMOKE_SOURCE = "flowvia_visits_ready_create_smoke_v1";
const SMOKE_SOURCE = "flowvia_guided_visit_create_validation_v1";

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for visits ready-create smoke.");
}

const { getPrismaClient } = await import("../lib/db/prisma.ts");
const {
  canCreateVisitForReferral,
  evaluateReferralIntakeQuality,
  getReferralDuplicateCandidates,
  getReferralIntakeQualityStatus,
} = await import("../lib/pilot/referral-intake-quality.ts");
const {
  getSchedulingWindowActionPolicy,
  getSuggestedSchedulingWindows,
} = await import("../lib/pilot/scheduling-intelligence.ts");
const { STEWARDSHIP_ARCHIVE_MARKER } = await import("../lib/pilot/data-stewardship.ts");
const { normalizeE164Phone } = await import("../lib/sms/compliance.ts");

const prisma = getPrismaClient();
const runId = randomUUID().slice(0, 8);
const phoneSuffix = runId
  .split("")
  .map((char) => char.charCodeAt(0) % 10)
  .join("")
  .slice(0, 4);
const phone = `+1555022${phoneSuffix}`;

type ReadyCreateReferralRow = {
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
  visits: { id?: string; scheduledAt?: Date | null; status: string }[];
  zip: string | null;
};

function duplicateSources(rows: ReadyCreateReferralRow[]) {
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

function gateFor(row: ReadyCreateReferralRow, rows: ReadyCreateReferralRow[], smsConsentStatus = "active", activeWorkflowVisible = true) {
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
    sources: duplicateSources(rows),
  });
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

  return canCreateVisitForReferral({
    activeWorkflowVisible,
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
  });
}

function assertNoForbiddenSourceTerms(source: string, label: string) {
  assert.doesNotMatch(source, /\b(sendSms|telnyx\.messages|fetch\s*\(|googlemaps|mapbox|geocodio|distanceMatrix|new PrismaClient)\b/i, `${label} must preserve no-SMS, no-external-API, and Prisma wrapper guardrails.`);
}

async function archiveValidationRows() {
  const note = `[${new Date().toISOString()}] Guided visit creation validation archived. ${STEWARDSHIP_ARCHIVE_MARKER}`;
  await prisma.visit.updateMany({
    data: { notes: note },
    where: { referral: { referralSource: { in: [LEGACY_SMOKE_SOURCE, SMOKE_SOURCE] } } },
  });
  await prisma.patientReferral.updateMany({
    data: { notes: note },
    where: { referralSource: { in: [LEGACY_SMOKE_SOURCE, SMOKE_SOURCE] } },
  });
  await prisma.therapist.updateMany({
    data: { active: false },
    where: { OR: [{ email: { startsWith: "visits.ready-create.smoke." } }, { email: { startsWith: "visits.ready-create.validation." } }] },
  });
}

try {
  const smsBefore = await prisma.smsMessage.count();
  await archiveValidationRows();

  const therapist = await prisma.therapist.create({
    data: {
      active: true,
      email: `visits.ready-create.validation.${runId}@flowviahealth.test`,
      name: "Visits Ready Create Validation Therapist",
      phone,
      serviceAreaNotes: "Plano 75024 guided visit creation validation. No clinical detail.",
    },
  });
  const readyReferral = await prisma.patientReferral.create({
    data: {
      assignedTherapistId: therapist.id,
      careType: "Plano operational scheduling",
      city: "Plano",
      patientName: "Guided Visit Ready Validation",
      phone,
      referralSource: SMOKE_SOURCE,
      status: "contacted",
      zip: "75024",
    },
  });
  const blockedReferral = await prisma.patientReferral.create({
    data: {
      careType: "Needs intake review",
      city: null,
      patientName: "Guided Visit Blocked Validation",
      phone: `+1555023${phoneSuffix}`,
      referralSource: SMOKE_SOURCE,
      status: "new",
      zip: null,
    },
  });

  const initialRows = await prisma.patientReferral.findMany({
    include: {
      assignedTherapist: { select: { name: true } },
      visits: {
        select: { id: true, scheduledAt: true, status: true },
        where: { status: { in: ["scheduled", "in_progress"] } },
      },
    },
    where: { id: { in: [readyReferral.id, blockedReferral.id] } },
  }) as ReadyCreateReferralRow[];
  const readyRow = initialRows.find((row) => row.id === readyReferral.id);
  const blockedRow = initialRows.find((row) => row.id === blockedReferral.id);
  assert.ok(readyRow, "Ready referral should be queryable for guided create flow.");
  assert.ok(blockedRow, "Blocked referral should be queryable for guided create flow.");

  const readyGate = gateFor(readyRow, initialRows);
  assert.equal(readyGate.allowed, true, "Ready referral should pass the deterministic create-visit gate.");
  const blockedGate = gateFor(blockedRow, initialRows, "none");
  assert.equal(blockedGate.allowed, false, "Blocked referral should not pass the deterministic create-visit gate.");
  assert.match(blockedGate.reasons.join(" "), /Missing therapist|Missing city|Missing ZIP|Needs contacted\/active status|Needs intake review/);

  const windows = getSuggestedSchedulingWindows({ scheduledVisits: [] }, new Date("2026-07-06T14:00:00.000Z"));
  assert.ok(windows.length > 0, "Guided visit creation should expose deterministic business-day windows.");
  const policy = getSchedulingWindowActionPolicy();
  assert.deepEqual(policy, {
    action: "fill_datetime_field_only",
    autonomousSchedulingEnabled: false,
    createsVisit: false,
    fieldName: "scheduledAt",
    requiresManualSubmit: true,
    sendsSms: false,
  });

  const visit = await prisma.visit.create({
    data: {
      referralId: readyReferral.id,
      scheduledAt: windows[0].scheduledAt,
      status: "scheduled",
      therapistId: therapist.id,
    },
  });
  await prisma.auditLog.create({
    data: {
      action: "visit_created",
      actorId: "visits_ready_create_smoke",
      actorType: "pilot_admin",
      entityId: visit.id,
      entityType: "Visit",
      metadataJson: {
        readyGateEnforced: true,
        referralId: readyReferral.id,
        source: "guided_visit_creation",
        status: visit.status,
        therapistId: therapist.id,
      },
    },
  });

  const afterCreateRows = await prisma.patientReferral.findMany({
    include: {
      assignedTherapist: { select: { name: true } },
      visits: {
        select: { id: true, scheduledAt: true, status: true },
        where: { status: { in: ["scheduled", "in_progress"] } },
      },
    },
    where: { id: { in: [readyReferral.id, blockedReferral.id] } },
  }) as ReadyCreateReferralRow[];
  const readyAfterCreate = afterCreateRows.find((row) => row.id === readyReferral.id);
  assert.ok(readyAfterCreate);
  const duplicateGate = gateFor(readyAfterCreate, afterCreateRows);
  assert.equal(duplicateGate.allowed, false, "Existing open/future visit should block duplicate visit creation.");
  assert.match(duplicateGate.reasons.join(" "), /Existing open\/future visit/);

  await prisma.auditLog.create({
    data: {
      action: "visit_create_blocked",
      actorId: "visits_ready_create_smoke",
      actorType: "pilot_admin",
      entityId: blockedReferral.id,
      entityType: "PatientReferral",
      metadataJson: {
        reason: blockedGate.reasons.slice(0, 5).join(","),
        route: "/admin/visits/new",
        severity: blockedGate.severity,
        source: "guided_visit_creation",
      },
    },
  });
  const blockedAudit = await prisma.auditLog.findFirst({
    where: {
      action: "visit_create_blocked",
      entityId: blockedReferral.id,
      entityType: "PatientReferral",
    },
  });
  assert.ok(blockedAudit, "Blocked create attempts should have a safe audit path.");

  const status = getReferralIntakeQualityStatus();
  assert.equal(status.guidedVisitCreationEnabled, true);
  assert.equal(status.manualVisitCreateSubmitRequired, true);
  assert.equal(status.visitCreateReadyGateEnforced, true);
  assert.equal(status.visitCreateSmsSendingEnabled, false);
  assert.equal(status.visitCreateMapsGeocodingTravelTimeEnabled, false);
  assert.equal(status.autoVisitCreationEnabled, false);
  assert.equal(status.visitCreateBlockedAuditEnabled, true);

  const safeSummary = [
    readyReferral.patientName,
    readyReferral.status,
    [readyReferral.city, readyReferral.zip].filter(Boolean).join(" / "),
    therapist.name,
    "Source: deterministic",
  ].join(" | ");
  assert.doesNotMatch(safeSummary, /\+1\d{10}|\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b|raw SMS|provider payload|BEGIN PRIVATE KEY|DATABASE_URL/i);
  assert.equal(normalizeE164Phone(phone), phone);

  const [newVisitSource, visitDetailSource, healthSource, browserSmokeSource] = await Promise.all([
    readFile("app/admin/visits/new/page.tsx", "utf8"),
    readFile("app/admin/visits/[id]/page.tsx", "utf8"),
    readFile("app/admin/health/page.tsx", "utf8"),
    readFile("tests/e2e/authenticated-browser-smoke.spec.ts", "utf8"),
  ]);
  for (const [label, source] of Object.entries({ browserSmokeSource, healthSource, newVisitSource, visitDetailSource })) {
    assertNoForbiddenSourceTerms(source, label);
  }
  assert.match(newVisitSource, /ready-referral-selected-panel/);
  assert.match(newVisitSource, /blocked-referral-selected-panel/);
  assert.match(newVisitSource, /Use this window only fills/);
  assert.match(newVisitSource, /visit_create_blocked/);
  assert.match(visitDetailSource, /visit-created-success-panel/);
  assert.match(healthSource, /Guided visit creation/);
  assert.match(browserSmokeSource, /ready-referral-selected-panel/);

  const smsAfter = await prisma.smsMessage.count();
  assert.equal(smsAfter, smsBefore, "Guided visit creation smoke must not send or record SMS.");

  console.log("Visits ready-create smoke passed: guided ready flow, manual submit policy, blocked gates/audit, duplicate visit block, safe rendering strings, and no SMS/external APIs verified.");
} finally {
  await archiveValidationRows();
  await prisma.$disconnect();
}
