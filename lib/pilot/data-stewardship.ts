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
export const MARK_TEST_PHONE_OPTED_OUT_CONFIRMATION = "MARK TEST PHONE OPTED OUT";
export const DATA_STEWARDSHIP_CLEANUP_MODE = "archive_only";
export const DATA_STEWARDSHIP_PROTECTED_TABLES = ["AuditLog", "SmsConsentEnrollment", "SmsMessage", "TelnyxWebhookEvent"] as const;

type StewardshipPrisma = PrismaClient | Prisma.TransactionClient;

type ReferralLike = {
  careType?: string | null;
  patientName?: string | null;
  referralSource?: string | null;
};

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

const referralSeeds = [
  ["Demo Patient Alpha", "+15550101101", "Dallas", "75230", "Demo mobility visit", "scheduled", 0],
  ["Demo Patient Beta", "+15550101102", "Plano", "75024", "Demo scheduling request", "contacted", 1],
  ["Demo Patient Gamma", "+15550101103", "Frisco", "75034", "Demo evaluation workflow", "new", 1],
  ["Demo Patient Delta", "+15550101104", "Dallas", "75248", "Demo follow-up workflow", "active", 0],
  ["Demo Patient Echo", "+15550101105", "McKinney", "75070", "Demo service update workflow", "completed", 2],
  ["Demo Patient Foxtrot", "+15550101106", "Allen", "75013", "Demo readiness check", "canceled", 2],
  ["Demo Patient Gulf", "+15550101107", "Dallas", "75231", "Demo assignment workflow", "contacted", 0],
  ["Demo Patient Hotel", "+15550101108", "McKinney", "75071", "Demo scheduling workflow", "scheduled", 2],
] as const;

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
  return referral.referralSource === DEMO_SOURCE || Boolean(referral.patientName?.startsWith("Demo Patient"));
}

export function isExplicitSmokeTestReferralLike(referral: ReferralLike) {
  return (
    referral.referralSource === DB_SMOKE_SOURCE ||
    referral.referralSource === OPS_GUARDRAIL_SMOKE_SOURCE ||
    Boolean(referral.patientName?.startsWith("Smoke")) ||
    Boolean(referral.patientName?.startsWith("Ops Guardrail Smoke")) ||
    Boolean(referral.careType?.startsWith("Smoke test"))
  );
}

export function fakePilotReferralWhere(): Prisma.PatientReferralWhereInput {
  return {
    OR: [
      { referralSource: DEMO_SOURCE },
      { patientName: { startsWith: "Demo Patient" } },
      { referralSource: DB_SMOKE_SOURCE },
      { referralSource: OPS_GUARDRAIL_SMOKE_SOURCE },
      { patientName: { startsWith: "Smoke" } },
      { patientName: { startsWith: "Ops Guardrail Smoke" } },
    ],
  };
}

export function smokeOperationalReferralWhere(): Prisma.PatientReferralWhereInput {
  return {
    OR: [
      { referralSource: DB_SMOKE_SOURCE },
      { referralSource: OPS_GUARDRAIL_SMOKE_SOURCE },
      { patientName: { startsWith: "Smoke" } },
      { patientName: { startsWith: "Ops Guardrail Smoke" } },
      { careType: { startsWith: "Smoke test" } },
    ],
  };
}

function unarchivedWhere(baseWhere: Prisma.PatientReferralWhereInput): Prisma.PatientReferralWhereInput {
  return {
    AND: [
      baseWhere,
      {
        NOT: {
          notes: { contains: STEWARDSHIP_ARCHIVE_MARKER },
        },
      },
    ],
  };
}

export function seedableDemoTherapistEmails() {
  return therapistSeeds.map((therapist) => therapist.email);
}

export async function seedOrRefreshFakePilotData(prisma: PrismaClient, actorId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.patientReferral.deleteMany({
      where: { referralSource: DEMO_SOURCE },
    });
    await tx.therapist.deleteMany({
      where: { email: { in: seedableDemoTherapistEmails() } },
    });

    const therapists = await Promise.all(
      therapistSeeds.map((therapist) =>
        tx.therapist.create({
          data: {
            ...therapist,
            active: true,
          },
        }),
      ),
    );

    const referrals = await Promise.all(
      referralSeeds.map(([patientName, phone, city, zip, careType, status, therapistIndex], index) =>
        tx.patientReferral.create({
          data: {
            assignedTherapistId: therapists[therapistIndex].id,
            careType,
            city,
            email: `demo.patient.${index + 1}@example.test`,
            notes: "Fake field pilot operational note. No PHI.",
            patientName,
            phone,
            referralSource: DEMO_SOURCE,
            status,
            zip,
          },
        }),
      ),
    );

    const visitSeeds = [
      [referrals[0].id, therapists[0].id, "2026-07-08T15:00:00.000Z", "scheduled", "Fake scheduled visit for pilot seed."],
      [referrals[1].id, therapists[1].id, "2026-07-09T16:30:00.000Z", "in_progress", "Fake in-progress visit for pilot seed."],
      [referrals[3].id, therapists[0].id, "2026-07-10T17:00:00.000Z", "completed", "Fake completed visit for pilot seed."],
      [referrals[4].id, therapists[2].id, "2026-07-11T14:00:00.000Z", "no_show", "Fake no-show visit for pilot seed."],
      [referrals[7].id, therapists[2].id, "2026-07-12T18:00:00.000Z", "canceled", "Fake canceled visit for pilot seed."],
    ] as const;

    const visits = await Promise.all(
      visitSeeds.map(([referralId, therapistId, scheduledAt, status, notes]) =>
        tx.visit.create({
          data: {
            notes,
            referralId,
            scheduledAt: new Date(scheduledAt),
            status,
            therapistId,
          },
        }),
      ),
    );

    await tx.auditLog.create({
      data: {
        actorId,
        actorType: "pilot_admin",
        action: "pilot_data_refreshed",
        entityType: "PilotData",
        metadataJson: {
          referralCount: referrals.length,
          source: DEMO_SOURCE,
          therapistCount: therapists.length,
          visitCount: visits.length,
        },
      },
    });

    return {
      referralCount: referrals.length,
      therapistCount: therapists.length,
      visitCount: visits.length,
    };
  });
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
      NOT: {
        notes: { contains: STEWARDSHIP_ARCHIVE_MARKER },
      },
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
  if (!validateStewardshipConfirmation(confirmation, CLEAR_TEST_DATA_CONFIRMATION)) {
    throw new Error("Confirmation text did not match CLEAR TEST DATA.");
  }

  return prisma.$transaction(async (tx) => {
    const referrals = await tx.patientReferral.findMany({
      select: { id: true, notes: true },
      where: unarchivedWhere(smokeOperationalReferralWhere()),
      take: 200,
    });
    const referralIds = referrals.map((referral) => referral.id);
    await archiveReferrals(tx, referrals, "Stewardship cleanup: smoke-test operational record archived.");
    const archivedVisitCount = await archiveVisits(tx, referralIds, "Stewardship cleanup: smoke-test visit archived.");
    const therapists = await tx.therapist.updateMany({
      where: {
        OR: [
          { name: { startsWith: "Smoke" } },
          { name: { startsWith: "Ops Guardrail Smoke" } },
          { email: { startsWith: "smoke.therapist." } },
          { email: { startsWith: "ops.guardrail." } },
        ],
      },
      data: { active: false },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        actorType: "pilot_admin",
        action: "pilot_test_data_archived",
        entityType: "PilotData",
        metadataJson: {
          cleanupMode: DATA_STEWARDSHIP_CLEANUP_MODE,
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
  const [
    fakeReferralCount,
    fakeVisitCount,
    therapistCount,
    smsConsentEnrollmentCount,
    smsMessageCount,
    telnyxWebhookEventCount,
    auditLogCount,
    archivedFakeReferralCount,
    lastStewardshipAudit,
    personalTestEnrollment,
  ] = await Promise.all([
    prisma.patientReferral.count({ where: fakePilotReferralWhere() }),
    prisma.visit.count({ where: { referral: fakePilotReferralWhere() } }),
    prisma.therapist.count(),
    prisma.smsConsentEnrollment.count(),
    prisma.smsMessage.count(),
    prisma.telnyxWebhookEvent.count(),
    prisma.auditLog.count(),
    prisma.patientReferral.count({ where: { AND: [fakePilotReferralWhere(), { notes: { contains: STEWARDSHIP_ARCHIVE_MARKER } }] } }),
    prisma.auditLog.findFirst({
      orderBy: { createdAt: "desc" },
      select: { action: true, actorType: true, createdAt: true },
      where: {
        action: {
          in: ["pilot_data_seeded", "pilot_data_refreshed", "pilot_data_archived", "pilot_test_data_archived", "pilot_personal_test_phone_opted_out"],
        },
      },
    }),
    getPersonalTestEnrollmentSummary(prisma),
  ]);
  const telnyx = getTelnyxConfigStatus();
  const dataMode = getFlowviaDataModeStatus();

  return {
    archivedFakeReferralCount,
    auditLogCount,
    auditPreservingCleanupEnabled: true,
    dataModeLabel: dataMode.safeLabel,
    fakeReferralCount,
    fakeVisitCount,
    lastStewardshipAudit,
    personalNumberTestModeStatus: personalTestEnrollment.configured ? `${personalTestEnrollment.maskedPhone} / ${personalTestEnrollment.status}` : "No configured test phone",
    personalTestEnrollment,
    realSmsGateStatus: telnyx.realSmsTestsEnabled ? "On" : "Off",
    smsConsentEnrollmentCount,
    smsMessageCount,
    telnyxWebhookEventCount,
    therapistCount,
  };
}
