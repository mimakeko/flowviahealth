import type { Prisma, PrismaClient } from "@prisma/client";
import { getFlowviaDataModeStatus } from "../compliance/data-mode.ts";
import { normalizeE164Phone, redactPhone } from "../sms/compliance.ts";
import { getTelnyxConfigStatus } from "../sms/telnyx.ts";

export const DEMO_SOURCE = "flowvia_demo_seed_v1";
export const DB_SMOKE_SOURCE = "flowvia_db_smoke_v1";
export const OPS_GUARDRAIL_SMOKE_SOURCE = "flowvia_ops_guardrail_smoke_v1";
export const STEWARDSHIP_ARCHIVE_MARKER = "FLOWVIA_ARCHIVED_BY_STEWARDSHIP";
export const REFRESH_FAKE_DATA_CONFIRMATION = "REFRESH FAKE DATA";
export const ARCHIVE_FAKE_DATA_CONFIRMATION = "ARCHIVE FAKE DATA";
export const CLEAR_TEST_DATA_CONFIRMATION = "CLEAR TEST DATA";
export const ARCHIVE_SMOKE_TEST_DATA_CONFIRMATION = "ARCHIVE SMOKE TEST DATA";
export const RESET_DEMO_SCENARIOS_CONFIRMATION = "RESET DEMO SCENARIOS";
export const MARK_TEST_PHONE_OPTED_OUT_CONFIRMATION = "MARK TEST PHONE OPTED OUT";
export const DATA_STEWARDSHIP_CLEANUP_MODE = "archive_only";
export const DATA_STEWARDSHIP_HARD_DELETE_MODE = "disabled";
export const DATA_STEWARDSHIP_PROTECTED_TABLES = ["AuditLog", "SmsConsentEnrollment", "SmsMessage", "TelnyxWebhookEvent"] as const;
export const DEMO_SCENARIO_SOURCE = "flowvia_demo_scenarios_v1";

type StewardshipPrisma = PrismaClient | Prisma.TransactionClient;

type ReferralLike = {
  careType?: string | null;
  notes?: string | null;
  patientName?: string | null;
  referralSource?: string | null;
  status?: string | null;
};

type VisitLike = {
  notes?: string | null;
  status?: string | null;
};

export type DemoScenarioKey =
  | "ready_to_schedule"
  | "upcoming_visit"
  | "opted_out_follow_up"
  | "possible_duplicate_pair"
  | "missing_therapist_intake_review"
  | "therapist_field_today"
  | "completed_recently"
  | "no_show_follow_up";

export const DEMO_SCENARIO_OPTIONS: ReadonlyArray<{
  key: DemoScenarioKey;
  label: string;
  description: string;
}> = [
  {
    key: "ready_to_schedule",
    label: "North Dallas ready-to-schedule referral",
    description: "Assigned contacted referral with fake city/ZIP and service area, no open visit.",
  },
  {
    key: "upcoming_visit",
    label: "Plano/McKinney upcoming visit",
    description: "Assigned scheduled visit for upcoming visit queues and scheduling intelligence.",
  },
  {
    key: "opted_out_follow_up",
    label: "Opted-out non-SMS follow-up referral",
    description: "Contacted referral linked to an opted-out fake consent enrollment.",
  },
  {
    key: "possible_duplicate_pair",
    label: "Possible duplicate referral pair",
    description: "Two local fake referrals with duplicate signals for warning-only review.",
  },
  {
    key: "missing_therapist_intake_review",
    label: "Missing therapist intake review referral",
    description: "Incomplete fake referral that should stay out of ready-to-schedule queues.",
  },
  {
    key: "therapist_field_today",
    label: "Therapist field today/in-progress visit",
    description: "Assigned in-progress visit visible in therapist field workflow.",
  },
  {
    key: "completed_recently",
    label: "Completed recently visit",
    description: "Terminal completed visit for recent completion and terminal-lock checks.",
  },
  {
    key: "no_show_follow_up",
    label: "No-show follow-up visit",
    description: "Terminal no-show visit for follow-up review and audit-safe terminal state.",
  },
];

const therapistSeeds = [
  {
    name: "Demo Therapist North Dallas",
    email: "demo.north.dallas@flowviahealth.test",
    phone: "+15550101001",
    serviceAreaNotes: "Demo service area: North Dallas only. Fake pilot data.",
  },
  {
    name: "Demo Therapist Plano/Frisco",
    email: "demo.plano.frisco@flowviahealth.test",
    phone: "+15550101002",
    serviceAreaNotes: "Demo service area: Plano and Frisco only. Fake pilot data.",
  },
  {
    name: "Demo Therapist McKinney/Allen",
    email: "demo.mckinney.allen@flowviahealth.test",
    phone: "+15550101003",
    serviceAreaNotes: "Demo service area: McKinney and Allen only. Fake pilot data.",
  },
] as const;

function hasSmokeTestText(value: string | null | undefined) {
  return /\b(smoke|test|browser confirmation|referral intake smoke|visits workflow smoke|therapist field smoke|therapist confirmation smoke|ops guardrail smoke)\b/i.test(value || "");
}

export function isArchivedOperationalRecord(record: { notes?: string | null }) {
  return isArchivedNote(record.notes);
}

export function isSmokeTestOperationalRecord(record: ReferralLike | VisitLike) {
  return (
    hasSmokeTestText(record.notes) ||
    ("referralSource" in record && hasSmokeTestText(record.referralSource)) ||
    ("patientName" in record && hasSmokeTestText(record.patientName)) ||
    ("careType" in record && hasSmokeTestText(record.careType))
  );
}

export function isDemoOperationalRecord(record: ReferralLike) {
  return record.referralSource === DEMO_SOURCE || record.referralSource === DEMO_SCENARIO_SOURCE || Boolean(record.patientName?.includes("Demo"));
}

export function isActiveWorkflowRecord(record: ReferralLike | VisitLike) {
  return !isArchivedOperationalRecord(record) && !isSmokeTestOperationalRecord(record) && record.status !== "completed" && record.status !== "canceled";
}

function isArchivedNote(notes: string | null | undefined) {
  return Boolean(notes?.includes(STEWARDSHIP_ARCHIVE_MARKER));
}

function appendStewardshipNote(existingNotes: string | null | undefined, addition: string) {
  const timestamp = new Date().toISOString();
  return [existingNotes?.trim(), `[${timestamp}] ${addition}`].filter(Boolean).join("\n");
}

export function validateStewardshipConfirmation(value: string, expected: string) {
  return value.trim() === expected;
}

export function isExplicitFakePilotReferralLike(referral: ReferralLike) {
  return referral.referralSource === DEMO_SOURCE || referral.referralSource === DEMO_SCENARIO_SOURCE || Boolean(referral.patientName?.startsWith("Demo Patient"));
}

export function isExplicitSmokeTestReferralLike(referral: ReferralLike) {
  return referral.referralSource === DB_SMOKE_SOURCE || referral.referralSource === OPS_GUARDRAIL_SMOKE_SOURCE || isSmokeTestOperationalRecord(referral);
}

export function fakePilotReferralWhere(): Prisma.PatientReferralWhereInput {
  return {
    OR: [
      { referralSource: DEMO_SOURCE },
      { referralSource: DEMO_SCENARIO_SOURCE },
      { patientName: { startsWith: "Demo Patient" } },
      { referralSource: DB_SMOKE_SOURCE },
      { referralSource: OPS_GUARDRAIL_SMOKE_SOURCE },
      { referralSource: { contains: "smoke" } },
      { patientName: { startsWith: "Smoke" } },
      { patientName: { startsWith: "Ops Guardrail Smoke" } },
      { patientName: { contains: "Smoke" } },
      { patientName: { contains: "Browser Confirmation" } },
    ],
  };
}

export function demoOperationalReferralWhere(): Prisma.PatientReferralWhereInput {
  return {
    OR: [
      { referralSource: DEMO_SOURCE },
      { referralSource: DEMO_SCENARIO_SOURCE },
      { patientName: { startsWith: "Demo Patient" } },
      { patientName: { contains: "Demo" } },
    ],
  };
}

export function smokeOperationalReferralWhere(): Prisma.PatientReferralWhereInput {
  return {
    OR: [
      { referralSource: DB_SMOKE_SOURCE },
      { referralSource: OPS_GUARDRAIL_SMOKE_SOURCE },
      { referralSource: { contains: "smoke" } },
      { referralSource: { contains: "test" } },
      { patientName: { startsWith: "Smoke" } },
      { patientName: { startsWith: "Ops Guardrail Smoke" } },
      { patientName: { contains: "Smoke" } },
      { patientName: { contains: "Test" } },
      { patientName: { contains: "Browser Confirmation" } },
      { patientName: { contains: "Referral Intake Smoke" } },
      { patientName: { contains: "Visits Workflow Smoke" } },
      { patientName: { contains: "Therapist Field Smoke" } },
      { patientName: { contains: "Therapist Confirmation Smoke" } },
      { notes: { contains: "Smoke" } },
      { notes: { contains: "Test" } },
      { notes: { contains: "Browser Confirmation" } },
      { careType: { startsWith: "Smoke test" } },
      { careType: { contains: "Smoke" } },
      { careType: { contains: "Test" } },
    ],
  };
}

export function excludeArchivedOperationalWhereClause(): Prisma.PatientReferralWhereInput {
  return {
    OR: [
      { notes: null },
      { NOT: { notes: { contains: STEWARDSHIP_ARCHIVE_MARKER } } },
    ],
  };
}

export function activeOperationalReferralWhere(baseWhere: Prisma.PatientReferralWhereInput): Prisma.PatientReferralWhereInput {
  return {
    AND: [
      baseWhere,
      excludeArchivedOperationalWhereClause(),
    ],
  };
}

const unarchivedWhere = activeOperationalReferralWhere;

export function visibleOperationalReferralWhere(): Prisma.PatientReferralWhereInput {
  return excludeArchivedOperationalWhereClause();
}

export function activeWorkflowWhereClause(baseWhere: Prisma.PatientReferralWhereInput = {}): Prisma.PatientReferralWhereInput {
  return {
    AND: [
      baseWhere,
      excludeArchivedOperationalWhereClause(),
      { NOT: smokeOperationalReferralWhere() },
    ],
  };
}

export function smokeOperationalVisitWhere(): Prisma.VisitWhereInput {
  return {
    OR: [
      { referral: smokeOperationalReferralWhere() },
      { therapist: { name: { contains: "Smoke" } } },
      { therapist: { name: { contains: "Test" } } },
      { therapist: { email: { contains: ".smoke." } } },
      { therapist: { email: { contains: ".test." } } },
      { notes: { contains: "Smoke" } },
      { notes: { contains: "Test" } },
      { notes: { contains: "Browser Confirmation" } },
    ],
  };
}

export function visibleOperationalVisitWhere(): Prisma.VisitWhereInput {
  return {
    AND: [
      {
        OR: [
          { notes: null },
          { NOT: { notes: { contains: STEWARDSHIP_ARCHIVE_MARKER } } },
        ],
      },
      {
        referral: visibleOperationalReferralWhere(),
      },
    ],
  };
}

export function activeWorkflowVisitWhere(baseWhere: Prisma.VisitWhereInput = {}): Prisma.VisitWhereInput {
  return {
    AND: [
      baseWhere,
      visibleOperationalVisitWhere(),
      { NOT: smokeOperationalVisitWhere() },
    ],
  };
}

export function seedableDemoTherapistEmails() {
  return therapistSeeds.map((therapist) => therapist.email);
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function selectedScenarioKeys(input?: readonly string[]) {
  const validKeys = new Set(DEMO_SCENARIO_OPTIONS.map((scenario) => scenario.key));
  const selected = (input || []).filter((item): item is DemoScenarioKey => validKeys.has(item as DemoScenarioKey));
  return selected.length > 0 ? selected : DEMO_SCENARIO_OPTIONS.map((scenario) => scenario.key);
}

export function normalizeDemoScenarioSelection(input?: readonly string[]) {
  return selectedScenarioKeys(input);
}

async function upsertDemoTherapists(prisma: StewardshipPrisma) {
  const therapists = [];
  for (const therapist of therapistSeeds) {
    therapists.push(
      await prisma.therapist.upsert({
        create: {
          ...therapist,
          active: true,
        },
        update: {
          active: true,
          name: therapist.name,
          phone: therapist.phone,
          serviceAreaNotes: therapist.serviceAreaNotes,
        },
        where: { email: therapist.email },
      }),
    );
  }
  return therapists;
}

async function archiveDemoOperationalRecords(tx: Prisma.TransactionClient) {
  const referrals = await tx.patientReferral.findMany({
    select: { id: true, notes: true },
    where: unarchivedWhere(demoOperationalReferralWhere()),
    take: 500,
  });
  const referralIds = referrals.map((referral) => referral.id);

  await archiveReferrals(tx, referrals, "Stewardship reset: old demo scenario archived.");
  const archivedVisitCount = await archiveVisits(tx, referralIds, "Stewardship reset: visit attached to old demo scenario archived.");

  if (referralIds.length > 0) {
    await Promise.all([
      tx.patientReferral.updateMany({
        where: {
          id: { in: referralIds },
          status: { notIn: ["completed", "canceled"] },
        },
        data: { status: "canceled" },
      }),
      tx.visit.updateMany({
        where: {
          referralId: { in: referralIds },
          status: { in: ["unscheduled", "scheduled", "in_progress"] },
        },
        data: { status: "canceled" },
      }),
    ]);
  }

  return {
    referralCount: referrals.length,
    visitCount: archivedVisitCount,
  };
}

async function createDemoReferral(
  tx: Prisma.TransactionClient,
  input: {
    assignedTherapistId?: string | null;
    careType?: string;
    city?: string | null;
    emailSlug: string;
    notes?: string;
    patientName: string;
    phone: string;
    status: "new" | "contacted" | "scheduled" | "active" | "completed" | "canceled";
    zip?: string | null;
  },
) {
  return tx.patientReferral.create({
    data: {
      assignedTherapistId: input.assignedTherapistId || null,
      careType: input.careType,
      city: input.city,
      email: `${input.emailSlug}@example.test`,
      notes: input.notes || "Fake demo scenario operational note. No PHI.",
      patientName: input.patientName,
      phone: input.phone,
      referralSource: DEMO_SCENARIO_SOURCE,
      status: input.status,
      zip: input.zip,
    },
  });
}

async function seedDemoScenariosInTransaction(
  tx: Prisma.TransactionClient,
  scenarioKeys: readonly DemoScenarioKey[],
) {
  const selected = new Set(scenarioKeys);
  const therapists = await upsertDemoTherapists(tx);
  const northDallas = therapists[0];
  const planoFrisco = therapists[1];
  const mckinneyAllen = therapists[2];
  const now = new Date();
  const createdReferrals: string[] = [];
  const createdVisits: string[] = [];
  let consentUpsertCount = 0;

  async function trackReferral<T extends { id: string }>(referral: Promise<T>) {
    const item = await referral;
    createdReferrals.push(item.id);
    return item;
  }

  async function trackVisit<T extends { id: string }>(visit: Promise<T>) {
    const item = await visit;
    createdVisits.push(item.id);
    return item;
  }

  if (selected.has("ready_to_schedule")) {
    await trackReferral(createDemoReferral(tx, {
      assignedTherapistId: northDallas.id,
      careType: "Demo mobility visit",
      city: "Dallas",
      emailSlug: "demo.ready.schedule",
      patientName: "Demo Scenario Ready Schedule",
      phone: "+15550102101",
      status: "contacted",
      zip: "75230",
    }));
  }

  if (selected.has("upcoming_visit")) {
    const referral = await trackReferral(createDemoReferral(tx, {
      assignedTherapistId: planoFrisco.id,
      careType: "Demo upcoming visit",
      city: "Plano",
      emailSlug: "demo.upcoming.visit",
      patientName: "Demo Scenario Upcoming Visit",
      phone: "+15550102102",
      status: "scheduled",
      zip: "75024",
    }));
    await trackVisit(tx.visit.create({
      data: {
        notes: "Fake demo upcoming visit. No PHI.",
        referralId: referral.id,
        scheduledAt: addDays(now, 1),
        status: "scheduled",
        therapistId: planoFrisco.id,
      },
    }));
  }

  if (selected.has("opted_out_follow_up")) {
    await trackReferral(createDemoReferral(tx, {
      assignedTherapistId: mckinneyAllen.id,
      careType: "Demo non-SMS follow-up",
      city: "McKinney",
      emailSlug: "demo.opted.out",
      patientName: "Demo Scenario Non SMS Follow Up",
      phone: "+15550102103",
      status: "contacted",
      zip: "75070",
    }));
    await tx.smsConsentEnrollment.upsert({
      create: {
        consentTextVersion: "demo_scenario_v1",
        fullName: "Demo Scenario Non SMS Follow Up",
        normalizedPhone: "+15550102103",
        optedOutAt: now,
        phone: "+15550102103",
        source: "sms_consent_page",
        status: "opted_out",
      },
      update: {
        fullName: "Demo Scenario Non SMS Follow Up",
        optedOutAt: now,
        status: "opted_out",
      },
      where: { normalizedPhone: "+15550102103" },
    });
    consentUpsertCount += 1;
  }

  if (selected.has("possible_duplicate_pair")) {
    await trackReferral(createDemoReferral(tx, {
      assignedTherapistId: northDallas.id,
      careType: "Demo duplicate review",
      city: "Dallas",
      emailSlug: "demo.duplicate.one",
      patientName: "Demo Scenario Duplicate A",
      phone: "+15550102104",
      status: "contacted",
      zip: "75231",
    }));
    await trackReferral(createDemoReferral(tx, {
      assignedTherapistId: northDallas.id,
      careType: "Demo duplicate review",
      city: "Dallas",
      emailSlug: "demo.duplicate.two",
      patientName: "Demo Scenario Duplicate B",
      phone: "+15550102104",
      status: "contacted",
      zip: "75231",
    }));
  }

  if (selected.has("missing_therapist_intake_review")) {
    await trackReferral(createDemoReferral(tx, {
      assignedTherapistId: null,
      careType: "Demo intake review",
      city: null,
      emailSlug: "demo.intake.review",
      notes: "Fake demo intake review record missing assignment and location. No PHI.",
      patientName: "Demo Scenario Intake Review",
      phone: "+15550102105",
      status: "new",
      zip: null,
    }));
  }

  if (selected.has("therapist_field_today")) {
    const referral = await trackReferral(createDemoReferral(tx, {
      assignedTherapistId: northDallas.id,
      careType: "Demo field visit today",
      city: "Dallas",
      emailSlug: "demo.field.today",
      patientName: "Demo Scenario Field Today",
      phone: "+15550102106",
      status: "active",
      zip: "75248",
    }));
    await trackVisit(tx.visit.create({
      data: {
        notes: "Fake demo in-progress field visit. No PHI.",
        referralId: referral.id,
        scheduledAt: addHours(now, -1),
        status: "in_progress",
        therapistId: northDallas.id,
      },
    }));
  }

  if (selected.has("completed_recently")) {
    const referral = await trackReferral(createDemoReferral(tx, {
      assignedTherapistId: planoFrisco.id,
      careType: "Demo completed recently",
      city: "Frisco",
      emailSlug: "demo.completed.recently",
      patientName: "Demo Scenario Completed Recently",
      phone: "+15550102107",
      status: "completed",
      zip: "75034",
    }));
    await trackVisit(tx.visit.create({
      data: {
        notes: "Fake demo completed visit. No PHI.",
        referralId: referral.id,
        scheduledAt: addDays(now, -1),
        status: "completed",
        therapistId: planoFrisco.id,
      },
    }));
  }

  if (selected.has("no_show_follow_up")) {
    const referral = await trackReferral(createDemoReferral(tx, {
      assignedTherapistId: mckinneyAllen.id,
      careType: "Demo no-show follow-up",
      city: "Allen",
      emailSlug: "demo.no.show",
      patientName: "Demo Scenario No Show Follow Up",
      phone: "+15550102108",
      status: "active",
      zip: "75013",
    }));
    await trackVisit(tx.visit.create({
      data: {
        notes: "Fake demo no-show visit. No PHI.",
        referralId: referral.id,
        scheduledAt: addDays(now, -1),
        status: "no_show",
        therapistId: mckinneyAllen.id,
      },
    }));
  }

  return {
    consentUpsertCount,
    referralCount: createdReferrals.length,
    scenarioKeys: [...selected],
    therapistCount: therapists.length,
    visitCount: createdVisits.length,
  };
}

export async function seedOrRefreshFakePilotData(prisma: PrismaClient, actorId: string) {
  const result = await resetDemoScenarios(prisma, actorId, RESET_DEMO_SCENARIOS_CONFIRMATION);
  return {
    referralCount: result.seededReferralCount,
    therapistCount: result.therapistCount,
    visitCount: result.seededVisitCount,
  };
}

async function archiveReferrals(prisma: StewardshipPrisma, referrals: Array<{ id: string; notes: string | null }>, reason: string) {
  await Promise.all(
    referrals.map((referral) =>
      prisma.patientReferral.update({
        where: { id: referral.id },
        data: {
          notes: isArchivedNote(referral.notes) ? referral.notes : appendStewardshipNote(referral.notes, `${reason} ${STEWARDSHIP_ARCHIVE_MARKER}`),
        },
      }),
    ),
  );
}

async function archiveVisits(prisma: StewardshipPrisma, referralIds: string[], reason: string) {
  if (referralIds.length === 0) return 0;
  const visits = await prisma.visit.findMany({
    select: { id: true, notes: true },
    where: {
      referralId: { in: referralIds },
      OR: [
        { notes: null },
        { NOT: { notes: { contains: STEWARDSHIP_ARCHIVE_MARKER } } },
      ],
    },
  });

  await Promise.all(
    visits.map((visit) =>
      prisma.visit.update({
        where: { id: visit.id },
        data: {
          notes: appendStewardshipNote(visit.notes, `${reason} ${STEWARDSHIP_ARCHIVE_MARKER}`),
        },
      }),
    ),
  );

  return visits.length;
}

async function archiveVisitsByWhere(prisma: StewardshipPrisma, where: Prisma.VisitWhereInput, reason: string) {
  const visits = await prisma.visit.findMany({
    select: { id: true, notes: true },
    where: {
      AND: [
        where,
        visibleOperationalVisitWhere(),
      ],
    },
    take: 500,
  });

  await Promise.all(
    visits.map((visit) =>
      prisma.visit.update({
        where: { id: visit.id },
        data: {
          notes: appendStewardshipNote(visit.notes, `${reason} ${STEWARDSHIP_ARCHIVE_MARKER}`),
          status: "canceled",
        },
      }),
    ),
  );

  return visits.length;
}

export async function archiveCompletedCanceledFakeReferrals(prisma: PrismaClient, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const referrals = await tx.patientReferral.findMany({
      select: { id: true, notes: true },
      where: {
        AND: [
          unarchivedWhere(fakePilotReferralWhere()),
          { status: { in: ["completed", "canceled"] } },
        ],
      },
      take: 200,
    });
    const referralIds = referrals.map((referral) => referral.id);

    await archiveReferrals(tx, referrals, "Stewardship archive: completed/canceled fake pilot workflow.");
    const archivedVisitCount = await archiveVisits(tx, referralIds, "Stewardship archive: visit attached to archived fake referral.");

    await tx.auditLog.create({
      data: {
        actorId,
        actorType: "pilot_admin",
        action: "pilot_data_archived",
        entityType: "PilotData",
        metadataJson: {
          cleanupMode: DATA_STEWARDSHIP_CLEANUP_MODE,
          referralCount: referrals.length,
          visitCount: archivedVisitCount,
        },
      },
    });

    return {
      referralCount: referrals.length,
      visitCount: archivedVisitCount,
    };
  });
}

export async function archiveSmokeTestOperationalRecords(prisma: PrismaClient, actorId: string, confirmation: string) {
  if (!validateStewardshipConfirmation(confirmation, ARCHIVE_SMOKE_TEST_DATA_CONFIRMATION) && !validateStewardshipConfirmation(confirmation, CLEAR_TEST_DATA_CONFIRMATION)) {
    throw new Error("Confirmation text did not match ARCHIVE SMOKE TEST DATA.");
  }

  return prisma.$transaction(async (tx) => {
    const referrals = await tx.patientReferral.findMany({
      select: { id: true, notes: true },
      where: unarchivedWhere(smokeOperationalReferralWhere()),
      take: 200,
    });
    const referralIds = referrals.map((referral) => referral.id);
    await archiveReferrals(tx, referrals, "Stewardship cleanup: smoke-test operational record archived.");
    const archivedReferralVisitCount = await archiveVisits(tx, referralIds, "Stewardship cleanup: smoke-test visit archived.");
    const archivedDirectVisitCount = await archiveVisitsByWhere(tx, smokeOperationalVisitWhere(), "Stewardship cleanup: smoke-test visit archived.");
    const archivedVisitCount = archivedReferralVisitCount + archivedDirectVisitCount;
    if (referralIds.length > 0) {
      await Promise.all([
        tx.patientReferral.updateMany({
          where: {
            id: { in: referralIds },
            status: { notIn: ["completed", "canceled"] },
          },
          data: { status: "canceled" },
        }),
        tx.visit.updateMany({
          where: {
            referralId: { in: referralIds },
            status: { in: ["unscheduled", "scheduled", "in_progress"] },
          },
          data: { status: "canceled" },
        }),
      ]);
    }
    const therapists = await tx.therapist.updateMany({
      where: {
        OR: [
          { name: { startsWith: "Smoke" } },
          { name: { startsWith: "Ops Guardrail Smoke" } },
          { name: { contains: "Smoke" } },
          { email: { startsWith: "smoke.therapist." } },
          { email: { startsWith: "ops.guardrail." } },
          { email: { contains: ".smoke." } },
        ],
      },
      data: { active: false },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        actorType: "pilot_admin",
        action: "data_stewardship_smoke_archive",
        entityType: "PilotData",
        metadataJson: {
          cleanupMode: DATA_STEWARDSHIP_CLEANUP_MODE,
          protectedTables: DATA_STEWARDSHIP_PROTECTED_TABLES.join(","),
          referralCount: referrals.length,
          therapistCount: therapists.count,
          visitCount: archivedVisitCount,
        },
      },
    });

    return {
      referralCount: referrals.length,
      therapistCount: therapists.count,
      visitCount: archivedVisitCount,
    };
  });
}

export async function resetDemoScenarios(
  prisma: PrismaClient,
  actorId: string,
  confirmation: string,
  scenarios?: readonly string[],
) {
  if (!validateStewardshipConfirmation(confirmation, RESET_DEMO_SCENARIOS_CONFIRMATION)) {
    throw new Error("Confirmation text did not match RESET DEMO SCENARIOS.");
  }

  const scenarioKeys = selectedScenarioKeys(scenarios);

  return prisma.$transaction(async (tx) => {
    const before = await Promise.all([
      tx.auditLog.count(),
      tx.smsMessage.count(),
      tx.telnyxWebhookEvent.count(),
      tx.smsConsentEnrollment.count(),
    ]);
    const archived = await archiveDemoOperationalRecords(tx);
    const smokeReferrals = await tx.patientReferral.findMany({
      select: { id: true, notes: true },
      where: unarchivedWhere(smokeOperationalReferralWhere()),
      take: 500,
    });
    const smokeReferralIds = smokeReferrals.map((referral) => referral.id);
    await archiveReferrals(tx, smokeReferrals, "Stewardship reset: smoke-test operational record archived.");
    const archivedSmokeReferralVisitCount = await archiveVisits(tx, smokeReferralIds, "Stewardship reset: smoke-test visit archived.");
    const archivedSmokeDirectVisitCount = await archiveVisitsByWhere(tx, smokeOperationalVisitWhere(), "Stewardship reset: smoke-test visit archived.");
    if (smokeReferralIds.length > 0) {
      await Promise.all([
        tx.patientReferral.updateMany({
          where: {
            id: { in: smokeReferralIds },
            status: { notIn: ["completed", "canceled"] },
          },
          data: { status: "canceled" },
        }),
        tx.visit.updateMany({
          where: {
            referralId: { in: smokeReferralIds },
            status: { in: ["unscheduled", "scheduled", "in_progress"] },
          },
          data: { status: "canceled" },
        }),
      ]);
    }
    const seeded = await seedDemoScenariosInTransaction(tx, scenarioKeys);
    const after = await Promise.all([
      tx.auditLog.count(),
      tx.smsMessage.count(),
      tx.telnyxWebhookEvent.count(),
      tx.smsConsentEnrollment.count(),
    ]);

    await Promise.all([
      tx.auditLog.create({
        data: {
          actorId,
          actorType: "pilot_admin",
          action: "data_stewardship_demo_reset",
          entityType: "PilotData",
          metadataJson: {
            archivedReferralCount: archived.referralCount,
            archivedSmokeReferralCount: smokeReferrals.length,
            archivedSmokeVisitCount: archivedSmokeReferralVisitCount + archivedSmokeDirectVisitCount,
            archivedVisitCount: archived.visitCount,
            auditPreserved: after[0] >= before[0],
            cleanupMode: DATA_STEWARDSHIP_CLEANUP_MODE,
            consentPreserved: after[3] >= before[3],
            hardDeleteMode: DATA_STEWARDSHIP_HARD_DELETE_MODE,
            messageLedgerPreserved: after[1] === before[1],
            protectedTables: DATA_STEWARDSHIP_PROTECTED_TABLES.join(","),
            scenarioCount: seeded.scenarioKeys.length,
            seededConsentCount: seeded.consentUpsertCount,
            seededReferralCount: seeded.referralCount,
            seededVisitCount: seeded.visitCount,
            source: DEMO_SCENARIO_SOURCE,
            therapistCount: seeded.therapistCount,
            webhookPreserved: after[2] === before[2],
          },
        },
      }),
      tx.auditLog.create({
        data: {
          actorId,
          actorType: "pilot_admin",
          action: "data_stewardship_demo_seed",
          entityType: "PilotData",
          metadataJson: {
            scenarioCount: seeded.scenarioKeys.length,
            seededConsentCount: seeded.consentUpsertCount,
            seededReferralCount: seeded.referralCount,
            seededVisitCount: seeded.visitCount,
            source: DEMO_SCENARIO_SOURCE,
            therapistCount: seeded.therapistCount,
          },
        },
      }),
    ]);

    return {
      archivedReferralCount: archived.referralCount,
      archivedSmokeReferralCount: smokeReferrals.length,
      archivedSmokeVisitCount: archivedSmokeReferralVisitCount + archivedSmokeDirectVisitCount,
      archivedVisitCount: archived.visitCount,
      auditPreserved: after[0] >= before[0],
      consentPreserved: after[3] >= before[3],
      scenarioCount: seeded.scenarioKeys.length,
      seededConsentCount: seeded.consentUpsertCount,
      seededReferralCount: seeded.referralCount,
      seededVisitCount: seeded.visitCount,
      messageLedgerPreserved: after[1] === before[1],
      therapistCount: seeded.therapistCount,
      webhookPreserved: after[2] === before[2],
    };
  });
}

export function getPilotDemoResetStatus() {
  return {
    activeQueueSource: "filtered operational records",
    archivedWorkflowRowsHidden: true,
    auditPreservationEnforced: true,
    hardDeleteProtectedHistoryDisabled: true,
    consentPreservationEnforced: true,
    demoResetArchiveFirst: true,
    demoScenarioSeedingEnabled: true,
    enabled: true,
    externalResetApisEnabled: false,
    hardDeleteMode: DATA_STEWARDSHIP_HARD_DELETE_MODE,
    realDataResetEnabled: false,
    smsLedgerPreservationEnforced: true,
    smokeTestActiveQueueExclusionEnabled: true,
    smokeTestArchiveEnabled: true,
    webhookPreservationEnforced: true,
  };
}

export async function markConfiguredPersonalTestPhoneOptedOut(prisma: PrismaClient, actorId: string, confirmation: string) {
  if (!validateStewardshipConfirmation(confirmation, MARK_TEST_PHONE_OPTED_OUT_CONFIRMATION)) {
    throw new Error("Confirmation text did not match MARK TEST PHONE OPTED OUT.");
  }

  const configuredPhone = process.env.FLOWVIA_PERSONAL_TEST_PHONE?.trim();
  if (!configuredPhone) {
    throw new Error("FLOWVIA_PERSONAL_TEST_PHONE is not configured, so no personal test enrollment can be identified safely.");
  }

  const normalizedPhone = normalizeE164Phone(configuredPhone);
  const enrollment = await prisma.smsConsentEnrollment.findUnique({
    select: { id: true, status: true },
    where: { normalizedPhone },
  });

  if (!enrollment) {
    return { changed: false, maskedPhone: redactPhone(normalizedPhone), status: "not_found" };
  }

  await prisma.$transaction([
    prisma.smsConsentEnrollment.update({
      where: { id: enrollment.id },
      data: {
        optedOutAt: new Date(),
        status: "opted_out",
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId,
        actorType: "pilot_admin",
        action: "pilot_personal_test_phone_opted_out",
        entityId: enrollment.id,
        entityType: "SmsConsentEnrollment",
        metadataJson: {
          from: enrollment.status,
          status: "opted_out",
        },
      },
    }),
  ]);

  return { changed: enrollment.status !== "opted_out", maskedPhone: redactPhone(normalizedPhone), status: "opted_out" };
}

export async function getPersonalTestEnrollmentSummary(prisma: PrismaClient) {
  const configuredPhone = process.env.FLOWVIA_PERSONAL_TEST_PHONE?.trim();
  if (!configuredPhone) {
    return {
      configured: false,
      maskedPhone: "Not configured",
      status: "Read-only guidance",
    };
  }

  const normalizedPhone = normalizeE164Phone(configuredPhone);
  const enrollment = await prisma.smsConsentEnrollment.findUnique({
    select: { status: true, updatedAt: true },
    where: { normalizedPhone },
  });

  return {
    configured: true,
    maskedPhone: redactPhone(normalizedPhone),
    status: enrollment?.status ?? "No enrollment found",
    updatedAt: enrollment?.updatedAt ?? null,
  };
}

export async function getPilotDataStewardshipSummary(prisma: PrismaClient) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [
    fakeReferralCount,
    fakeVisitCount,
    activeDemoReferralCount,
    activeSmokeReferralCount,
    activeDemoVisitCount,
    activeSmokeVisitCount,
    terminalDemoReferralCount,
    terminalDemoVisitCount,
    therapistCount,
    smsConsentEnrollmentCount,
    smsMessageCount,
    telnyxWebhookEventCount,
    auditLogCount,
    recentAuditLogCount,
    archivedFakeReferralCount,
    archivedFakeVisitCount,
    lastStewardshipAudit,
    personalTestEnrollment,
  ] = await Promise.all([
    prisma.patientReferral.count({ where: fakePilotReferralWhere() }),
    prisma.visit.count({ where: { referral: fakePilotReferralWhere() } }),
    prisma.patientReferral.count({ where: { AND: [activeWorkflowWhereClause(demoOperationalReferralWhere()), { status: { notIn: ["completed", "canceled"] } }] } }),
    prisma.patientReferral.count({ where: { AND: [activeWorkflowWhereClause(smokeOperationalReferralWhere()), { status: { notIn: ["completed", "canceled"] } }] } }),
    prisma.visit.count({ where: { AND: [activeWorkflowVisitWhere({ referral: demoOperationalReferralWhere() }), { status: { in: ["unscheduled", "scheduled", "in_progress"] } }] } }),
    prisma.visit.count({ where: { AND: [activeWorkflowVisitWhere({ referral: smokeOperationalReferralWhere() }), { status: { in: ["unscheduled", "scheduled", "in_progress"] } }] } }),
    prisma.patientReferral.count({ where: { AND: [activeWorkflowWhereClause(demoOperationalReferralWhere()), { status: { in: ["completed", "canceled"] } }] } }),
    prisma.visit.count({ where: { AND: [activeWorkflowVisitWhere({ referral: demoOperationalReferralWhere() }), { status: { in: ["completed", "canceled", "no_show"] } }] } }),
    prisma.therapist.count(),
    prisma.smsConsentEnrollment.count(),
    prisma.smsMessage.count(),
    prisma.telnyxWebhookEvent.count(),
    prisma.auditLog.count(),
    prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
    prisma.patientReferral.count({ where: { AND: [fakePilotReferralWhere(), { notes: { contains: STEWARDSHIP_ARCHIVE_MARKER } }] } }),
    prisma.visit.count({
      where: {
        AND: [
          { referral: fakePilotReferralWhere() },
          {
            OR: [
              { notes: { contains: STEWARDSHIP_ARCHIVE_MARKER } },
              { referral: { notes: { contains: STEWARDSHIP_ARCHIVE_MARKER } } },
            ],
          },
        ],
      },
    }),
    prisma.auditLog.findFirst({
      orderBy: { createdAt: "desc" },
      select: { action: true, actorType: true, createdAt: true },
      where: {
        action: {
          in: [
            "pilot_data_seeded",
            "pilot_data_refreshed",
            "pilot_data_archived",
            "pilot_test_data_archived",
            "data_stewardship_smoke_archive",
            "data_stewardship_demo_reset",
            "data_stewardship_demo_seed",
            "pilot_personal_test_phone_opted_out",
          ],
        },
      },
    }),
    getPersonalTestEnrollmentSummary(prisma),
  ]);
  const telnyx = getTelnyxConfigStatus();
  const dataMode = getFlowviaDataModeStatus();

  return {
    activeDemoReferralCount,
    activeDemoVisitCount,
    activeSmokeReferralCount,
    activeSmokeVisitCount,
    archivedFakeReferralCount,
    archivedFakeVisitCount,
    auditLogCount,
    auditPreservingCleanupEnabled: true,
    consentPreservationEnforced: true,
    dataModeLabel: dataMode.safeLabel,
    demoScenarioSeedingEnabled: true,
    fakeReferralCount,
    fakeVisitCount,
    hardDeleteMode: DATA_STEWARDSHIP_HARD_DELETE_MODE,
    lastStewardshipAudit,
    personalNumberTestModeStatus: personalTestEnrollment.configured ? `${personalTestEnrollment.maskedPhone} / ${personalTestEnrollment.status}` : "No configured test phone",
    personalTestEnrollment,
    realDataResetEnabled: false,
    realSmsGateStatus: telnyx.realSmsTestsEnabled ? "On" : "Off",
    recentAuditLogCount,
    smsConsentEnrollmentCount,
    smsLedgerPreservationEnforced: true,
    smsMessageCount,
    smokeTestArchiveEnabled: true,
    telnyxWebhookEventCount,
    therapistCount,
    terminalDemoRecordCount: terminalDemoReferralCount + terminalDemoVisitCount,
    terminalDemoReferralCount,
    terminalDemoVisitCount,
    webhookPreservationEnforced: true,
  };
}
