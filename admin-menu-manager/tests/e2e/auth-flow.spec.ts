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

    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "화면을 찾을 수 없습니다" })).toHaveCount(0);

    await page.goto("/change-password");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
    await expect(page.getByRole("button", { name: "관리자 복구" })).toHaveCount(0);

    await page.goto("/login");
    await expect(page.getByRole("button", { name: "관리자 복구" })).toHaveCount(0);
    await expect(page.locator('head link[rel="icon"][href="/favicon.svg"]')).toHaveCount(1);
    await expect(page.getByText("CSRF")).toHaveCount(0);
    await expect(page.getByText(/운영 보안을 먼저/)).toHaveCount(0);
    const faviconResponse = await page.request.get("/favicon.svg");
    expect(faviconResponse.status()).toBe(200);
    if (viewport.width >= 768) {
      await expect(page.getByRole("heading", { name: "바 운영을 위한 관리자 콘솔" })).toBeVisible();
      await expect(page.getByText("오늘 주문")).toBeVisible();
      await expect(page.locator(".auth-visual")).toHaveCSS("background-image", "none");
    }
    await page.screenshot({
      path: testInfo.outputPath(`auth-login-${viewport.label}.png`),
      fullPage: true
    });
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

  test(`D01 protected navigation reuses authenticated shell data at ${viewport.label}`, async ({ page }) => {
    await page.request.post("/__dev/reset-auth");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/login");

    await page.getByLabel("아이디").fill("admin1");
    await page.getByLabel("비밀번호").fill("AdminPass!1");
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible();

    let sessionRefreshes = 0;
    let dashboardRefreshes = 0;
    let permissionRefreshes = 0;
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/api/auth/session")) sessionRefreshes += 1;
      if (url.includes("/api/dashboard")) dashboardRefreshes += 1;
      if (url.includes("/current-permissions")) permissionRefreshes += 1;
    });

    await page.evaluate(() => {
      window.history.pushState(null, "", "/bars");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await expect(page).toHaveURL(/\/bars$/);
    await expect(page.locator(".app-shell")).toBeVisible();
    await expect(page.getByRole("heading", { name: "로그인 상태 확인 중" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "바 관리" })).toBeVisible();
    expect(sessionRefreshes).toBe(0);
    expect(dashboardRefreshes).toBe(0);
    expect(permissionRefreshes).toBe(0);
  });

  test(`D01 direct root opens the dashboard for an authenticated session at ${viewport.label}`, async ({ page }) => {
    await page.request.post("/__dev/reset-auth");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/login");

    await page.getByLabel("아이디").fill("admin1");
    await page.getByLabel("비밀번호").fill("AdminPass!1");
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "화면을 찾을 수 없습니다" })).toHaveCount(0);
    await expect(page.locator(".app-shell")).toHaveAttribute("data-route", "/dashboard");
  });
}
