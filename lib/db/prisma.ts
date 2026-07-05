import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertServerOnlyModule } from "../sms/server-only.ts";

assertServerOnlyModule();

const globalForPrisma = globalThis as unknown as {
  flowviaPrisma?: PrismaClient;
};

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the Prisma SMS store.");
  }
  return databaseUrl;
}

export function getPrismaClient() {
  if (globalForPrisma.flowviaPrisma) return globalForPrisma.flowviaPrisma;

  const adapter = new PrismaPg({
    connectionString: requireDatabaseUrl(),
  });

  const prisma = new PrismaClient({ adapter });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.flowviaPrisma = prisma;
  }

  return prisma;
}
