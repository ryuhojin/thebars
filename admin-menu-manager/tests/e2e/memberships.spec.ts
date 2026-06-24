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
  await page.getByRole("button", { name: /회원 관리/ }).click();
  await expect(page).toHaveURL(/\/bars\/[^/]+\/members$/);
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
}

async function expectTouchTargets(page: Page) {
  const smallTargets = await page.locator("button, input, select, summary, a.button, .nav-link").evaluateAll((elements) =>
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
  test(`D05 member add role permissions at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, "admin1", "AdminPass!1");
    await createBarThroughUi(page, `Members Bar ${viewport.label}`);

    await expect(page.getByRole("heading", { name: "바 회원·권한" })).toBeVisible();
    await expect(page.getByText("아직 회원이 없습니다.")).toBeVisible();

    await page.getByRole("button", { name: "회원 추가" }).click();
    await expect(page.getByRole("dialog", { name: "회원 추가" })).toBeVisible();
    await page.getByLabel("회원 추가 사용자 검색").fill("staff1");
    await page.getByLabel("추가할 사용자").selectOption({ label: "staff1" });
    await page.getByLabel("추가 역할").selectOption("staff");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(/\/bars\/[^/]+\/members$/);
    await expect(page.getByLabel("회원 추가 사용자 검색")).toHaveValue("staff1");
    await expect(page.getByLabel("추가 역할")).toHaveValue("staff");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({
      path: testInfo.outputPath(`member-add-${viewport.label}.png`),
      fullPage: true
    });

    await page
      .getByRole("dialog", { name: "회원 추가" })
      .getByRole("button", { name: "회원 추가", exact: true })
      .click();
    await expect(page.getByText("회원을 추가했습니다.")).toBeVisible();
    await expect(page.locator("strong:visible", { hasText: "staff1" }).first()).toBeVisible();

    await page.getByRole("button", { name: "편집" }).first().click();
    const memberEditor =
      viewport.width < 768 ? page.getByRole("dialog", { name: "회원 편집" }) : page.locator(".member-editor-inline");
    await memberEditor.getByLabel("회원 역할").selectOption("manager");
    await memberEditor.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("회원 역할을 저장했습니다.")).toBeVisible();
    await expect(page.locator("td:visible, strong:visible", { hasText: "manager" }).first()).toBeVisible();

    await page.getByLabel("staff 메뉴 편집").check();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(/\/bars\/[^/]+\/members$/);
    await expect(page.getByLabel("staff 메뉴 편집")).toBeChecked();
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.getByRole("button", { name: "권한 저장" }).click();
    await expect(page.getByText("역할별 권한을 저장했습니다.")).toBeVisible();

    await page.getByRole("button", { name: "편집" }).first().click();
    const deactivateEditor =
      viewport.width < 768 ? page.getByRole("dialog", { name: "회원 편집" }) : page.locator(".member-editor-inline");
    page.once("dialog", (dialog) => dialog.accept());
    await deactivateEditor.getByRole("button", { name: "소속 비활성화" }).click();
    await expect(page.getByText("바 소속을 비활성화했습니다.")).toBeVisible();
    await expect(page.locator(".status-badge:visible, td:visible, strong:visible", { hasText: "비활성" }).first()).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await page.screenshot({
      path: testInfo.outputPath(`members-list-${viewport.label}.png`),
      fullPage: true
    });
  });
}

test("D05 members screen blocks non-system users", async ({ page }) => {
  await page.request.post("/__dev/reset-auth");
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "admin1", "AdminPass!1");
  await createBarThroughUi(page, "Blocked Members Bar");
  const membersPath = new URL(page.url()).pathname;
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await login(page, "staff1", "StaffPass!1");
  await page.goto(membersPath);

  await expect(page).toHaveURL(new RegExp(`${membersPath}$`));
  await expect(page.getByRole("heading", { name: "접근할 수 없습니다" })).toBeVisible();
  await expect(page.getByText("시스템 관리자만 사용할 수 있습니다.")).toBeVisible();
});
