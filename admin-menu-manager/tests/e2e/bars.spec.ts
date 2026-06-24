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

async function readSelectedBarId(page: Page): Promise<string> {
  const response = await page.request.get("/api/dashboard");
  const body = (await response.json()) as { data: { accessibleBars: Array<{ id: string; name: string }> } };
  const bar = body.data.accessibleBars.find((item) => item.name === "Sample Bar") ?? body.data.accessibleBars[0];
  if (!bar) throw new Error("Sample Bar fixture missing");
  return bar.id;
}

for (const viewport of viewports) {
  test(`D03 bar create list detail at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, "admin1", "AdminPass!1");

    await page.goto("/bars");
    await expect(page).toHaveURL(/\/bars$/);
    await expect(page.getByRole("heading", { name: "바 관리" })).toBeVisible();
    await expect(page.getByText("등록된 바가 없습니다.")).toBeVisible();

    await page.getByRole("button", { name: "바 등록" }).first().click();
    await expect(page).toHaveURL(/\/bars\/new$/);
    await expect(page.getByRole("heading", { name: "새 바 등록" })).toBeVisible();

    await page.getByLabel("바 이름").fill(`Sample Bar ${viewport.label}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(/\/bars\/new$/);
    await expect(page.getByLabel("바 이름")).toHaveValue(`Sample Bar ${viewport.label}`);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({
      path: testInfo.outputPath(`bar-new-${viewport.label}.png`),
      fullPage: true
    });

    await page.getByRole("button", { name: "생성" }).click();
    await expect(page).toHaveURL(/\/bars\/[^/]+$/);
    await expect(page.getByRole("heading", { name: `Sample Bar ${viewport.label}` })).toBeVisible();
    await expect(page.locator(".detail-list").filter({ hasText: "고객 메뉴판 경로" }).first()).toBeVisible();
    await expect(page.getByText("첫 발행 전", { exact: true })).toBeVisible();
    await expect(page.locator(".status-box small")).toContainText("준비 중");
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`bar-detail-${viewport.label}.png`),
      fullPage: true
    });

    await page.getByRole("button", { name: "바 목록" }).click();
    await expect(page).toHaveURL(/\/bars$/);
    await page.getByLabel("바 이름 검색").fill("Sample");
    await page.getByRole("button", { name: "선택" }).first().click();
    const beforeSummary = await page.locator(".selected-bar-summary").innerText();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(/\/bars$/);
    await expect(page.getByLabel("바 이름 검색")).toHaveValue("Sample");
    await expect(page.locator(".selected-bar-summary")).toHaveText(beforeSummary);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`bars-list-${viewport.label}.png`),
      fullPage: true
    });
  });
}

test("D03 bars screen blocks non-system users", async ({ page }) => {
  await page.request.post("/__dev/reset-auth");
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "staff1", "StaffPass!1");

  await page.goto("/bars");

  await expect(page).toHaveURL(/\/bars$/);
  await expect(page.getByRole("heading", { name: "접근할 수 없습니다" })).toBeVisible();
  await expect(page.getByText("시스템 관리자만 사용할 수 있습니다.")).toBeVisible();
});

for (const viewport of viewports) {
  test(`D17 bar lifecycle at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth?fixtures=full");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, "admin1", "AdminPass!1");
    const barId = await readSelectedBarId(page);

    await page.goto(`/bars/${barId}`);
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}$`));
    await expect(page.getByRole("heading", { name: "Sample Bar" })).toBeVisible();
    await expect(page.getByLabel("현재 작업 바")).toHaveValue(barId);

    await page.getByRole("button", { name: /^비활성화$/ }).click();
    await expect(page.getByRole("dialog", { name: "바 비활성화" })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}$`));
    await page.getByRole("button", { name: "비활성화 실행" }).click();
    await expect(page.getByText("비공개 상태", { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /고객 메뉴판 데이터를 내리고 배포 성공/ })).toBeVisible();

    await page.getByRole("button", { name: /^재활성화$/ }).click();
    await expect(page.getByRole("dialog", { name: "바 재활성화" })).toBeVisible();
    await page.getByRole("button", { name: "재활성화 실행" }).click();
    await expect(page.getByText("준비 중 또는 첫 발행 전")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /준비 중 고객 메뉴판/ })).toBeVisible();

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}$`));
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`bar-lifecycle-${viewport.label}.png`),
      fullPage: true
    });
  });
}
