import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Response } from "@playwright/test";
import { loadLocalEnv } from "./load-local-env.mts";

loadLocalEnv();

const skipToken = "SKIP_CLOUD_THERAPIST_WORKSPACE_SMOKE";
const artifactsDir = path.join(process.cwd(), "artifacts", "cloud-smoke");
const baseUrl = normalizeBaseUrl(process.env.FLOWVIA_CLOUD_SMOKE_BASE_URL || "https://flowviahealth.com");
const adminEmail = process.env.FLOWVIA_BROWSER_SMOKE_ADMIN_EMAIL;
const adminPassword = process.env.FLOWVIA_BROWSER_SMOKE_ADMIN_PASSWORD;

type PatternCheck = {
  label: string;
  regex: RegExp;
};

const therapistHierarchy = [
  /Today['’]s field focus/i,
  /Next field action/i,
  /New referral opportunities/i,
  /\bToday\b/i,
  /\bUpcoming\b/i,
  /Needs attention/i,
  /Assigned work/i,
];

const forbiddenAgencySpeedLanguage: PatternCheck[] = [
  { label: "agency speed dashboard language", regex: /Referral speed/i },
  { label: "acceptance funnel language", regex: /Acceptance funnel/i },
  { label: "therapist response patterns language", regex: /Therapist response patterns/i },
  { label: "acceptance visibility language", regex: /Acceptance visibility/i },
  { label: "staffing handoff friction language", regex: /Staffing handoff friction/i },
];

const rawHtmlLeakPatterns: PatternCheck[] = [
  { label: "Next.js redirect leak", regex: /NEXT_REDIRECT/i },
  { label: "Prisma known request error", regex: /PrismaClientKnownRequestError/i },
  { label: "Prisma initialization error", regex: /PrismaClientInitializationError/i },
  { label: "stack trace leak", regex: /\bstack trace\b/i },
  { label: "DATABASE_URL value leak", regex: /\bDATABASE_URL\s*(?:=|:)\s*["']?(?:postgres(?:ql)?:\/\/|[^"'\s]*supabase\.co\b)/i },
  { label: "DIRECT_URL value leak", regex: /\bDIRECT_URL\s*(?:=|:)\s*["']?(?:postgres(?:ql)?:\/\/|[^"'\s]*supabase\.co\b)/i },
  { label: "database credential URL leak", regex: /\bpostgres(?:ql)?:\/\/[^:\s/@]+:[^@\s/]+@[^"'<>\s]+/i },
  { label: "Supabase credential URL leak", regex: /\bpostgres(?:ql)?:\/\/[^:\s/@]+:[^@\s/]+@[^"'<>\s]*supabase\.(?:co|com)[^"'<>\s]*/i },
  { label: "Telnyx API key leak", regex: /TELNYX_API_KEY/i },
  { label: "Telnyx webhook secret leak", regex: /TELNYX_WEBHOOK_SIGNING_SECRET/i },
  { label: "private key leak", regex: /BEGIN [A-Z ]*PRIVATE KEY/i },
  { label: "raw webhook payload leak", regex: /raw webhook payload/i },
  { label: "provider payload leak", regex: /provider payload/i },
];

const visibleTextLeakPatterns: PatternCheck[] = [
  { label: "raw SMS body leak", regex: /raw SMS body/i },
  { label: "raw webhook payload leak", regex: /raw webhook payload/i },
  { label: "provider payload leak", regex: /provider payload/i },
  { label: "full E.164 phone number", regex: /\+1\d{10}\b/ },
  { label: "full formatted phone number", regex: /\(\d{3}\)\s?\d{3}-\d{4}\b/ },
  { label: "full dashed or dotted phone number", regex: /\b\d{3}[-.]\d{3}[-.]\d{4}\b/ },
];

const fullStreetAddressPatterns: PatternCheck[] = [
  {
    label: "full street address",
    regex: /(?<![\w-])\d{1,6}\s+(?:[A-Za-z0-9.'#-]+\s+){0,6}(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Boulevard|Blvd\.?|Court|Ct\.?|Circle|Cir\.?|Trail|Trl\.?|Parkway|Pkwy\.?|Place|Pl\.?|Way|Expressway|Expy\.?)(?=$|[\s,.;)])(?:[\s,]+(?:Apt|Apartment|Suite|Ste\.?|Unit)\s*[A-Z0-9-]+)?/i,
  },
];

assertNoPatterns("mt-3 list-disc space-y-1 pl-5", fullStreetAddressPatterns, "Tailwind class regression");

const optionalAdminRoutes = [
  "/dashboard",
  "/admin/referrals",
  "/admin/scheduling",
  "/admin/health",
  "/admin/audit",
];

const visitedRoutes = new Set<string>();
const runtimeErrors: string[] = [];

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`FAIL_CLOUD_THERAPIST_WORKSPACE_SMOKE: unsupported base URL protocol ${url.protocol}`);
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (localHosts.has(url.hostname)) {
    throw new Error("FAIL_CLOUD_THERAPIST_WORKSPACE_SMOKE: cloud smoke must not target localhost.");
  }

  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function routeUrl(route: string) {
  return new URL(route, `${baseUrl}/`).toString();
}

function recordRoute(page: Page) {
  visitedRoutes.add(new URL(page.url()).pathname);
}

async function pageText(page: Page) {
  return page.locator("body").innerText({ timeout: 15_000 });
}

async function pageHtml(page: Page) {
  return page.content();
}

function excerptAround(value: string, start: number, end: number) {
  const excerptStart = Math.max(0, start - 40);
  const excerptEnd = Math.min(value.length, end + 40);
  const prefix = excerptStart > 0 ? "..." : "";
  const suffix = excerptEnd < value.length ? "..." : "";
  return `${prefix}${value.slice(excerptStart, excerptEnd).replace(/\s+/g, " ")}${suffix}`;
}

function firstMatch(value: string, regex: RegExp) {
  const match = new RegExp(regex.source, regex.flags).exec(value);
  if (!match || match.index === undefined) return null;
  return {
    excerpt: excerptAround(value, match.index, match.index + match[0].length),
    matched: match[0],
    start: match.index,
  };
}

function assertNoPatterns(value: string, patterns: readonly PatternCheck[], scopeLabel: string) {
  for (const pattern of patterns) {
    const match = firstMatch(value, pattern.regex);
    if (!match) continue;
    assert.fail(
      [
        `${scopeLabel} should not expose forbidden content.`,
        `Pattern label: ${pattern.label}`,
        `Regex: ${pattern.regex}`,
        `Matched substring: ${JSON.stringify(match.matched)}`,
        `Excerpt: ${JSON.stringify(match.excerpt)}`,
      ].join(" "),
    );
  }
}

async function assertNoLeaks(page: Page, label: string) {
  const [text, html] = await Promise.all([pageText(page), pageHtml(page)]);
  assertNoPatterns(html, rawHtmlLeakPatterns, `${label} html`);
  assertNoPatterns(text, visibleTextLeakPatterns, `${label} visible text`);
  assertNoPatterns(text, fullStreetAddressPatterns, `${label} visible text`);
}

async function assertNoRuntimeErrors(label: string) {
  assert.equal(runtimeErrors.length, 0, `${label} should not emit browser runtime errors: ${runtimeErrors.join(" | ")}`);
}

function assertOkResponse(response: Response | null, label: string) {
  assert.ok(response, `${label} should produce a navigation response.`);
  assert.ok(response.status() < 400, `${label} expected HTTP < 400 but got ${response.status()}.`);
}

async function gotoReadOnly(page: Page, route: string) {
  const response = await page.goto(routeUrl(route), { waitUntil: "domcontentloaded" });
  assertOkResponse(response, route);
  await page.locator("body").waitFor({ state: "visible", timeout: 15_000 });
  recordRoute(page);
  await assertNoLeaks(page, route);
  await assertNoRuntimeErrors(route);
}

async function login(page: Page) {
  const loginUrl = routeUrl("/login?next=%2Fmy-work");
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(adminEmail!);
  await page.getByLabel("Password").fill(adminPassword!);
  await Promise.all([
    page.waitForURL(/\/my-work(?:[?#].*)?$/, { timeout: 30_000 }),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);
  await page.waitForLoadState("domcontentloaded");
  recordRoute(page);
}

async function assertTherapistWorkspace(page: Page, label: string) {
  const text = await pageText(page);
  for (const pattern of therapistHierarchy) {
    assert.match(text, pattern, `${label} should show therapist-first hierarchy item ${pattern}`);
  }
  assertNoPatterns(text, forbiddenAgencySpeedLanguage, `${label} visible text`);
  await assertNoLeaks(page, label);
  await assertNoRuntimeErrors(label);
}

async function assertMobileNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(root.scrollWidth, body.scrollWidth);
    const clientWidth = root.clientWidth;
    return { clientWidth, scrollWidth };
  });
  assert.ok(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `/my-work mobile should not horizontally overflow. clientWidth=${overflow.clientWidth} scrollWidth=${overflow.scrollWidth}`,
  );
}

async function runCloudSmoke() {
  if (!adminEmail || !adminPassword) {
    console.log(skipToken);
    console.log(`Cloud therapist workspace smoke summary: SKIP baseUrl=${baseUrl} adminLoginChecked=no routesChecked=0 screenshotsPath=artifacts/cloud-smoke`);
    return;
  }

  await mkdir(artifactsDir, { recursive: true });

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;

  try {
    browser = await chromium.launch();
    context = await browser.newContext({ baseURL: baseUrl, viewport: { height: 900, width: 1440 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on("pageerror", (error) => runtimeErrors.push(error.message));

    await login(page);
    await assertTherapistWorkspace(page, "/my-work desktop");
    await page.screenshot({ fullPage: true, path: path.join(artifactsDir, "my-work-desktop.png") });

    for (const route of optionalAdminRoutes) {
      await gotoReadOnly(page, route);
    }

    await page.setViewportSize({ height: 852, width: 393 });
    await gotoReadOnly(page, "/my-work");
    await assertTherapistWorkspace(page, "/my-work mobile");
    await assertMobileNoHorizontalOverflow(page);
    await page.screenshot({ fullPage: true, path: path.join(artifactsDir, "my-work-mobile.png") });

    console.log([
      "Cloud therapist workspace smoke summary: PASS",
      `baseUrl=${baseUrl}`,
      "adminLoginChecked=yes",
      `routesChecked=${visitedRoutes.size}`,
      "screenshotsPath=artifacts/cloud-smoke",
      "desktopScreenshot=artifacts/cloud-smoke/my-work-desktop.png",
      "mobileScreenshot=artifacts/cloud-smoke/my-work-mobile.png",
    ].join(" "));
  } catch (error) {
    console.log([
      "Cloud therapist workspace smoke summary: FAIL",
      `baseUrl=${baseUrl}`,
      "adminLoginChecked=yes",
      `routesChecked=${visitedRoutes.size}`,
      "screenshotsPath=artifacts/cloud-smoke",
    ].join(" "));
    throw error;
  } finally {
    await context?.close();
    await browser?.close();
  }
}

await runCloudSmoke();
