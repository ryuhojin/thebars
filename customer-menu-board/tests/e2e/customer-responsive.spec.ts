import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { width: 390, height: 844, label: "compact" },
  { width: 768, height: 1024, label: "medium" },
  { width: 1440, height: 900, label: "wide" }
];

for (const viewport of viewports) {
  test(`D14 customer menu at ${viewport.label}`, async ({ page }, testInfo) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/YmFyLWE3azJtOQ");

    await expect(page).toHaveURL(/\/YmFyLWE3azJtOQ$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sample Bar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "바 정보" })).toBeVisible();
    await page.getByRole("button", { name: "바 정보" }).click();
    await expect(page.getByText("02-1234-5678")).toBeVisible();
    await expect(page.getByRole("link", { name: "Instagram" })).toBeVisible();

    await expect(page.locator(".public-menu-card", { hasText: "하우스 하이볼" })).toBeVisible();
    await page.getByLabel("메뉴 검색").fill("맥");
    const whiskyCard = page.locator(".public-menu-card", { hasText: "맥캘란 12" });
    await expect(whiskyCard).toBeVisible();
    await whiskyCard.getByRole("button", { name: /맥캘란 12/ }).click();
    await expect(whiskyCard.getByText("지역")).toBeVisible();
    await expect(whiskyCard.getByText("Speyside")).toBeVisible();

    await page.getByLabel("메뉴 검색").fill("");
    await page.getByRole("button", { name: "전체" }).click();
    const soldOutCard = page.locator(".public-menu-card", { hasText: "네그로니" });
    await expect(soldOutCard).toBeVisible();
    await expect(soldOutCard.locator("b", { hasText: "품절" })).toBeVisible();
    await expect(soldOutCard.getByText("15,000 KRW")).toHaveCount(0);
    await expect(page.getByText("등록된 메뉴가 없습니다")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`customer-menu-${viewport.label}.png`),
      fullPage: true
    });

    await page.getByLabel("메뉴 검색").fill("맥");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(/\/YmFyLWE3azJtOQ$/);
    await expect(page.getByLabel("메뉴 검색")).toHaveValue("맥");
    await expect(whiskyCard.getByText("지역")).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    expect(requests.some((url) => url.includes("/api") || url.includes("127.0.0.1:5173"))).toBe(false);
    expect(requests.filter((url) => url.includes("/menus/YmFyLWE3azJtOQ.json"))).toHaveLength(1);
  });
}

test("D14 customer menu not found and schema states", async ({ page }) => {
  await page.route("**/menus/missing.json", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.goto("/missing");
  await expect(page.getByRole("heading", { name: "메뉴판을 찾을 수 없습니다" })).toBeVisible();
  await expect(page.getByRole("link", { name: /관리자|로그인|주문|결제/ })).toHaveCount(0);

  await page.route("**/menus/bad-schema.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({ schemaVersion: 2 })
    })
  );
  await page.goto("/bad-schema");
  await expect(page.getByRole("heading", { name: "메뉴 데이터를 표시할 수 없습니다" })).toBeVisible();
  await expect(page.getByRole("link", { name: /관리자|로그인|주문|결제/ })).toHaveCount(0);
});

test("D23 customer menu Web Vitals baseline and viewport fetch stability", async ({ page }) => {
  const menuRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/menus/YmFyLWE3azJtOQ.json")) menuRequests.push(request.url());
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/YmFyLWE3azJtOQ");
  await expect(page.getByRole("heading", { level: 1, name: "Sample Bar" })).toBeVisible();

  const baseline = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const paint = performance.getEntriesByType("paint").find((entry) => entry.name === "first-contentful-paint");
    return {
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? 0,
      loadEventMs: navigation?.loadEventEnd ?? 0,
      firstContentfulPaintMs: paint?.startTime ?? 0
    };
  });

  expect(baseline.domContentLoadedMs).toBeGreaterThan(0);
  expect(baseline.domContentLoadedMs).toBeLessThan(3000);
  expect(baseline.loadEventMs).toBeLessThan(4000);
  if (baseline.firstContentfulPaintMs > 0) expect(baseline.firstContentfulPaintMs).toBeLessThan(3000);

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page).toHaveURL(/\/YmFyLWE3azJtOQ$/);
  expect(menuRequests).toHaveLength(1);
});

async function expectNoHorizontalOverflow(page: Page) {
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
}

async function expectTouchTargets(page: Page) {
  const smallTargets = await page.locator("button, input, a").evaluateAll((elements) =>
    elements
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { text: element.textContent?.trim() ?? element.getAttribute("aria-label") ?? "", height: rect.height };
      })
      .filter((item) => item.height > 0 && item.height < 44)
  );
  expect(smallTargets).toEqual([]);
}
