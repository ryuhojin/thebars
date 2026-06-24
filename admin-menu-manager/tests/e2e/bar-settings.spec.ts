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

async function createBarThroughUi(page: Page, name: string) {
  await page.goto("/bars/new");
  await page.getByLabel("바 이름").fill(name);
  await page.getByRole("button", { name: "생성", exact: true }).click();
  await expect(page).toHaveURL(/\/bars\/[^/]+$/);
  await page.getByRole("button", { name: /바 설정/ }).click();
  await expect(page).toHaveURL(/\/bars\/[^/]+\/settings$/);
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
}

async function expectTouchTargets(page: Page) {
  const smallTargets = await page.locator("button, input, textarea, select, summary, a.button, .nav-link").evaluateAll((elements) =>
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
  test(`D06 bar settings save at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, "admin1", "AdminPass!1");
    await createBarThroughUi(page, `Settings Bar ${viewport.label}`);

    await expect(page.getByRole("heading", { name: "바 기본 정보·영업시간" })).toBeVisible();
    await page.getByLabel("바 이름").fill(`Public Settings ${viewport.label}`);
    await page.getByLabel("국내 전화번호").fill("0212345678");
    await page.getByLabel("소개 문구").fill("조용한 음악과 싱글몰트를 위한 바");
    await page.getByLabel("주소").fill("서울시 마포구 와우산로 00, 지하 1층");
    await page.getByLabel("지도 링크").fill("https://maps.example.test/settings");

    const monday = page.locator(".hours-day").filter({ hasText: "월요일" });
    await monday.getByRole("button", { name: "구간 추가" }).click();
    await page.getByLabel("월요일 시작 1").fill("18:00");
    await page.getByLabel("월요일 마감 1").fill("02:00");

    await page.getByRole("button", { name: "링크 추가" }).click();
    await page.locator(".link-row").nth(0).getByLabel("링크 이름").fill("Instagram");
    await page.locator(".link-row").nth(0).getByLabel("URL").fill("https://instagram.example.test/settings");
    await page.getByRole("button", { name: "링크 추가" }).click();
    await page.locator(".link-row").nth(1).getByLabel("링크 이름").fill("예약");
    await page.locator(".link-row").nth(1).getByLabel("URL").fill("https://booking.example.test/settings");
    await page.locator(".link-row").nth(0).getByRole("button", { name: "아래로" }).click();

    await page.getByLabel("바 통화").selectOption("USD");
    await expect(page.getByText("통화를 변경해도 기존 금액 숫자는 자동 변환되지 않습니다.")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(/\/bars\/[^/]+\/settings$/);
    await expect(page.getByLabel("바 이름")).toHaveValue(`Public Settings ${viewport.label}`);
    await expect(page.getByLabel("월요일 마감 1")).toHaveValue("02:00");
    await expect(page.locator(".link-row").nth(0).getByLabel("링크 이름")).toHaveValue("예약");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({
      path: testInfo.outputPath(`bar-settings-form-${viewport.label}.png`),
      fullPage: true
    });

    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("바 기본 정보를 저장했습니다. 발행 전까지 기존 고객 메뉴판은 유지됩니다.")).toBeVisible();
    await expect(page.getByText("USD").first()).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`bar-settings-saved-${viewport.label}.png`),
      fullPage: true
    });
  });
}

test("D06 settings screen hides bars from non-members", async ({ page }) => {
  await page.request.post("/__dev/reset-auth");
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "admin1", "AdminPass!1");
  await createBarThroughUi(page, "Hidden Settings Bar");
  const settingsPath = new URL(page.url()).pathname;
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await login(page, "staff1", "StaffPass!1");
  await page.goto(settingsPath);

  await expect(page).toHaveURL(new RegExp(`${settingsPath}$`));
  await expect(page.getByRole("heading", { name: "바 기본 정보를 불러오지 못했습니다" })).toBeVisible();
  await expect(page.getByText("바를 찾을 수 없습니다.")).toBeVisible();
});
