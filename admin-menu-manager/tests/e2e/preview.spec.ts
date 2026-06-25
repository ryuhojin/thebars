import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { width: 390, height: 844, label: "compact" },
  { width: 768, height: 1024, label: "medium" },
  { width: 1440, height: 900, label: "wide" }
];

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("아이디").fill(username);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function readSelectedBarId(page: Page): Promise<string> {
  const bars = await readDashboardBars(page);
  const bar = bars.find((item) => item.name === "Sample Bar") ?? bars[0];
  if (!bar) throw new Error("Sample Bar fixture missing");
  return bar.id;
}

async function readDashboardBars(page: Page): Promise<Array<{ id: string; name: string }>> {
  const response = await page.request.get("/api/dashboard");
  const body = (await response.json()) as { data: { accessibleBars: Array<{ id: string; name: string }> } };
  return body.data.accessibleBars;
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
}

async function expectTouchTargets(page: Page) {
  const smallTargets = await page.locator("button, input, select, a.button, .nav-link").evaluateAll((elements) => {
    const hasExpandedHitTarget = (element: Element, rect: DOMRect): boolean => {
      const missingHeight = 44 - rect.height;
      if (missingHeight <= 0) return true;
      const centerX = rect.left + rect.width / 2;
      const inset = missingHeight / 2;
      const topY = Math.max(0, rect.top - inset + 1);
      const bottomY = Math.min(window.innerHeight - 1, rect.bottom + inset - 1);
      const matches = (target: Element | null) =>
        target === element || Boolean(target && (element.contains(target) || target.closest("button, input, select, a.button, .nav-link") === element));
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

for (const viewport of viewports) {
  test(`D13 public preview at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth?fixtures=full");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, "admin1", "AdminPass!1");
    const barId = await readSelectedBarId(page);

    await page.goto(`/bars/${barId}/preview`);
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/preview$`));
    await expect(page.getByRole("heading", { name: "메뉴판 미리보기" })).toBeVisible();
    await expect(page.getByText("검증 통과")).toBeVisible();
    await expect(page.getByLabel("현재 작업 바")).toHaveValue(barId);
    await page.getByLabel("미리보기 범위").selectOption("all");
    await expect(page.locator('.public-menu-renderer[data-concept="menu_book"]')).toBeVisible();
    await expect(page.locator(".book-menu-row", { hasText: "맥캘란 12" })).toBeVisible();
    const soldOutRow = page.locator(".book-menu-row", { hasText: "네그로니" });
    await expect(soldOutRow).toBeVisible();
    await expect(soldOutRow.locator("b", { hasText: "품절" })).toBeVisible();
    await expect(soldOutRow.getByText("15,000 KRW")).toHaveCount(0);
    await expect(page.getByText("do not publish")).toHaveCount(0);

    await page.getByLabel("미리보기 범위").selectOption({ label: "메뉴: 맥캘란 12" });
    await page.getByLabel("고객 메뉴 검색").fill("맥");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/preview$`));
    await expect(page.getByLabel("미리보기 범위")).toHaveValue(/menu_/);
    await expect(page.getByLabel("고객 메뉴 검색")).toHaveValue("맥");
    await expect(page.getByLabel("현재 작업 바")).toHaveValue(barId);

    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`preview-${viewport.label}.png`),
      fullPage: true
    });
  });
}

test("D13 public preview uses the active customer menu concept", async ({ page }) => {
  await page.request.post("/__dev/reset-auth?fixtures=full");
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "admin1", "AdminPass!1");
  const barId = await readSelectedBarId(page);

  await page.goto(`/bars/${barId}/preview?layoutConcept=menu_book`);

  await expect(page).toHaveURL(new RegExp(`/bars/${barId}/preview\\?layoutConcept=menu_book$`));
  await expect(page.getByRole("radio", { name: /메뉴북형/ })).toBeChecked();
  await expect(page.locator('.public-menu-renderer[data-concept="menu_book"]')).toBeVisible();
  await expect(page.getByLabel("미리보기 범위")).not.toHaveValue("all");
  await expect(page.getByText("Selected Category")).toBeVisible();
  await expect(page.getByText("고객 화면 컨셉")).toBeVisible();
  await expect(page.getByText("메뉴북형").first()).toBeVisible();
  await expect(page.getByRole("radio", { name: /현장 속도형/ })).toHaveCount(0);
});

test("D13 shell bar selector and role based sidebar", async ({ page }) => {
  await page.request.post("/__dev/reset-auth?fixtures=full");
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "staff1", "StaffPass!1");
  const barId = await readSelectedBarId(page);
  const bars = await readDashboardBars(page);

  await expect(page.getByLabel("현재 작업 바")).toHaveValue(barId);
  await expect(page.getByLabel("현재 작업 바").locator("option")).toHaveCount(2);
  expect(bars.map((bar) => bar.name)).toContain("Whisky Lab");
  const sidebar = page.locator(".sidebar");
  await expect(sidebar.getByText("운영 홈", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("바 운영", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("고객 메뉴판", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("주문 운영", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("메뉴 관리", { exact: true })).toHaveCount(0);
  await expect(sidebar.getByText("시스템 관리", { exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: /메뉴판 미리보기/ })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: /테이블 목록/ })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: /정산 내역/ })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "메뉴", exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: /바 회원/ })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: /사용자 계정/ })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: /카테고리/ })).toHaveCount(0);
});

test("D13 manager can switch bars and open permitted menu areas", async ({ page }) => {
  await page.request.post("/__dev/reset-auth?fixtures=full");
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "manager1", "ManagerPass!1");
  const bars = await readDashboardBars(page);
  const whiskyLab = bars.find((bar) => bar.name === "Whisky Lab");
  if (!whiskyLab) throw new Error("Whisky Lab fixture missing");

  await page.getByLabel("현재 작업 바").selectOption(whiskyLab.id);
  const sidebar = page.locator(".sidebar");
  await expect(sidebar.getByText("메뉴 관리", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("고객 메뉴판", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("주문 운영", { exact: true })).toBeVisible();
  await expect(sidebar.getByText("시스템 관리", { exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: /카테고리/ })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "메뉴", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: /테이블 목록/ })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: /정산 내역/ })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: /사용자 계정/ })).toHaveCount(0);

  await sidebar.getByRole("link", { name: /카테고리/ }).click();
  await expect(page).toHaveURL(new RegExp(`/bars/${whiskyLab.id}/categories$`));
  await expect(page.getByLabel("현재 작업 바")).toHaveValue(whiskyLab.id);
  await expect(page.getByRole("heading", { name: "카테고리 관리" })).toBeVisible();
});
