import { spawnSync } from "node:child_process";
import { loadLocalEnv } from "./load-local-env.mts";

loadLocalEnv();

const skipMessage = "SKIP_BROWSER_AUTH_SMOKE: missing local browser smoke credentials";
const baseUrl = process.env.FLOWVIA_BROWSER_SMOKE_BASE_URL || "http://localhost:3000";
const mutationChecks = process.env.FLOWVIA_BROWSER_SMOKE_RUN_MUTATION_CHECKS || "false";

function isLocalBaseUrl(value: string) {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

if (mutationChecks !== "false") {
  console.error("FAIL_BROWSER_AUTH_SMOKE: FLOWVIA_BROWSER_SMOKE_RUN_MUTATION_CHECKS must remain false for this read-only smoke.");
  process.exit(1);
}

if (!isLocalBaseUrl(baseUrl)) {
  console.error("FAIL_BROWSER_AUTH_SMOKE: authenticated browser smoke only supports local base URLs.");
  process.exit(1);
}

if (!process.env.FLOWVIA_BROWSER_SMOKE_ADMIN_EMAIL || !process.env.FLOWVIA_BROWSER_SMOKE_ADMIN_PASSWORD) {
  console.log(skipMessage);
  console.log(`Browser auth smoke summary: SKIP baseUrl=${baseUrl} adminLoginChecked=no therapistLoginChecked=skipped routesChecked=0 screenshotsPath=artifacts/browser-smoke`);
  process.exit(0);
}

const result = spawnSync(
  "pnpm",
  ["exec", "playwright", "test", "tests/e2e/authenticated-browser-smoke.spec.ts", "--config=playwright.config.ts"],
  {
    env: {
      ...process.env,
      FLOWVIA_BROWSER_SMOKE_BASE_URL: baseUrl,
      FLOWVIA_BROWSER_SMOKE_RUN_MUTATION_CHECKS: "false",
    },
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(`FAIL_BROWSER_AUTH_SMOKE: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
