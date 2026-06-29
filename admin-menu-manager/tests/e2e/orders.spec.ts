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

async function readSelectedBarId(page: Page): Promise<string> {
  const response = await page.request.get("/api/dashboard");
  const body = (await response.json()) as { data: { accessibleBars: Array<{ id: string; name: string }> } };
  const bar = body.data.accessibleBars.find((item) => item.name === "Sample Bar") ?? body.data.accessibleBars[0];
  if (!bar) throw new Error("Sample Bar fixture missing");
  return bar.id;
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
        const rect = element.getBoundingClientRect();
        return { text: element.textContent?.trim() ?? element.getAttribute("aria-label") ?? "", height: rect.height };
      })
      .filter((item) => item.height > 0 && item.height < 44)
  );
  expect(smallTargets).toEqual([]);
}

async function expectOrderStatusBadgeOpticallyCentered(scope: ReturnType<Page["locator"]>) {
  const metrics = await scope.locator(".order-status-badge").filter({ hasText: "열림" }).first().evaluate((badge) => {
    const label = badge.querySelector(".order-status-badge-label");
    if (!label) throw new Error("Order status badge label is missing");
    const badgeRect = badge.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    return {
      badgeDisplay: getComputedStyle(badge).display,
      centerDelta: (labelRect.top + labelRect.height / 2) - (badgeRect.top + badgeRect.height / 2)
    };
  });
  expect(metrics.badgeDisplay).toContain("flex");
  expect(Math.abs(metrics.centerDelta)).toBeLessThanOrEqual(1.5);
}

for (const viewport of viewports) {
  test(`D21 checkout settlement cancellation summary and resize at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth?fixtures=full");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, "manager1", "ManagerPass!1");
    const barId = await readSelectedBarId(page);

    await page.goto(`/bars/${barId}/orders`);
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/orders$`));
    await expect(page.getByRole("heading", { name: "테이블 목록" })).toBeVisible();
    await expect(page.getByLabel("현재 작업 바")).toHaveValue(barId);
    const operationsSummary = page.getByLabel("테이블 운영 요약");
    await expect(operationsSummary.getByText("열린 테이블")).toBeVisible();
    await expect(operationsSummary.getByText("계산 요청 큐")).toBeVisible();
    await expect(page.locator(".orders-list-panel tr:visible, .orders-list-panel article:visible").filter({ hasText: "A1" }).first()).toBeVisible();
    await expectOrderStatusBadgeOpticallyCentered(page.locator(".orders-list-panel article:visible").filter({ hasText: "A1" }).first());
    await expect(page.locator(".orders-list-panel tr:visible, .orders-list-panel article:visible").filter({ hasText: "계산 요청" }).first()).toBeVisible();
    if (viewport.width >= 768) {
      const sidebar = page.locator(".sidebar");
      await expect(sidebar.getByRole("link", { name: /테이블 목록/ })).toBeVisible();
      await expect(sidebar.getByRole("link", { name: /정산 내역/ })).toBeVisible();
    }

    const tableLabel = `T-${viewport.label}`;
    const firstDescription = `D18 ${viewport.label} 신규`;
    await page.getByRole("button", { name: "테이블 생성", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/orders/new$`));
    await expect(page.getByRole("heading", { name: "테이블 생성" })).toBeVisible();
    await expect(page.locator(".page-return-row").getByRole("button", { name: "목록으로 가기" })).toBeVisible();
    await page.getByLabel("새 테이블 라벨").fill(tableLabel);
    await page.getByLabel("새 테이블 손님 설명").fill(firstDescription);
    await page.locator("#order-tab-create-form").getByRole("button", { name: "테이블 생성" }).click();
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/orders$`));
    await expect(page.getByText(/테이블을 열었습니다\./)).toBeVisible();
    const createdRow = page.locator(".orders-list-panel tr:visible, .orders-list-panel article:visible").filter({ hasText: tableLabel }).first();
    await expect(createdRow).toBeVisible();

    await page.getByRole("button", { name: "테이블 생성", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/orders/new$`));
    await expect(page.getByText(/테이블을 열었습니다\./)).toHaveCount(0);
    await page.locator(".page-return-row").getByRole("button", { name: "목록으로 가기" }).click();
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/orders$`));

    await createdRow.getByRole("button", { name: "정산" }).click();
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/orders/(?!new$)[^/]+$`));
    await expect(page.getByRole("tab", { name: /결제·정산/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#settlement-work-panel")).toBeVisible();
    await page.locator(".page-return-row").getByRole("button", { name: "목록으로 가기" }).click();
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/orders$`));

    const cancelTableLabel = `C-${viewport.label}`;
    await page.getByRole("button", { name: "테이블 생성", exact: true }).click();
    await page.getByLabel("새 테이블 라벨").fill(cancelTableLabel);
    await page.getByLabel("새 테이블 손님 설명").fill("목록 취소 검증");
    await page.locator("#order-tab-create-form").getByRole("button", { name: "테이블 생성" }).click();
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/orders$`));
    const cancelRow = page.locator(".orders-list-panel tr:visible, .orders-list-panel article:visible").filter({ hasText: cancelTableLabel }).first();
    await expect(cancelRow).toBeVisible();
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("테이블을 취소할까요");
      await dialog.accept();
    });
    await cancelRow.getByRole("button", { name: "취소", exact: true }).click();
    await expect(page.getByText(/테이블을 취소했습니다\./)).toBeVisible();
    await expect(page.locator(".orders-list-panel tr:visible, .orders-list-panel article:visible").filter({ hasText: cancelTableLabel })).toHaveCount(0);
    await page.getByRole("button", { name: /취소 \d+/ }).click();
    const cancelledRow = page.locator(".orders-list-panel tr:visible, .orders-list-panel article:visible").filter({ hasText: cancelTableLabel }).first();
    await expect(cancelledRow).toBeVisible();
    await expect(cancelledRow.locator(".status-badge").filter({ hasText: /^취소$/ })).toBeVisible();
    await expect(cancelledRow.getByRole("button", { name: "상세" })).toBeVisible();
    await expect(cancelledRow.getByRole("button", { name: "취소", exact: true })).toHaveCount(0);
    await expect(cancelledRow.getByRole("button", { name: "정산" })).toHaveCount(0);
    await page.getByRole("button", { name: /전체 기록 \d+/ }).click();
    const allRecordCancelledRow = page.locator(".orders-list-panel tr:visible, .orders-list-panel article:visible").filter({ hasText: cancelTableLabel }).first();
    await expect(allRecordCancelledRow).toBeVisible();
    await expect(allRecordCancelledRow.locator(".status-badge").filter({ hasText: /^취소$/ })).toBeVisible();
    await expect(allRecordCancelledRow.getByRole("button", { name: "상세" })).toBeVisible();
    await expect(allRecordCancelledRow.getByRole("button", { name: "취소", exact: true })).toHaveCount(0);
    await expect(allRecordCancelledRow.getByRole("button", { name: "정산" })).toHaveCount(0);
    await page.getByRole("button", { name: /운영 중 \d+/ }).click();
    const activeCreatedRow = page.locator(".orders-list-panel tr:visible, .orders-list-panel article:visible").filter({ hasText: tableLabel }).first();
    await expect(activeCreatedRow).toBeVisible();

    await activeCreatedRow.getByRole("button", { name: "상세" }).click();
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/orders/(?!new$)[^/]+$`));
    const orderTabId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
    await expect(page.locator(".page-return-row").getByRole("button", { name: "목록으로 가기" })).toBeVisible();
    await expect(page.getByRole("heading", { name: new RegExp(tableLabel) })).toBeVisible();
    await expect(page.getByRole("tab", { name: /주문 편집/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#order-work-panel")).toBeVisible();
    await expect(page.locator("#settlement-work-panel")).toBeHidden();
    await expect(page.locator(".orders-detail-page .hero-panel .status-box")).toHaveCount(0);
    await expect(page.getByLabel("정산 요약")).toBeVisible();
    await expect(page.getByLabel("정산 요약").getByText("메뉴 합계")).toBeVisible();
    await expect(page.locator("#order-work-panel").getByRole("button", { name: "정산 완료" })).toHaveCount(0);
    const orderLinesBox = await page.locator(".order-work-card").boundingBox();
    const addToggleBox = await page.getByRole("button", { name: "+ 메뉴 또는 기타 항목 추가" }).boundingBox();
    if (!orderLinesBox || !addToggleBox) throw new Error("Order detail layout sections are missing");
    expect(orderLinesBox.y).toBeLessThanOrEqual(addToggleBox.y + 1);
    await expect(page.locator(".orders-event-disclosure")).not.toHaveAttribute("open", "");
    await expect(page.getByLabel("테이블 이벤트")).toBeHidden();

    await page.getByRole("button", { name: "+ 메뉴 또는 기타 항목 추가" }).click();
    await expect(page.getByLabel("주문 메뉴 검색")).toBeVisible();
    const menuPickerBox = await page.locator(".order-menu-picker-panel").boundingBox();
    if (!menuPickerBox) throw new Error("Order menu picker is missing after opening add panel");
    expect(addToggleBox.y).toBeLessThanOrEqual(menuPickerBox.y + 1);

    await page.getByLabel("주문 메뉴 검색").fill("맥");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/orders/${orderTabId}$`));
    await expect(page.getByLabel("주문 메뉴 검색")).toHaveValue("맥");
    await expect(page.getByLabel("현재 작업 바")).toHaveValue(barId);

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/orders/${orderTabId}$`));
    await expect(page.getByLabel("주문 메뉴 검색")).toHaveValue("맥");

    await page.getByLabel("주문 메뉴 검색").fill("맥캘란");
    const macallanOption = page.locator("#order-menu-select option").filter({ hasText: "맥캘란 12" }).first();
    const macallanValue = await macallanOption.getAttribute("value");
    if (!macallanValue) throw new Error("맥캘란 picker option missing");
    await page.getByLabel("추가할 메뉴").selectOption(macallanValue);
    await page.getByLabel("추가할 수량").fill("2");
    await page.getByRole("button", { name: "메뉴 추가" }).click();
    await expect(page.getByText("메뉴 주문을 추가했습니다.")).toBeVisible();
    const macallanLine = page.locator(".order-line-card").filter({ hasText: "맥캘란 12" });
    await expect(macallanLine).toBeVisible();
    await expect(macallanLine.getByText("36,000 KRW")).toBeVisible();

    await page.getByLabel("맥캘란 12 수량 늘리기").click();
    await expect(macallanLine.getByText("54,000 KRW")).toBeVisible();
    await expect(page.getByLabel("맥캘란 12 현재 수량")).toHaveText("3");

    await page.getByLabel("기타 항목명").fill("커버차지");
    await page.getByLabel("기타 항목 단가").fill("5000");
    await page.getByLabel("기타 항목 수량").fill("2");
    await page.getByLabel("기타 항목 사유").fill("라이브 커버");
    await page.getByRole("button", { name: "기타 항목 추가", exact: true }).click();
    await expect(page.getByText("기타 주문 항목을 추가했습니다.")).toBeVisible();
    const coverLine = page.locator(".order-line-card").filter({ hasText: "커버차지" });
    await expect(coverLine).toBeVisible();
    await expect(coverLine.getByText("10,000 KRW")).toBeVisible();
    await expect(page.locator(".settlement-final-total").getByText("64,000 KRW")).toBeVisible();

    await page.getByLabel("조정 금액").fill("-4000");
    await page.getByLabel("금액 조정 사유").fill("단골 할인");
    await page.getByRole("button", { name: "조정 추가" }).click();
    await expect(page.getByText("금액 조정을 추가했습니다.")).toBeVisible();
    const discountLine = page.locator(".order-line-card").filter({ hasText: "단골 할인" });
    await expect(discountLine).toBeVisible();
    await expect(discountLine.locator("strong").getByText("-4,000 KRW", { exact: true })).toBeVisible();
    await expect(page.locator(".settlement-final-total").getByText("60,000 KRW")).toBeVisible();

    await page.getByLabel("금액 조정 구분").selectOption("추가금");
    await page.getByLabel("조정 금액").fill("2000");
    await page.getByLabel("금액 조정 사유").fill("잔 파손");
    await page.getByRole("button", { name: "조정 추가" }).click();
    await expect(page.getByText("금액 조정을 추가했습니다.")).toBeVisible();
    const surchargeLine = page.locator(".order-line-card").filter({ hasText: "잔 파손" });
    await expect(surchargeLine).toBeVisible();
    await expect(surchargeLine.locator("strong").getByText("2,000 KRW", { exact: true })).toBeVisible();
    await expect(page.locator(".settlement-final-total").getByText("62,000 KRW")).toBeVisible();

    await discountLine.getByRole("button", { name: "취소" }).click();
    await page.getByLabel("취소 사유", { exact: true }).fill("오입력");
    await page.getByRole("button", { name: "취소 확정" }).click();
    await expect(page.getByText("주문 항목을 취소 처리했습니다.")).toBeVisible();
    await expect(page.getByText("취소: 오입력")).toBeVisible();
    await expect(page.locator(".settlement-final-total").getByText("66,000 KRW")).toBeVisible();

    await page.getByRole("tab", { name: /결제·정산/ }).click();
    await expect(page.getByRole("tab", { name: /결제·정산/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#settlement-work-panel")).toBeVisible();
    await expect(page.locator("#order-work-panel")).toBeHidden();
    await page.locator(".order-settlement-panel").getByRole("button", { name: "계산 요청", exact: true }).click();
    await expect(page.getByText("계산 요청으로 표시했습니다.")).toBeVisible();
    await expect(page.getByText("계산 요청 중", { exact: true })).toBeVisible();
    await expect(page.locator(".order-settlement-panel").getByText("66,000 KRW")).toBeVisible();

    await page.getByLabel("정산 메모").fill(`이체 확인 ${viewport.label}`);
    await expect(page.locator(".settlement-confirm-card")).toBeVisible();
    await page.getByLabel("계좌이체 확인").check();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/orders/${orderTabId}$`));
    await expect(page.getByRole("tab", { name: /결제·정산/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("정산 메모")).toHaveValue(`이체 확인 ${viewport.label}`);
    await expect(page.getByLabel("계좌이체 확인")).toBeChecked();

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("정산 완료");
      await dialog.accept();
    });
    await page.getByRole("button", { name: "정산 완료" }).last().click();
    await expect(page.getByText("정산을 완료하고 최종 합계를 고정했습니다.")).toBeVisible();
    await expect(page.getByText("최종 합계", { exact: true })).toBeVisible();
    await expect(page.locator(".settlement-result-grid").getByText("66,000 KRW", { exact: true })).toBeVisible();
    await expect(page.getByLabel("상세 테이블 라벨")).toHaveCount(0);

    await page.goto(`/bars/${barId}/settlements`);
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/settlements$`));
    await expect(page.getByRole("heading", { name: "정산 내역" })).toBeVisible();
    await expect(page.getByText("정산 완료된 테이블만 조회합니다")).toBeVisible();
    const settledRow = page.locator(".orders-list-panel tr:visible, .orders-list-panel article:visible").filter({ hasText: tableLabel }).first();
    await expect(settledRow).toBeVisible();
    await expect(settledRow.getByText("66,000 KRW", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "테이블 생성" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "메뉴 추가" })).toHaveCount(0);

    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`orders-${viewport.label}.png`),
      fullPage: true
    });
  });

  test(`D20 staff custom adjustment actions hidden at ${viewport.label}`, async ({ page }) => {
    await page.request.post("/__dev/reset-auth?fixtures=full");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, "staff1", "StaffPass!1");
    const barId = await readSelectedBarId(page);

    await page.goto(`/bars/${barId}/orders`);
    await page.locator(".orders-list-panel tr:visible, .orders-list-panel article:visible").filter({ hasText: "A1" }).first().getByRole("button", { name: "상세" }).click();
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/orders/[^/]+$`));
    await page.getByRole("button", { name: "+ 메뉴 또는 기타 항목 추가" }).click();
    await expect(page.getByRole("heading", { name: "기타 항목·금액 조정" })).toHaveCount(0);
    await expect(page.getByLabel("기타 항목명")).toHaveCount(0);
    await expect(page.getByLabel("조정 금액")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
}
