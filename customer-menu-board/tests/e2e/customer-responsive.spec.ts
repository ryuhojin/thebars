import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { width: 390, height: 844, label: "compact" },
  { width: 768, height: 1024, label: "medium" },
  { width: 1440, height: 900, label: "wide" }
];

const bookViewports = [
  ...viewports,
  { width: 1366, height: 1024, label: "ipad-pro" }
];

const bookMenuFixture = {
  schemaVersion: 1,
  status: "published",
  layout: { concept: "menu_book" },
  revision: 1,
  publishedAt: "2026-06-24T00:00:00.000Z",
  generatedAt: "2026-06-24T00:00:00.000Z",
  contentHash: "0000000000000000000000000000000000000000000000000000000000000000",
  encodedSlug: "book-concept",
  bar: {
    name: "Sample Bar",
    intro: "선택한 카테고리의 메뉴만 조용히 읽는 디지털 메뉴북",
    currency: "KRW",
    address: "서울시 마포구 와우산로 00",
    phoneNumberDisplay: "02-1234-5678",
    openingNote: "오늘 18:00-다음날 02:00",
    businessHours: [],
    links: [{ label: "Instagram", url: "https://example.com/sample-bar" }]
  },
  categories: [
    {
      id: "cat_1",
      name: "추천",
      items: [
        {
          id: "menu_1",
          name: "하우스 하이볼",
          description: "시트러스와 탄산감을 살린 가벼운 하이볼",
          soldOut: false,
          abv: 8,
          prices: [{ label: "잔", volumeText: "330ml", amountMinor: 12000, currency: "KRW" }],
          badges: [],
          fields: []
        }
      ],
      children: []
    },
    {
      id: "cat_2",
      name: "위스키",
      items: [],
      children: [
        {
          id: "cat_3",
          name: "싱글몰트",
          description: "잔 단위로 즐기는 대표 싱글몰트입니다.",
          items: [
            {
              id: "menu_2",
              name: "맥캘란 12",
              description: "셰리 오크, 건과일, 스파이스",
              soldOut: false,
              abv: 40,
              prices: [{ label: "샷", volumeText: "30ml", amountMinor: 18000, currency: "KRW" }],
              badges: [],
              fields: [{ label: "지역", value: "Speyside" }]
            },
            {
              id: "menu_3",
              name: "맥캘란 18",
              description: "말린 과일, 진한 오크, 긴 여운",
              soldOut: false,
              abv: 43,
              prices: [{ label: "샷", volumeText: "30ml", amountMinor: 42000, currency: "KRW" }],
              badges: [],
              fields: []
            },
            {
              id: "menu_4",
              name: "글렌피딕 15",
              description: "꿀, 바닐라, 부드러운 오크",
              soldOut: false,
              abv: 40,
              prices: [{ label: "샷", volumeText: "30ml", amountMinor: 21000, currency: "KRW" }],
              badges: [],
              fields: []
            }
          ],
          children: []
        }
      ]
    }
  ]
};

for (const viewport of viewports) {
  test(`D14 customer menu at ${viewport.label}`, async ({ page }, testInfo) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/YmFyLWE3azJtOQ");

    await expect(page).toHaveURL(/\/YmFyLWE3azJtOQ$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sample Bar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "매장 정보" })).toBeVisible();
    await page.getByRole("button", { name: "매장 정보" }).click();
    const storeDialog = page.getByRole("dialog", { name: "Sample Bar" });
    await expect(storeDialog).toBeVisible();
    await expect(storeDialog.getByText("02-1234-5678")).toBeVisible();
    await expect(storeDialog.getByRole("link", { name: "Instagram" })).toBeVisible();
    await storeDialog.getByRole("button", { name: "닫기" }).click();
    await expect(storeDialog).toBeHidden();

    await expect(page.locator(".book-menu-row", { hasText: "하우스 하이볼" })).toBeVisible();
    await page.getByRole("button", { name: "검색" }).click();
    await page.getByLabel("메뉴 검색").fill("맥");
    const whiskyRow = page.locator(".book-menu-row", { hasText: "맥캘란 12" });
    await expect(whiskyRow).toBeVisible();
    await whiskyRow.getByRole("button", { name: /맥캘란 12 상세 보기/ }).click();
    const detailDialog = page.getByRole("dialog", { name: "맥캘란 12" });
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog.getByText("지역")).toBeVisible();
    await expect(detailDialog.getByText("Speyside")).toBeVisible();
    await expect(whiskyRow.getByText("Speyside")).toHaveCount(0);
    await detailDialog.getByRole("button", { name: "닫기" }).click();

    await page.getByLabel("메뉴 검색").fill("");
    await page.getByRole("button", { name: "검색" }).click();
    await page.getByRole("button", { name: "칵테일" }).click();
    const soldOutRow = page.locator(".book-menu-row", { hasText: "네그로니" });
    await expect(soldOutRow).toBeVisible();
    await expect(soldOutRow.locator("b", { hasText: "품절" })).toBeVisible();
    await expect(soldOutRow.getByText("15,000 KRW")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`customer-menu-${viewport.label}.png`),
      fullPage: true
    });

    await page.getByRole("button", { name: "검색" }).click();
    await page.getByLabel("메뉴 검색").fill("맥");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(/\/YmFyLWE3azJtOQ$/);
    await expect(page.getByLabel("메뉴 검색")).toHaveValue("맥");
    await expect(page.locator(".book-menu-row", { hasText: "맥캘란 12" })).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    expect(requests.some((url) => url.includes("/api") || url.includes("127.0.0.1:5173"))).toBe(false);
    expect(requests.filter((url) => url.includes("/menus/YmFyLWE3azJtOQ.json"))).toHaveLength(1);
  });
}

for (const viewport of bookViewports) {
  test(`customer menu book concept at ${viewport.label}`, async ({ page }, testInfo) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.route("**/menus/book-concept.json", (route) =>
      route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify(bookMenuFixture)
      })
    );

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/book-concept");

    await expect(page).toHaveURL(/\/book-concept$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sample Bar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "검색" })).toBeVisible();
    await expect(page.getByRole("button", { name: "매장 정보" })).toBeVisible();
    await expectBookHeaderMatchesWireframe(page, viewport.width < 768 ? 31 : 38);
    await expectBookControlsMatchWireframe(page, viewport.width < 768);
    await page.getByRole("button", { name: "매장 정보" }).click();
    const storeDialog = page.getByRole("dialog", { name: "Sample Bar" });
    await expect(storeDialog).toBeVisible();
    await expect(storeDialog.getByText("서울시 마포구 와우산로 00")).toBeVisible();
    await storeDialog.getByRole("button", { name: "닫기" }).click();
    await page.getByRole("button", { name: "위스키" }).click();
    await expect(page.getByRole("heading", { name: "위스키" })).toBeVisible();
    await expect(page.locator(".book-subcategory", { hasText: "싱글몰트" })).toBeVisible();
    await expect(page.locator(".book-menu-row", { hasText: "맥캘란 12" })).toBeVisible();

    await page.getByRole("button", { name: "검색" }).click();
    await page.getByLabel("메뉴 검색").fill("맥");
    const macallanRow = page.locator(".book-menu-row", { hasText: "맥캘란 12" });
    await expect(macallanRow).toBeVisible();
    await macallanRow.getByRole("button", { name: /맥캘란 12 상세 보기/ }).click();
    const itemDialog = page.getByRole("dialog", { name: "맥캘란 12" });
    await expect(itemDialog).toBeVisible();
    await expect(itemDialog.getByText("Speyside")).toBeVisible();
    await expect(macallanRow.getByText("Speyside")).toHaveCount(0);
    await itemDialog.getByRole("button", { name: "닫기" }).click();

    const columns = await bookGridColumnCount(page);
    expect(columns).toBe(viewport.width >= 1280 ? 3 : viewport.width >= 768 ? 2 : 1);
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    expect(requests.some((url) => url.includes("/api") || url.includes("127.0.0.1:5173"))).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath(`customer-menu-book-${viewport.label}.png`),
      fullPage: true
    });
  });
}

test("D14 customer menu not found and schema states", async ({ page }) => {
  await page.route("**/menus/missing.json", (route) => route.fulfill({ status: 404, body: "{}" }));
  await page.goto("/missing");
  await expect(page.getByRole("heading", { name: "해당 바는 없습니다" })).toBeVisible();
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

test("D14 customer root asks for a bar slug without loading sample data", async ({ page }) => {
  const menuRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/menus/")) menuRequests.push(request.url());
  });

  await page.goto("/");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "바를 조회해 주세요" })).toBeVisible();
  await expect(page.getByText("주소에 매장 메뉴판 링크를 입력해 주세요.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Sample Bar" })).toHaveCount(0);
  expect(menuRequests).toHaveLength(0);
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
  const smallTargets = await page.locator("button, input, a, summary").evaluateAll((elements) => {
    const hasExpandedHitTarget = (element: Element, rect: DOMRect): boolean => {
      const missingHeight = 44 - rect.height;
      if (missingHeight <= 0) return true;
      const centerX = rect.left + rect.width / 2;
      const inset = missingHeight / 2;
      const topY = Math.max(0, rect.top - inset + 1);
      const bottomY = Math.min(window.innerHeight - 1, rect.bottom + inset - 1);
      const matches = (target: Element | null) =>
        target === element || Boolean(target && (element.contains(target) || target.closest("button, input, a, summary") === element));
      return matches(document.elementFromPoint(centerX, topY)) && matches(document.elementFromPoint(centerX, bottomY));
    };

    return elements
      .map((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.bottom <= 0 || rect.top >= window.innerHeight) return null;
        if (rect.height > 0 && rect.height < 44 && hasExpandedHitTarget(element, rect)) return null;
        return { text: element.textContent?.trim() ?? element.getAttribute("aria-label") ?? "", height: rect.height };
      })
      .filter((item): item is { text: string; height: number } => item !== null)
      .filter((item) => item.height > 0 && item.height < 44);
  });
  expect(smallTargets).toEqual([]);
}

async function bookGridColumnCount(page: Page): Promise<number> {
  return page.locator(".book-menu-grid").evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
}

async function expectBookHeaderMatchesWireframe(page: Page, expectedTitlePx: number) {
  const metrics = await page.evaluate(() => {
    const customerPage = document.querySelector(".customer-page[data-concept='menu_book']");
    const hero = document.querySelector(".customer-hero");
    const eyebrow = document.querySelector(".customer-hero-copy .eyebrow");
    const title = document.querySelector(".customer-hero h1");
    const actions = document.querySelector(".customer-hero-actions");
    const renderer = document.querySelector(".public-menu-renderer[data-concept='menu_book']");
    if (!customerPage || !hero || !eyebrow || !title || !actions || !renderer) throw new Error("missing menu book header");
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect();
      return {
        x: box.x,
        width: box.width,
        center: box.x + box.width / 2
      };
    };
    const heroRect = rect(hero);
    const actionsRect = rect(actions);
    return {
      actionsRightGap: heroRect.x + heroRect.width - (actionsRect.x + actionsRect.width),
      centerDelta: Math.abs(rect(eyebrow).center - rect(title).center),
      heroBorder: Number.parseFloat(getComputedStyle(hero).borderTopWidth),
      rendererBorder: Number.parseFloat(getComputedStyle(renderer).borderTopWidth),
      pageWidthRatio: rect(customerPage).width / window.innerWidth,
      titleFontSize: Number.parseFloat(getComputedStyle(title).fontSize)
    };
  });
  expect(metrics.titleFontSize).toBe(expectedTitlePx);
  expect(metrics.centerDelta).toBeLessThanOrEqual(1);
  expect(metrics.heroBorder).toBe(0);
  expect(metrics.rendererBorder).toBe(0);
  expect(metrics.actionsRightGap).toBeLessThanOrEqual(1);
  expect(metrics.pageWidthRatio).toBeGreaterThan(0.98);
}

async function expectBookControlsMatchWireframe(page: Page, compact: boolean) {
  const metrics = await page.evaluate(() => {
    const numberStyle = (selector: string, property: "height" | "fontSize" | "minHeight" | "paddingTop") => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`missing ${selector}`);
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const value = property === "height" ? rect.height : Number.parseFloat(style[property]);
      return Math.round(value * 10) / 10;
    };
    return {
      searchMinHeight: numberStyle(".customer-search-menu summary", "minHeight"),
      searchFont: numberStyle(".customer-search-menu summary", "fontSize"),
      infoMinHeight: numberStyle(".customer-info-toggle", "minHeight"),
      categoryMinHeight: numberStyle(".book-category-select button", "minHeight"),
      categoryHeight: numberStyle(".book-category-select button", "height"),
      categoryPaddingTop: numberStyle(".book-category-select", "paddingTop"),
      categoryPagePaddingTop: numberStyle(".book-category-page", "paddingTop"),
      sectionEyebrowFont: numberStyle(".book-section-head span", "fontSize"),
      sectionTitleFont: numberStyle(".book-section-head h2", "fontSize"),
      rowPaddingTop: numberStyle(".book-menu-row-main", "paddingTop")
    };
  });
  expect(metrics.searchMinHeight).toBe(compact ? 34 : 36);
  expect(metrics.searchFont).toBe(compact ? 11 : 12);
  expect(metrics.infoMinHeight).toBe(compact ? 34 : 36);
  expect(metrics.categoryMinHeight).toBe(38);
  expect(metrics.categoryHeight).toBe(44);
  expect(metrics.categoryPaddingTop).toBe(compact ? 20 : 14);
  expect(metrics.categoryPagePaddingTop).toBe(4);
  expect(metrics.sectionEyebrowFont).toBe(11);
  expect(metrics.sectionTitleFont).toBe(25);
  expect(metrics.rowPaddingTop).toBe(15);
}
