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

async function readSelectedBarId(page: Page): Promise<string> {
  const response = await page.request.get("/api/dashboard");
  const body = (await response.json()) as { data: { selectedBarId: string | null; accessibleBars: Array<{ id: string; name: string }> } };
  const bar = body.data.accessibleBars.find((item) => item.id === body.data.selectedBarId) ?? body.data.accessibleBars[0];
  if (!bar) throw new Error("selected bar fixture missing");
  return bar.id;
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
  await page.getByRole("button", { name: "초안 저장" }).click();
  await expect(page.getByText("신규 메뉴 초안을 저장했습니다. 최종 저장을 눌러 D1에 반영하세요.")).toBeVisible();
  await page.getByRole("button", { name: /최종 저장 1개/ }).click();
  await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus$`));
  await expect(visibleMenuName(page, input.name, page.viewportSize()?.width ?? 1440)).toBeVisible();
}

async function saveMenuDraftThroughUi(
  page: Page,
  input: {
    name: string;
    categoryLabel: string;
    itemTypeLabel: string;
    priceLabel: string;
    amount: string;
  }
) {
  await page.getByLabel("메뉴 이름").fill(input.name);
  await page.getByLabel("메뉴 카테고리").selectOption({ label: input.categoryLabel });
  await page.getByLabel("품목 유형").selectOption({ label: input.itemTypeLabel });
  await page.getByLabel("가격 라벨 1").fill(input.priceLabel);
  const amountFields = page.getByLabel(/가격 금액/);
  const amountCount = await amountFields.count();
  for (let index = 0; index < amountCount; index += 1) {
    await amountFields.nth(index).fill(input.amount);
  }
  await page.getByRole("button", { name: "초안 저장" }).click();
  await expect(page.getByText("신규 메뉴 초안을 저장했습니다. 최종 저장을 눌러 D1에 반영하세요.")).toBeVisible();
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

function visibleMenuName(page: Page, name: string, width: number) {
  return (width < 768 ? page.locator(".data-cards") : page.locator(".data-table")).getByText(name).first();
}

function visibleMenuRow(page: Page, name: string, width: number) {
  return width < 768
    ? page.locator(".data-card").filter({ hasText: name })
    : page.locator(".menus-table tbody tr").filter({ hasText: name });
}

async function selectMenuForQuickEdit(page: Page, name: string, width: number) {
  const row = visibleMenuRow(page, name, width);
  if (width < 768) {
    await row.getByRole("button", { name: "선택" }).click();
  } else {
    await row.click();
  }
  if (width < 1400) {
    await expect(quickEditPanel(page, width)).toBeVisible();
  }
}

async function openMenuEditorFromList(page: Page, name: string, width: number) {
  const row = visibleMenuRow(page, name, width);
  if (width < 768) {
    await row.getByRole("button", { name: "상세" }).click();
    return;
  }
  await row.click();
  await quickEditPanel(page, width).getByRole("button", { name: "편집 열기" }).click();
}

function quickEditPanel(page: Page, width: number) {
  return width < 1400 ? page.getByRole("dialog", { name: "선택 메뉴" }) : page.locator(".menu-selection-panel");
}

async function closeQuickEditPanelIfDialog(page: Page, width: number) {
  if (width >= 1400) return;
  const dialog = quickEditPanel(page, width);
  if ((await dialog.count()) === 0) return;
  await dialog.getByLabel("닫기").click();
  await expect(dialog).toHaveCount(0);
}

test("menu category select follows the managed category order", async ({ page }) => {
  await page.request.post("/__dev/reset-auth");
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "admin1", "AdminPass!1");
  const barId = await createBarThroughUi(page, "Category Select Order Bar");

  await page.goto(`/bars/${barId}/categories`);
  await createRootCategory(page, "Z Order");
  await createChildCategory(page, "Z Order", "C Child");
  await createChildCategory(page, "Z Order", "B Child");
  await createRootCategory(page, "A Order");

  await page.goto(`/bars/${barId}/menus/new`);
  await expect(page.getByRole("heading", { name: "새 메뉴 등록" })).toBeVisible();
  const optionLabels = await page.locator('select[aria-label="메뉴 카테고리"] option').evaluateAll((options) =>
    options.map((option) => option.textContent?.trim() ?? "")
  );

  expect(optionLabels).toEqual(["Z Order (상위 카테고리)", "Z Order / C Child", "Z Order / B Child", "A Order"]);
});

test("D12 tablet menu list uses internal grid scroll and quick edit dialog", async ({ page }, testInfo) => {
  await page.request.post("/__dev/reset-auth?fixtures=full");
  await page.setViewportSize({ width: 1024, height: 768 });
  await login(page, "admin1", "AdminPass!1");
  const barId = await readSelectedBarId(page);

  await page.goto(`/bars/${barId}/menus`);
  await expect(page.getByRole("heading", { name: "메뉴 관리" })).toBeVisible();
  await expect(page.locator(".menu-selection-panel")).toHaveCount(0);
  const gridMetrics = await page.locator(".menus-data-view").evaluate((element) => ({
    clientWidth: element.clientWidth,
    overflowX: getComputedStyle(element).overflowX,
    scrollWidth: element.scrollWidth,
    pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth
  }));
  expect(gridMetrics.overflowX).toBe("auto");
  expect(gridMetrics.scrollWidth).toBeGreaterThan(gridMetrics.clientWidth);
  expect(gridMetrics.pageOverflows).toBe(false);

  const firstMenuName = (await page.locator(".menus-table tbody tr").first().locator(".menu-name-cell strong").innerText()).trim();
  await selectMenuForQuickEdit(page, firstMenuName, 1024);
  const dialog = quickEditPanel(page, 1024);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: firstMenuName })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("d12-tablet-dialog-scroll.png"),
    fullPage: true
  });
});

test("bulk final save clears two saved create drafts after menu list reflects them", async ({ page }) => {
  await page.request.post("/__dev/reset-auth");
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "admin1", "AdminPass!1");
  const barId = await createBarThroughUi(page, "Draft Clear Bar");

  await page.goto(`/bars/${barId}/categories`);
  await createRootCategory(page, "Draft Clear Category");

  const firstName = "초안 정리 위스키";
  const secondName = "초안 정리 칵테일";
  await page.goto(`/bars/${barId}/menus/new`);
  await saveMenuDraftThroughUi(page, {
    name: firstName,
    categoryLabel: "Draft Clear Category",
    itemTypeLabel: "위스키 · 공통",
    priceLabel: "샷",
    amount: "18000"
  });
  await expect(page.getByText(`1. ${firstName}`)).toBeVisible();
  await saveMenuDraftThroughUi(page, {
    name: secondName,
    categoryLabel: "Draft Clear Category",
    itemTypeLabel: "칵테일 · 공통",
    priceLabel: "잔",
    amount: "16000"
  });
  await expect(page.getByText(/2개 대기/)).toBeVisible();
  await expect(page.getByText(`2. ${secondName}`)).toBeVisible();

  await page.getByRole("button", { name: /최종 저장 2개/ }).click();
  await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus$`));
  await expect(page.locator(".data-table").getByText(firstName).first()).toBeVisible();
  await expect(page.locator(".data-table").getByText(secondName).first()).toBeVisible();
  await expect(
    page.evaluate((targetBarId) => window.sessionStorage.getItem(`thebar:menu-create-drafts:v1:${targetBarId}`), barId)
  ).resolves.toBeNull();

  await page.goto(`/bars/${barId}/menus/new`);
  await expect(page.getByText(/0개 대기/)).toBeVisible();
  await expect(page.getByText("대기 중인 신규 메뉴 초안이 없습니다.")).toBeVisible();
  await expect(page.getByText(`1. ${firstName}`)).toHaveCount(0);
  await expect(page.getByText(`2. ${secondName}`)).toHaveCount(0);
});

test("create draft final save shows a single validation summary", async ({ page }) => {
  await page.request.post("/__dev/reset-auth");
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "admin1", "AdminPass!1");
  const barId = await createBarThroughUi(page, "Draft Validation Bar");

  await page.goto(`/bars/${barId}/categories`);
  await createRootCategory(page, "검증");
  await createChildCategory(page, "검증", "싱글몰트");

  await page.goto(`/bars/${barId}/menus/new`);
  await saveMenuDraftThroughUi(page, {
    name: "임시 검증 메뉴",
    categoryLabel: "검증 / 싱글몰트",
    itemTypeLabel: "위스키 · 공통",
    priceLabel: "샷",
    amount: "18000"
  });

  await page.evaluate((currentBarId) => {
    const key = `thebar:menu-create-drafts:v1:${currentBarId}`;
    const drafts = JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as Array<{ form: { name: string } }>;
    if (drafts[0]) drafts[0].form.name = "";
    window.sessionStorage.setItem(key, JSON.stringify(drafts));
  }, barId);

  await page.reload();
  await page.getByRole("button", { name: /최종 저장 1개/ }).click();
  await expect(page.locator(".menu-editor-panel .form-summary")).toHaveCount(1);
  await expect(page.locator(".menu-editor-panel .form-status")).toHaveCount(0);
  await expect(page.getByText("입력값을 확인하세요.")).toHaveCount(1);
});

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
    await expect(page.locator(".page-return-row").getByRole("button", { name: "목록으로 가기" })).toBeVisible();
    await page.getByLabel("메뉴 이름").fill(`맥캘란 12 ${viewport.label}`);
    await page.getByLabel("메뉴 카테고리").selectOption({ label: `위스키 ${viewport.label} / 싱글몰트 ${viewport.label}` });
    await page.getByLabel("메뉴 설명").fill("셰리 캐스크\n기본 CRUD 검증");
    await page.getByLabel("품목 유형").selectOption({ label: "위스키 · 공통" });
    await page.getByLabel("ABV").fill("40.5");
    await expect(page.getByLabel("가격 라벨 1")).toHaveValue("샷");
    await expect(page.getByLabel("대표 가격 1")).toBeChecked();
    await expect(page.getByLabel("대표 가격 2")).not.toBeChecked();
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
    await expect(page.getByLabel("대표 가격 1")).toBeChecked();
    await expect(page.getByLabel("브랜드·증류소")).toHaveValue("Macallan");
    await expect(page.getByLabel("내부 메모 입력")).toHaveValue("오너 확인 재고");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({
      path: testInfo.outputPath(`menu-new-${viewport.label}.png`),
      fullPage: true
    });

    await page.getByRole("button", { name: "초안 저장" }).click();
    await expect(page.getByText("신규 메뉴 초안을 저장했습니다. 최종 저장을 눌러 D1에 반영하세요.")).toBeVisible();
    await expect(page.getByText(`1. 맥캘란 12 ${viewport.label}`)).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus/new$`));
    await expect(page.getByText(`1. 맥캘란 12 ${viewport.label}`)).toBeVisible();
    await expect(page.getByText(/1개 대기/)).toBeVisible();
    await page.getByRole("button", { name: /최종 저장 1개/ }).click();
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus$`));
    await expect(page.getByRole("heading", { name: "메뉴 관리" })).toBeVisible();
    await expect(visibleMenuName(page, `맥캘란 12 ${viewport.label}`, viewport.width)).toBeVisible();
    await openMenuEditorFromList(page, `맥캘란 12 ${viewport.label}`, viewport.width);
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus/[^/]+$`));
    await expect(page.getByRole("heading", { name: "메뉴 기본 정보" })).toBeVisible();
    await expect(page.locator(".page-return-row").getByRole("button", { name: "목록으로 가기" })).toBeVisible();
    await expect(page.getByLabel("가격 금액 1")).toHaveValue("18000");
    await expect(page.getByLabel("대표 가격 1")).toBeChecked();
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

    await page.getByRole("button", { name: "목록", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus$`));
    await expect(page.getByRole("heading", { name: "메뉴 관리" })).toBeVisible();
    await page.getByLabel("메뉴 검색").fill("맥캘란");
    const editedMenuName =
      viewport.width < 768
        ? page.locator(".data-cards").getByText(`맥캘란 12 수정 ${viewport.label}`).first()
        : page.locator(".data-table").getByText(`맥캘란 12 수정 ${viewport.label}`).first();
    await expect(editedMenuName).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus$`));
    await expect(page.getByLabel("메뉴 검색")).toHaveValue("맥캘란");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({
      path: testInfo.outputPath(`menus-list-${viewport.label}.png`),
      fullPage: true
    });

    await openMenuEditorFromList(page, `맥캘란 12 수정 ${viewport.label}`, viewport.width);
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
    await expect(page.locator(".menu-list-metrics span")).toHaveCount(4);
    await expect(page.locator(".menu-category-rail")).toBeVisible();
    if (viewport.width >= 1400) {
      await expect(page.locator(".menu-selection-panel")).toBeVisible();
    } else {
      await expect(page.locator(".menu-selection-panel")).toHaveCount(0);
    }
    await expect(page.locator(".menu-list-inspector")).toHaveCount(0);
    await expect(page.locator(".menu-bulk-panel")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "목록 변경 저장" })).toBeDisabled();
    if (viewport.width >= 768) {
      const headers = await page.locator(".menus-table thead th").evaluateAll((cells) =>
        cells.map((cell) => cell.textContent?.trim() ?? "")
      );
      expect(headers).toEqual(["노출순서", "카테고리", "메뉴명", "가격", "배지", "상태", "노출"]);
    }
    await selectMenuForQuickEdit(page, macallanName, viewport.width);
    const macallanPanel = quickEditPanel(page, viewport.width);
    await expect(macallanPanel.getByRole("heading", { name: macallanName })).toBeVisible();
    await macallanPanel.getByLabel(`${macallanName} 판매 상태 빠른 변경`).selectOption("sold_out");
    await macallanPanel.getByLabel(`${macallanName} 노출 빠른 변경`).uncheck();
    await macallanPanel.getByLabel(`${macallanName} 카테고리 빠른 변경`).selectOption({ label: `칵테일 D12 ${viewport.label}` });
    await macallanPanel.getByLabel(`${macallanName} 배지 추가 선택`).selectOption("system:system-badge-recommended");
    await macallanPanel.getByRole("button", { name: "배지 추가" }).click();
    await closeQuickEditPanelIfDialog(page, viewport.width);
    await selectMenuForQuickEdit(page, negroniName, viewport.width);
    const negroniPanel = quickEditPanel(page, viewport.width);
    await expect(negroniPanel.getByRole("heading", { name: negroniName })).toBeVisible();
    await negroniPanel.getByLabel(`${negroniName} 판매 상태 빠른 변경`).selectOption("sold_out");
    await negroniPanel.getByLabel(`${negroniName} 노출 빠른 변경`).uncheck();
    await negroniPanel.getByLabel(`${negroniName} 배지 추가 선택`).selectOption("system:system-badge-recommended");
    await negroniPanel.getByRole("button", { name: "배지 추가" }).click();
    await closeQuickEditPanelIfDialog(page, viewport.width);
    await expect(page.locator(".menus-toolbar .status-badge").filter({ hasText: "미저장 2개" })).toBeVisible();
    await expect(page.getByRole("button", { name: "목록 변경 저장" })).toBeEnabled();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/menus$`));
    await selectMenuForQuickEdit(page, macallanName, 390);
    const compactPanel = quickEditPanel(page, 390);
    await expect(compactPanel.getByLabel(`${macallanName} 판매 상태 빠른 변경`)).toHaveValue("sold_out");
    await expect(compactPanel.getByLabel(`${macallanName} 노출 빠른 변경`)).not.toBeChecked();
    await expect(page.locator(".menus-toolbar .status-badge").filter({ hasText: "미저장 2개" })).toBeVisible();
    await closeQuickEditPanelIfDialog(page, 390);
    await page.screenshot({
      path: testInfo.outputPath(`d12-bulk-draft-${viewport.label}.png`),
      fullPage: true
    });

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.getByRole("button", { name: "목록 변경 저장" }).click();
    await expect(page.getByText("2개 메뉴를 저장했습니다.")).toBeVisible();
    await page.getByLabel("판매 상태 필터").selectOption("sold_out");
    await page.getByLabel("노출 필터").selectOption("hidden");
    await page.getByLabel("배지 필터").selectOption("system:system-badge-recommended");
    await expect(visibleMenuName(page, macallanName, viewport.width)).toBeVisible();
    await expect(visibleMenuName(page, negroniName, viewport.width)).toBeVisible();
    await page.locator(".menu-category-rail-item").filter({ hasText: `칵테일 D12 ${viewport.label}` }).click();
    await expect(page.locator(".menu-category-rail-item[data-selected='true']")).toContainText(`칵테일 D12 ${viewport.label}`);
    await expect(visibleMenuName(page, macallanName, viewport.width)).toBeVisible();
    await expect(visibleMenuName(page, negroniName, viewport.width)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`d12-bulk-saved-${viewport.label}.png`),
      fullPage: true
    });
  });
}
