import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadLocalEnv } from "./load-local-env.mts";

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for scheduling ready gate smoke.");
}

const { getPrismaClient } = await import("../lib/db/prisma.ts");
const {
  RESET_DEMO_SCENARIOS_CONFIRMATION,
  activeWorkflowWhereClause,
  resetDemoScenarios,
  smokeOperationalReferralWhere,
} = await import("../lib/pilot/data-stewardship.ts");
const {
  canCreateVisitForReferral,
  evaluateReferralIntakeQuality,
  getReferralDuplicateCandidates,
  getReferralIntakeQualityStatus,
} = await import("../lib/pilot/referral-intake-quality.ts");
const { normalizeE164Phone } = await import("../lib/sms/compliance.ts");

const prisma = getPrismaClient();

type GateReferralRow = {
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

function duplicateSources(rows: GateReferralRow[]) {
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

function assertNoForbiddenSourceTerms(source: string, label: string) {
  assert.doesNotMatch(source, /\b(sendSms|telnyx\.messages|fetch\s*\(|googlemaps|mapbox|geocodio|distanceMatrix|new PrismaClient)\b/i, `${label} must preserve no-SMS, no-external-API, and Prisma wrapper guardrails.`);
}

try {
  const protectedBefore = await Promise.all([
    prisma.auditLog.count(),
    prisma.smsMessage.count(),
    prisma.telnyxWebhookEvent.count(),
    prisma.smsConsentEnrollment.count(),
  ]);
  await resetDemoScenarios(prisma, "scheduling_ready_gate_smoke", RESET_DEMO_SCENARIOS_CONFIRMATION);
  const protectedAfter = await Promise.all([
    prisma.auditLog.count(),
    prisma.smsMessage.count(),
    prisma.telnyxWebhookEvent.count(),
    prisma.smsConsentEnrollment.count(),
  ]);
  assert.ok(protectedAfter[0] >= protectedBefore[0], "Audit rows must be preserved.");
  assert.ok(protectedAfter[1] >= protectedBefore[1], "SMS message rows must be preserved.");
  assert.ok(protectedAfter[2] >= protectedBefore[2], "Webhook rows must be preserved.");
  assert.ok(protectedAfter[3] >= protectedBefore[3], "Consent rows must be preserved.");

  const rows = await prisma.patientReferral.findMany({
    include: {
      assignedTherapist: { select: { name: true } },
      visits: {
        select: { id: true, scheduledAt: true, status: true },
        where: { status: { in: ["scheduled", "in_progress"] } },
      },
    },
    orderBy: { createdAt: "desc" },
    where: activeWorkflowWhereClause({
      patientName: { contains: "Demo Scenario" },
      status: { in: ["new", "contacted", "active", "scheduled"] },
    }),
  }) as GateReferralRow[];
  const sourceRows = duplicateSources(rows);
  const phones = Array.from(new Set(rows.map((row) => normalizeE164Phone(row.phone)).filter(Boolean)));
  const smsConsentRows = phones.length > 0
    ? await prisma.smsConsentEnrollment.findMany({
        select: { normalizedPhone: true, status: true },
        where: { normalizedPhone: { in: phones } },
      })
    : [];
  const smsConsentByPhone = Object.fromEntries(smsConsentRows.map((row) => [row.normalizedPhone, row.status]));
  const gates = new Map<string, ReturnType<typeof canCreateVisitForReferral>>();

  for (const row of rows) {
    const smsConsentStatus = smsConsentByPhone[normalizeE164Phone(row.phone)] || "none";
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
      sources: sourceRows,
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
    gates.set(row.patientName, canCreateVisitForReferral({
      activeWorkflowVisible: true,
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
    }));
  }

  assert.equal(gates.get("Demo Scenario Ready Schedule")?.allowed, true, "Curated valid ready referral should be create-ready.");
  assert.equal(gates.get("Demo Scenario Duplicate A")?.allowed, false, "Duplicate A must be review-only.");
  assert.equal(gates.get("Demo Scenario Duplicate B")?.allowed, false, "Duplicate B must be review-only.");
  assert.match(gates.get("Demo Scenario Duplicate A")?.reasons.join(" ") || "", /Duplicate review/);
  assert.equal(gates.get("Demo Scenario Non SMS Follow Up")?.allowed, false, "Opted-out referral must be review-only.");
  assert.match(gates.get("Demo Scenario Non SMS Follow Up")?.reasons.join(" ") || "", /Non-SMS only/);
  assert.equal(gates.get("Demo Scenario Intake Review")?.allowed, false, "Missing intake referral must be review-only.");
  assert.match(gates.get("Demo Scenario Intake Review")?.reasons.join(" ") || "", /Missing therapist|Missing city|Missing ZIP|Needs intake review/);

  const activeSmokeCount = await prisma.patientReferral.count({
    where: activeWorkflowWhereClause(smokeOperationalReferralWhere()),
  });
  assert.equal(activeSmokeCount, 0, "Archived/smoke rows must be excluded from active scheduling gates.");

  const status = getReferralIntakeQualityStatus();
  assert.equal(status.schedulingReadyGateEnabled, true);
  assert.equal(status.schedulingReadyGateSource, "deterministic referral intake quality");
  assert.equal(status.smsSendingEnabled, false);
  assert.equal(status.externalDuplicateApisEnabled, false);
  assert.equal(status.autoVisitCreationEnabled, false);

  const [gateSource, schedulingSource, referralsSource, newVisitSource, healthSource] = await Promise.all([
    readFile("lib/pilot/referral-intake-quality.ts", "utf8"),
    readFile("app/admin/scheduling/page.tsx", "utf8"),
    readFile("app/admin/referrals/page.tsx", "utf8"),
    readFile("app/admin/visits/new/page.tsx", "utf8"),
    readFile("app/admin/health/page.tsx", "utf8"),
  ]);
  for (const [label, source] of Object.entries({ gateSource, healthSource, newVisitSource, referralsSource, schedulingSource })) {
    assertNoForbiddenSourceTerms(source, label);
  }
  assert.match(schedulingSource, /readyToCreateRows/);
  assert.match(schedulingSource, /Needs review before scheduling/);
  assert.match(newVisitSource, /visit_create_blocked/);
  assert.match(newVisitSource, /Review referral first/);
  assert.match(referralsSource, /createVisitGate\.allowed/);
  assert.match(healthSource, /Scheduling ready gate/);

  console.log("Scheduling ready gate smoke passed: create-ready gate, review-only blockers, archived/smoke exclusion, protected history, no SMS, no external APIs, and visit-create block verified.");
} finally {
  await prisma.$disconnect();
}
