import { loadLocalEnv } from "./load-local-env.mts";
import {
  EXPECTED_TELNYX_FROM_NUMBER,
  EXPECTED_TELNYX_MESSAGING_PROFILE_ID,
  getCloudDeployTarget,
  isProductionLikeTarget,
} from "../lib/pilot/cloud-health.ts";

type CheckLevel = "PASS" | "WARN" | "FAIL";

const results: Array<{ level: CheckLevel; message: string }> = [];

function add(level: CheckLevel, message: string) {
  results.push({ level, message });
}

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

loadLocalEnv();

const target = getCloudDeployTarget();
const productionLike = isProductionLikeTarget(target);
const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID?.trim();
const fromNumber = process.env.TELNYX_FLOWVIA_FROM_NUMBER?.trim();
const realSmsEnabled = process.env.FLOWVIA_ALLOW_REAL_SMS_TEST === "true";
const unsignedBypassEnabled = process.env.FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST === "true";

console.log(`Flowvia Telnyx cloud readiness (${target})`);
console.log("Secret values are redacted; this script reports set/missing and approved public identifiers only. It does not send SMS.");

add(hasEnv("TELNYX_API_KEY") ? "PASS" : productionLike ? "FAIL" : "WARN", `TELNYX_API_KEY: ${hasEnv("TELNYX_API_KEY") ? "SET" : "MISSING"}`);

if (!messagingProfileId) {
  add(productionLike ? "FAIL" : "WARN", "TELNYX_MESSAGING_PROFILE_ID: MISSING");
} else if (messagingProfileId === EXPECTED_TELNYX_MESSAGING_PROFILE_ID) {
  add("PASS", `TELNYX_MESSAGING_PROFILE_ID matches approved Flowvia profile ${EXPECTED_TELNYX_MESSAGING_PROFILE_ID}.`);
} else {
  add("FAIL", "TELNYX_MESSAGING_PROFILE_ID does not match the approved Flowvia messaging profile.");
}

if (!fromNumber) {
  add(productionLike ? "FAIL" : "WARN", "TELNYX_FLOWVIA_FROM_NUMBER: MISSING");
} else if (fromNumber === EXPECTED_TELNYX_FROM_NUMBER) {
  add("PASS", `TELNYX_FLOWVIA_FROM_NUMBER matches approved sender ${EXPECTED_TELNYX_FROM_NUMBER}.`);
} else {
  add("FAIL", "TELNYX_FLOWVIA_FROM_NUMBER does not match the approved Flowvia sender number.");
}

add(
  hasEnv("TELNYX_WEBHOOK_SIGNING_SECRET") ? "PASS" : productionLike ? "FAIL" : "WARN",
  `TELNYX_WEBHOOK_SIGNING_SECRET: ${hasEnv("TELNYX_WEBHOOK_SIGNING_SECRET") ? "SET" : "MISSING"}`,
);

add(
  realSmsEnabled ? "WARN" : "PASS",
  `FLOWVIA_ALLOW_REAL_SMS_TEST=${realSmsEnabled ? "true" : "false or unset"}. Real SMS must stay off except a controlled personal-phone test window.`,
);

add(
  unsignedBypassEnabled ? productionLike ? "FAIL" : "WARN" : "PASS",
  `FLOWVIA_ALLOW_UNSIGNED_TELNYX_WEBHOOK_TEST=${unsignedBypassEnabled ? "true" : "false or unset"}.`,
);

const counts = results.reduce<Record<CheckLevel, number>>((acc, result) => {
  acc[result.level] += 1;
  return acc;
}, { PASS: 0, WARN: 0, FAIL: 0 });

for (const result of results) {
  console.log(`${result.level}: ${result.message}`);
}

console.log(`Summary: ${counts.PASS} PASS, ${counts.WARN} WARN, ${counts.FAIL} FAIL`);

if (counts.FAIL > 0) {
  process.exitCode = 1;
}
