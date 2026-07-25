import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.FLOWVIA_BROWSER_SMOKE_ADMIN_EMAIL;
const adminPassword = process.env.FLOWVIA_BROWSER_SMOKE_ADMIN_PASSWORD;

const longRecommendationFixtures = [
  {
    fit: "Best Fit",
    name: "Alexandra Montgomery-Rivera, Doctor of Physical Therapy",
    reason: "Service area includes North Dallas, Lake Highlands, and the surrounding weekday coverage zone.",
  },
  {
    fit: "Best Fit",
    name: "Christopher J. Van der Merwe-Santiago, PT",
    reason: "The requested service area and therapy discipline are both recorded in the active coverage notes.",
  },
  {
    fit: "Insufficient information",
    name: "María Fernanda de la Cruz-Washington, Physical Therapist",
    reason: "No direct city or ZIP evidence appears in the recorded service area, so staffing review is needed.",
  },
] as const;

async function login(page: Page) {
  await page.goto("/login?next=%2Fadmin%2Freferrals");
  await page.getByLabel("Email").fill(adminEmail!);
  await page.getByLabel("Password").fill(adminPassword!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
}

test("recommendation rows keep long names and reasons readable in the authenticated shell", async ({ page }) => {
  test.skip(!adminEmail || !adminPassword, "missing local browser smoke credentials");

  await login(page);
  await page.goto("/admin/referrals");
  const detailLinks = page.locator('a[href^="/admin/referrals/"]:not([href="/admin/referrals/new"])');
  expect(await detailLinks.count(), "the local seed must include a referral detail to exercise the recommendation layout").toBeGreaterThan(0);
  await detailLinks.first().click();
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("therapist-recommendation-list")).toBeVisible();
  await expect(page.getByTestId("therapist-recommendation-card").first()).toBeVisible();

  // Clone the rendered recommendation row in-place. This preserves the real authenticated shell,
  // production Tailwind output, and component structure without writing fixture data to the server.
  await page.evaluate((fixtures) => {
    const list = document.querySelector<HTMLElement>('[data-testid="therapist-recommendation-list"]');
    const template = list?.querySelector<HTMLElement>('[data-testid="therapist-recommendation-card"]');
    if (!list || !template) throw new Error("Recommendation layout fixture could not mount.");

    list.replaceChildren(...fixtures.map((fixture) => {
      const card = template.cloneNode(true) as HTMLElement;
      const name = card.querySelector<HTMLElement>('[data-testid="therapist-recommendation-name"]');
      const reason = card.querySelector<HTMLElement>('[data-testid="therapist-recommendation-reason"]');
      const fit = card.querySelector<HTMLElement>('[data-testid="therapist-recommendation-fit"]');
      if (!name || !reason || !fit) throw new Error("Recommendation row is missing its readable content contract.");
      name.textContent = fixture.name;
      reason.textContent = fixture.reason;
      fit.textContent = fixture.fit;
      return card;
    }));
  }, longRecommendationFixtures);

  for (const width of [390, 768, 1024, 1280, 1600]) {
    await page.setViewportSize({ height: 900, width });
    const report = await page.evaluate(() => {
      const lineMetrics = (element: HTMLElement) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const lines = [...range.getClientRects()].map((rect) => Math.round(rect.top));
        const lineCount = new Set(lines).size;
        const characters = (element.innerText || "").replace(/\s+/g, " ").trim().length;
        return { characters, charsPerLine: characters / Math.max(lineCount, 1), lineCount };
      };

      const cards = [...document.querySelectorAll<HTMLElement>('[data-testid="therapist-recommendation-card"]')].map((card) => {
        const name = card.querySelector<HTMLElement>('[data-testid="therapist-recommendation-name"]');
        const reason = card.querySelector<HTMLElement>('[data-testid="therapist-recommendation-reason"]');
        if (!name || !reason) throw new Error("Recommendation card content is incomplete.");
        return {
          name: lineMetrics(name),
          reason: lineMetrics(reason),
          width: Math.round(card.getBoundingClientRect().width),
        };
      });

      return { cards, viewport: window.innerWidth };
    });

    expect(report.cards, `${width}px should retain all representative recommendations`).toHaveLength(longRecommendationFixtures.length);
    for (const card of report.cards) {
      // The mobile shell deliberately retains page and section padding. 240px is
      // the readable floor; a 390px viewport currently affords 258px per row.
      expect(card.width, `${width}px recommendation item needs a naturally readable width`).toBeGreaterThanOrEqual(width <= 480 ? 240 : 500);
      expect(card.name.charsPerLine, `${width}px therapist name must not fragment vertically`).toBeGreaterThanOrEqual(8);
      expect(card.reason.charsPerLine, `${width}px fit reason must not fragment vertically`).toBeGreaterThanOrEqual(12);
    }
  }
});
