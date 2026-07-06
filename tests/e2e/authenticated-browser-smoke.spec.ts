import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

const baseUrl = process.env.FLOWVIA_BROWSER_SMOKE_BASE_URL || "http://localhost:3000";
const artifactsDir = path.join(process.cwd(), "artifacts", "browser-smoke");
const adminEmail = process.env.FLOWVIA_BROWSER_SMOKE_ADMIN_EMAIL;
const adminPassword = process.env.FLOWVIA_BROWSER_SMOKE_ADMIN_PASSWORD;
const therapistEmail = process.env.FLOWVIA_BROWSER_SMOKE_THERAPIST_EMAIL;
const therapistPassword = process.env.FLOWVIA_BROWSER_SMOKE_THERAPIST_PASSWORD;

const visitedRoutes = new Set<string>();
let dangerousTextChecksPassed = false;
let rbacChecksPassed: "yes" | "skipped" = "skipped";

const forbiddenVisibleText = [
  /NEXT_REDIRECT/i,
  /PrismaClientKnownRequestError/i,
  /PrismaClientInitializationError/i,
  /\bstack trace\b/i,
  /TELNYX_API_KEY/i,
  /DATABASE_URL\s*=/i,
  /DIRECT_URL\s*=/i,
  /postgres(?:ql)?:\/\/[^ ]+/i,
  /BEGIN PRIVATE KEY/i,
  /\+1\d{10}\b/,
  /\(\d{3}\)\s?\d{3}-\d{4}\b/,
  /\b\d{3}-\d{3}-\d{4}\b/,
  /OASIS documentation workflow/i,
  /Claims workflow/i,
  /Billing workflow/i,
  /Medicare billing workflow/i,
];

const forbiddenControls = [
  /^Send SMS$/i,
  /^Bulk SMS$/i,
  /^Send message$/i,
];

function localPath(route: string) {
  return new URL(route, baseUrl).pathname;
}

async function visibleBodyText(page: Page) {
  return page.locator("body").innerText();
}

async function expectNoDangerousVisibleText(page: Page, route: string) {
  const text = await visibleBodyText(page);
  for (const pattern of forbiddenVisibleText) {
    expect(text, `${route} should not expose ${pattern}`).not.toMatch(pattern);
  }

  for (const pattern of forbiddenControls) {
    await expect(page.getByRole("button", { name: pattern }), `${route} should not expose outbound SMS controls`).toHaveCount(0);
    await expect(page.getByRole("link", { name: pattern }), `${route} should not expose outbound SMS links`).toHaveCount(0);
  }
}

async function expectRawPageIsClean(page: Page, route: string) {
  const html = await page.content();
  expect(html, `${route} should not expose raw framework redirect text`).not.toContain("NEXT_REDIRECT");
  expect(html, `${route} should not expose private keys`).not.toContain("BEGIN PRIVATE KEY");
}

async function gotoProtected(page: Page, route: string) {
  await page.goto(route);
  await expect(page.locator("body")).toBeVisible();
  visitedRoutes.add(localPath(route));
  await expectNoDangerousVisibleText(page, route);
  await expectRawPageIsClean(page, route);
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ fullPage: true, path: path.join(artifactsDir, name) });
}

async function login(page: Page, email: string, password: string, next = "/dashboard") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
}

async function logout(page: Page) {
  await page.getByRole("button", { name: /logout/i }).click();
  await page.waitForURL(/\/login\?logged_out=1|\/login/);
}

async function expectAnyText(page: Page, patterns: RegExp[], route: string) {
  const text = await visibleBodyText(page);
  const matched = patterns.some((pattern) => pattern.test(text));
  expect(matched, `${route} should include one of: ${patterns.map(String).join(", ")}`).toBe(true);
}

test("authenticated Flowvia dashboard smoke is read-only and local", async ({ page }) => {
  test.skip(!adminEmail || !adminPassword, "missing local browser smoke credentials");

  await mkdir(artifactsDir, { recursive: true });

  try {
    await login(page, adminEmail!, adminPassword!);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("navigation", { name: /internal workspace navigation/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Referral Operations/i })).toBeVisible();

    await gotoProtected(page, "/dashboard");
    await expectAnyText(page, [/Pilot operations overview/i, /Dashboard blocked by pilot gate/i], "/dashboard");
    await screenshot(page, "admin-dashboard.png");

    await gotoProtected(page, "/admin/referrals");
    await expect(page.getByRole("heading", { name: /Referral operations/i })).toBeVisible();
    await expectAnyText(page, [/Operations Assistant/i, /Scheduling Intelligence/i, /Ready for scheduling/i, /Needs intake review/i], "/admin/referrals");
    await screenshot(page, "admin-referrals.png");

    await gotoProtected(page, "/admin/referrals/new");
    await expectAnyText(page, [/no PHI/i, /manual referral/i, /patient/i], "/admin/referrals/new");

    await gotoProtected(page, "/admin/referrals");
    const referralDetailLink = page.locator('tbody a[href^="/admin/referrals/"]').first();
    if (await referralDetailLink.count()) {
      await referralDetailLink.click();
      await page.waitForLoadState("networkidle");
      visitedRoutes.add(new URL(page.url()).pathname);
      await expectNoDangerousVisibleText(page, "referral detail");
      await expectRawPageIsClean(page, "referral detail");
      await expectAnyText(page, [/Referral decision/i, /Scheduling readiness/i, /Safety guarantees/i], "referral detail");
      const createVisitLinks = page.getByRole("link", { name: /Create visit/i });
      if (await createVisitLinks.count()) {
        const href = await createVisitLinks.first().getAttribute("href");
        expect(href || "", "Create visit CTA should only point to the manual visit form").toMatch(/^\/admin\/visits\/new\?/);
      }
      await screenshot(page, "referral-detail.png");
    } else {
      console.log("Browser auth smoke note: no referral detail link found; detail screenshot skipped.");
    }

    await gotoProtected(page, "/admin/visits");
    await expect(page.getByRole("heading", { name: /Visit operations/i })).toBeVisible();

    await gotoProtected(page, "/admin/visits/new");
    await expectAnyText(page, [/New visit/i, /Referral/i, /Scheduling/i], "/admin/visits/new");

    await gotoProtected(page, "/admin/scheduling");
    await expect(page.getByRole("heading", { name: /Scheduling Intelligence/i })).toBeVisible();
    await expectAnyText(page, [/ready-to-schedule/i, /ready gate/i, /No maps/i, /No create-ready referrals/i], "/admin/scheduling");
    const reviewRows = page.locator("text=Review only").first();
    if (await reviewRows.count()) {
      const reviewSection = page.locator("section").filter({ hasText: /Needs review before scheduling/i });
      await expect(reviewSection.getByRole("link", { name: /Create visit/i })).toHaveCount(0);
    }
    await screenshot(page, "admin-scheduling.png");

    await gotoProtected(page, "/admin/data");
    await expect(page.getByRole("heading", { name: /Data Stewardship/i })).toBeVisible();
    await expectAnyText(page, [/Type exactly: REFRESH FAKE DATA/i, /Type exactly: ARCHIVE FAKE DATA/i, /Type exactly: ARCHIVE SMOKE TEST DATA/i, /Type exactly: RESET DEMO SCENARIOS/i], "/admin/data");
    await screenshot(page, "admin-data.png");

    await gotoProtected(page, "/admin/health");
    await expect(page.getByRole("heading", { name: /Health Center/i })).toBeVisible();
    await expectAnyText(page, [/Real SMS gate/i, /External API calls/i, /Autonomous/i, /Maps\/geocoding APIs/i], "/admin/health");
    await screenshot(page, "admin-health.png");

    await gotoProtected(page, "/admin/audit");
    await expect(page.getByRole("heading", { name: /Audit trail/i })).toBeVisible();
    await expectAnyText(page, [/safe metadata/i, /Audit Trail/i, /No safe metadata/i], "/admin/audit");
    await screenshot(page, "admin-audit.png");

    await gotoProtected(page, "/my-work");
    await expectAnyText(page, [/My Work/i, /Field workspace/i, /No PHI/i, /masked/i], "/my-work");
    await screenshot(page, "my-work.png");

    if (therapistEmail && therapistPassword) {
      await logout(page);
      await login(page, therapistEmail, therapistPassword, "/my-work");
      await expect(page).toHaveURL(/\/my-work|\/dashboard/);
      await gotoProtected(page, "/my-work");
      await expectAnyText(page, [/My Work/i, /Field workspace/i, /No PHI/i, /masked/i], "therapist /my-work");
      await screenshot(page, "therapist-my-work.png");

      for (const route of ["/admin/data", "/admin/audit", "/admin/health"]) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        const currentPath = new URL(page.url()).pathname;
        expect(["/unauthorized", "/login"].includes(currentPath), `${route} should block therapist access`).toBe(true);
        await expectNoDangerousVisibleText(page, route);
      }
      rbacChecksPassed = "yes";
    }

    dangerousTextChecksPassed = true;
    console.log([
      "Browser auth smoke summary: PASS",
      `baseUrl=${baseUrl}`,
      "adminLoginChecked=yes",
      `therapistLoginChecked=${therapistEmail && therapistPassword ? "yes" : "skipped"}`,
      `routesChecked=${visitedRoutes.size}`,
      "screenshotsPath=artifacts/browser-smoke",
      `dangerousTextChecksPassed=${dangerousTextChecksPassed ? "yes" : "no"}`,
      `rbacChecksPassed=${rbacChecksPassed}`,
    ].join(" "));
  } catch (error) {
    console.log([
      "Browser auth smoke summary: FAIL",
      `baseUrl=${baseUrl}`,
      "adminLoginChecked=yes",
      `therapistLoginChecked=${therapistEmail && therapistPassword ? "attempted" : "skipped"}`,
      `routesChecked=${visitedRoutes.size}`,
      "screenshotsPath=artifacts/browser-smoke",
      `dangerousTextChecksPassed=${dangerousTextChecksPassed ? "yes" : "no"}`,
      `rbacChecksPassed=${rbacChecksPassed}`,
    ].join(" "));
    throw error;
  }
});
