import { expect, test } from "@playwright/test";

const viewports = [
  { width: 390, height: 844, label: "compact" },
  { width: 768, height: 1024, label: "medium" },
  { width: 1440, height: 900, label: "wide" }
];

const authScreens = [
  { path: "/setup", heading: "최초 관리자 설정" },
  { path: "/login", heading: "로그인" },
  { path: "/recovery", heading: "시스템 관리자 복구" }
];

for (const viewport of viewports) {
  test(`D01 auth screens render and preserve input at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const screen of authScreens) {
      await page.goto(screen.path);
      await expect(page).toHaveURL(new RegExp(`${screen.path}$`));
      await expect(page.getByRole("heading", { name: screen.heading })).toBeVisible();
    }

    await page.goto("/bars");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
    await expect(page.getByText("반응형 앱 셸 검증")).toHaveCount(0);

    await page.goto("/change-password");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
    await expect(page.getByRole("button", { name: "관리자 복구" })).toHaveCount(0);

    await page.goto("/login");
    await expect(page.getByRole("button", { name: "관리자 복구" })).toHaveCount(0);
    await page.getByLabel("아이디").fill("forced1");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("아이디")).toHaveValue("forced1");

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalOverflow).toBe(false);

    await page.screenshot({
      path: testInfo.outputPath(`auth-screens-${viewport.label}.png`),
      fullPage: true
    });
  });

  test(`D01 forced password flow at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/login");

    await page.getByLabel("아이디").fill("forced1");
    await page.getByLabel("비밀번호").fill("TempPass!1");
    await page.getByRole("button", { name: "로그인" }).click();

    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByRole("heading", { name: "비밀번호 변경" })).toBeVisible();

    await page.getByLabel("현재 임시 비밀번호").fill("TempPass!1");
    await page.getByLabel("새 비밀번호", { exact: true }).fill("BetterPass!1");
    await page.getByLabel("새 비밀번호 확인").fill("BetterPass!1");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByLabel("새 비밀번호", { exact: true })).toHaveValue("BetterPass!1");
    await page.getByRole("button", { name: "변경하고 계속" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible();
    await expect(page.getByLabel("현재 사용자").getByText("forced1")).toBeVisible();

    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/login$/);

    const smallTargets = await page.locator("button, input, a.button").evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { text: element.textContent?.trim() ?? element.getAttribute("aria-label") ?? "", height: rect.height };
        })
        .filter((item) => item.height > 0 && item.height < 44)
    );
    expect(smallTargets).toEqual([]);

    await page.screenshot({
      path: testInfo.outputPath(`auth-flow-${viewport.label}.png`),
      fullPage: true
    });
  });
}
