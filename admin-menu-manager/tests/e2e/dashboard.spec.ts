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
  await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
}

async function expectTouchTargets(page: Page) {
  const smallTargets = await page.locator("button, a.button, .nav-link").evaluateAll((elements) =>
    elements
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { text: element.textContent?.trim() ?? element.getAttribute("aria-label") ?? "", height: rect.height };
      })
      .filter((item) => item.height > 0 && item.height < 44)
  );
  expect(smallTargets).toEqual([]);
}

async function expectResizePreservesDashboardState(page: Page) {
  const beforeUrl = page.url();
  const selectedSummary = page.locator(".selected-bar-summary");
  const beforeSummary = await selectedSummary.innerText();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page).toHaveURL(beforeUrl);
  await expect(selectedSummary).toHaveText(beforeSummary);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page).toHaveURL(beforeUrl);
  await expect(selectedSummary).toHaveText(beforeSummary);
}

for (const viewport of viewports) {
  test(`D02 system-admin dashboard at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await login(page, "admin1", "AdminPass!1");

    await expect(page.locator(".dashboard-page")).toHaveAttribute("data-dashboard-mode", "system-admin");
    await expect(page.getByLabel("현재 사용자").getByText("admin1")).toBeVisible();
    await expect(page.getByText("시스템 관리자", { exact: true })).toBeVisible();
    await expect(page.getByText("활성 사용자", { exact: true })).toBeVisible();
    await expect(page.getByText("전체 0개 · 비활성 0개")).toBeVisible();
    await expect(page.getByText("전체 3명 · 잠김 0명 · 비활성 0명")).toBeVisible();
    await expect(page.getByText("등록된 바가 없습니다.")).toBeVisible();
    await expect(page.locator(".selected-bar-summary")).toHaveText("선택된 바 없음");
    await expect(page.getByRole("button", { name: "바 등록" })).toBeEnabled();

    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`dashboard-admin-${viewport.label}.png`),
      fullPage: true
    });
    await expectResizePreservesDashboardState(page);
  });

  test(`D02 bar-user dashboard at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await login(page, "staff1", "StaffPass!1");

    await expect(page.locator(".dashboard-page")).toHaveAttribute("data-dashboard-mode", "bar-user");
    await expect(page.getByLabel("현재 사용자").getByText("staff1")).toBeVisible();
    await expect(page.getByText("바 운영자")).toBeVisible();
    await expect(page.getByText("바 운영 대시보드입니다.")).toBeVisible();
    await expect(page.getByText("접근 가능한 바가 없습니다.")).toBeVisible();
    await expect(page.getByText("현재 계정에는 아직 바 소속이 없습니다.")).toBeVisible();
    await expect(page.getByText("활성 사용자")).toHaveCount(0);
    await expect(page.locator(".selected-bar-summary")).toHaveText("선택된 바 없음");
    await expect(page.getByRole("button", { name: /주문 탭 보기/ })).toBeDisabled();

    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`dashboard-staff-${viewport.label}.png`),
      fullPage: true
    });
    await expectResizePreservesDashboardState(page);
  });
}
