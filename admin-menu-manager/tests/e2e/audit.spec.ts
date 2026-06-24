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
  test(`D22 audit log page at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth?fixtures=full");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, "admin1", "AdminPass!1");

    await page.goto("/system/audit");
    await expect(page).toHaveURL(/\/system\/audit$/);
    await expect(page.getByRole("heading", { name: "감사 로그·보관 작업" })).toBeVisible();
    await expect(page.getByLabel("현재 작업 바")).toBeVisible();
    const fixtureLog =
      viewport.width < 768
        ? page.locator(".audit-card", { hasText: "Sample Bar 공개 12" }).first()
        : page.getByRole("cell", { name: "Sample Bar 공개 12" });
    await expect(fixtureLog).toBeVisible();
    await expect(page.getByRole("heading", { name: "보관 작업", exact: true })).toBeVisible();

    await page.getByLabel("감사 로그 검색").fill("manager1");
    await page.getByLabel("감사 로그 작업 필터").selectOption("order_tab.settled");
    await page.getByLabel("감사 로그 결과 필터").selectOption("success");
    const filteredLog =
      viewport.width < 768
        ? page.locator(".audit-card", { hasText: "테이블 4 정산" }).first()
        : page.getByRole("cell", { name: "테이블 4 정산" });
    await expect(filteredLog).toBeVisible();
    await page.getByRole("button", { name: "미리 계산" }).click();
    await expect(page.getByText(/정리 대상 계산 완료/)).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`audit-${viewport.label}.png`),
      fullPage: true
    });
  });
}

test("D22 audit filters and maintenance result survive resize without URL change", async ({ page }) => {
  await page.request.post("/__dev/reset-auth?fixtures=full");
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "admin1", "AdminPass!1");

  await page.goto("/system/audit");
  await page.getByLabel("감사 로그 검색").fill("배포");
  await page.getByLabel("감사 로그 작업 필터").selectOption("publication.requested");
  await page.getByLabel("감사 로그 결과 필터").selectOption("failure");
  await page.getByText("배포 확인 필요").first().click();
  await page.getByRole("button", { name: "미리 계산" }).click();
  await expect(page.getByText(/정리 대상 계산 완료/)).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });

  await expect(page).toHaveURL(/\/system\/audit$/);
  await expect(page.getByLabel("감사 로그 검색")).toHaveValue("배포");
  await expect(page.getByLabel("감사 로그 작업 필터")).toHaveValue("publication.requested");
  await expect(page.getByLabel("감사 로그 결과 필터")).toHaveValue("failure");
  await expect(page.getByText(/정리 대상 계산 완료/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("D22 audit navigation and API access are system-admin only", async ({ page }) => {
  await page.request.post("/__dev/reset-auth?fixtures=full");
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "staff1", "StaffPass!1");

  await expect(page.locator(".sidebar").getByRole("link", { name: /감사 로그/ })).toHaveCount(0);
  await page.goto("/system/audit");
  await expect(page.getByRole("heading", { name: "시스템 관리자 권한이 필요합니다." })).toBeVisible();
});
