import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { width: 390, height: 844, label: "compact", username: "ucompact1" },
  { width: 768, height: 1024, label: "medium", username: "umedium1" },
  { width: 1440, height: 900, label: "wide", username: "uwide1" }
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
  test(`D04 user create deactivate at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, "admin1", "AdminPass!1");

    await page.goto("/system/users");
    await expect(page).toHaveURL(/\/system\/users$/);
    await expect(page.getByRole("heading", { name: "사용자 계정 관리" })).toBeVisible();
    await expect(page.getByLabel("아이디 검색")).toBeVisible();

    await page.getByRole("button", { name: "사용자 생성" }).click();
    await expect(page.getByRole("dialog", { name: "사용자 생성" })).toBeVisible();
    await page.getByLabel("아이디", { exact: true }).fill(viewport.username);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(/\/system\/users$/);
    await expect(page.getByLabel("아이디", { exact: true })).toHaveValue(viewport.username);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({
      path: testInfo.outputPath(`user-create-${viewport.label}.png`),
      fullPage: true
    });

    await page.getByRole("button", { name: "생성", exact: true }).click();
    await expect(page.getByText("계정 생성 완료")).toBeVisible();
    await expect(page.getByText(`${viewport.username} 임시 비밀번호는 지금만 표시됩니다.`)).toBeVisible();

    await page.getByLabel("아이디 검색").fill(viewport.username);
    await page.getByLabel("사용자 상태 필터").selectOption("forced_password_change");
    await expect(page.getByText(viewport.username).first()).toBeVisible();
    await page.getByRole("button", { name: "선택" }).first().click();
    const beforeSummary = await page.locator(".selected-bar-summary").innerText();

    await page.getByRole("button", { name: "관리" }).first().click();
    await expect(page.getByRole("dialog", { name: "사용자 관리" })).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "비활성화" }).click();
    await expect(page.getByText("비활성", { exact: false }).first()).toBeVisible();

    await expect(page.getByLabel("아이디 검색")).toHaveValue(viewport.username);
    await expect(page.getByLabel("사용자 상태 필터")).toHaveValue("forced_password_change");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(/\/system\/users$/);
    await expect(page.getByLabel("아이디 검색")).toHaveValue(viewport.username);
    await expect(page.getByLabel("사용자 상태 필터")).toHaveValue("forced_password_change");
    await expect(page.locator(".selected-bar-summary")).toHaveText(beforeSummary);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`users-list-${viewport.label}.png`),
      fullPage: true
    });
  });
}

test("D04 users screen blocks non-system users", async ({ page }) => {
  await page.request.post("/__dev/reset-auth");
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "staff1", "StaffPass!1");

  await page.goto("/system/users");

  await expect(page).toHaveURL(/\/system\/users$/);
  await expect(page.getByRole("heading", { name: "시스템 관리자 권한이 필요합니다." })).toBeVisible();
  await expect(page.getByText("이 화면은 시스템 관리자에게만 공개됩니다.")).toBeVisible();
});
