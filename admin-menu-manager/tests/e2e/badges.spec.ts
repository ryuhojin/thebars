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
        if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
          const labelRect = element.closest("label")?.getBoundingClientRect();
          if (labelRect && labelRect.height >= 44 && labelRect.width >= 44) return null;
        }
        const rect = element.getBoundingClientRect();
        return { text: element.textContent?.trim() ?? element.getAttribute("aria-label") ?? "", height: rect.height };
      })
      .filter((item): item is { text: string; height: number } => item !== null)
      .filter((item) => item.height > 0 && item.height < 44)
  );
  expect(smallTargets).toEqual([]);
}

for (const viewport of viewports) {
  test(`D08 badge and color management at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, "admin1", "AdminPass!1");
    await createBarThroughUi(page, `Badges Bar ${viewport.label}`);

    await page.goto("/system/badges");
    await expect(page).toHaveURL(/\/system\/badges$/);
    await expect(page.getByRole("heading", { name: "배지·색상 관리" })).toBeVisible();

    await page.getByRole("button", { name: "허용 색상" }).click();
    await page.getByRole("button", { name: "새 색상" }).click();
    await page.getByLabel("색상 이름").fill(`Accent ${viewport.label}`);
    await page.getByLabel("색상 HEX").fill("#4F46E5");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(/\/system\/badges$/);
    await expect(page.getByRole("button", { name: "허용 색상" })).toHaveClass(/is-active/);
    await expect(page.getByLabel("색상 HEX")).toHaveValue("#4F46E5");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({
      path: testInfo.outputPath(`badge-color-form-${viewport.label}.png`),
      fullPage: true
    });

    await page.getByRole("button", { name: "색상 추가" }).click();
    await expect(page.getByText("허용 색상을 저장했습니다.")).toBeVisible();

    await page.getByRole("button", { name: "배지", exact: true }).click();
    await page.getByRole("button", { name: "새 공통 배지" }).click();
    await page.getByLabel("공통 배지 이름").fill(`스페셜 ${viewport.label}`);
    await page.getByLabel("공통 배지 색상").selectOption({ label: `Accent ${viewport.label} · #4F46E5` });
    await page.getByRole("button", { name: "공통 배지 추가" }).click();
    await expect(page.getByText("공통 배지를 저장했습니다.")).toBeVisible();
    await expect(page.getByText(`스페셜 ${viewport.label}`).first()).toBeVisible();

    const recommendedToggle = page.getByLabel("추천 공통 배지 표시");
    await expect(recommendedToggle).toBeVisible();
    await recommendedToggle.click();
    await expect(recommendedToggle).toBeChecked();

    await page.getByRole("button", { name: "새 전용 배지" }).click();
    await page.getByLabel("바 전용 배지 이름").fill(`오늘의 픽 ${viewport.label}`);
    await page.getByLabel("바 전용 배지 색상").selectOption({ label: `Accent ${viewport.label} · #4F46E5` });
    await page.getByRole("button", { name: "전용 배지 추가" }).click();
    await expect(page.getByText("바 전용 배지를 저장했습니다.")).toBeVisible();
    await expect(page.getByText(`오늘의 픽 ${viewport.label}`).first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(/\/system\/badges$/);
    await expect(page.getByLabel("바 선택")).toContainText(`Badges Bar ${viewport.label}`);
    await expect(page.getByText(`오늘의 픽 ${viewport.label}`).first()).toBeVisible();
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`badges-complete-${viewport.label}.png`),
      fullPage: true
    });
  });
}
