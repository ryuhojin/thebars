import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { width: 390, height: 844, label: "compact" },
  { width: 768, height: 1024, label: "medium" },
  { width: 1440, height: 900, label: "wide" }
];

type DashboardBar = { id: string; name: string };

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("아이디").fill(username);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function keyboardLogin(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  await page.keyboard.type(username);
  await page.keyboard.press("Tab");
  await page.keyboard.type(password);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function readBars(page: Page): Promise<DashboardBar[]> {
  const response = await page.request.get("/api/dashboard");
  const body = (await response.json()) as { data: { accessibleBars: DashboardBar[] } };
  return body.data.accessibleBars;
}

async function readSampleBarId(page: Page): Promise<string> {
  const bars = await readBars(page);
  const bar = bars.find((item) => item.name === "Sample Bar") ?? bars[0];
  if (!bar) throw new Error("Sample Bar fixture missing");
  return bar.id;
}

async function readFirstMenuItemId(page: Page, barId: string): Promise<string> {
  const response = await page.request.get(`/api/bars/${barId}/menu-items`);
  const body = (await response.json()) as { data: { items: Array<{ id: string; name: string }> } };
  const item = body.data.items.find((entry) => entry.name === "맥캘란 12") ?? body.data.items[0];
  if (!item) throw new Error("menu item fixture missing");
  return item.id;
}

async function readFirstOrderTabId(page: Page, barId: string): Promise<string> {
  const response = await page.request.get(`/api/bars/${barId}/order-tabs`);
  const body = (await response.json()) as { data: { tabs: Array<{ id: string; tableLabel: string }> } };
  const tab = body.data.tabs.find((entry) => entry.tableLabel === "A1") ?? body.data.tabs[0];
  if (!tab) throw new Error("order tab fixture missing");
  return tab.id;
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
}

async function expectTouchTargets(page: Page) {
  const smallTargets = await page.locator("button, input, select, textarea, a.button, .nav-link").evaluateAll((elements) =>
    elements
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { text: element.textContent?.trim() ?? element.getAttribute("aria-label") ?? "", height: rect.height };
      })
      .filter((item) => item.height > 0 && item.height < 44)
  );
  expect(smallTargets).toEqual([]);
}

async function expectTokenContrast(page: Page) {
  const results = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const pairs = [
      ["text-on-bg", root.getPropertyValue("--color-text"), root.getPropertyValue("--color-bg")],
      ["text-on-surface", root.getPropertyValue("--color-text"), root.getPropertyValue("--color-surface")],
      ["white-on-accent", "#ffffff", root.getPropertyValue("--color-accent")]
    ] as const;
    const toRgb = (value: string): [number, number, number] => {
      const probe = document.createElement("span");
      probe.style.color = value.trim();
      document.documentElement.appendChild(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      const match = color.match(/\d+/g)?.map(Number) ?? [0, 0, 0];
      return [match[0] ?? 0, match[1] ?? 0, match[2] ?? 0];
    };
    const luminance = ([red, green, blue]: [number, number, number]) => {
      const channel = [red, green, blue].map((part) => {
        const value = part / 255;
        return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * (channel[0] ?? 0) + 0.7152 * (channel[1] ?? 0) + 0.0722 * (channel[2] ?? 0);
    };
    return pairs.map(([name, foreground, background]) => {
      const left = luminance(toRgb(foreground));
      const right = luminance(toRgb(background));
      const contrast = (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
      return { name, contrast };
    });
  });
  expect(results.filter((item) => item.contrast < 4.5)).toEqual([]);
}

for (const viewport of viewports) {
  test(`D23 major admin route matrix at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth?fixtures=full");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, "admin1", "AdminPass!1");
    const barId = await readSampleBarId(page);
    const menuItemId = await readFirstMenuItemId(page, barId);
    const orderTabId = await readFirstOrderTabId(page, barId);

    const accessibleBarIds = new Set((await readBars(page)).map((bar) => bar.id));
    const routes = [
      { path: "/dashboard", label: "대시보드" },
      { path: "/bars", label: "바 목록" },
      { path: "/bars/new", label: "바 등록" },
      { path: `/bars/${barId}`, label: "바 개요", selectedBarId: barId },
      { path: `/bars/${barId}/members`, label: "바 회원·권한", selectedBarId: barId },
      { path: `/bars/${barId}/settings`, label: "바 기본 정보", selectedBarId: barId },
      { path: `/bars/${barId}/categories`, label: "카테고리", selectedBarId: barId },
      { path: `/bars/${barId}/menus`, label: "메뉴", selectedBarId: barId },
      { path: `/bars/${barId}/menus/new`, label: "메뉴 등록", selectedBarId: barId },
      { path: `/bars/${barId}/menus/${menuItemId}`, label: "메뉴 상세", selectedBarId: barId },
      { path: `/bars/${barId}/preview`, label: "메뉴판 미리보기", selectedBarId: barId },
      { path: `/bars/${barId}/publications`, label: "GitHub 발행", selectedBarId: barId },
      { path: `/bars/${barId}/orders`, label: "주문 탭", selectedBarId: barId },
      { path: `/bars/${barId}/orders/${orderTabId}`, label: "주문 탭 상세", selectedBarId: barId },
      { path: "/system/users", label: "사용자 계정" },
      { path: "/system/audit", label: "감사 로그·보관" },
      { path: "/system/item-types", label: "품목 유형·템플릿" },
      { path: "/system/badges", label: "배지·색상" }
    ];

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page).toHaveURL(new RegExp(`${escapeRegExp(route.path)}$`));
      await expect(page.locator(".route-meta strong")).toHaveText(route.label);
      await expect(page.getByLabel("현재 작업 바")).toBeVisible();
      const selectedValue = await page.getByLabel("현재 작업 바").inputValue();
      if (route.selectedBarId) expect(selectedValue).toBe(route.selectedBarId);
      else expect(accessibleBarIds.has(selectedValue)).toBe(true);
      await expect(page.locator("main")).not.toContainText("요청을 처리하지 못했습니다.");
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page);
    }

    await expectTokenContrast(page);
    await page.screenshot({ path: testInfo.outputPath(`d23-route-matrix-${viewport.label}.png`), fullPage: true });
  });
}

test("D23 keyboard login, compact drawer, 360px width, and focus restore", async ({ page }) => {
  await page.request.post("/__dev/reset-auth?fixtures=full");
  await page.setViewportSize({ width: 360, height: 800 });
  await keyboardLogin(page, "admin1", "AdminPass!1");
  await expect(page.getByLabel("현재 작업 바")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await expect(page.getByLabel("현재 작업 바")).toBeVisible();
  await expect(page.getByLabel("내비게이션 열기")).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });

  await page.getByLabel("내비게이션 열기").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("navigation", { name: "Compact 관리자 주요 메뉴" })).toBeVisible();
  await page.getByLabel("내비게이션 닫기").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("navigation", { name: "Compact 관리자 주요 메뉴" })).toHaveCount(0);

  await page.goto("/system/users");
  const openButton = page.getByRole("button", { name: "사용자 생성" });
  await openButton.click();
  const dialog = page.getByRole("dialog", { name: "사용자 생성" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(openButton).toBeFocused();
});

test("D23 resize preserves selected bar and search without viewport duplicate fetches", async ({ page }) => {
  await page.request.post("/__dev/reset-auth?fixtures=full");
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "manager1", "ManagerPass!1");
  const bars = await readBars(page);
  const whiskyLab = bars.find((bar) => bar.name === "Whisky Lab");
  if (!whiskyLab) throw new Error("Whisky Lab fixture missing");

  let dashboardFetches = 0;
  let permissionFetches = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/dashboard")) dashboardFetches += 1;
    if (url.includes("/current-permissions")) permissionFetches += 1;
  });

  await page.getByLabel("현재 작업 바").selectOption(whiskyLab.id);
  await page.goto(`/bars/${whiskyLab.id}/categories`);
  await page.getByLabel("카테고리 검색").fill("칵테일");
  await expect(page.getByLabel("현재 작업 바")).toHaveValue(whiskyLab.id);
  await expect(page.locator(".sidebar").getByRole("link", { name: /카테고리/ })).toBeVisible();

  dashboardFetches = 0;
  permissionFetches = 0;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.setViewportSize({ width: 1440, height: 900 });

  await expect(page).toHaveURL(new RegExp(`/bars/${whiskyLab.id}/categories$`));
  await expect(page.getByLabel("현재 작업 바")).toHaveValue(whiskyLab.id);
  await expect(page.getByLabel("카테고리 검색")).toHaveValue("칵테일");
  expect(dashboardFetches).toBe(0);
  expect(permissionFetches).toBe(0);
});

test("D23 staff sidebar exposes only permitted menus", async ({ page }) => {
  await page.request.post("/__dev/reset-auth?fixtures=full");
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "staff1", "StaffPass!1");
  await expect(page.getByLabel("현재 작업 바").locator("option")).toHaveCount(2);
  const sidebar = page.locator(".sidebar");
  await expect(sidebar.getByText("운영 홈", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("바 운영", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("고객 메뉴판", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("주문 운영", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("메뉴 관리", { exact: true })).toHaveCount(0);
  await expect(sidebar.getByText("시스템 관리", { exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: /메뉴판 미리보기/ })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: /주문 탭/ })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: /카테고리/ })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "메뉴", exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: /바 회원/ })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: /사용자 계정/ })).toHaveCount(0);

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(sidebar.locator(".nav-group-label").first()).toHaveText("주문 운영");
  await expect(sidebar.getByRole("link", { name: /주문 탭/ })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("내비게이션 열기").click();
  const drawer = page.getByRole("navigation", { name: "Compact 관리자 주요 메뉴" });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(".nav-group-label").first()).toHaveText("주문 운영");
  await expect(drawer.getByRole("link", { name: /주문 탭/ })).toBeVisible();
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
