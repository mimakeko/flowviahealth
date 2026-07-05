import { existsSync, readFileSync } from "node:fs";
import { config } from "dotenv";
import { getFlowviaDataModeStatus } from "../lib/compliance/data-mode.ts";
import { classifyOperationalNote } from "../lib/compliance/note-classification.ts";
import { secureClinicalNoteAcknowledgementEnabled } from "../lib/compliance/note-acknowledgement.ts";
import { verifyScryptPasswordHash } from "../lib/pilot/session.ts";
import { assertSmsTemplatesAreSafe } from "../lib/sms/templates.ts";

type CheckLevel = "PASS" | "WARN" | "FAIL";

config({ path: ".env", quiet: true });
config({ path: ".env.local", quiet: true });

const results: Array<{ level: CheckLevel; message: string }> = [];

function add(level: CheckLevel, message: string) {
  results.push({ level, message });
}

function fileIncludes(file: string, patterns: string[]) {
  if (!existsSync(file)) return { exists: false, missing: patterns };
  const text = readFileSync(file, "utf8").toLowerCase();
  return {
    exists: true,
    missing: patterns.filter((pattern) => !text.includes(pattern.toLowerCase())),
  };
}

function checkDoc(file: string, label: string, patterns: string[]) {
  const result = fileIncludes(file, patterns);
  if (!result.exists) {
    add("FAIL", `${label} is missing at ${file}.`);
    return;
  }
  if (result.missing.length > 0) {
    add("FAIL", `${label} is missing required topics: ${result.missing.join(", ")}.`);
    return;
  }
  add("PASS", `${label} exists and includes required topics.`);
}

function booleanEnv(name: string, defaultValue: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return defaultValue;
  return value === "true";
}

function checkKnownTemporaryPassword(hashName: "FLOWVIA_ADMIN_PASSWORD_HASH" | "FLOWVIA_THERAPIST_PASSWORD_HASH", knownPassword: string) {
  const hash = process.env[hashName]?.trim().replaceAll("\\$", "$");
  return hash ? verifyScryptPasswordHash(knownPassword, hash) : false;
}

const target = (
  process.env.FLOWVIA_DEPLOY_TARGET ||
  process.env.FLOWVIA_READINESS_TARGET ||
  process.env.VERCEL_ENV ||
  (process.env.NODE_ENV === "production" ? "production" : "local")
).trim().toLowerCase();
const productionLike = ["staging", "production", "preview", "prod"].includes(target);

console.log("Flowvia HIPAA readiness guardrail check");
console.log("This is a readiness/control check, not a legal certification.");

checkDoc("docs/HIPAA_SECURITY_CONTROLS_V1.md", "HIPAA security controls", [
  "administrative safeguards",
  "technical safeguards",
  "physical safeguards",
  "risk analysis",
  "rbac",
  "audit controls",
  "not a legal certification",
]);

checkDoc("docs/HIPAA_RISK_REGISTER_V1.md", "HIPAA risk register", [
  "temporary pilot auth",
  "temporary generic passwords",
  "ngrok",
  "unsigned webhook bypass",
  "accidental PHI in SMS",
  "vendor BAA",
  "backup/restore",
  "retention/deletion",
  "incident response",
  "audit review",
  "AI",
]);

checkDoc("docs/PRODUCTION_READINESS_BLOCKERS_V1.md", "Production blockers", [
  "No real patients/PHI yet",
  "Temporary pilot passwords",
  "MFA",
  "webhook signing secret",
  "Vendor BAA",
  "Backup/restore",
  "Retention/deletion",
  "Incident response",
  "PHI in SMS forbidden",
  "Operational notes",
  "AI",
]);

checkDoc("docs/VENDOR_BAA_CHECKLIST_V1.md", "Vendor BAA checklist", [
  "Supabase",
  "Vercel",
  "Telnyx",
  "Resend",
  "OpenAI",
  "PHI",
  "BAA",
]);

checkDoc("docs/CLOUD_STAGING_DEPLOYMENT_V1.md", "Cloud staging deployment plan", [
  "Vercel env vars",
  "https://flowviahealth.com/api/telnyx/webhook",
  "personal-phone-only",
  "FLOWVIA_ALLOW_REAL_SMS_TEST=false",
  "Message Ledger",
]);

checkDoc("docs/VERCEL_ENV_MANIFEST_V1.md", "Vercel env manifest", [
  "DATABASE_URL",
  "TELNYX_WEBHOOK_SIGNING_SECRET",
  "FLOWVIA_AI_ENABLED",
  "FLOWVIA_DATA_MODE",
  "Forbidden In Vercel",
]);

const dataMode = getFlowviaDataModeStatus();
if (dataMode.blockers.length > 0) {
  for (const blocker of dataMode.blockers) add("FAIL", blocker);
} else {
  add("PASS", `Data mode is ${dataMode.safeLabel}; PHI remains blocked.`);
}

if (process.env.FLOWVIA_DATA_MODE === "phi_allowed") {
  add("FAIL", "PHI mode is requested; secure note/PHI mode is not enabled for this pilot.");
}

if (secureClinicalNoteAcknowledgementEnabled()) {
  add("FAIL", "Secure clinical note acknowledgement/override is enabled unexpectedly.");
} else {
  add("PASS", "Secure clinical notes are disabled in this pilot.");
}

const blockedNote = classifyOperationalNote("Patient has diabetes", { fieldLabel: "HIPAA readiness note" });
if (blockedNote.severity === "block" && blockedNote.classification === "phi_like_or_clinical") {
  add("PASS", "Note classification exists and blocks PHI-like/clinical notes.");
} else {
  add("FAIL", "Note classification did not block a clinical/PHI-like note.");
}

try {
  assertSmsTemplatesAreSafe();
  add("PASS", "SMS template registry exists and contains no forbidden clinical placeholders.");
} catch (error) {
  add("FAIL", error instanceof Error ? error.message : "SMS template registry validation failed.");
}

if (productionLike && !process.env.TELNYX_WEBHOOK_SIGNING_SECRET?.trim()) {
  add("FAIL", "Webhook signing secret is required for cloud/prod targets.");
} else if (!process.env.TELNYX_WEBHOOK_SIGNING_SECRET?.trim()) {
  add("WARN", "Webhook signing secret is missing locally; staging must configure it.");
} else {
  add("PASS", "Webhook signing secret is configured without printing its value.");
}

if (process.env.FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST === "true") {
  add(productionLike ? "FAIL" : "WARN", "Unsigned webhook bypass is enabled; local smoke only and forbidden in cloud.");
} else {
  add("PASS", "Unsigned webhook bypass is not enabled.");
}

if (process.env.FLOWVIA_ALLOW_REAL_SMS_TEST === "true") {
  add("WARN", "Real SMS testing is enabled; personal phone numbers and fake data only, turn off immediately after testing.");
} else {
  add("PASS", "Real SMS testing is disabled by default/current env.");
}

const aiEnabled = booleanEnv("FLOWVIA_AI_ENABLED", false);
const aiProvider = (process.env.FLOWVIA_AI_PROVIDER || "mock").trim().toLowerCase();
const aiNoPhi = booleanEnv("FLOWVIA_AI_NO_PHI_MODE", true);
const aiAuditOnly = booleanEnv("FLOWVIA_AI_AUDIT_ONLY", true);
if (aiEnabled && aiProvider !== "mock" && aiProvider !== "none") {
  add("FAIL", "AI is enabled with a real provider; PHI/no-PHI/vendor controls are not approved.");
} else if (aiEnabled) {
  add("WARN", "AI is enabled; keep mock/no-PHI/audit-only behavior and do not send PHI.");
} else {
  add("PASS", "AI is disabled by default/current env.");
}
add(aiNoPhi ? "PASS" : "FAIL", `AI no-PHI mode is ${aiNoPhi ? "on" : "off"}.`);
add(aiAuditOnly ? "PASS" : "WARN", `AI audit-only mode is ${aiAuditOnly ? "on" : "off"}.`);

const adminTempPassword = checkKnownTemporaryPassword("FLOWVIA_ADMIN_PASSWORD_HASH", "FlowviaTest123!");
const therapistTempPassword = checkKnownTemporaryPassword("FLOWVIA_THERAPIST_PASSWORD_HASH", "FlowviaTherapist123!");
add(adminTempPassword ? "WARN" : "PASS", `Known temporary admin test password remains blocker: ${adminTempPassword ? "YES" : "NO"}`);
add(therapistTempPassword ? "WARN" : "PASS", `Known temporary therapist test password remains blocker: ${therapistTempPassword ? "YES" : "NO"}`);

const counts = results.reduce<Record<CheckLevel, number>>((acc, result) => {
  acc[result.level] += 1;
  return acc;
}, { PASS: 0, WARN: 0, FAIL: 0 });

for (const result of results) {
  console.log(`${result.level}: ${result.message}`);
}

console.log(`Summary: ${counts.PASS} PASS, ${counts.WARN} WARN, ${counts.FAIL} FAIL`);
console.log("Next actions: finish BAAs, auth/MFA, backup/restore, retention/deletion, incident response, audit review, and password rotation before PHI.");

if (counts.FAIL > 0) {
  process.exitCode = 1;
}
