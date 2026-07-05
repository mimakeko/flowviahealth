import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { config } from "dotenv";
import { getFlowviaDataModeStatus } from "../lib/compliance/data-mode.ts";
import { verifyScryptPasswordHash } from "../lib/pilot/session.ts";

type CheckLevel = "PASS" | "WARN" | "FAIL";
type DatabasePoolerMode = "session" | "transaction" | "unknown";
type DatabaseUrlMetadata = Readonly<{
  hasSslRequirement: boolean;
  mode: DatabasePoolerMode;
  parseable: boolean;
  port: string;
  set: boolean;
}>;

const repoRoot = process.cwd();
const envLocalPath = `${repoRoot}/.env.local`;
const envExamplePath = `${repoRoot}/.env.example`;
const manifestPath = `${repoRoot}/docs/VERCEL_ENV_MANIFEST_V1.md`;

config({ path: ".env", quiet: true });
config({ path: ".env.local", quiet: true });

const requiredDocumentationEnv = [
  "FLOWVIA_DEPLOY_TARGET",
  "DATABASE_URL",
  "DIRECT_URL",
  "TELNYX_API_KEY",
  "TELNYX_MESSAGING_PROFILE_ID",
  "TELNYX_FLOWVIA_FROM_NUMBER",
  "TELNYX_WEBHOOK_SIGNING_SECRET",
  "FLOWVIA_ADMIN_EMAIL",
  "FLOWVIA_ADMIN_PASSWORD_HASH",
  "FLOWVIA_THERAPIST_EMAILS",
  "FLOWVIA_THERAPIST_PASSWORD_HASH",
  "FLOWVIA_SESSION_SECRET",
  "FLOWVIA_PILOT_OPERATIONS_ENABLED",
  "FLOWVIA_ADMIN_MESSAGES_ENABLED",
  "FLOWVIA_ALLOW_REAL_SMS_TEST",
  "FLOWVIA_DATA_MODE",
  "FLOWVIA_AI_ENABLED",
  "FLOWVIA_AI_PROVIDER",
  "FLOWVIA_AI_NO_PHI_MODE",
  "FLOWVIA_AI_AUDIT_ONLY",
] as const;

const stagingRequiredEnv = [
  "DATABASE_URL",
  "DIRECT_URL",
  "TELNYX_API_KEY",
  "TELNYX_MESSAGING_PROFILE_ID",
  "TELNYX_FLOWVIA_FROM_NUMBER",
  "TELNYX_WEBHOOK_SIGNING_SECRET",
  "FLOWVIA_ADMIN_EMAIL",
  "FLOWVIA_ADMIN_PASSWORD_HASH",
  "FLOWVIA_THERAPIST_EMAILS",
  "FLOWVIA_THERAPIST_PASSWORD_HASH",
  "FLOWVIA_SESSION_SECRET",
  "FLOWVIA_PILOT_OPERATIONS_ENABLED",
  "FLOWVIA_ADMIN_MESSAGES_ENABLED",
  "FLOWVIA_DATA_MODE",
] as const;

const target = (
  process.env.FLOWVIA_DEPLOY_TARGET ||
  process.env.FLOWVIA_READINESS_TARGET ||
  process.env.VERCEL_ENV ||
  (process.env.NODE_ENV === "production" ? "production" : "local")
).trim().toLowerCase();
const validTargets = new Set(["local", "staging", "production", "preview", "prod"]);
const productionLike = ["staging", "production", "preview", "prod"].includes(target);
const results: Array<{ level: CheckLevel; message: string }> = [];

function add(level: CheckLevel, message: string) {
  results.push({ level, message });
}

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

function safeValueSummary(name: string) {
  if (!hasEnv(name)) return "MISSING";
  if (name === "TELNYX_FLOWVIA_FROM_NUMBER" || name === "TELNYX_MESSAGING_PROFILE_ID" || name === "FLOWVIA_DEPLOY_TARGET") {
    return `SET (${process.env[name]})`;
  }
  if (name.startsWith("FLOWVIA_AI_") || name.startsWith("FLOWVIA_") && !name.includes("HASH") && !name.includes("SECRET")) {
    return `SET (${process.env[name]})`;
  }
  return `SET (length ${process.env[name]?.length ?? 0})`;
}

function gitCheckIgnored(file: string) {
  try {
    execFileSync("git", ["check-ignore", "-q", file], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function gitTracks(file: string) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", file], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function checkKnownTemporaryPassword(hashName: "FLOWVIA_ADMIN_PASSWORD_HASH" | "FLOWVIA_THERAPIST_PASSWORD_HASH", knownPassword: string) {
  const hash = process.env[hashName]?.trim().replaceAll("\\$", "$");
  return hash ? verifyScryptPasswordHash(knownPassword, hash) : false;
}

function booleanEnv(name: string, defaultValue: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return defaultValue;
  return value === "true";
}

function databaseUrlMetadata(name: "DATABASE_URL" | "DIRECT_URL"): DatabaseUrlMetadata {
  const value = process.env[name]?.trim();
  if (!value) {
    return {
      hasSslRequirement: false,
      mode: "unknown",
      parseable: false,
      port: "missing",
      set: false,
    };
  }

  try {
    const parsed = new URL(value);
    const port = parsed.port || (parsed.protocol === "postgresql:" || parsed.protocol === "postgres:" ? "5432" : "unknown");
    const host = parsed.hostname.toLowerCase();
    const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
    const sslValue = parsed.searchParams.get("ssl")?.toLowerCase();
    const hasSslRequirement = sslMode === "require" || sslValue === "true";
    const mode: DatabasePoolerMode = port === "6543" || (host.includes("pooler") && port !== "5432")
      ? "transaction"
      : port === "5432"
        ? "session"
        : "unknown";

    return {
      hasSslRequirement,
      mode,
      parseable: true,
      port,
      set: true,
    };
  } catch {
    return {
      hasSslRequirement: false,
      mode: "unknown",
      parseable: false,
      port: "unparseable",
      set: true,
    };
  }
}

function addDatabaseUrlMetadata(name: "DATABASE_URL" | "DIRECT_URL", metadata: DatabaseUrlMetadata) {
  if (!metadata.set) return;

  add(
    metadata.parseable ? "PASS" : productionLike ? "FAIL" : "WARN",
    `${name} safe metadata: SET, detected port=${metadata.port}, likely pooler mode=${metadata.mode}, SSL requirement=${metadata.hasSslRequirement ? "present" : "missing"}.`,
  );
}

function addSupabasePoolingChecks() {
  const databaseUrl = databaseUrlMetadata("DATABASE_URL");
  const directUrl = databaseUrlMetadata("DIRECT_URL");

  addDatabaseUrlMetadata("DATABASE_URL", databaseUrl);
  addDatabaseUrlMetadata("DIRECT_URL", directUrl);

  if (databaseUrl.set && databaseUrl.parseable) {
    if (databaseUrl.port === "6543" || databaseUrl.mode === "transaction") {
      add("PASS", "DATABASE_URL appears serverless-safe for Vercel runtime: transaction pooler mode detected.");
    } else if (databaseUrl.port === "5432" || databaseUrl.mode === "session") {
      add(
        productionLike ? "FAIL" : "WARN",
        "DATABASE_URL appears to use session/direct Postgres on port 5432. Vercel/serverless runtime must use Supabase transaction pooler, usually port 6543.",
      );
    } else {
      add(
        productionLike ? "WARN" : "PASS",
        "DATABASE_URL pooler mode is unknown. For Vercel/serverless, confirm it is the Supabase transaction pooler URL, usually port 6543.",
      );
    }

    add(
      databaseUrl.hasSslRequirement ? "PASS" : productionLike ? "FAIL" : "WARN",
      `DATABASE_URL SSL requirement is ${databaseUrl.hasSslRequirement ? "present" : "missing"} for Supabase Postgres.`,
    );
  }

  if (directUrl.set && directUrl.parseable) {
    if (directUrl.port === "5432" || directUrl.mode === "session") {
      add("PASS", "DIRECT_URL appears suitable for Prisma migrations/admin operations: session/direct mode detected.");
    } else if (directUrl.port === "6543" || directUrl.mode === "transaction") {
      add(
        productionLike ? "FAIL" : "WARN",
        "DIRECT_URL appears to use the transaction pooler. Prisma migrations/admin operations should use Supabase session/direct URL, usually port 5432.",
      );
    } else {
      add("WARN", "DIRECT_URL pooler mode is unknown. Confirm it is Supabase session/direct URL for migrations/admin operations, usually port 5432.");
    }

    add(
      directUrl.hasSslRequirement ? "PASS" : productionLike ? "FAIL" : "WARN",
      `DIRECT_URL SSL requirement is ${directUrl.hasSslRequirement ? "present" : "missing"} for Supabase Postgres.`,
    );
  }

  if (databaseUrl.set && directUrl.set) {
    const identical = process.env.DATABASE_URL?.trim() === process.env.DIRECT_URL?.trim();
    add(
      identical ? "WARN" : "PASS",
      `DATABASE_URL and DIRECT_URL are ${identical ? "identical" : "non-identical"}. Runtime should use transaction pooler; migrations/admin should use session/direct.`,
    );
  }
}

console.log(`Flowvia cloud staging readiness (${target})`);
console.log("Secret values are redacted; this script reports presence, lengths, modes, and safe public identifiers only.");

if (!validTargets.has(target)) {
  add("FAIL", `FLOWVIA_DEPLOY_TARGET/FLOWVIA_READINESS_TARGET value is unsupported: ${target}. Use local, staging, or production.`);
} else {
  add("PASS", `Deploy target recognized: ${target}.`);
}

if (existsSync(envLocalPath)) {
  add("PASS", ".env.local exists for local readiness.");
} else {
  add(productionLike ? "PASS" : "WARN", ".env.local is missing; local route smoke tests may need local env values.");
}

if (gitCheckIgnored(".env.local") && !gitTracks(".env.local")) {
  add("PASS", ".env.local is ignored by git and not tracked.");
} else {
  add("FAIL", ".env.local must be ignored by git and must not be tracked.");
}

const envExample = existsSync(envExamplePath) ? readFileSync(envExamplePath, "utf8") : "";
const manifest = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : "";
for (const name of requiredDocumentationEnv) {
  add(envExample.includes(`${name}=`) ? "PASS" : "FAIL", `${name} is ${envExample.includes(`${name}=`) ? "" : "not "}documented in .env.example.`);
  add(manifest.includes(`\`${name}\``) ? "PASS" : "FAIL", `${name} is ${manifest.includes(`\`${name}\``) ? "" : "not "}documented in Vercel env manifest.`);
}

for (const name of stagingRequiredEnv) {
  const set = hasEnv(name);
  add(set ? "PASS" : productionLike ? "FAIL" : "WARN", `${name}: ${safeValueSummary(name)}`);
}

addSupabasePoolingChecks();

if (productionLike) {
  if (process.env.FLOWVIA_PILOT_OPERATIONS_ENABLED !== "true") {
    add("FAIL", "FLOWVIA_PILOT_OPERATIONS_ENABLED must be true for staging cloud dashboard validation.");
  }
  if (process.env.FLOWVIA_ADMIN_MESSAGES_ENABLED !== "true") {
    add("FAIL", "FLOWVIA_ADMIN_MESSAGES_ENABLED must be true for staging Message Ledger validation.");
  }
}

if (process.env.TELNYX_MESSAGING_PROFILE_ID && process.env.TELNYX_MESSAGING_PROFILE_ID !== "40019f0a-4f48-4749-9d5a-7bb4f0716cbe") {
  add("FAIL", "TELNYX_MESSAGING_PROFILE_ID must match Flowvia_Messaging profile 40019f0a-4f48-4749-9d5a-7bb4f0716cbe.");
}

if (process.env.TELNYX_FLOWVIA_FROM_NUMBER && process.env.TELNYX_FLOWVIA_FROM_NUMBER !== "+14692933948") {
  add("FAIL", "TELNYX_FLOWVIA_FROM_NUMBER must remain +14692933948 for this pilot.");
}

if (process.env.FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST === "true") {
  add(productionLike ? "FAIL" : "WARN", "FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST=true; this is local smoke-test only.");
} else {
  add("PASS", "Unsigned Telnyx webhook bypass is off.");
}

if (process.env.FLOWVIA_SMS_STORE_MODE === "test" || process.env.FLOWVIA_SMS_STORE_MODE === "json") {
  add(productionLike ? "FAIL" : "WARN", `FLOWVIA_SMS_STORE_MODE=${process.env.FLOWVIA_SMS_STORE_MODE}; use only for local/dev smoke testing.`);
} else {
  add("PASS", "SMS store mode is not forcing local/test JSON storage.");
}

if (process.env.FLOWVIA_ALLOW_REAL_SMS_TEST === "true") {
  add("WARN", "FLOWVIA_ALLOW_REAL_SMS_TEST=true; use personal phone numbers only and turn off immediately after controlled testing.");
} else {
  add("PASS", "Real SMS test gate is off.");
}

if (!hasEnv("FLOWVIA_DATA_MODE")) {
  add(productionLike ? "FAIL" : "WARN", "FLOWVIA_DATA_MODE is missing; safe code default blocks PHI, but staging should set personal_test or phi_blocked explicitly.");
}

const dataMode = getFlowviaDataModeStatus();
if (dataMode.blockers.length > 0) {
  for (const blocker of dataMode.blockers) add("FAIL", blocker);
} else {
  add("PASS", `Data mode is ${dataMode.safeLabel}; PHI remains blocked.`);
}

const aiEnabledMissing = !hasEnv("FLOWVIA_AI_ENABLED");
const aiProviderMissing = !hasEnv("FLOWVIA_AI_PROVIDER");
const aiNoPhiMissing = !hasEnv("FLOWVIA_AI_NO_PHI_MODE");
const aiAuditOnlyMissing = !hasEnv("FLOWVIA_AI_AUDIT_ONLY");
if (aiEnabledMissing) add("WARN", "FLOWVIA_AI_ENABLED is missing; safe default is false.");
if (aiProviderMissing) add("WARN", "FLOWVIA_AI_PROVIDER is missing; safe default is mock.");
if (aiNoPhiMissing) add("WARN", "FLOWVIA_AI_NO_PHI_MODE is missing; safe default is true.");
if (aiAuditOnlyMissing) add("WARN", "FLOWVIA_AI_AUDIT_ONLY is missing; safe default is true.");

const aiEnabled = booleanEnv("FLOWVIA_AI_ENABLED", false);
const aiProvider = (process.env.FLOWVIA_AI_PROVIDER || "mock").trim().toLowerCase();
const aiNoPhi = booleanEnv("FLOWVIA_AI_NO_PHI_MODE", true);
const aiAuditOnly = booleanEnv("FLOWVIA_AI_AUDIT_ONLY", true);
const explicitRealAiAllowance = process.env.FLOWVIA_AI_ALLOW_REAL_PROVIDER_NO_PHI === "true";
if (aiEnabled && aiProvider !== "mock" && aiProvider !== "none" && !(aiNoPhi && aiAuditOnly && explicitRealAiAllowance)) {
  add("FAIL", "AI is enabled with a non-mock provider without no-PHI mode, audit-only mode, and explicit real-provider allowance.");
} else {
  add("PASS", `AI gate safe: enabled=${aiEnabled ? "true" : "false"}, provider=${aiProvider}, noPhi=${aiNoPhi ? "true" : "false"}, auditOnly=${aiAuditOnly ? "true" : "false"}.`);
}

const adminTempPassword = checkKnownTemporaryPassword("FLOWVIA_ADMIN_PASSWORD_HASH", "FlowviaTest123!");
const therapistTempPassword = checkKnownTemporaryPassword("FLOWVIA_THERAPIST_PASSWORD_HASH", "FlowviaTherapist123!");
add(adminTempPassword ? "WARN" : "PASS", `Known temporary admin test password appears configured: ${adminTempPassword ? "YES" : "NO"}`);
add(therapistTempPassword ? "WARN" : "PASS", `Known temporary therapist test password appears configured: ${therapistTempPassword ? "YES" : "NO"}`);

const counts = results.reduce<Record<CheckLevel, number>>((acc, result) => {
  acc[result.level] += 1;
  return acc;
}, { PASS: 0, WARN: 0, FAIL: 0 });

for (const result of results) {
  console.log(`${result.level}: ${result.message}`);
}

console.log(`Summary: ${counts.PASS} PASS, ${counts.WARN} WARN, ${counts.FAIL} FAIL`);
console.log("Next actions: keep PHI blocked, configure Vercel env vars, enforce Telnyx signing, run smoke tests sequentially, then turn real SMS testing off.");

if (counts.FAIL > 0) {
  process.exitCode = 1;
}
