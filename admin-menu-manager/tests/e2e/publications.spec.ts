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

for (const viewport of viewports) {
  test(`D16 Cloudflare publication history at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth?fixtures=full");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, "admin1", "AdminPass!1");
    const barId = await readSelectedBarId(page);

    await page.goto(`/bars/${barId}/preview`);
    await expect(page.getByRole("heading", { name: "메뉴판 미리보기" })).toBeVisible();
    await page.getByRole("button", { name: "발행" }).click();
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/publications$`));

    await expect(page.getByRole("heading", { name: "발행·배포 상태" })).toBeVisible();
    await expect(page.getByText(/public\/menus\//)).toBeVisible();
    await expect(page.getByLabel("현재 작업 바")).toHaveValue(barId);
    await expect(page.getByRole("radio", { name: /메뉴북형/ })).toBeVisible();
    await page.getByRole("radio", { name: /메뉴북형/ }).check();

    await page.getByRole("button", { name: "발행 시작" }).click();
    await expect(page.getByRole("heading", { name: "저장된 메뉴판을 발행할까요?" })).toBeVisible();
    await expect(page.getByText("메뉴북형으로 고객 메뉴판을 표시합니다.")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/publications$`));
    await expect(page.getByRole("heading", { name: "저장된 메뉴판을 발행할까요?" })).toBeVisible();

    let publishPayload: unknown = null;
    await page.route(/\/api\/bars\/[^/]+\/publications$/, async (route) => {
      if (route.request().method() === "POST") {
        publishPayload = route.request().postDataJSON();
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      await route.continue();
    });
    await page.getByRole("button", { name: "확인 후 발행" }).click();
    await expect(page.getByRole("button", { name: "발행 중" })).toBeDisabled();
    await expect(page.getByText("고객 배포 완료")).toBeVisible();
    await expect(page.getByText(/반영 번호/).first()).toBeVisible();
    await expect(page.getByText("대상 반영 번호와 일치하는 고객 화면 배포가 성공했습니다.")).toBeVisible();
    expect(publishPayload).toMatchObject({ confirmSavedOnly: true, layoutConcept: "menu_book" });

    await page.getByRole("button", { name: "상세" }).click();
    const detailDialog = page.getByRole("dialog", { name: "발행 상세" });
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog.getByText("배포 상태", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "닫기" }).click();

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/publications$`));
    await expect(page.getByRole("heading", { name: "발행·배포 상태" })).toBeVisible();
    await expect(page.getByText("배포 · 성공").first()).toBeVisible();

    await page.getByRole("button", { name: "재발행" }).first().click();
    const republishConfirmation = page.getByRole("dialog", { name: /다시 발행할까요/ });
    await expect(republishConfirmation).toBeVisible();
    await expect(republishConfirmation).toBeFocused();
    const confirmationBox = await republishConfirmation.boundingBox();
    expect(confirmationBox?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((confirmationBox?.y ?? 0) + (confirmationBox?.height ?? 0)).toBeLessThanOrEqual(844);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(new RegExp(`/bars/${barId}/publications$`));
    await expect(page.getByRole("heading", { name: /다시 발행할까요/ })).toBeVisible();
    await page.getByRole("button", { name: "현재 편집본 유지 후 재발행" }).click();
    await expect(page.locator(".publication-card", { hasText: "과거 공개본 재발행" }).first()).toBeVisible();

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`publication-${viewport.label}.png`),
      fullPage: true
    });
  });
}

test("D15 menu screen publish action opens the same publications route", async ({ page }) => {
  await page.request.post("/__dev/reset-auth?fixtures=full");
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "admin1", "AdminPass!1");
  const barId = await readSelectedBarId(page);

  await page.goto(`/bars/${barId}/menus`);
  await expect(page.getByRole("heading", { name: "메뉴 관리" })).toBeVisible();
  await page.getByRole("button", { name: "발행" }).click();

  await expect(page).toHaveURL(new RegExp(`/bars/${barId}/publications$`));
  await expect(page.getByRole("heading", { name: "발행·배포 상태" })).toBeVisible();
});

test("D15 publication preview button carries the selected menu concept", async ({ page }) => {
  await page.request.post("/__dev/reset-auth?fixtures=full");
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "admin1", "AdminPass!1");
  const barId = await readSelectedBarId(page);

  await page.goto(`/bars/${barId}/publications`);
  await expect(page.getByRole("heading", { name: "발행·배포 상태" })).toBeVisible();
  await page.getByRole("radio", { name: /메뉴북형/ }).check();
  await page.getByRole("button", { name: "미리보기" }).click();

  await expect(page).toHaveURL(new RegExp(`/bars/${barId}/preview\\?layoutConcept=menu_book$`));
  await expect(page.getByRole("radio", { name: /메뉴북형/ })).toBeChecked();
  await expect(page.locator('.public-menu-renderer[data-concept="menu_book"]')).toBeVisible();
});
