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

async function createBarThroughUi(page: Page, name: string): Promise<string> {
  await page.goto("/bars/new");
  await page.getByLabel("바 이름").fill(name);
  await page.getByRole("button", { name: "생성", exact: true }).click();
  await expect(page).toHaveURL(/\/bars\/(?!new$)[^/]+$/);
  return new URL(page.url()).pathname.split("/").at(-1) ?? "";
}

async function createRootCategory(page: Page, name: string) {
  await page.getByRole("button", { name: "상위 추가" }).click();
  await page.getByLabel("카테고리 이름").fill(name);
  await page.getByRole("button", { name: "카테고리 추가" }).click();
  await expect(page.getByText("카테고리를 저장했습니다.")).toBeVisible();
}

async function selectCategory(page: Page, name: string) {
  await page.locator(".category-select-button").filter({ hasText: name }).click();
}

async function createChildCategory(page: Page, parentName: string, childName: string) {
  await selectCategory(page, parentName);
  await page.getByRole("button", { name: "하위 추가" }).click();
  await page.getByLabel("카테고리 이름").fill(childName);
  await page.getByRole("button", { name: "카테고리 추가" }).click();
  await expect(page.getByText("카테고리를 저장했습니다.")).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
}

async function expectTouchTargets(page: Page) {
  const smallTargets = await page.locator("button, input, select, textarea, a.button, .nav-link").evaluateAll((elements) =>
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
  test(`D09 category management at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, "admin1", "AdminPass!1");
    const barId = await createBarThroughUi(page, `Categories Bar ${viewport.label}`);

    await page.goto(`/bars/${barId}/categories`);
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/categories$`));
    await expect(page.getByRole("heading", { name: "카테고리 관리" })).toBeVisible();

    await createRootCategory(page, `위스키 ${viewport.label}`);
    await createChildCategory(page, `위스키 ${viewport.label}`, `싱글몰트 ${viewport.label}`);
    await createRootCategory(page, `칵테일 ${viewport.label}`);

    await selectCategory(page, `위스키 ${viewport.label}`);
    await page.getByLabel("카테고리 이름").fill(`위스키 수정 ${viewport.label}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/categories$`));
    await expect(page.getByLabel("카테고리 이름")).toHaveValue(`위스키 수정 ${viewport.label}`);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({
      path: testInfo.outputPath(`category-form-${viewport.label}.png`),
      fullPage: true
    });

    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("카테고리를 저장했습니다.")).toBeVisible();

    await page.getByRole("button", { name: new RegExp(`위스키 수정 ${viewport.label} 아래로 이동`) }).click();
    await expect(page.getByText("카테고리 순서를 저장했습니다.")).toBeVisible();

    await selectCategory(page, `싱글몰트 ${viewport.label}`);
    await page.getByLabel("다른 상위로 이동").selectOption({ label: `칵테일 ${viewport.label}` });
    await expect(page.getByText("카테고리를 이동했습니다.")).toBeVisible();

    await createRootCategory(page, `푸드 ${viewport.label}`);
    await createChildCategory(page, `푸드 ${viewport.label}`, `안주 ${viewport.label}`);
    await selectCategory(page, `푸드 ${viewport.label}`);
    await page.getByRole("button", { name: "삭제" }).click();
    await expect(page.locator(".form-status").filter({ hasText: "하위" })).toBeVisible();
    await page.getByLabel("하위 카테고리 함께 삭제 확인").check();
    await page.getByRole("button", { name: "삭제" }).click();
    await expect(page.getByText(`푸드 ${viewport.label}`)).toHaveCount(0);
    await expect(page.getByText(`안주 ${viewport.label}`)).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/categories$`));
    await expect(page.getByText(`싱글몰트 ${viewport.label}`).first()).toBeVisible();
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`categories-complete-${viewport.label}.png`),
      fullPage: true
    });
  });
}
