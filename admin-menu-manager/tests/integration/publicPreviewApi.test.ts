import { describe, expect, it } from "vitest";
import { createAdminApi } from "../../server/app";
import { AuthService } from "../../server/auth/authService";
import { MemoryAuthRepository } from "../../server/auth/memoryAuthRepository";
import { FastTestPasswordHasher } from "../../server/auth/passwordHasher";
import { MemoryBadgeRepository } from "../../server/badges/memoryBadgeRepository";
import { MemoryBarRepository } from "../../server/bars/memoryBarRepository";
import { MemoryCategoryRepository } from "../../server/categories/memoryCategoryRepository";
import { MemoryItemTypeRepository } from "../../server/item-types/memoryItemTypeRepository";
import { MemoryMembershipRepository } from "../../server/memberships/memoryMembershipRepository";
import { MemoryMenuItemRepository } from "../../server/menu-items/memoryMenuItemRepository";
import type { PublicMenuPreviewResponse } from "../../contracts/preview";
import type { PublicMenu } from "../../contracts/publicMenu";
import { calculatePublicMenuContentHash, parsePublicMenu } from "../../contracts/publicMenu";

const config = {
  setupToken: "setup-token",
  recoveryToken: "recovery-token"
};

type PreviewRuntime = {
  app: ReturnType<typeof createAdminApi>;
  service: AuthService;
};

type JsonObject = Record<string, unknown>;

function createRuntime(slugs = ["bar-a7k2m9", "bar-z9q8w7"]): PreviewRuntime {
  const authRepository = new MemoryAuthRepository();
  const barRepository = new MemoryBarRepository();
  const categoryRepository = new MemoryCategoryRepository();
  const itemTypeRepository = new MemoryItemTypeRepository();
  const badgeRepository = new MemoryBadgeRepository();
  const menuItemRepository = new MemoryMenuItemRepository(categoryRepository, itemTypeRepository, badgeRepository);
  const membershipRepository = new MemoryMembershipRepository();
  const hasher = new FastTestPasswordHasher();
  let slugIndex = 0;
  const service = new AuthService(authRepository, {
    passwordHasher: hasher,
    config,
    now: () => new Date("2026-06-23T00:00:00.000Z")
  });
  return {
    app: createAdminApi({
      repository: authRepository,
      barRepository,
      categoryRepository,
      itemTypeRepository,
      badgeRepository,
      menuItemRepository,
      membershipRepository,
      passwordHasher: hasher,
      config,
      now: () => new Date("2026-06-23T00:00:00.000Z"),
      barSlugGenerator: () => slugs[Math.min(slugIndex++, slugs.length - 1)] ?? "bar-a7k2m9"
    }),
    service
  };
}

async function readJsonObject(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function postJson(app: PreviewRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
  return app.request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { "x-csrf-token": csrf } : {})
    },
    body: JSON.stringify(body)
  });
}

async function patchJson(app: PreviewRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
  return app.request(path, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { "x-csrf-token": csrf } : {})
    },
    body: JSON.stringify(body)
  });
}

async function login(runtime: PreviewRuntime, username: string, password: string) {
  const response = await postJson(runtime.app, "/api/auth/login", { username, password });
  const cookie = setCookieHeader(response);
  return { response, cookie, csrf: csrfFromCookie(cookie) };
}

function setCookieHeader(response: Response): string {
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies = getSetCookie ? getSetCookie.call(response.headers) : [response.headers.get("set-cookie") ?? ""];
  return cookies
    .flatMap((value) => (value.includes(", bar_") ? value.split(/,\s+(?=bar_)/) : [value]))
    .map((value) => value.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

function csrfFromCookie(cookie: string): string {
  const csrf = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("bar_csrf="));
  if (!csrf) throw new Error("csrf cookie missing");
  return csrf.replace("bar_csrf=", "");
}

async function seedUser(runtime: PreviewRuntime, username: string, options: { isSystemAdmin?: boolean } = {}) {
  return runtime.service.createSeedUser({
    username,
    password: username === "admin1" ? "AdminPass!1" : "StaffPass!1",
    isSystemAdmin: options.isSystemAdmin ?? false,
    forcedPasswordChange: false
  });
}

async function createBar(runtime: PreviewRuntime, cookie: string, csrf: string, name = "Preview Bar") {
  const response = await postJson(runtime.app, "/api/bars", { name, currency: "KRW" }, cookie, csrf);
  const body = await readJsonObject(response);
  expect(response.status).toBe(201);
  return body.data as { id: string; name: string };
}

async function createCategory(
  runtime: PreviewRuntime,
  barId: string,
  cookie: string,
  csrf: string,
  body: { name: string; parentId?: string | null; description?: string; showDescription?: boolean; isVisible?: boolean }
) {
  const response = await postJson(runtime.app, `/api/bars/${barId}/categories`, body, cookie, csrf);
  const responseBody = await readJsonObject(response);
  expect(response.status).toBe(201);
  const category = ((responseBody.data as { categories: Array<{ id: string; name: string; parentId: string | null }> }).categories).find(
    (item) => item.name === body.name.trim() && item.parentId === (body.parentId ?? null)
  );
  if (!category) throw new Error(`created category ${body.name} missing`);
  return category;
}

async function createMenuItem(runtime: PreviewRuntime, barId: string, cookie: string, csrf: string, body: Record<string, unknown>) {
  const response = await postJson(runtime.app, `/api/bars/${barId}/menu-items`, body, cookie, csrf);
  const responseBody = await readJsonObject(response);
  expect(response.status).toBe(201);
  const item = (responseBody.data as { item: { id: string; publicId: string } | null }).item;
  if (!item) throw new Error("created menu item missing");
  return item;
}

async function seedPreviewMenu(runtime: PreviewRuntime) {
  await seedUser(runtime, "admin1", { isSystemAdmin: true });
  const staffUser = await seedUser(runtime, "staff1");
  await seedUser(runtime, "other1");
  const admin = await login(runtime, "admin1", "AdminPass!1");
  const bar = await createBar(runtime, admin.cookie, admin.csrf);
  const otherBar = await createBar(runtime, admin.cookie, admin.csrf, "Other Bar");
  await postJson(runtime.app, `/api/bars/${bar.id}/members`, { userId: staffUser.id, role: "staff" }, admin.cookie, admin.csrf);
  const staff = await login(runtime, "staff1", "StaffPass!1");
  const other = await login(runtime, "other1", "StaffPass!1");

  await patchJson(
    runtime.app,
    `/api/bars/${bar.id}/settings`,
    {
      name: "Preview Bar",
      description: "Public intro",
      address: "Seoul",
      mapUrl: "https://maps.example.com/preview",
      phoneNumberDigits: "0212345678",
      openingNote: "18:00-02:00",
      currency: "KRW",
      businessHours: [{ dayOfWeek: 5, opensAt: "18:00", closesAt: "02:00" }],
      links: [{ label: "Instagram", url: "https://example.com/preview" }]
    },
    admin.cookie,
    admin.csrf
  );
  const visible = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, {
    name: "추천",
    description: "추천 설명",
    showDescription: true
  });
  const empty = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "빈 카테고리" });
  const hidden = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "숨김", isVisible: false });

  const available = await createMenuItem(runtime, bar.id, admin.cookie, admin.csrf, {
    categoryId: visible.id,
    name: "맥캘란 12",
    description: "셰리 오크",
    abv: 40,
    itemType: { source: "system", id: "system-type-whisky" },
    prices: [{ label: "샷", volumeText: "30ml", amountMinor: 18000 }],
    details: {
      template: "whisky",
      brand: "Macallan",
      country: "Scotland",
      region: "Speyside",
      classification: "",
      ageStatement: "12Y",
      caskFinish: "",
      vintageOrDistilledYear: "",
      singleCask: false,
      caskStrength: false,
      nonChillFiltered: false
    },
    internalMemo: "do not publish"
  });
  const soldOut = await createMenuItem(runtime, bar.id, admin.cookie, admin.csrf, {
    categoryId: visible.id,
    name: "네그로니",
    description: "비터 칵테일",
    saleStatus: "sold_out",
    itemType: { source: "system", id: "system-type-cocktail" },
    prices: [{ label: "잔", amountMinor: 15000 }]
  });
  await createMenuItem(runtime, bar.id, admin.cookie, admin.csrf, {
    categoryId: hidden.id,
    name: "숨김 메뉴",
    description: "hidden",
    isVisible: false,
    prices: [{ label: "잔", amountMinor: 1 }],
    internalMemo: "hidden memo"
  });
  const bulk = await postJson(
    runtime.app,
    `/api/bars/${bar.id}/menu-items/bulk`,
    {
      expectedCount: 2,
      changes: [
        { menuItemId: available.id, badges: [{ source: "system", id: "system-badge-recommended" }] },
        { menuItemId: soldOut.id, badges: [{ source: "system", id: "system-badge-signature" }] }
      ]
    },
    admin.cookie,
    admin.csrf
  );
  expect(bulk.status).toBe(200);
  return { bar, otherBar, admin, staff, other, empty };
}

describe("D13 public preview API", () => {
  it("requires authentication", async () => {
    const runtime = createRuntime();

    const response = await runtime.app.request("/api/bars/bar-1/preview");

    expect(response.status).toBe(401);
    expect(await readJsonObject(response)).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
  });

  it("builds schema-valid public DTO without private fields and with stable content hash", async () => {
    const runtime = createRuntime();
    const { bar, staff } = await seedPreviewMenu(runtime);

    const first = await runtime.app.request(`/api/bars/${bar.id}/preview`, { headers: { cookie: staff.cookie } });
    const second = await runtime.app.request(`/api/bars/${bar.id}/preview`, { headers: { cookie: staff.cookie } });
    const firstBody = (await readJsonObject(first)).data as PublicMenuPreviewResponse;
    const secondBody = (await readJsonObject(second)).data as PublicMenuPreviewResponse;

    expect(first.status).toBe(200);
    const publicMenu: PublicMenu = parsePublicMenu(firstBody.menu);
    expect(firstBody.schema).toEqual({ valid: true, schemaVersion: 1 });
    expect(firstBody.hash.contentHash).toBe(secondBody.hash.contentHash);
    await expect(calculatePublicMenuContentHash(publicMenu)).resolves.toBe(firstBody.hash.contentHash);
    expect(JSON.stringify(publicMenu)).not.toMatch(/internalMemo|do not publish|userId|barId|updatedBy|숨김 메뉴|hidden memo/);
    expect(publicMenu.categories.map((category) => category.name)).toContain("빈 카테고리");
    expect(publicMenu.categories.find((category) => category.name === "숨김")).toBeUndefined();
    const items = publicMenu.categories.flatMap((category) => category.items);
    expect(items.map((item) => item.id)).toEqual(["menu_1", "menu_2"]);
    expect(items[0]).toMatchObject({
      name: "맥캘란 12",
      prices: [{ label: "샷", volumeText: "30ml", amountMinor: 18000, currency: "KRW" }],
      badges: [{ label: "추천" }]
    });
    expect(items[0]?.fields).toEqual(expect.arrayContaining([{ label: "브랜드", value: "Macallan" }]));
    expect(items[1]).toMatchObject({
      name: "네그로니",
      soldOut: true,
      prices: [],
      badges: []
    });
    expect(firstBody.scopeOptions.some((option) => option.type === "menu" && option.label.includes("맥캘란"))).toBe(true);
  });

  it("hides other tenant bars as not found", async () => {
    const runtime = createRuntime();
    const { otherBar, staff } = await seedPreviewMenu(runtime);

    const response = await runtime.app.request(`/api/bars/${otherBar.id}/preview`, { headers: { cookie: staff.cookie } });

    expect(response.status).toBe(404);
    expect(await readJsonObject(response)).toMatchObject({ error: { code: "BAR_NOT_FOUND" } });
  });
});
