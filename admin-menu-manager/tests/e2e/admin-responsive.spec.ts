import { expect, test } from "@playwright/test";

const viewports = [
  { width: 390, height: 844, label: "compact" },
  { width: 768, height: 1024, label: "medium" },
  { width: 1440, height: 900, label: "wide" }
];

for (const viewport of viewports) {
  test(`admin shell smoke at ${viewport.label}`, async ({ page }, testInfo) => {
    await page.request.post("/__dev/reset-auth");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/login");
    await page.getByLabel("아이디").fill("admin1");
    await page.getByLabel("비밀번호").fill("AdminPass!1");
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/bars");

    await expect(page).toHaveURL(/\/bars$/);
    await expect(page.getByRole("heading", { name: "바 관리" })).toBeVisible();
    await expect(page.getByLabel("바 이름 검색")).toBeVisible();

    await page.getByLabel("바 이름 검색").fill("Sample Bar");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL(/\/bars$/);
    await expect(page.getByLabel("바 이름 검색")).toHaveValue("Sample Bar");

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalOverflow).toBe(false);

    const smallTargets = await page.locator("button, a.button, .nav-link").evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { text: element.textContent?.trim() ?? element.getAttribute("aria-label") ?? "", height: rect.height };
        })
        .filter((item) => item.height > 0 && item.height < 44)
    );
    expect(smallTargets).toEqual([]);

    await page.screenshot({
      path: testInfo.outputPath(`admin-shell-${viewport.label}.png`),
      fullPage: true
    });
  });
}
