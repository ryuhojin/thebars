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

const config = {
  setupToken: "setup-token",
  recoveryToken: "recovery-token"
};

type MenuItemsRuntime = {
  app: ReturnType<typeof createAdminApi>;
  service: AuthService;
};

type JsonObject = Record<string, unknown>;
type CategoryDto = {
  id: string;
  name: string;
  parentId: string | null;
};
type MenuCategoryOptionDto = {
  id: string;
  path: string;
  isLeaf: boolean;
};
type MenuItemDto = {
  id: string;
  publicId: string;
  categoryId: string;
  categoryPath: string;
  name: string;
  saleStatus: "available" | "sold_out";
  isVisible: boolean;
  abv: number | null;
  sortOrder: number;
  itemType: { id: string; source: "system" | "bar"; name: string } | null;
  prices: Array<{ label: string; volumeText: string; amountMinor: number; displayOrder: number }>;
  badges: Array<{ source: "system" | "bar"; id: string; name: string; displayOrder: number }>;
};
type MenuItemDetailDto = MenuItemDto & {
  details: Record<string, unknown> | null;
  internalMemo: string;
  canEditInternalMemo: boolean;
};

function createRuntime(slugs = ["bar-a7k2m9", "bar-f9q2x1"]): MenuItemsRuntime {
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

async function postJson(app: MenuItemsRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function patchJson(app: MenuItemsRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function deleteJson(app: MenuItemsRuntime["app"], path: string, cookie = "", csrf = "") {
  return app.request(path, {
    method: "DELETE",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { "x-csrf-token": csrf } : {})
    }
  });
}

async function login(runtime: MenuItemsRuntime, username: string, password: string) {
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

async function seedUser(runtime: MenuItemsRuntime, username: string, options: { isSystemAdmin?: boolean } = {}) {
  return runtime.service.createSeedUser({
    username,
    password: username === "admin1" ? "AdminPass!1" : "StaffPass!1",
    isSystemAdmin: options.isSystemAdmin ?? false,
    forcedPasswordChange: false
  });
}

async function createBar(runtime: MenuItemsRuntime, cookie: string, csrf: string, name: string) {
  const response = await postJson(runtime.app, "/api/bars", { name, currency: "KRW" }, cookie, csrf);
  const body = await readJsonObject(response);
  expect(response.status).toBe(201);
  return body.data as { id: string; name: string };
}

async function createCategory(
  runtime: MenuItemsRuntime,
  barId: string,
  cookie: string,
  csrf: string,
  body: { name: string; parentId?: string | null }
) {
  const response = await postJson(runtime.app, `/api/bars/${barId}/categories`, body, cookie, csrf);
  const responseBody = await readJsonObject(response);
  expect(response.status).toBe(201);
  const category = ((responseBody.data as { categories: CategoryDto[] }).categories).find((item) => item.name === body.name.trim());
  if (!category) throw new Error(`created category ${body.name} missing`);
  return category;
}

async function createMenuItem(
  runtime: MenuItemsRuntime,
  barId: string,
  cookie: string,
  csrf: string,
  body: Record<string, unknown>
) {
  const response = await postJson(runtime.app, `/api/bars/${barId}/menu-items`, body, cookie, csrf);
  const responseBody = await readJsonObject(response);
  expect(response.status).toBe(201);
  return (responseBody.data as { item: MenuItemDto }).item;
}

describe("D10 menu item API", () => {
  it("requires authentication", async () => {
    const runtime = createRuntime();

    const response = await runtime.app.request("/api/bars/bar-1/menu-items");

    expect(response.status).toBe(401);
    expect(await readJsonObject(response)).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
  });

  it("returns menu category options in the managed category tree order", async () => {
    const runtime = createRuntime();
    await seedUser(runtime, "admin1", { isSystemAdmin: true });
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Category Order Bar");
    const zRoot = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "Z Root" });
    const cChild = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "C Child", parentId: zRoot.id });
    const bChild = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "B Child", parentId: zRoot.id });
    const aRoot = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "A Root" });

    const rootReorder = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/categories/reorder`,
      { parentId: null, orderedIds: [zRoot.id, aRoot.id] },
      admin.cookie,
      admin.csrf
    );
    expect(rootReorder.status).toBe(200);
    const childReorder = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/categories/reorder`,
      { parentId: zRoot.id, orderedIds: [cChild.id, bChild.id] },
      admin.cookie,
      admin.csrf
    );
    expect(childReorder.status).toBe(200);

    const response = await runtime.app.request(`/api/bars/${bar.id}/menu-items`, { headers: { cookie: admin.cookie } });
    const body = await readJsonObject(response);
    expect(response.status).toBe(200);

    const categories = (body.data as { categories: MenuCategoryOptionDto[] }).categories;
    expect(categories.map((category) => category.path)).toEqual(["Z Root", "Z Root / C Child", "Z Root / B Child", "A Root"]);
  });

  it("creates, updates, moves, and permanently deletes basic menu items", async () => {
    const runtime = createRuntime();
    await seedUser(runtime, "admin1", { isSystemAdmin: true });
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Sample Bar");
    const whisky = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "위스키" });
    const singleMalt = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "싱글몰트", parentId: whisky.id });
    const cocktails = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "칵테일" });

    const invalid = await postJson(runtime.app, `/api/bars/${bar.id}/menu-items`, { name: "" }, admin.cookie, admin.csrf);
    expect(invalid.status).toBe(400);
    expect(await readJsonObject(invalid)).toMatchObject({ error: { code: "INPUT_INVALID" } });

    const nonLeaf = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items`,
      { categoryId: whisky.id, name: "글렌피딕 12" },
      admin.cookie,
      admin.csrf
    );
    expect(nonLeaf.status).toBe(409);
    expect(await readJsonObject(nonLeaf)).toMatchObject({ error: { code: "MENU_CATEGORY_NOT_LEAF" } });

    const macallan = await createMenuItem(runtime, bar.id, admin.cookie, admin.csrf, {
      categoryId: singleMalt.id,
      name: "맥캘란 12",
      description: "셰리 캐스크",
      itemType: { source: "system", id: "system-type-whisky" },
      abv: 40.5
    });
    expect(macallan).toMatchObject({
      publicId: "menu_1",
      categoryPath: "위스키 / 싱글몰트",
      saleStatus: "available",
      isVisible: true,
      abv: 40.5,
      itemType: expect.objectContaining({ id: "system-type-whisky" })
    });

    const deactivateUsedType = await patchJson(
      runtime.app,
      "/api/system/item-types/system-type-whisky",
      { name: "위스키", template: "whisky", defaultPriceLabels: ["샷", "보틀"], isActive: false },
      admin.cookie,
      admin.csrf
    );
    expect(deactivateUsedType.status).toBe(409);
    expect(await readJsonObject(deactivateUsedType)).toMatchObject({ error: { code: "ITEM_TYPE_IN_USE" } });

    const duplicate = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items`,
      { categoryId: singleMalt.id, name: " 맥캘란   12 " },
      admin.cookie,
      admin.csrf
    );
    expect(duplicate.status).toBe(409);
    expect(await readJsonObject(duplicate)).toMatchObject({ error: { code: "MENU_NAME_EXISTS" } });

    const negroni = await createMenuItem(runtime, bar.id, admin.cookie, admin.csrf, {
      categoryId: cocktails.id,
      name: "네그로니"
    });
    expect(negroni.publicId).toBe("menu_2");

    const updated = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items/${macallan.id}`,
      {
        categoryId: cocktails.id,
        name: "맥캘란 12 더블 캐스크",
        description: "판매 중지 예정",
        saleStatus: "sold_out",
        isVisible: false,
        abv: null,
        itemType: null
      },
      admin.cookie,
      admin.csrf
    );
    const updateBody = await readJsonObject(updated);
    expect(updated.status).toBe(200);
    expect(updateBody).toMatchObject({
      data: {
        item: {
          id: macallan.id,
          categoryId: cocktails.id,
          categoryPath: "칵테일",
          name: "맥캘란 12 더블 캐스크",
          saleStatus: "sold_out",
          isVisible: false,
          abv: null,
          itemType: null,
          sortOrder: 0
        },
        items: expect.arrayContaining([expect.objectContaining({ id: negroni.id, categoryId: cocktails.id, sortOrder: 1 })])
      }
    });

    const childUnderMenuParent = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/categories`,
      { name: "클래식", parentId: cocktails.id },
      admin.cookie,
      admin.csrf
    );
    expect(childUnderMenuParent.status).toBe(409);
    expect(await readJsonObject(childUnderMenuParent)).toMatchObject({ error: { code: "CATEGORY_PARENT_HAS_MENU" } });

    const deleteResponse = await deleteJson(runtime.app, `/api/bars/${bar.id}/menu-items/${macallan.id}`, admin.cookie, admin.csrf);
    expect(deleteResponse.status).toBe(200);
    expect(await readJsonObject(deleteResponse)).toMatchObject({ data: { deleted: true } });

    const readDeleted = await runtime.app.request(`/api/bars/${bar.id}/menu-items/${macallan.id}`, { headers: { cookie: admin.cookie } });
    expect(readDeleted.status).toBe(404);
    expect(await readJsonObject(readDeleted)).toMatchObject({ error: { code: "MENU_ITEM_NOT_FOUND" } });
  });

  it("isolates menu reads and writes by active bar membership and menu edit permission", async () => {
    const runtime = createRuntime();
    await seedUser(runtime, "admin1", { isSystemAdmin: true });
    const managerUser = await seedUser(runtime, "manager1");
    const staffUser = await seedUser(runtime, "staff1");
    await seedUser(runtime, "other1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Sample Bar");
    const otherBar = await createBar(runtime, admin.cookie, admin.csrf, "Other Bar");
    const cocktails = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "칵테일" });
    await postJson(runtime.app, `/api/bars/${bar.id}/members`, { userId: managerUser.id, role: "manager" }, admin.cookie, admin.csrf);
    await postJson(runtime.app, `/api/bars/${bar.id}/members`, { userId: staffUser.id, role: "staff" }, admin.cookie, admin.csrf);
    const manager = await login(runtime, "manager1", "StaffPass!1");
    const staff = await login(runtime, "staff1", "StaffPass!1");
    const outsider = await login(runtime, "other1", "StaffPass!1");

    const created = await createMenuItem(runtime, bar.id, manager.cookie, manager.csrf, {
      categoryId: cocktails.id,
      name: "마티니",
      isVisible: false,
      saleStatus: "sold_out"
    });
    expect(created).toMatchObject({ name: "마티니", isVisible: false, saleStatus: "sold_out" });

    const staffRead = await runtime.app.request(`/api/bars/${bar.id}/menu-items`, { headers: { cookie: staff.cookie } });
    expect(staffRead.status).toBe(200);
    expect(await readJsonObject(staffRead)).toMatchObject({
      data: { canEdit: false, items: [expect.objectContaining({ id: created.id, isVisible: false, saleStatus: "sold_out" })] }
    });

    const staffWrite = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items`,
      { categoryId: cocktails.id, name: "권한 없음" },
      staff.cookie,
      staff.csrf
    );
    expect(staffWrite.status).toBe(403);
    expect(await readJsonObject(staffWrite)).toMatchObject({ error: { code: "BAR_PERMISSION_REQUIRED" } });

    const outsiderRead = await runtime.app.request(`/api/bars/${bar.id}/menu-items`, { headers: { cookie: outsider.cookie } });
    expect(outsiderRead.status).toBe(404);
    expect(await readJsonObject(outsiderRead)).toMatchObject({ error: { code: "BAR_NOT_FOUND" } });

    const otherBarRead = await runtime.app.request(`/api/bars/${otherBar.id}/menu-items/${created.id}`, {
      headers: { cookie: admin.cookie }
    });
    expect(otherBarRead.status).toBe(404);
    expect(await readJsonObject(otherBarRead)).toMatchObject({ error: { code: "MENU_ITEM_NOT_FOUND" } });
  });
});

describe("D11 menu item price, detail, and internal memo API", () => {
  it("bulk-creates client-side draft menu items in one final save", async () => {
    const runtime = createRuntime();
    await seedUser(runtime, "admin1", { isSystemAdmin: true });
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Draft Bulk Bar");
    const whisky = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "위스키" });
    const wine = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "와인" });

    const unauthenticated = await postJson(runtime.app, `/api/bars/${bar.id}/menu-items/bulk-create`, {
      expectedCount: 1,
      drafts: [{ clientDraftId: "draft-unauth", menuItem: { categoryId: whisky.id, name: "미인증 초안" } }]
    });
    expect(unauthenticated.status).toBe(401);
    expect(await readJsonObject(unauthenticated)).toMatchObject({ error: { code: "AUTH_REQUIRED" } });

    const duplicateDrafts = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items/bulk-create`,
      {
        expectedCount: 2,
        drafts: [
          { clientDraftId: "draft-a", menuItem: { categoryId: whisky.id, name: "중복 메뉴" } },
          { clientDraftId: "draft-b", menuItem: { categoryId: wine.id, name: " 중복   메뉴 " } }
        ]
      },
      admin.cookie,
      admin.csrf
    );
    expect(duplicateDrafts.status).toBe(409);
    expect(await readJsonObject(duplicateDrafts)).toMatchObject({ error: { code: "MENU_NAME_EXISTS" } });

    const emptyAfterDuplicate = await runtime.app.request(`/api/bars/${bar.id}/menu-items`, { headers: { cookie: admin.cookie } });
    expect(emptyAfterDuplicate.status).toBe(200);
    expect(await readJsonObject(emptyAfterDuplicate)).toMatchObject({ data: { items: [] } });

    const bulk = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items/bulk-create`,
      {
        expectedCount: 2,
        drafts: [
          {
            clientDraftId: "draft-whisky",
            menuItem: {
              categoryId: whisky.id,
              name: "라프로익 10",
              itemType: { source: "system", id: "system-type-whisky" },
              prices: [
                { label: "샷", volumeText: "30ml", amountMinor: 19000 },
                { label: "보틀", volumeText: "700ml", amountMinor: 240000 }
              ],
              details: { template: "whisky", brand: "Laphroaig", country: "Scotland", region: "Islay" },
              internalMemo: "초안에서 최종 저장"
            }
          },
          {
            clientDraftId: "draft-wine",
            menuItem: {
              categoryId: wine.id,
              name: "하우스 와인",
              itemType: { source: "system", id: "system-type-wine" },
              prices: [
                { label: "글라스", volumeText: "150ml", amountMinor: 14000 },
                { label: "바틀", volumeText: "750ml", amountMinor: 72000 }
              ],
              details: { template: "wine", producer: "THE BAR", country: "France", region: "Bordeaux" }
            }
          }
        ]
      },
      admin.cookie,
      admin.csrf
    );
    const body = await readJsonObject(bulk);
    expect(bulk.status).toBe(201);
    expect(body).toMatchObject({
      data: {
        bulk: {
          impactCount: 2,
          created: [
            expect.objectContaining({ clientDraftId: "draft-whisky", name: "라프로익 10" }),
            expect.objectContaining({ clientDraftId: "draft-wine", name: "하우스 와인" })
          ]
        },
        items: expect.arrayContaining([
          expect.objectContaining({
            name: "라프로익 10",
            prices: [
              expect.objectContaining({ label: "샷", isRepresentative: true }),
              expect.objectContaining({ label: "보틀", isRepresentative: false })
            ]
          }),
          expect.objectContaining({
            name: "하우스 와인",
            prices: [
              expect.objectContaining({ label: "글라스", isRepresentative: false }),
              expect.objectContaining({ label: "바틀", isRepresentative: true })
            ]
          })
        ])
      }
    });
  });

  it("saves prices, fixed template details, and owner-only internal memo", async () => {
    const runtime = createRuntime();
    await seedUser(runtime, "admin1", { isSystemAdmin: true });
    const managerUser = await seedUser(runtime, "manager1");
    const ownerUser = await seedUser(runtime, "owner1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "D11 Bar");
    const whisky = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "위스키" });
    await postJson(runtime.app, `/api/bars/${bar.id}/members`, { userId: managerUser.id, role: "manager" }, admin.cookie, admin.csrf);
    await postJson(runtime.app, `/api/bars/${bar.id}/members`, { userId: ownerUser.id, role: "owner" }, admin.cookie, admin.csrf);
    const manager = await login(runtime, "manager1", "StaffPass!1");
    const owner = await login(runtime, "owner1", "StaffPass!1");

    const created = await createMenuItem(runtime, bar.id, owner.cookie, owner.csrf, {
      categoryId: whisky.id,
      name: "라가불린 16",
      itemType: { source: "system", id: "system-type-whisky" },
      prices: [
        { label: "샷", volumeText: "30ml", amountMinor: 18000 },
        { label: "보틀", volumeText: "700ml", amountMinor: 280000 }
      ],
      details: {
        template: "whisky",
        brand: "Lagavulin",
        country: "Scotland",
        region: "Islay",
        classification: "Single Malt",
        ageStatement: "16Y",
        caskStrength: false
      },
      internalMemo: "희소 재고"
    });
    expect(created.prices).toEqual([
      expect.objectContaining({ label: "샷", volumeText: "30ml", amountMinor: 18000, displayOrder: 0, isRepresentative: true }),
      expect.objectContaining({ label: "보틀", volumeText: "700ml", amountMinor: 280000, displayOrder: 1, isRepresentative: false })
    ]);

    const wine = await createMenuItem(runtime, bar.id, owner.cookie, owner.csrf, {
      categoryId: whisky.id,
      name: "부르고뉴 피노",
      itemType: { source: "system", id: "system-type-wine" },
      prices: [
        { label: "글라스", volumeText: "150ml", amountMinor: 18000 },
        { label: "병", volumeText: "750ml", amountMinor: 120000 }
      ],
      details: {
        template: "wine",
        producer: "Sample Winery",
        country: "France",
        region: "Burgundy",
        grapeVariety: "Pinot Noir",
        vintage: "2021",
        style: "Red",
        sweetness: "",
        body: "",
        acidity: "",
        tannin: ""
      }
    });
    expect(wine.prices).toEqual([
      expect.objectContaining({ label: "글라스", isRepresentative: false }),
      expect.objectContaining({ label: "병", isRepresentative: true })
    ]);

    const read = await runtime.app.request(`/api/bars/${bar.id}/menu-items/${created.id}`, { headers: { cookie: manager.cookie } });
    const readBody = await readJsonObject(read);
    expect(read.status).toBe(200);
    expect(readBody).toMatchObject({
      data: {
        canEditInternalMemo: false,
        item: {
          id: created.id,
          internalMemo: "희소 재고",
          canEditInternalMemo: false,
          details: { template: "whisky", brand: "Lagavulin", region: "Islay" },
          prices: [
            expect.objectContaining({ label: "샷", amountMinor: 18000 }),
            expect.objectContaining({ label: "보틀", amountMinor: 280000 })
          ]
        }
      }
    });

    const managerUpdate = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items/${created.id}`,
      {
        categoryId: whisky.id,
        name: "라가불린 16",
        description: "",
        saleStatus: "available",
        isVisible: true,
        abv: null,
        itemType: { source: "system", id: "system-type-whisky" },
        prices: [{ label: "글라스", volumeText: "45ml", amountMinor: 26000 }],
        details: { template: "whisky", brand: "Lagavulin", region: "Islay", ageStatement: "16Y" }
      },
      manager.cookie,
      manager.csrf
    );
    expect(managerUpdate.status).toBe(200);
    expect(await readJsonObject(managerUpdate)).toMatchObject({
      data: { item: { prices: [expect.objectContaining({ label: "글라스", displayOrder: 0, isRepresentative: true })] } }
    });

    const managerMemo = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items/${created.id}`,
      {
        categoryId: whisky.id,
        name: "라가불린 16",
        description: "",
        saleStatus: "available",
        isVisible: true,
        abv: null,
        itemType: { source: "system", id: "system-type-whisky" },
        internalMemo: "매니저 수정"
      },
      manager.cookie,
      manager.csrf
    );
    expect(managerMemo.status).toBe(403);
    expect(await readJsonObject(managerMemo)).toMatchObject({ error: { code: "INTERNAL_MEMO_OWNER_REQUIRED" } });

    const ownerMemo = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items/${created.id}`,
      {
        categoryId: whisky.id,
        name: "라가불린 16",
        description: "",
        saleStatus: "available",
        isVisible: true,
        abv: null,
        itemType: { source: "system", id: "system-type-whisky" },
        prices: [],
        internalMemo: "오너 확인 완료"
      },
      owner.cookie,
      owner.csrf
    );
    const ownerMemoBody = await readJsonObject(ownerMemo);
    expect(ownerMemo.status).toBe(200);
    expect((ownerMemoBody.data as { item: MenuItemDetailDto }).item).toMatchObject({
      internalMemo: "오너 확인 완료",
      prices: []
    });
  });

  it("rejects invalid price input and requires confirmation before detail template reset", async () => {
    const runtime = createRuntime();
    await seedUser(runtime, "admin1", { isSystemAdmin: true });
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "D11 Validation Bar");
    const cocktails = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "칵테일" });

    const duplicatePrice = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items`,
      {
        categoryId: cocktails.id,
        name: "중복 가격",
        prices: [
          { label: "샷", amountMinor: 12000 },
          { label: " 샷 ", amountMinor: 13000 }
        ]
      },
      admin.cookie,
      admin.csrf
    );
    expect(duplicatePrice.status).toBe(400);
    expect(await readJsonObject(duplicatePrice)).toMatchObject({ error: { code: "INPUT_INVALID" } });

    const tooManyPrices = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items`,
      {
        categoryId: cocktails.id,
        name: "가격 많음",
        prices: Array.from({ length: 11 }, (_, index) => ({ label: `옵션 ${index}`, amountMinor: index }))
      },
      admin.cookie,
      admin.csrf
    );
    expect(tooManyPrices.status).toBe(400);
    expect(await readJsonObject(tooManyPrices)).toMatchObject({ error: { code: "INPUT_INVALID" } });

    const created = await createMenuItem(runtime, bar.id, admin.cookie, admin.csrf, {
      categoryId: cocktails.id,
      name: "맨해튼",
      itemType: { source: "system", id: "system-type-whisky" },
      details: { template: "whisky", brand: "Rye", country: "USA" }
    });

    const mismatch = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items/${created.id}`,
      {
        categoryId: cocktails.id,
        name: "맨해튼",
        description: "",
        saleStatus: "available",
        isVisible: true,
        abv: null,
        itemType: { source: "system", id: "system-type-cocktail" }
      },
      admin.cookie,
      admin.csrf
    );
    expect(mismatch.status).toBe(409);
    expect(await readJsonObject(mismatch)).toMatchObject({
      error: { code: "DETAIL_TEMPLATE_RESET_REQUIRED", details: { fromTemplate: "whisky", toTemplate: "cocktail" } }
    });

    const confirmed = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items/${created.id}`,
      {
        categoryId: cocktails.id,
        name: "맨해튼",
        description: "",
        saleStatus: "available",
        isVisible: true,
        abv: null,
        itemType: { source: "system", id: "system-type-cocktail" },
        confirmDetailReset: true,
        details: { template: "cocktail", baseSpirit: "Rye", method: "Stir" }
      },
      admin.cookie,
      admin.csrf
    );
    const confirmedBody = await readJsonObject(confirmed);
    expect(confirmed.status).toBe(200);
    expect((confirmedBody.data as { item: MenuItemDetailDto }).item).toMatchObject({
      itemType: expect.objectContaining({ id: "system-type-cocktail" }),
      details: { template: "cocktail", baseSpirit: "Rye", method: "Stir" }
    });
  });
});

describe("D12 menu list filters, badges, and bulk update API", () => {
  it("filters the shared list contract and bulk-saves sale, visibility, category, and badge changes", async () => {
    const runtime = createRuntime();
    await seedUser(runtime, "admin1", { isSystemAdmin: true });
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "D12 Bar");
    const whisky = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "위스키" });
    const cocktails = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "칵테일" });
    const barBadgeResponse = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/badges`,
      { name: "하우스 픽", colorId: "badge-color-forest" },
      admin.cookie,
      admin.csrf
    );
    const barBadgeBody = await readJsonObject(barBadgeResponse);
    expect(barBadgeResponse.status).toBe(201);
    const barBadge = ((barBadgeBody.data as { barBadges: Array<{ id: string; name: string }> }).barBadges).find(
      (badge) => badge.name === "하우스 픽"
    );
    if (!barBadge) throw new Error("bar badge missing");

    const macallan = await createMenuItem(runtime, bar.id, admin.cookie, admin.csrf, {
      categoryId: whisky.id,
      name: "맥캘란 12",
      description: "셰리 캐스크",
      itemType: { source: "system", id: "system-type-whisky" },
      prices: [{ label: "샷", volumeText: "30ml", amountMinor: 18000 }]
    });
    const negroni = await createMenuItem(runtime, bar.id, admin.cookie, admin.csrf, {
      categoryId: cocktails.id,
      name: "네그로니",
      itemType: { source: "system", id: "system-type-cocktail" },
      prices: [{ label: "잔", amountMinor: 16000 }]
    });
    const oldFashioned = await createMenuItem(runtime, bar.id, admin.cookie, admin.csrf, {
      categoryId: cocktails.id,
      name: "올드 패션드",
      saleStatus: "available",
      isVisible: true
    });

    const unauthenticated = await postJson(runtime.app, `/api/bars/${bar.id}/menu-items/bulk`, {
      expectedCount: 1,
      changes: [{ menuItemId: macallan.id, saleStatus: "sold_out" }]
    });
    expect(unauthenticated.status).toBe(401);
    expect(await readJsonObject(unauthenticated)).toMatchObject({ error: { code: "AUTH_REQUIRED" } });

    const bulk = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items/bulk`,
      {
        expectedCount: 2,
        changes: [
          {
            menuItemId: macallan.id,
            saleStatus: "sold_out",
            isVisible: false,
            categoryId: cocktails.id,
            badges: [
              { source: "system", id: "system-badge-recommended" },
              { source: "bar", id: barBadge.id }
            ]
          },
          {
            menuItemId: negroni.id,
            saleStatus: "sold_out",
            isVisible: false,
            badges: [{ source: "system", id: "system-badge-recommended" }]
          }
        ]
      },
      admin.cookie,
      admin.csrf
    );
    const bulkBody = await readJsonObject(bulk);
    expect(bulk.status).toBe(200);
    expect(bulkBody).toMatchObject({
      data: {
        bulk: { impactCount: 2 },
        badgeOptions: expect.arrayContaining([
          expect.objectContaining({ source: "system", id: "system-badge-recommended", name: "추천" }),
          expect.objectContaining({ source: "bar", id: barBadge.id, name: "하우스 픽" })
        ]),
        items: expect.arrayContaining([
          expect.objectContaining({
            id: macallan.id,
            categoryId: cocktails.id,
            saleStatus: "sold_out",
            isVisible: false,
            badges: [
              expect.objectContaining({ source: "system", id: "system-badge-recommended", displayOrder: 0 }),
              expect.objectContaining({ source: "bar", id: barBadge.id, displayOrder: 1 })
            ]
          }),
          expect.objectContaining({
            id: negroni.id,
            saleStatus: "sold_out",
            isVisible: false,
            badges: [expect.objectContaining({ source: "system", id: "system-badge-recommended", displayOrder: 0 })]
          })
        ])
      }
    });

    const qFilter = await runtime.app.request(`/api/bars/${bar.id}/menu-items?q=${encodeURIComponent("셰리")}`, {
      headers: { cookie: admin.cookie }
    });
    expect(qFilter.status).toBe(200);
    expect(await readJsonObject(qFilter)).toMatchObject({ data: { items: [expect.objectContaining({ id: macallan.id })] } });

    const statusFilter = await runtime.app.request(
      `/api/bars/${bar.id}/menu-items?saleStatus=sold_out&visibility=hidden&categoryId=${encodeURIComponent(cocktails.id)}`,
      { headers: { cookie: admin.cookie } }
    );
    const statusBody = await readJsonObject(statusFilter);
    expect(statusFilter.status).toBe(200);
    expect((statusBody.data as { items: MenuItemDto[] }).items.map((item) => item.id).sort()).toEqual(
      [macallan.id, negroni.id].sort()
    );
    expect((statusBody.data as { items: MenuItemDto[] }).items).toEqual([
      expect.objectContaining({ id: macallan.id, sortOrder: 0 }),
      expect.objectContaining({ id: negroni.id, sortOrder: 2 })
    ]);

    const reorder = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items/bulk`,
      {
        expectedCount: 3,
        changes: [
          { menuItemId: negroni.id, sortOrder: 0 },
          { menuItemId: macallan.id, sortOrder: 1 },
          { menuItemId: oldFashioned.id, sortOrder: 2 }
        ]
      },
      admin.cookie,
      admin.csrf
    );
    expect(reorder.status).toBe(200);
    expect(await readJsonObject(reorder)).toMatchObject({
      data: {
        bulk: { impactCount: 3 },
        items: [
          expect.objectContaining({ id: negroni.id, sortOrder: 0 }),
          expect.objectContaining({ id: macallan.id, sortOrder: 1 }),
          expect.objectContaining({ id: oldFashioned.id, sortOrder: 2 })
        ]
      }
    });

    const itemTypeFilter = await runtime.app.request(
      `/api/bars/${bar.id}/menu-items?itemTypeSource=system&itemTypeId=system-type-whisky`,
      { headers: { cookie: admin.cookie } }
    );
    expect(itemTypeFilter.status).toBe(200);
    expect(await readJsonObject(itemTypeFilter)).toMatchObject({ data: { items: [expect.objectContaining({ id: macallan.id })] } });

    const badgeFilter = await runtime.app.request(
      `/api/bars/${bar.id}/menu-items?badgeSource=bar&badgeId=${encodeURIComponent(barBadge.id)}`,
      { headers: { cookie: admin.cookie } }
    );
    expect(badgeFilter.status).toBe(200);
    expect(await readJsonObject(badgeFilter)).toMatchObject({ data: { items: [expect.objectContaining({ id: macallan.id })] } });
  });

  it("rejects invalid, conflicting, unauthorized, and cross-tenant bulk changes", async () => {
    const runtime = createRuntime();
    await seedUser(runtime, "admin1", { isSystemAdmin: true });
    const staffUser = await seedUser(runtime, "staff1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "D12 Guard Bar");
    const otherBar = await createBar(runtime, admin.cookie, admin.csrf, "D12 Other Bar");
    const parent = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "주류" });
    const leaf = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "칵테일", parentId: parent.id });
    await postJson(runtime.app, `/api/bars/${bar.id}/members`, { userId: staffUser.id, role: "staff" }, admin.cookie, admin.csrf);
    const staff = await login(runtime, "staff1", "StaffPass!1");
    const item = await createMenuItem(runtime, bar.id, admin.cookie, admin.csrf, {
      categoryId: leaf.id,
      name: "가드 메뉴"
    });

    const tooManyBadges = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items/bulk`,
      {
        expectedCount: 1,
        changes: [
          {
            menuItemId: item.id,
            badges: [
              { source: "system", id: "system-badge-recommended" },
              { source: "system", id: "system-badge-signature" },
              { source: "system", id: "system-badge-new" },
              { source: "bar", id: "extra-badge" }
            ]
          }
        ]
      },
      admin.cookie,
      admin.csrf
    );
    expect(tooManyBadges.status).toBe(400);
    expect(await readJsonObject(tooManyBadges)).toMatchObject({ error: { code: "INPUT_INVALID" } });

    const staffBulk = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items/bulk`,
      { expectedCount: 1, changes: [{ menuItemId: item.id, saleStatus: "sold_out" }] },
      staff.cookie,
      staff.csrf
    );
    expect(staffBulk.status).toBe(403);
    expect(await readJsonObject(staffBulk)).toMatchObject({ error: { code: "BAR_PERMISSION_REQUIRED" } });

    const crossTenant = await postJson(
      runtime.app,
      `/api/bars/${otherBar.id}/menu-items/bulk`,
      { expectedCount: 1, changes: [{ menuItemId: item.id, saleStatus: "sold_out" }] },
      admin.cookie,
      admin.csrf
    );
    expect(crossTenant.status).toBe(404);
    expect(await readJsonObject(crossTenant)).toMatchObject({ error: { code: "MENU_ITEM_NOT_FOUND" } });

    const impactMismatch = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items/bulk`,
      { expectedCount: 2, changes: [{ menuItemId: item.id, saleStatus: "sold_out" }] },
      admin.cookie,
      admin.csrf
    );
    expect(impactMismatch.status).toBe(409);
    expect(await readJsonObject(impactMismatch)).toMatchObject({ error: { code: "BULK_IMPACT_MISMATCH" } });

    const unavailableBadge = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items/bulk`,
      { expectedCount: 1, changes: [{ menuItemId: item.id, badges: [{ source: "bar", id: "missing-badge" }] }] },
      admin.cookie,
      admin.csrf
    );
    expect(unavailableBadge.status).toBe(409);
    expect(await readJsonObject(unavailableBadge)).toMatchObject({ error: { code: "MENU_BADGE_UNAVAILABLE" } });

    const nonLeafCategory = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/menu-items/bulk`,
      { expectedCount: 1, changes: [{ menuItemId: item.id, categoryId: parent.id }] },
      admin.cookie,
      admin.csrf
    );
    expect(nonLeafCategory.status).toBe(409);
    expect(await readJsonObject(nonLeafCategory)).toMatchObject({ error: { code: "MENU_CATEGORY_NOT_LEAF" } });
  });
});
