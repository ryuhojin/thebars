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

async function createMenuThroughUi(
  page: Page,
  barId: string,
  input: {
    name: string;
    categoryLabel: string;
    itemTypeLabel: string;
    priceLabel: string;
    amount: string;
  }
) {
  await page.goto(`/bars/${barId}/menus/new`);
  await page.getByLabel("메뉴 이름").fill(input.name);
  await page.getByLabel("메뉴 카테고리").selectOption({ label: input.categoryLabel });
  await page.getByLabel("품목 유형").selectOption({ label: input.itemTypeLabel });
  await page.getByLabel(`가격 라벨 1`).fill(input.priceLabel);
  const amountFields = page.getByLabel(/가격 금액/);
  const amountCount = await amountFields.count();
  for (let index = 0; index < amountCount; index += 1) {
    await amountFields.nth(index).fill(input.amount);
  }
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus/(?!new$)[^/]+$`));
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

function menuSelectionCheckbox(page: Page, name: string, width: number) {
  const locator = page.getByLabel(`${name} 선택`);
  return width < 768 ? locator.last() : locator.first();
}

function visibleMenuName(page: Page, name: string, width: number) {
  return (width < 768 ? page.locator(".data-cards") : page.locator(".data-table")).getByText(name).first();
}

for (const viewport of viewports) {
  test(`D11 menu price detail memo save at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, "admin1", "AdminPass!1");
    const barId = await createBarThroughUi(page, `Menus Bar ${viewport.label}`);

    await page.goto(`/bars/${barId}/categories`);
    await createRootCategory(page, `위스키 ${viewport.label}`);
    await createChildCategory(page, `위스키 ${viewport.label}`, `싱글몰트 ${viewport.label}`);
    await createRootCategory(page, `칵테일 ${viewport.label}`);

    await page.goto(`/bars/${barId}/menus/new`);
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus/new$`));
    await expect(page.getByRole("heading", { name: "새 메뉴 등록" })).toBeVisible();
    await page.getByLabel("메뉴 이름").fill(`맥캘란 12 ${viewport.label}`);
    await page.getByLabel("메뉴 카테고리").selectOption({ label: `위스키 ${viewport.label} / 싱글몰트 ${viewport.label}` });
    await page.getByLabel("메뉴 설명").fill("셰리 캐스크\n기본 CRUD 검증");
    await page.getByLabel("품목 유형").selectOption({ label: "위스키 · 공통" });
    await page.getByLabel("ABV").fill("40.5");
    await expect(page.getByLabel("가격 라벨 1")).toHaveValue("샷");
    await page.getByLabel("가격 금액 1").fill("18000");
    await page.getByLabel("가격 용량 1").fill("30ml");
    await page.getByLabel("가격 금액 2").fill("280000");
    await page.getByLabel("가격 용량 2").fill("700ml");
    await page.getByLabel("브랜드·증류소").fill("Macallan");
    await page.getByLabel("국가").fill("Scotland");
    await page.getByLabel("지역").fill("Speyside");
    await page.getByLabel("숙성 연수·NAS").fill("12Y");
    await page.getByLabel("내부 메모 입력").fill("오너 확인 재고");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus/new$`));
    await expect(page.getByLabel("메뉴 이름")).toHaveValue(`맥캘란 12 ${viewport.label}`);
    await expect(page.getByLabel("ABV")).toHaveValue("40.5");
    await expect(page.getByLabel("가격 금액 1")).toHaveValue("18000");
    await expect(page.getByLabel("브랜드·증류소")).toHaveValue("Macallan");
    await expect(page.getByLabel("내부 메모 입력")).toHaveValue("오너 확인 재고");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({
      path: testInfo.outputPath(`menu-new-${viewport.label}.png`),
      fullPage: true
    });

    await page.getByRole("button", { name: "저장" }).click();
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus/[^/]+$`));
    await expect(page.getByRole("heading", { name: "메뉴 기본 정보" })).toBeVisible();
    await expect(page.getByLabel("가격 금액 1")).toHaveValue("18000");
    await expect(page.getByLabel("브랜드·증류소")).toHaveValue("Macallan");
    await expect(page.getByLabel("내부 메모 입력")).toHaveValue("오너 확인 재고");
    const menuItemId = new URL(page.url()).pathname.split("/").at(-1) ?? "";

    await page.getByLabel("메뉴 이름").fill(`맥캘란 12 수정 ${viewport.label}`);
    await page.getByLabel("메뉴 설명").fill("품절 처리 및 카테고리 이동");
    await page.getByLabel("메뉴 카테고리").selectOption({ label: `칵테일 ${viewport.label}` });
    await page.getByLabel("ABV").fill("");
    await page.getByLabel("가격 금액 1").fill("22000");
    await page.getByLabel("브랜드·증류소").fill("Macallan Estate");
    await page.getByLabel("내부 메모 입력").fill("품절 전 재고 확인");
    await page.getByLabel("품절").check();
    await page.getByLabel("메뉴 노출").uncheck();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus/${menuItemId}$`));
    await expect(page.getByLabel("메뉴 이름")).toHaveValue(`맥캘란 12 수정 ${viewport.label}`);
    await expect(page.getByLabel("메뉴 노출")).not.toBeChecked();
    await expect(page.getByLabel("가격 금액 1")).toHaveValue("22000");
    await expect(page.getByLabel("브랜드·증류소")).toHaveValue("Macallan Estate");
    await expect(page.getByLabel("내부 메모 입력")).toHaveValue("품절 전 재고 확인");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("메뉴를 저장했습니다.")).toBeVisible();
    await expect(page.getByLabel("가격 금액 1")).toHaveValue("22000");
    await expect(page.getByLabel("브랜드·증류소")).toHaveValue("Macallan Estate");
    await expect(page.getByLabel("내부 메모 입력")).toHaveValue("품절 전 재고 확인");

    await page.getByRole("button", { name: "목록" }).click();
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus$`));
    await expect(page.getByRole("heading", { name: "메뉴 관리" })).toBeVisible();
    await page.getByLabel("메뉴 검색").fill("맥캘란");
    const visibleMenuName =
      viewport.width < 768
        ? page.locator(".data-cards").getByText(`맥캘란 12 수정 ${viewport.label}`).first()
        : page.locator(".data-table").getByText(`맥캘란 12 수정 ${viewport.label}`).first();
    await expect(visibleMenuName).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus$`));
    await expect(page.getByLabel("메뉴 검색")).toHaveValue("맥캘란");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({
      path: testInfo.outputPath(`menus-list-${viewport.label}.png`),
      fullPage: true
    });

    await page.getByRole("button", { name: "상세" }).click();
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus/${menuItemId}$`));
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "메뉴 삭제" }).click();
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus$`));
    await expect(page.getByText("등록된 메뉴가 없습니다.")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`menus-complete-${viewport.label}.png`),
      fullPage: true
    });
  });
}

for (const viewport of viewports) {
  test(`D12 menu list bulk edit badges and resize state at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, "admin1", "AdminPass!1");
    const barId = await createBarThroughUi(page, `D12 Menus ${viewport.label}`);

    await page.goto(`/bars/${barId}/categories`);
    await createRootCategory(page, `위스키 D12 ${viewport.label}`);
    await createChildCategory(page, `위스키 D12 ${viewport.label}`, `싱글몰트 D12 ${viewport.label}`);
    await createRootCategory(page, `칵테일 D12 ${viewport.label}`);

    const macallanName = `D12 맥캘란 ${viewport.label}`;
    const negroniName = `D12 네그로니 ${viewport.label}`;
    await createMenuThroughUi(page, barId, {
      name: macallanName,
      categoryLabel: `위스키 D12 ${viewport.label} / 싱글몰트 D12 ${viewport.label}`,
      itemTypeLabel: "위스키 · 공통",
      priceLabel: "샷",
      amount: "18000"
    });
    await createMenuThroughUi(page, barId, {
      name: negroniName,
      categoryLabel: `칵테일 D12 ${viewport.label}`,
      itemTypeLabel: "칵테일 · 공통",
      priceLabel: "잔",
      amount: "15000"
    });

    await page.goto(`/bars/${barId}/menus`);
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus$`));
    await expect(page.getByRole("heading", { name: "메뉴 관리" })).toBeVisible();
    await menuSelectionCheckbox(page, macallanName, viewport.width).check();
    await menuSelectionCheckbox(page, negroniName, viewport.width).check();
    await page.getByLabel("일괄 판매 상태").selectOption("sold_out");
    await page.getByLabel("일괄 노출").selectOption("hidden");
    await page.getByLabel("일괄 카테고리 이동").selectOption({ label: `칵테일 D12 ${viewport.label}` });
    const bulkPanel = page.locator(".menu-bulk-panel");
    await bulkPanel.getByLabel("일괄 배지 방식").selectOption("replace");
    await bulkPanel.getByLabel("일괄 배지 추가 선택").selectOption("system:system-badge-recommended");
    await bulkPanel.getByRole("button", { name: "배지 추가" }).click();
    await page.getByRole("button", { name: "선택 항목에 적용" }).click();
    await expect(page.getByText("2개 메뉴에 일괄 변경 초안을 적용했습니다. 최종 저장을 눌러 반영하세요.")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus$`));
    await expect(menuSelectionCheckbox(page, macallanName, 390)).toBeChecked();
    await expect(menuSelectionCheckbox(page, negroniName, 390)).toBeChecked();
    await expect(page.getByText(/미저장 변경 2개/)).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`d12-bulk-draft-${viewport.label}.png`),
      fullPage: true
    });

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.getByRole("button", { name: /최종 저장 2개/ }).click();
    await expect(page.getByText("2개 메뉴를 저장했습니다.")).toBeVisible();
    await page.getByLabel("판매 상태 필터").selectOption("sold_out");
    await page.getByLabel("노출 필터").selectOption("hidden");
    await page.getByLabel("배지 필터").selectOption("system:system-badge-recommended");
    await expect(visibleMenuName(page, macallanName, viewport.width)).toBeVisible();
    await expect(visibleMenuName(page, negroniName, viewport.width)).toBeVisible();
    await page.getByRole("button", { name: "카테고리 보기" }).click();
    await expect(page.getByRole("heading", { name: `칵테일 D12 ${viewport.label}` })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`d12-bulk-saved-${viewport.label}.png`),
      fullPage: true
    });
  });
}
