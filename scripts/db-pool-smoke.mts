import { loadLocalEnv } from "./load-local-env.mts";
import {
  getCloudDeployTarget,
  getDatabaseUrlComparison,
  isProductionLikeTarget,
} from "../lib/pilot/cloud-health.ts";

function fail(message: string): never {
  throw new Error(message);
}

function explainDatabaseError(error: unknown): never {
  const message = error instanceof Error ? error.message : "Unknown database error.";
  if (/EMAXCONNSESSION|max clients reached in session mode/i.test(message)) {
    fail("Database pool smoke failed: EMAXCONNSESSION detected. Vercel/serverless DATABASE_URL must use the Supabase transaction pooler, usually port 6543.");
  }
  if (/certificate|self-signed|TLS|SSL|ssl/i.test(message)) {
    fail("Database pool smoke failed: TLS/SSL connection error detected. Confirm Supabase URLs include SSL requirements and trusted certificate settings.");
  }
  fail(`Database pool smoke failed: ${message}`);
}

loadLocalEnv();

const target = getCloudDeployTarget();
const productionLike = isProductionLikeTarget(target);
const dbUrls = getDatabaseUrlComparison();

console.log(`Flowvia DB pool smoke (${target})`);
console.log("Secret values are redacted; this script reports storage mode, URL mode, port, and identical/non-identical only.");

if (!process.env.DATABASE_URL) {
  fail("DATABASE_URL is required for db:pool-smoke.");
}

console.log(`DATABASE_URL: SET, mode=${dbUrls.databaseUrl.mode}, port=${dbUrls.databaseUrl.port}, ssl=${dbUrls.databaseUrl.hasSslRequirement ? "present" : "missing"}`);
console.log(`DIRECT_URL: ${dbUrls.directUrl.set ? "SET" : "MISSING"}, mode=${dbUrls.directUrl.mode}, port=${dbUrls.directUrl.port}, ssl=${dbUrls.directUrl.hasSslRequirement ? "present" : "missing"}`);
console.log(`DATABASE_URL/DIRECT_URL: ${dbUrls.identical === null ? "unknown" : dbUrls.identical ? "identical" : "non-identical"}`);

if (productionLike && dbUrls.identical) {
  fail("DATABASE_URL and DIRECT_URL are identical in a production-like target. Runtime should use transaction pooler; migrations/admin should use direct/session.");
}

if (productionLike && dbUrls.databaseUrl.mode === "session") {
  fail("DATABASE_URL appears to use session/direct mode in a production-like target. Use Supabase transaction pooler for serverless runtime.");
}

const { getPrismaClient } = await import("../lib/db/prisma.ts");
const { getSmsStoreStatus } = await import("../lib/sms/store.ts");

const storage = getSmsStoreStatus();
console.log(`Storage mode: ${storage.label}`);

try {
  const prisma = getPrismaClient();
  const counts = {
    auditLogs: await prisma.auditLog.count(),
    referrals: await prisma.patientReferral.count(),
    smsConsentEnrollments: await prisma.smsConsentEnrollment.count(),
    smsMessages: await prisma.smsMessage.count(),
    telnyxWebhookEvents: await prisma.telnyxWebhookEvent.count(),
    therapists: await prisma.therapist.count(),
    visits: await prisma.visit.count(),
  };

  console.log("Sequential core table checks passed:", counts);
  console.log("DB pool smoke passed: Prisma can query core tables without stressing the pool.");
} catch (error) {
  explainDatabaseError(error);
}
