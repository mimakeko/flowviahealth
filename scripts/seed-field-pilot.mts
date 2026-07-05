import { loadLocalEnv } from "./load-local-env.mts";

const DEMO_SOURCE = "flowvia_demo_seed_v1";
const DEMO_ACTOR = "seed_script";

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

function requirePostgres() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Field pilot seed writes to Postgres and will not use local JSON storage.");
  }
}

async function main() {
  loadLocalEnv();
  requirePostgres();
  const { getPrismaClient } = await import("../lib/db/prisma.ts");
  const prisma = getPrismaClient();

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({
      where: { actorType: DEMO_ACTOR },
    });
    await tx.patientReferral.deleteMany({
      where: { referralSource: DEMO_SOURCE },
    });
    await tx.therapist.deleteMany({
      where: {
        email: {
          in: therapistSeeds.map((therapist) => therapist.email),
        },
      },
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

    const referralSeeds = [
      ["Demo Patient Alpha", "+15550101101", "Dallas", "75230", "Demo mobility visit", "scheduled", therapists[0].id],
      ["Demo Patient Beta", "+15550101102", "Plano", "75024", "Demo scheduling request", "contacted", therapists[1].id],
      ["Demo Patient Gamma", "+15550101103", "Frisco", "75034", "Demo evaluation workflow", "new", therapists[1].id],
      ["Demo Patient Delta", "+15550101104", "Dallas", "75248", "Demo follow-up workflow", "active", therapists[0].id],
      ["Demo Patient Echo", "+15550101105", "McKinney", "75070", "Demo service update workflow", "completed", therapists[2].id],
      ["Demo Patient Foxtrot", "+15550101106", "Allen", "75013", "Demo readiness check", "canceled", therapists[2].id],
      ["Demo Patient Gulf", "+15550101107", "Dallas", "75231", "Demo assignment workflow", "contacted", therapists[0].id],
      ["Demo Patient Hotel", "+15550101108", "McKinney", "75071", "Demo scheduling workflow", "scheduled", therapists[2].id],
    ] as const;

    const referrals = await Promise.all(
      referralSeeds.map(([patientName, phone, city, zip, careType, status, assignedTherapistId], index) =>
        tx.patientReferral.create({
          data: {
            assignedTherapistId,
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

    await Promise.all(
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

    await Promise.all([
      tx.auditLog.create({
        data: {
          actorType: DEMO_ACTOR,
          action: "seed_demo_therapists",
          entityType: "Therapist",
          metadataJson: { count: therapists.length, source: DEMO_SOURCE },
        },
      }),
      tx.auditLog.create({
        data: {
          actorType: DEMO_ACTOR,
          action: "seed_demo_referrals",
          entityType: "PatientReferral",
          metadataJson: { count: referrals.length, source: DEMO_SOURCE },
        },
      }),
      tx.auditLog.create({
        data: {
          actorType: DEMO_ACTOR,
          action: "seed_demo_visits",
          entityType: "Visit",
          metadataJson: { count: visitSeeds.length, source: DEMO_SOURCE },
        },
      }),
    ]);
  });

  await prisma.$disconnect();
  console.log("Seed complete: fake field pilot data created for 3 demo therapists, 8 demo referrals, and 5 demo visits.");
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : "Field pilot seed failed.");
  process.exitCode = 1;
});
