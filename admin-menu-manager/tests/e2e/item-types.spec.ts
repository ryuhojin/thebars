import { expect, test, type Locator, type Page } from "@playwright/test";

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

function sectionByHeading(page: Page, heading: string): Locator {
  return page.locator(".sub-panel").filter({ has: page.getByRole("heading", { name: heading }) }).first();
}

async function selectTypeByName(panel: Locator, name: string) {
  const rowButton = panel.getByRole("row", { name: new RegExp(name) }).getByRole("button", { name: "선택" });
  if (await rowButton.count()) {
    await rowButton.click();
    return;
  }
  await panel.locator(".data-card").filter({ hasText: name }).getByRole("button", { name: "선택" }).click();
}

async function expectTypeVisible(panel: Locator, name: string) {
  const row = panel.getByRole("row", { name: new RegExp(name) });
  if (await row.count()) {
    await expect(row).toBeVisible();
    return;
  }
  await expect(panel.locator(".data-card").filter({ hasText: name }).first()).toBeVisible();
}

for (const viewport of viewports) {
  test(`D07 system admin can add a common item type without accessible bars at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, "admin1", "AdminPass!1");

    await page.goto("/system/item-types");
    await expect(page).toHaveURL(/\/system\/item-types$/);
    await expect(page.getByText("시스템 공통 유형 저장은 시스템 관리자만 가능합니다.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "품목 유형 추가" })).toBeEnabled();

    await page.getByRole("button", { name: "품목 유형 추가" }).click();
    await expect(page.getByRole("heading", { name: "새 공통 유형" })).toBeVisible();
    await expect(page.getByText("선택: 새 유형")).toBeVisible();
    await page.getByLabel("유형 이름").fill(`논알콜 ${viewport.label}`);
    await expect(page.getByLabel("유형 이름")).toHaveValue(`논알콜 ${viewport.label}`);

    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`item-type-no-bar-create-${viewport.label}.png`),
      fullPage: true
    });
  });

  test(`D07 item type create override approve at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, "admin1", "AdminPass!1");
    await createBarThroughUi(page, `Item Types Bar ${viewport.label}`);

    await page.goto("/system/item-types");
    await expect(page).toHaveURL(/\/system\/item-types$/);
    await expect(page.getByRole("heading", { name: "품목 유형·고정 템플릿·포도 품종" })).toBeVisible();

    await page.getByRole("button", { name: "품목 유형 추가" }).click();
    await page.getByLabel("유형 이름").fill(`사케 ${viewport.label}`);
    await page.getByLabel("공통 유형 정보 템플릿").selectOption("spirit");
    await page.locator(".type-editor").getByRole("button", { name: "추가" }).click();
    await page.locator('input[aria-label="공통 유형 가격 라벨 1"]').fill("잔");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(/\/system\/item-types$/);
    await expect(page.getByLabel("유형 이름")).toHaveValue(`사케 ${viewport.label}`);
    await expect(page.locator('input[aria-label="공통 유형 가격 라벨 1"]')).toHaveValue("잔");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({
      path: testInfo.outputPath(`item-type-common-form-${viewport.label}.png`),
      fullPage: true
    });

    await page.locator(".type-editor").getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("시스템 공통 유형을 저장했습니다.")).toBeVisible();
    await expect(page.getByText(`사케 ${viewport.label}`).first()).toBeVisible();

    await page.getByRole("button", { name: "바 전용" }).click();
    const overridePanel = sectionByHeading(page, "공통 유형 숨김·가격 라벨");
    await selectTypeByName(overridePanel, "와인");
    await expect(overridePanel.locator('input[aria-label="공통 유형 조정 가격 라벨 1"]')).toBeVisible();
    await overridePanel.locator('input[aria-label="공통 유형 조정 가격 라벨 1"]').fill("잔");
    await overridePanel.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("공통 유형의 바별 숨김·가격 라벨을 저장했습니다.")).toBeVisible();

    await page.getByRole("button", { name: "바 전용 유형 추가" }).click();
    const customPanel = sectionByHeading(page, "바 전용 유형");
    await customPanel.getByLabel("유형 이름").fill(`하우스 푸드 ${viewport.label}`);
    await customPanel.getByLabel("바 전용 유형 정보 템플릿").selectOption("food");
    await customPanel.locator(".type-editor").getByRole("button", { name: "추가" }).click();
    await customPanel.locator('input[aria-label="바 전용 유형 가격 라벨 1"]').fill("접시");
    await customPanel.locator(".type-editor").getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("바 전용 유형을 저장했습니다.")).toBeVisible();
    await expectTypeVisible(customPanel, `하우스 푸드 ${viewport.label}`);

    await page.getByRole("button", { name: "포도 품종 후보" }).click();
    await page.getByLabel("후보 품종명").fill(`가메 ${viewport.label}`);
    await page.getByRole("button", { name: "후보 제출" }).click();
    await expect(page.getByText("포도 품종 후보를 제출했습니다. 승인 전까지 메뉴 입력에는 사용할 수 없습니다.")).toBeVisible();
    await page.getByRole("button", { name: new RegExp(`가메 ${viewport.label}`) }).click();
    await expect(page.getByLabel("승인 표준명")).toHaveValue(`가메 ${viewport.label}`);
    await page.getByRole("button", { name: "승인", exact: true }).click();
    await expect(page.getByText("후보를 승인하고 승인 품종 목록에 반영했습니다.")).toBeVisible();
    await expect(page.getByText(`가메 ${viewport.label}`).first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(/\/system\/item-types$/);
    await expect(page.getByRole("heading", { name: "포도 품종 승인" })).toBeVisible();
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`item-types-complete-${viewport.label}.png`),
      fullPage: true
    });
  });
}
