import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadLocalEnv } from "./load-local-env.mts";

const VALIDATION_SOURCE = "flowvia_opportunity_workflow_validation_v1";

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for opportunity workflow smoke.");
}

const { classifyOperationalNote, hasBlockedNoteClassification } = await import("../lib/compliance/note-classification.ts");
const { getPrismaClient } = await import("../lib/db/prisma.ts");
const { STEWARDSHIP_ARCHIVE_MARKER } = await import("../lib/pilot/data-stewardship.ts");
const {
  canOfferReferralOpportunity,
  getOpportunityStateFromAuditLogs,
  getOpportunityStatesByReferralId,
  getOpportunityStatus,
  isOpportunityDeclineReason,
  opportunityAllowsVisitCreation,
  opportunityWhereClause,
} = await import("../lib/pilot/opportunity.ts");
const {
  canCreateVisitForReferral,
  evaluateReferralIntakeQuality,
  getReferralDuplicateCandidates,
} = await import("../lib/pilot/referral-intake-quality.ts");
const { normalizeE164Phone } = await import("../lib/sms/compliance.ts");

const prisma = getPrismaClient();
const runId = randomUUID().slice(0, 8);
const phoneSuffix = runId
  .split("")
  .map((char) => char.charCodeAt(0) % 10)
  .join("")
  .slice(0, 4);

type OpportunityReferralRow = {
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

function duplicateSources(rows: OpportunityReferralRow[]) {
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

function gateFor(row: OpportunityReferralRow, rows: OpportunityReferralRow[], smsConsentStatus = "active", activeWorkflowVisible = true) {
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
  const createVisitGate = canCreateVisitForReferral({
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

  return { createVisitGate, duplicateCandidates, intakeQuality };
}

function metadataObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function assertSafeAuditMetadata(rows: { action: string; metadataJson: unknown }[]) {
  const safeKeys = new Set(["attemptedAction", "declineReason", "noteAdded", "reason", "source", "therapistId", "workflow"]);
  for (const row of rows) {
    const metadata = metadataObject(row.metadataJson);
    for (const [key, value] of Object.entries(metadata)) {
      assert.ok(safeKeys.has(key), `${row.action} metadata key must stay allow-listed: ${key}`);
      assert.doesNotMatch(String(value), /\+1\d{10}|\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b|raw SMS|provider payload|BEGIN PRIVATE KEY|DATABASE_URL|DIRECT_URL|secret|token|password/i);
    }
  }
}

function assertNoForbiddenSourceTerms(source: string, label: string) {
  assert.doesNotMatch(source, /\b(sendSms|sendMessage|telnyx\.messages|fetch\s*\(|googlemaps|mapbox|geocodio|distanceMatrix|routeOptimization|directionsService|openai|anthropic|axios|XMLHttpRequest|new PrismaClient)\b/i, `${label} must preserve no-SMS, no-external-API, and Prisma wrapper guardrails.`);
}

async function archiveValidationRows() {
  const note = `[${new Date().toISOString()}] Opportunity workflow validation archived. ${STEWARDSHIP_ARCHIVE_MARKER}`;
  await prisma.visit.updateMany({
    data: { notes: note },
    where: { referral: { referralSource: VALIDATION_SOURCE } },
  });
  await prisma.patientReferral.updateMany({
    data: { notes: note },
    where: { referralSource: VALIDATION_SOURCE },
  });
  await prisma.therapist.updateMany({
    data: { active: false },
    where: { email: { startsWith: "opportunity.workflow.validation." } },
  });
}

try {
  const smsBefore = await prisma.smsMessage.count();
  await archiveValidationRows();

  const primaryTherapist = await prisma.therapist.create({
    data: {
      active: true,
      email: `opportunity.workflow.validation.${runId}@flowviahealth.test`,
      name: "Opportunity Workflow Validation Therapist",
      phone: `+1555033${phoneSuffix}`,
      serviceAreaNotes: "Dallas and Plano operational validation area. No clinical detail.",
    },
  });
  const wrongTherapist = await prisma.therapist.create({
    data: {
      active: true,
      email: `opportunity.workflow.validation.alt.${runId}@flowviahealth.test`,
      name: "Opportunity Workflow Alternate Therapist",
      phone: `+1555034${phoneSuffix}`,
      serviceAreaNotes: "Alternate operational validation area. No clinical detail.",
    },
  });
  const readyReferral = await prisma.patientReferral.create({
    data: {
      assignedTherapistId: primaryTherapist.id,
      careType: "Dallas operational visit",
      city: "Dallas",
      notes: "Operational validation row. No PHI.",
      patientName: "Opportunity Ready Validation",
      phone: `+1555035${phoneSuffix}`,
      referralSource: VALIDATION_SOURCE,
      status: "contacted",
      zip: "75230",
    },
  });
  const declinedReferral = await prisma.patientReferral.create({
    data: {
      assignedTherapistId: primaryTherapist.id,
      careType: "Plano operational visit",
      city: "Plano",
      notes: "Operational validation row. No PHI.",
      patientName: "Opportunity Decline Validation",
      phone: `+1555036${phoneSuffix}`,
      referralSource: VALIDATION_SOURCE,
      status: "contacted",
      zip: "75024",
    },
  });
  const blockedReferral = await prisma.patientReferral.create({
    data: {
      careType: "Operational review required",
      notes: "Operational validation row. No PHI.",
      patientName: "Opportunity Blocked Validation",
      phone: `+1555037${phoneSuffix}`,
      referralSource: VALIDATION_SOURCE,
      status: "new",
    },
  });

  const rows = await prisma.patientReferral.findMany({
    include: {
      assignedTherapist: { select: { name: true } },
      visits: {
        select: { id: true, scheduledAt: true, status: true },
        where: { status: { in: ["scheduled", "in_progress"] } },
      },
    },
    where: { id: { in: [readyReferral.id, declinedReferral.id, blockedReferral.id] } },
  }) as OpportunityReferralRow[];
  const readyRow = rows.find((row) => row.id === readyReferral.id);
  const declinedRow = rows.find((row) => row.id === declinedReferral.id);
  const blockedRow = rows.find((row) => row.id === blockedReferral.id);
  assert.ok(readyRow, "Ready referral should be queryable.");
  assert.ok(declinedRow, "Declined referral should be queryable.");
  assert.ok(blockedRow, "Blocked referral should be queryable.");

  const readyGate = gateFor(readyRow, rows);
  const readyOfferGate = canOfferReferralOpportunity({
    activeWorkflowVisible: true,
    assignedTherapistId: readyRow.assignedTherapistId,
    createVisitGate: readyGate.createVisitGate,
    intakeQuality: readyGate.intakeQuality,
    opportunityState: "not_offered",
    status: readyRow.status,
  });
  assert.equal(readyGate.createVisitGate.allowed, true, "Safe assigned active referral should pass create-visit gate.");
  assert.equal(readyOfferGate.allowed, true, "Safe assigned active referral should be offerable.");

  const blockedGate = gateFor(blockedRow, rows, "none");
  const blockedOfferGate = canOfferReferralOpportunity({
    activeWorkflowVisible: true,
    assignedTherapistId: blockedRow.assignedTherapistId,
    createVisitGate: blockedGate.createVisitGate,
    intakeQuality: blockedGate.intakeQuality,
    opportunityState: "not_offered",
    status: blockedRow.status,
  });
  assert.equal(blockedGate.createVisitGate.allowed, false, "Blocked referral should fail create-visit gate.");
  assert.equal(blockedOfferGate.allowed, false, "Blocked referral should not be offerable.");

  await prisma.auditLog.create({
    data: {
      action: "opportunity_offered",
      actorId: "opportunity_workflow_validation",
      actorType: "pilot_admin",
      entityId: readyReferral.id,
      entityType: "PatientReferral",
      metadataJson: {
        source: "deterministic_manual",
        therapistId: primaryTherapist.id,
      },
    },
  });
  await prisma.auditLog.create({
    data: {
      action: "opportunity_action_blocked",
      actorId: wrongTherapist.id,
      actorType: "therapist_pilot",
      entityId: readyReferral.id,
      entityType: "PatientReferral",
      metadataJson: {
        attemptedAction: "accept",
        reason: "offered_therapist_mismatch",
        source: "opportunity_workflow_validation",
        therapistId: wrongTherapist.id,
      },
    },
  });
  const offeredLogs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    where: { AND: [opportunityWhereClause(), { entityId: readyReferral.id, entityType: "PatientReferral" }] },
  });
  const offeredState = getOpportunityStateFromAuditLogs(offeredLogs);
  assert.equal(offeredState.state, "offered", "Opportunity offer should be readable from audit state.");
  assert.equal(offeredState.offeredTherapistId, primaryTherapist.id, "Offer state should carry the assigned therapist id.");
  assert.equal(offeredState.offeredTherapistId === wrongTherapist.id, false, "Acceptance must require the therapist who was offered the referral.");

  assert.equal(isOpportunityDeclineReason("outside_territory"), true, "Fixed decline reason should be accepted.");
  assert.equal(isOpportunityDeclineReason("patient_requested_clinical_change"), false, "Unsafe/free-form decline reason should not be accepted.");
  const unsafeNote = classifyOperationalNote("Patient diagnosis changed and medication list needs review.", { fieldLabel: "Opportunity decline note" });
  assert.equal(hasBlockedNoteClassification(unsafeNote), true, "Clinical/PHI-like opportunity notes must be blocked by note classification.");

  await prisma.auditLog.create({
    data: {
      action: "opportunity_accepted",
      actorId: primaryTherapist.id,
      actorType: "therapist_pilot",
      entityId: readyReferral.id,
      entityType: "PatientReferral",
      metadataJson: {
        source: "therapist_manual_accept",
        therapistId: primaryTherapist.id,
      },
    },
  });
  const acceptedLogs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    where: { AND: [opportunityWhereClause(), { entityId: readyReferral.id, entityType: "PatientReferral" }] },
  });
  const acceptedState = getOpportunityStateFromAuditLogs(acceptedLogs);
  assert.equal(acceptedState.state, "accepted", "Therapist acceptance should be readable from audit state.");
  assert.equal(opportunityAllowsVisitCreation({ opportunityState: acceptedState.state, referralSource: readyRow.referralSource }), true, "Accepted opportunity can become scheduling-ready when create gate passes.");

  await prisma.auditLog.createMany({
    data: [
      {
        action: "opportunity_offered",
        actorId: "opportunity_workflow_validation",
        actorType: "pilot_admin",
        entityId: declinedReferral.id,
        entityType: "PatientReferral",
        metadataJson: {
          source: "deterministic_manual",
          therapistId: primaryTherapist.id,
        },
      },
      {
        action: "opportunity_declined",
        actorId: primaryTherapist.id,
        actorType: "therapist_pilot",
        entityId: declinedReferral.id,
        entityType: "PatientReferral",
        metadataJson: {
          declineReason: "outside_territory",
          noteAdded: false,
          source: "therapist_manual_decline",
          therapistId: primaryTherapist.id,
        },
      },
    ],
  });
  const declinedLogs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    where: { AND: [opportunityWhereClause(), { entityId: declinedReferral.id, entityType: "PatientReferral" }] },
  });
  const declinedState = getOpportunityStateFromAuditLogs(declinedLogs);
  const declinedGate = gateFor(declinedRow, rows);
  assert.equal(declinedGate.createVisitGate.allowed, true, "Declined referral can still pass base ready gate.");
  assert.equal(declinedState.state, "declined", "Therapist decline should be readable from audit state.");
  assert.equal(declinedState.declinedReason, "outside_territory", "Declined opportunity should preserve a safe enum reason.");
  assert.equal(opportunityAllowsVisitCreation({ opportunityState: declinedState.state, referralSource: declinedRow.referralSource }), false, "Declined opportunities must not show Create visit.");

  const stateMap = getOpportunityStatesByReferralId([...acceptedLogs, ...declinedLogs]);
  assert.equal(stateMap.get(readyReferral.id)?.state, "accepted");
  assert.equal(stateMap.get(declinedReferral.id)?.state, "declined");

  const auditRows = await prisma.auditLog.findMany({
    select: { action: true, metadataJson: true },
    where: {
      AND: [
        opportunityWhereClause(),
        { entityId: { in: [readyReferral.id, declinedReferral.id, blockedReferral.id] }, entityType: "PatientReferral" },
      ],
    },
  });
  assert.ok(auditRows.length >= 5, "Opportunity workflow should write safe audit rows.");
  assertSafeAuditMetadata(auditRows);

  const safeSummary = [
    readyReferral.patientName,
    readyReferral.status,
    [readyReferral.city, readyReferral.zip].filter(Boolean).join(" / "),
    primaryTherapist.name,
    acceptedState.state,
  ].join(" | ");
  assert.doesNotMatch(safeSummary, /\+1\d{10}|\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b|raw SMS|provider payload|BEGIN PRIVATE KEY|DATABASE_URL|NEXT_REDIRECT/i);
  assert.equal(normalizeE164Phone(readyReferral.phone), readyReferral.phone);

  const status = getOpportunityStatus();
  assert.equal(status.enabled, true);
  assert.equal(status.deterministicManualSource, true);
  assert.equal(status.manualAcceptDeclineEnabled, true);
  assert.equal(status.safeAuditEnabled, true);
  assert.equal(status.autoAssignmentEnabled, false);
  assert.equal(status.autoAcceptanceEnabled, false);
  assert.equal(status.smsSendingEnabled, false);
  assert.equal(status.externalMatchingApisEnabled, false);
  assert.equal(status.mapsGeocodingTravelTimeApisEnabled, false);
  assert.equal(status.aiOpportunityDecisionsEnabled, false);

  const [
    opportunitySource,
    referralDetailSource,
    referralListSource,
    schedulingSource,
    newVisitSource,
    myWorkSource,
    healthSource,
    auditSource,
    browserSmokeSource,
  ] = await Promise.all([
    readFile("lib/pilot/opportunity.ts", "utf8"),
    readFile("app/admin/referrals/[id]/page.tsx", "utf8"),
    readFile("app/admin/referrals/page.tsx", "utf8"),
    readFile("app/admin/scheduling/page.tsx", "utf8"),
    readFile("app/admin/visits/new/page.tsx", "utf8"),
    readFile("app/my-work/page.tsx", "utf8"),
    readFile("app/admin/health/page.tsx", "utf8"),
    readFile("app/admin/audit/page.tsx", "utf8"),
    readFile("tests/e2e/authenticated-browser-smoke.spec.ts", "utf8"),
  ]);
  for (const [label, source] of Object.entries({ auditSource, healthSource, myWorkSource, newVisitSource, opportunitySource, referralDetailSource, referralListSource, schedulingSource })) {
    assertNoForbiddenSourceTerms(source, label);
  }
  assert.match(referralDetailSource, /therapist-opportunity-panel/);
  assert.match(referralDetailSource, /offerOpportunityAction/);
  assert.match(referralListSource, /opportunityBadgeClassName/);
  assert.match(schedulingSource, /scheduling-awaiting-opportunity-acceptance/);
  assert.match(schedulingSource, /opportunityAllowsVisitCreation/);
  assert.match(newVisitSource, /Therapist opportunity acceptance required/);
  assert.match(myWorkSource, /therapist-referral-opportunities/);
  assert.match(myWorkSource, /opportunityState\.offeredTherapistId === therapistId/);
  assert.match(myWorkSource, /OPPORTUNITY_DECLINE_REASONS/);
  assert.match(healthSource, /Therapist opportunity workflow/);
  assert.match(healthSource, /SMS from opportunity workflow/);
  assert.match(auditSource, /Opportunity events/);
  assert.match(browserSmokeSource, /admin-referral-opportunity-detail\.png/);
  assert.match(browserSmokeSource, /therapist-my-work-opportunities\.png/);

  const smsAfter = await prisma.smsMessage.count();
  assert.equal(smsAfter, smsBefore, "Opportunity workflow smoke must not send or record SMS.");

  console.log("Opportunity workflow smoke passed: offer gates, therapist-scoped accept, safe decline reasons, accepted scheduling readiness, declined create suppression, safe audit, no SMS, and no external API surfaces verified.");
} finally {
  await archiveValidationRows();
  await prisma.$disconnect();
}
