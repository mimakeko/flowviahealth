import { loadLocalEnv } from "./load-local-env.mts";

function requirePostgres() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Field pilot seed writes to Postgres and will not use local JSON storage.");
  }
}

async function main() {
  loadLocalEnv();
  requirePostgres();
  const { getPrismaClient } = await import("../lib/db/prisma.ts");
  const { seedOrRefreshFakePilotData } = await import("../lib/pilot/data-stewardship.ts");
  const prisma = getPrismaClient();

  const result = await seedOrRefreshFakePilotData(prisma, "seed_script");

  await prisma.$disconnect();
  console.log(`Seed complete: fake field pilot data created for ${result.therapistCount} demo therapists, ${result.referralCount} demo referrals, and ${result.visitCount} demo visits.`);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : "Field pilot seed failed.");
  process.exitCode = 1;
});
