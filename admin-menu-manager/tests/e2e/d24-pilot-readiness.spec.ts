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
  test(`D24 pilot readiness panel at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth?fixtures=full");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, "admin1", "AdminPass!1");

    await page.goto("/system/audit");
    await expect(page).toHaveURL(/\/system\/audit$/);
    const panel = page.locator(".pilot-readiness-panel");
    await expect(panel.getByRole("heading", { name: "파일럿 준비" })).toBeVisible();
    await expect(panel.getByText("파일럿 시작 준비")).toBeVisible();
    await expect(panel.getByText("Sample Bar", { exact: true })).toBeVisible();
    await expect(panel.getByText("Whisky Lab", { exact: true })).toBeVisible();
    await expect(panel.getByText(/와인, 위스키, 칵테일, 푸드, 시가/)).toBeVisible();
    await expect(panel.getByText("사람의 운영 배포 승인")).toBeVisible();
    await expect(panel.getByText(/실제 운영 비밀값, 원격 반영, 운영 배포는 승인 전까지 실행하지 않습니다/)).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`d24-pilot-readiness-${viewport.label}.png`),
      fullPage: true
    });
  });
}

test("D24 pilot readiness keeps audit filter state across resize on the same URL", async ({ page }) => {
  await page.request.post("/__dev/reset-auth?fixtures=full");
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "admin1", "AdminPass!1");

  await page.goto("/system/audit");
  await page.getByLabel("감사 로그 검색").fill("배포");
  await page.getByLabel("감사 로그 작업 필터").selectOption("publication.requested");
  await expect(page.getByRole("heading", { name: "파일럿 준비" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.setViewportSize({ width: 768, height: 1024 });

  await expect(page).toHaveURL(/\/system\/audit$/);
  await expect(page.getByLabel("감사 로그 검색")).toHaveValue("배포");
  await expect(page.getByLabel("감사 로그 작업 필터")).toHaveValue("publication.requested");
  await expect(page.getByRole("heading", { name: "파일럿 준비" })).toBeVisible();
  await expect(page.getByText("파일럿 시작 준비")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
