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
  const smallTargets = await page.locator("button, input, select, a.button, .nav-link").evaluateAll((elements) =>
    elements
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { text: element.textContent?.trim() ?? element.getAttribute("aria-label") ?? "", height: rect.height };
      })
      .filter((item) => item.height > 0 && item.height < 44)
  );
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
    await expect(page.locator(".public-menu-card", { hasText: "맥캘란 12" })).toBeVisible();
    const soldOutCard = page.locator(".public-menu-card", { hasText: "네그로니" });
    await expect(soldOutCard).toBeVisible();
    await expect(soldOutCard.locator("b", { hasText: "품절" })).toBeVisible();
    await expect(soldOutCard.getByText("15,000 KRW")).toHaveCount(0);
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
  await expect(sidebar.getByRole("link", { name: /주문 탭/ })).toBeVisible();
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
  await expect(sidebar.getByRole("link", { name: /주문 탭/ })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: /사용자 계정/ })).toHaveCount(0);

  await sidebar.getByRole("link", { name: /카테고리/ }).click();
  await expect(page).toHaveURL(new RegExp(`/bars/${whiskyLab.id}/categories$`));
  await expect(page.getByLabel("현재 작업 바")).toHaveValue(whiskyLab.id);
  await expect(page.getByRole("heading", { name: "카테고리 관리" })).toBeVisible();
});
