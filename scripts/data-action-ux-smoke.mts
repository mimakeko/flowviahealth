import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const stewardship = await import("../lib/pilot/data-stewardship.ts");

const dataPageSource = await readFile("app/admin/data/page.tsx", "utf8");

assert.match(dataPageSource, /Confirmation text did not match RESET DEMO SCENARIOS\./);
assert.match(dataPageSource, /Confirmation text did not match ARCHIVE SMOKE TEST DATA\./);
assert.match(dataPageSource, /Confirmation text did not match REFRESH FAKE DATA\./);
assert.match(dataPageSource, /Confirmation text did not match ARCHIVE FAKE DATA\./);
assert.match(dataPageSource, /Confirmation text did not match MARK TEST PHONE OPTED OUT\./);

assert.match(dataPageSource, /Demo scenarios reset\. Protected history preserved\./);
assert.match(dataPageSource, /Smoke-test operational records archived\. Protected history preserved\./);
assert.match(dataPageSource, /Fake pilot data refreshed\. Protected history preserved\./);
assert.match(dataPageSource, /Completed\/canceled fake workflows archived\. Protected history preserved\./);
assert.match(dataPageSource, /Configured personal test phone marked opted out\. Protected history preserved\./);

assert.doesNotMatch(dataPageSource, /\{params\.error\}/, "Raw error query params must not render directly.");
assert.doesNotMatch(dataPageSource, /\{params\.result\}/, "Raw result query params must not render directly.");
assert.doesNotMatch(dataPageSource, /error instanceof Error \? error\.message/, "Raw server errors must not be redirected into UI.");
assert.doesNotMatch(dataPageSource, /NEXT_REDIRECT.*role="alert"|role="alert".*NEXT_REDIRECT/s, "NEXT_REDIRECT must not be a rendered error message.");
assert.match(dataPageSource, /safeResultMessage/);
assert.match(dataPageSource, /safeErrorMessage/);
assert.match(dataPageSource, /pattern=\{exactConfirmationPattern/);
assert.match(dataPageSource, /required/);

const resetActionBody = dataPageSource.match(/async function resetDemoScenariosAction[\s\S]*?async function markPersonalTestPhoneOptedOutAction/)?.[0] || "";
const resetTryBlock = resetActionBody.match(/try \{[\s\S]*?\} catch/)?.[0] || "";
assert.doesNotMatch(resetTryBlock, /redirectWithResult|redirectWithError/, "Reset action must not throw redirect from inside its try/catch block.");
assert.match(resetActionBody, /redirectWithResult\("reset_demo"\)/);

const smokeActionBody = dataPageSource.match(/async function clearSmokeDataAction[\s\S]*?async function resetDemoScenariosAction/)?.[0] || "";
const smokeTryBlock = smokeActionBody.match(/try \{[\s\S]*?\} catch/)?.[0] || "";
assert.doesNotMatch(smokeTryBlock, /redirectWithResult|redirectWithError/, "Smoke archive action must not throw redirect from inside its try/catch block.");
assert.match(smokeActionBody, /redirectWithResult\("archive_smoke"\)/);

await assert.rejects(
  () => stewardship.resetDemoScenarios({} as never, "data_action_ux_smoke", "RESET DEMO"),
  /Confirmation text did not match RESET DEMO SCENARIOS\./,
);
await assert.rejects(
  () => stewardship.archiveSmokeTestOperationalRecords({} as never, "data_action_ux_smoke", "ARCHIVE"),
  /Confirmation text did not match ARCHIVE SMOKE TEST DATA\./,
);
await assert.rejects(
  () => stewardship.markConfiguredPersonalTestPhoneOptedOut({} as never, "data_action_ux_smoke", "MARK OPTED OUT"),
  /Confirmation text did not match MARK TEST PHONE OPTED OUT\./,
);

for (const source of [dataPageSource]) {
  assert.doesNotMatch(source, /\b(sendSms|telnyx\.messages|fetch\s*\(|googlemaps|mapbox|geocodio|distanceMatrix|new PrismaClient)\b/i);
  assert.doesNotMatch(source, /\b(provider payload|raw SMS body|api key|secret value)\b/i);
}

console.log("Data action UX smoke passed: safe result/error messages, redirect placement, exact confirmation failures, no raw NEXT_REDIRECT display, and no SMS/external API surfaces verified.");
