import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadLocalEnv } from "./load-local-env.mts";

const SMOKE_SOURCE = "flowvia_ops_guardrail_smoke_v1";
const SMOKE_ACTOR = "ops_guardrail_smoke";
const ROUND_TRIP_INPUT = "2026-07-07T13:00";

function requirePostgres() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Operations guardrail smoke writes only fake data to Postgres.");
  }
}

function assertBlocked(label: string, fn: () => unknown, expectedMessage: string) {
  assert.throws(fn, (error) => error instanceof Error && error.message === expectedMessage, label);
}

async function main() {
  loadLocalEnv();
  requirePostgres();

  const { getPrismaClient } = await import("../lib/db/prisma.ts");
  const {
    OPERATIONAL_NOTE_PHI_ERROR,
    assertOperationalTextSafe,
  } = await import("../lib/compliance/operational-text.ts");
  const {
    formatOperationsDateTime,
    formatOperationsDateTimeLocalInput,
    parseOperationsDateTimeLocal,
  } = await import("../lib/pilot/time.ts");
  const prisma = getPrismaClient();
  const runId = randomUUID().slice(0, 8);

  assertBlocked(
    "visit create rejects ALS diagnosis text",
    () => assertOperationalTextSafe("This patient has ALS (TEST)"),
    OPERATIONAL_NOTE_PHI_ERROR,
  );
  assertBlocked(
    "visit update rejects diagnosis text",
    () => assertOperationalTextSafe("diagnosis: test"),
    OPERATIONAL_NOTE_PHI_ERROR,
  );
  assertBlocked(
    "therapist my-work visit update rejects clinical note text",
    () => assertOperationalTextSafe("Therapist note: blood pressure check requested"),
    OPERATIONAL_NOTE_PHI_ERROR,
  );

  for (const safeNote of ["Call before arrival", "Gate code needed", "Prefers morning scheduling", "Test scheduling note"]) {
    assert.doesNotThrow(() => assertOperationalTextSafe(safeNote), `safe operational note should pass: ${safeNote}`);
  }

  const scheduledAt = parseOperationsDateTimeLocal(ROUND_TRIP_INPUT);
  assert.ok(scheduledAt, "scheduledAt should parse from datetime-local input");
  assert.equal(formatOperationsDateTimeLocalInput(scheduledAt), ROUND_TRIP_INPUT);
  assert.match(formatOperationsDateTime(scheduledAt), /1:00 PM/);

  await prisma.$transaction(async (tx) => {
    await tx.patientReferral.deleteMany({ where: { referralSource: SMOKE_SOURCE } });
    await tx.therapist.deleteMany({ where: { email: `ops.guardrail.${runId}@flowviahealth.test` } });

    const therapist = await tx.therapist.create({
      data: {
        active: true,
        email: `ops.guardrail.${runId}@flowviahealth.test`,
        name: "Ops Guardrail Smoke Therapist",
        phone: "+15550101880",
        serviceAreaNotes: "Fake smoke therapist. No PHI.",
      },
    });

    const referral = await tx.patientReferral.create({
      data: {
        assignedTherapistId: therapist.id,
        careType: "Fake scheduling workflow",
        city: "Dallas",
        email: `ops.guardrail.${runId}@example.test`,
        notes: "Test scheduling note",
        patientName: "Ops Guardrail Smoke Patient",
        phone: "+15550101881",
        referralSource: SMOKE_SOURCE,
        status: "scheduled",
        zip: "75230",
      },
    });

    const visit = await tx.visit.create({
      data: {
        notes: "Call before arrival",
        referralId: referral.id,
        scheduledAt,
        status: "scheduled",
        therapistId: therapist.id,
      },
    });

    const readVisit = await tx.visit.findUniqueOrThrow({ where: { id: visit.id } });
    assert.equal(formatOperationsDateTimeLocalInput(readVisit.scheduledAt), ROUND_TRIP_INPUT);
    assert.match(formatOperationsDateTime(readVisit.scheduledAt), /1:00 PM/);

    assertOperationalTextSafe("Gate code needed");
    const updated = await tx.visit.update({
      data: { notes: "Gate code needed" },
      where: { id: visit.id },
    });
    assert.equal(updated.notes, "Gate code needed");

    await tx.auditLog.create({
      data: {
        actorId: runId,
        actorType: SMOKE_ACTOR,
        action: "ops_guardrail_smoke_completed",
        entityId: visit.id,
        entityType: "Visit",
        metadataJson: { referralId: referral.id, scheduledLocal: ROUND_TRIP_INPUT },
      },
    });
  });

  await prisma.$disconnect();
  console.log("Operations guardrail smoke passed: clinical notes blocked, harmless note accepted, and visit time round-tripped at 1:00 PM.");
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : "Operations guardrail smoke failed.");
  process.exitCode = 1;
});
