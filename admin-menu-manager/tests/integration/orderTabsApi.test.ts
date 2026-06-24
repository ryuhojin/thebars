import { describe, expect, it } from "vitest";
import type { OrderTabDetailResponse, OrderTabsResponse } from "../../contracts/orderTabs";
import type { RolePermission } from "../../contracts/memberships";
import { createAdminApi } from "../../server/app";
import { AuthService } from "../../server/auth/authService";
import { MemoryAuthRepository } from "../../server/auth/memoryAuthRepository";
import { FastTestPasswordHasher } from "../../server/auth/passwordHasher";
import { MemoryCategoryRepository } from "../../server/categories/memoryCategoryRepository";
import { MemoryBarRepository } from "../../server/bars/memoryBarRepository";
import { MemoryMenuItemRepository } from "../../server/menu-items/memoryMenuItemRepository";
import { MemoryMembershipRepository } from "../../server/memberships/memoryMembershipRepository";
import { MemoryOrderTabRepository } from "../../server/order-tabs/memoryOrderTabRepository";
import { MemoryRateLimitRepository } from "../../server/rate-limits/memoryRateLimitRepository";
import type { RateLimitConfig } from "../../server/rate-limits/rateLimitService";

const config = {
  setupToken: "setup-token",
  recoveryToken: "recovery-token"
};

type OrderTabsRuntime = {
  app: ReturnType<typeof createAdminApi>;
  authRepository: MemoryAuthRepository;
  barRepository: MemoryBarRepository;
  categoryRepository: MemoryCategoryRepository;
  menuItemRepository: MemoryMenuItemRepository;
  membershipRepository: MemoryMembershipRepository;
  orderTabRepository: MemoryOrderTabRepository;
  rateLimitRepository: MemoryRateLimitRepository;
  service: AuthService;
};

type JsonObject = Record<string, unknown>;

function createRuntime(options: { slugs?: string[]; rateLimitConfig?: RateLimitConfig } = {}): OrderTabsRuntime {
  const authRepository = new MemoryAuthRepository();
  const barRepository = new MemoryBarRepository();
  const categoryRepository = new MemoryCategoryRepository();
  const menuItemRepository = new MemoryMenuItemRepository(categoryRepository);
  const membershipRepository = new MemoryMembershipRepository();
  const orderTabRepository = new MemoryOrderTabRepository();
  const rateLimitRepository = new MemoryRateLimitRepository();
  const hasher = new FastTestPasswordHasher();
  let slugIndex = 0;
  const slugs = options.slugs ?? ["bar-a7k2m9", "bar-f9q2x1"];
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
      menuItemRepository,
      membershipRepository,
      orderTabRepository,
      rateLimitRepository,
      rateLimitConfig: options.rateLimitConfig,
      passwordHasher: hasher,
      config,
      now: () => new Date("2026-06-23T00:00:00.000Z"),
      barSlugGenerator: () => slugs[Math.min(slugIndex++, slugs.length - 1)] ?? "bar-a7k2m9"
    }),
    authRepository,
    barRepository,
    categoryRepository,
    menuItemRepository,
    membershipRepository,
    orderTabRepository,
    rateLimitRepository,
    service
  };
}

async function seedOrderableMenu(runtime: OrderTabsRuntime, barId: string, userId: string) {
  const now = "2026-06-23T00:00:00.000Z";
  const category = await runtime.categoryRepository.createCategory({
    id: "cat-whisky",
    barId,
    parentId: null,
    name: "위스키",
    normalizedName: "위스키",
    description: "",
    showDescription: false,
    isVisible: true,
    createdByUserId: userId,
    updatedByUserId: userId,
    now
  });
  const menuItem = await runtime.menuItemRepository.createMenuItem({
    id: "menu-macallan",
    barId,
    categoryId: category.id,
    systemItemTypeId: null,
    barItemTypeId: null,
    name: "맥캘란 12",
    normalizedName: "맥캘란 12",
    description: "셰리 오크",
    internalMemo: "",
    saleStatus: "available",
    isVisible: true,
    abvBasisPoints: 4000,
    createdByUserId: userId,
    updatedByUserId: userId,
    now
  });
  const [price] = await runtime.menuItemRepository.replaceMenuItemPrices(
    barId,
    menuItem.id,
    [{ id: "price-shot", label: "샷", normalizedLabel: "샷", volumeText: "30ml", amountMinor: 18000, displayOrder: 0 }],
    userId,
    now
  );
  if (!price) throw new Error("price fixture missing");
  return { category, menuItem, price };
}

async function readJsonObject(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function getJson(app: OrderTabsRuntime["app"], path: string, cookie = "") {
  return app.request(path, {
    headers: {
      ...(cookie ? { cookie } : {})
    }
  });
}

async function postJson(app: OrderTabsRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function patchJson(app: OrderTabsRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function login(runtime: OrderTabsRuntime, username: string, password: string) {
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

async function seedSystemAdmin(runtime: OrderTabsRuntime) {
  await runtime.service.createSeedUser({
    username: "admin1",
    password: "AdminPass!1",
    isSystemAdmin: true,
    forcedPasswordChange: false
  });
}

async function seedUser(runtime: OrderTabsRuntime, username: string, password = "StaffPass!1") {
  return runtime.service.createSeedUser({
    username,
    password,
    forcedPasswordChange: false
  });
}

async function createBar(runtime: OrderTabsRuntime, cookie: string, csrf: string, name: string) {
  const response = await postJson(runtime.app, "/api/bars", { name, currency: "KRW" }, cookie, csrf);
  const body = await readJsonObject(response);
  expect(response.status).toBe(201);
  return body.data as { id: string; name: string };
}

async function addMember(runtime: OrderTabsRuntime, barId: string, userId: string, cookie: string, csrf: string, role = "staff") {
  const response = await postJson(runtime.app, `/api/bars/${barId}/members`, { userId, role }, cookie, csrf);
  expect(response.status).toBe(201);
}

async function setRolePermissions(runtime: OrderTabsRuntime, barId: string, cookie: string, csrf: string, permissions: RolePermission[]) {
  const response = await patchJson(runtime.app, `/api/bars/${barId}/role-permissions`, { permissions }, cookie, csrf);
  expect(response.status).toBe(200);
}

async function createOrderTab(runtime: OrderTabsRuntime, barId: string, cookie: string, csrf: string, tableLabel: string) {
  const response = await postJson(
    runtime.app,
    `/api/bars/${barId}/order-tabs`,
    { tableLabel, guestDescription: `${tableLabel} 손님` },
    cookie,
    csrf
  );
  const body = await readJsonObject(response);
  expect(response.status).toBe(201);
  return body.data as OrderTabDetailResponse;
}

describe("D18 order tabs API", () => {
  it("requires authentication", async () => {
    const runtime = createRuntime();

    const response = await getJson(runtime.app, "/api/bars/bar-1/order-tabs");

    expect(response.status).toBe(401);
    expect(await readJsonObject(response)).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
  });

  it("creates, lists, reads, and updates order tabs with per-bar counters and version conflicts", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const staffUser = await seedUser(runtime, "staff1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const staff = await login(runtime, "staff1", "StaffPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Sample Bar");
    const otherBar = await createBar(runtime, admin.cookie, admin.csrf, "Other Bar");
    await addMember(runtime, bar.id, staffUser.id, admin.cookie, admin.csrf);

    const invalid = await postJson(runtime.app, `/api/bars/${bar.id}/order-tabs`, { tableLabel: "" }, staff.cookie, staff.csrf);
    expect(invalid.status).toBe(400);
    expect(await readJsonObject(invalid)).toMatchObject({ error: { code: "INPUT_INVALID" } });

    const first = await createOrderTab(runtime, bar.id, staff.cookie, staff.csrf, "A1");
    const second = await createOrderTab(runtime, bar.id, staff.cookie, staff.csrf, "B2");
    expect(first.tab.tabNumber).toBe(1);
    expect(first.tab.displayCode).toBe("#1");
    expect(second.tab.tabNumber).toBe(2);
    expect(first.events[0]).toMatchObject({ type: "tab_created", resultingVersion: 1 });

    const listResponse = await getJson(runtime.app, `/api/bars/${bar.id}/order-tabs?status=open&query=A1`, staff.cookie);
    const listBody = await readJsonObject(listResponse);
    expect(listResponse.status).toBe(200);
    const list = listBody.data as OrderTabsResponse;
    expect(list.summary.open).toBe(2);
    expect(list.tabs.map((tab) => tab.tableLabel)).toEqual(["A1"]);

    const detailResponse = await getJson(runtime.app, `/api/bars/${bar.id}/order-tabs/${first.tab.id}`, staff.cookie);
    const detailBody = await readJsonObject(detailResponse);
    expect(detailResponse.status).toBe(200);
    expect(detailBody).toMatchObject({ data: { tab: { id: first.tab.id, version: 1 } } });

    const updateResponse = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${first.tab.id}`,
      { expectedVersion: 1, tableLabel: "A1", guestDescription: "창가 2명" },
      staff.cookie,
      staff.csrf
    );
    const updateBody = await readJsonObject(updateResponse);
    expect(updateResponse.status).toBe(200);
    expect(updateBody).toMatchObject({ data: { tab: { guestDescription: "창가 2명", version: 2 } } });

    const stale = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${first.tab.id}`,
      { expectedVersion: 1, tableLabel: "A1", guestDescription: "오래된 저장" },
      staff.cookie,
      staff.csrf
    );
    expect(stale.status).toBe(409);
    expect(await readJsonObject(stale)).toMatchObject({
      error: { code: "ORDER_TAB_VERSION_CONFLICT", details: { latestVersion: 2 } }
    });

    const hiddenByTenant = await getJson(runtime.app, `/api/bars/${otherBar.id}/order-tabs/${first.tab.id}`, staff.cookie);
    expect(hiddenByTenant.status).toBe(404);
    expect(await readJsonObject(hiddenByTenant)).toMatchObject({ error: { code: "BAR_NOT_FOUND" } });
  });

  it("enforces can_manage_orders role permission", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const staffUser = await seedUser(runtime, "staff1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const staff = await login(runtime, "staff1", "StaffPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Permission Bar");
    await addMember(runtime, bar.id, staffUser.id, admin.cookie, admin.csrf);
    await setRolePermissions(runtime, bar.id, admin.cookie, admin.csrf, [
      { role: "owner", canEditMenu: true, canManageOrders: true, canAddCustomOrderItem: true, canApplyOrderAdjustment: true },
      { role: "manager", canEditMenu: true, canManageOrders: true, canAddCustomOrderItem: true, canApplyOrderAdjustment: true },
      { role: "staff", canEditMenu: false, canManageOrders: false, canAddCustomOrderItem: false, canApplyOrderAdjustment: false }
    ]);

    const response = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs`,
      { tableLabel: "권한 없음" },
      staff.cookie,
      staff.csrf
    );

    expect(response.status).toBe(403);
    expect(await readJsonObject(response)).toMatchObject({ error: { code: "ORDER_PERMISSION_REQUIRED" } });
  });
});

describe("D19 order menu lines API", () => {
  it("adds menu line snapshots idempotently, updates quantity, and voids active lines only", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const staffUser = await seedUser(runtime, "staff1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const staff = await login(runtime, "staff1", "StaffPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Order Line Bar");
    await addMember(runtime, bar.id, staffUser.id, admin.cookie, admin.csrf);
    const menu = await seedOrderableMenu(runtime, bar.id, staffUser.id);
    const tab = await createOrderTab(runtime, bar.id, staff.cookie, staff.csrf, "B3");

    const invalid = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items`,
      { expectedVersion: tab.tab.version, idempotencyKey: "bad-key-1", menuItemId: menu.menuItem.id, priceId: menu.price.id, quantity: 0 },
      staff.cookie,
      staff.csrf
    );
    expect(invalid.status).toBe(400);
    expect(await readJsonObject(invalid)).toMatchObject({ error: { code: "INPUT_INVALID" } });

    const addResponse = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items`,
      {
        expectedVersion: tab.tab.version,
        idempotencyKey: "line-add-b3-macallan",
        menuItemId: menu.menuItem.id,
        priceId: menu.price.id,
        quantity: 2
      },
      staff.cookie,
      staff.csrf
    );
    const addBody = await readJsonObject(addResponse);
    expect(addResponse.status).toBe(201);
    const added = addBody.data as OrderTabDetailResponse;
    expect(added.tab).toMatchObject({ totalAmountMinor: 36000, activeItemCount: 1, version: 2 });
    expect(added.items).toHaveLength(1);
    const addedItem = added.items[0];
    if (!addedItem) throw new Error("added item missing");
    expect(addedItem).toMatchObject({
      menuItemName: "맥캘란 12",
      priceLabel: "샷",
      volumeText: "30ml",
      unitAmountMinor: 18000,
      quantity: 2,
      lineTotalAmountMinor: 36000,
      status: "active",
      version: 1
    });

    const duplicate = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items`,
      {
        expectedVersion: tab.tab.version,
        idempotencyKey: "line-add-b3-macallan",
        menuItemId: menu.menuItem.id,
        priceId: menu.price.id,
        quantity: 2
      },
      staff.cookie,
      staff.csrf
    );
    const duplicateBody = await readJsonObject(duplicate);
    expect(duplicate.status).toBe(201);
    expect((duplicateBody.data as OrderTabDetailResponse).items).toHaveLength(1);

    await runtime.menuItemRepository.replaceMenuItemPrices(
      bar.id,
      menu.menuItem.id,
      [{ id: menu.price.id, label: "샷", normalizedLabel: "샷", volumeText: "30ml", amountMinor: 99000, displayOrder: 0 }],
      staffUser.id,
      "2026-06-23T01:00:00.000Z"
    );
    const snapshotResponse = await getJson(runtime.app, `/api/bars/${bar.id}/order-tabs/${tab.tab.id}`, staff.cookie);
    const snapshot = (await readJsonObject(snapshotResponse)).data as OrderTabDetailResponse;
    const snapshotItem = snapshot.items[0];
    if (!snapshotItem) throw new Error("snapshot item missing");
    expect(snapshotItem).toMatchObject({ unitAmountMinor: 18000, lineTotalAmountMinor: 36000 });
    expect(snapshot.menuPicker.items[0]?.prices[0]).toMatchObject({ amountMinor: 99000 });

    const quantityResponse = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items/${addedItem.id}`,
      { expectedVersion: snapshot.tab.version, itemExpectedVersion: snapshotItem.version, quantity: 3 },
      staff.cookie,
      staff.csrf
    );
    const quantity = (await readJsonObject(quantityResponse)).data as OrderTabDetailResponse;
    expect(quantityResponse.status).toBe(200);
    expect(quantity.tab).toMatchObject({ totalAmountMinor: 54000, activeItemCount: 1, version: 3 });
    const quantityItem = quantity.items[0];
    if (!quantityItem) throw new Error("quantity item missing");
    expect(quantityItem).toMatchObject({ quantity: 3, lineTotalAmountMinor: 54000, version: 2 });

    const stale = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items/${addedItem.id}`,
      { expectedVersion: snapshot.tab.version, itemExpectedVersion: snapshotItem.version, quantity: 4 },
      staff.cookie,
      staff.csrf
    );
    expect(stale.status).toBe(409);
    expect(await readJsonObject(stale)).toMatchObject({ error: { code: "ORDER_TAB_VERSION_CONFLICT" } });

    const voidResponse = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items/${addedItem.id}/void`,
      { expectedVersion: quantity.tab.version, itemExpectedVersion: quantityItem.version, reason: "잘못 입력" },
      staff.cookie,
      staff.csrf
    );
    const voided = (await readJsonObject(voidResponse)).data as OrderTabDetailResponse;
    expect(voidResponse.status).toBe(200);
    expect(voided.tab).toMatchObject({ totalAmountMinor: 0, activeItemCount: 0, version: 4 });
    const voidedItem = voided.items[0];
    if (!voidedItem) throw new Error("voided item missing");
    expect(voidedItem).toMatchObject({ status: "voided", voidReason: "잘못 입력", lineTotalAmountMinor: 54000 });
    expect(voided.events.map((event) => event.type)).toContain("item_voided");

    const voidAgain = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items/${addedItem.id}/void`,
      { expectedVersion: voided.tab.version, itemExpectedVersion: voidedItem.version, reason: "다시 void" },
      staff.cookie,
      staff.csrf
    );
    expect(voidAgain.status).toBe(409);
    expect(await readJsonObject(voidAgain)).toMatchObject({ error: { code: "ORDER_ITEM_IMMUTABLE" } });
  });

  it("blocks tenant misses, closed tabs, and reused idempotency keys", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const staffUser = await seedUser(runtime, "staff1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const staff = await login(runtime, "staff1", "StaffPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Conflict Bar");
    const otherBar = await createBar(runtime, admin.cookie, admin.csrf, "Other Conflict Bar");
    await addMember(runtime, bar.id, staffUser.id, admin.cookie, admin.csrf);
    const menu = await seedOrderableMenu(runtime, bar.id, staffUser.id);
    const tab = await createOrderTab(runtime, bar.id, staff.cookie, staff.csrf, "C1");

    const first = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items`,
      { expectedVersion: tab.tab.version, idempotencyKey: "reuse-key-1", menuItemId: menu.menuItem.id, priceId: menu.price.id, quantity: 1 },
      staff.cookie,
      staff.csrf
    );
    expect(first.status).toBe(201);
    const reused = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items`,
      { expectedVersion: tab.tab.version, idempotencyKey: "reuse-key-1", menuItemId: menu.menuItem.id, priceId: menu.price.id, quantity: 2 },
      staff.cookie,
      staff.csrf
    );
    expect(reused.status).toBe(409);
    expect(await readJsonObject(reused)).toMatchObject({ error: { code: "IDEMPOTENCY_KEY_REUSED" } });

    const tenantMiss = await postJson(
      runtime.app,
      `/api/bars/${otherBar.id}/order-tabs/${tab.tab.id}/items`,
      { expectedVersion: 1, idempotencyKey: "tenant-miss", menuItemId: menu.menuItem.id, priceId: menu.price.id, quantity: 1 },
      staff.cookie,
      staff.csrf
    );
    expect(tenantMiss.status).toBe(404);

    const closed = await runtime.orderTabRepository.createOrderTab({
      id: "closed-tab",
      eventId: "closed-tab-event",
      barId: bar.id,
      tableLabel: "닫힘",
      guestDescription: "",
      status: "closed",
      currency: "KRW",
      totalAmountMinor: 0,
      activeItemCount: 0,
      createdByUserId: staffUser.id,
      now: "2026-06-23T02:00:00.000Z"
    });
    const immutable = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${closed.tab.id}/items`,
      { expectedVersion: closed.tab.version, idempotencyKey: "closed-tab", menuItemId: menu.menuItem.id, priceId: menu.price.id, quantity: 1 },
      staff.cookie,
      staff.csrf
    );
    expect(immutable.status).toBe(409);
    expect(await readJsonObject(immutable)).toMatchObject({ error: { code: "ORDER_TAB_IMMUTABLE" } });
  });
});

describe("D20 custom order items and adjustments API", () => {
  it("adds custom items and signed adjustments with idempotency, totals, and void restoration", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const managerUser = await seedUser(runtime, "manager1", "ManagerPass!1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const manager = await login(runtime, "manager1", "ManagerPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Adjustment Bar");
    await addMember(runtime, bar.id, managerUser.id, admin.cookie, admin.csrf, "manager");
    const tab = await createOrderTab(runtime, bar.id, manager.cookie, manager.csrf, "D20");

    const invalidReason = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items/custom`,
      { expectedVersion: tab.tab.version, idempotencyKey: "invalid-custom", name: "커버차지", unitAmountMinor: 5000, quantity: 1, reason: "" },
      manager.cookie,
      manager.csrf
    );
    expect(invalidReason.status).toBe(400);
    expect(await readJsonObject(invalidReason)).toMatchObject({ error: { code: "INPUT_INVALID" } });

    const customResponse = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items/custom`,
      {
        expectedVersion: tab.tab.version,
        idempotencyKey: "custom-cover-d20",
        name: "커버차지",
        unitAmountMinor: 5000,
        quantity: 2,
        reason: "라이브 커버"
      },
      manager.cookie,
      manager.csrf
    );
    const custom = (await readJsonObject(customResponse)).data as OrderTabDetailResponse;
    expect(customResponse.status).toBe(201);
    expect(custom.tab).toMatchObject({ totalAmountMinor: 10000, activeItemCount: 1, version: 2 });
    const customItem = custom.items.find((item) => item.type === "custom");
    expect(customItem).toMatchObject({
      menuItemName: "커버차지",
      priceLabel: "기타 항목",
      unitAmountMinor: 5000,
      quantity: 2,
      lineTotalAmountMinor: 10000,
      reason: "라이브 커버",
      status: "active"
    });

    const duplicateCustom = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items/custom`,
      {
        expectedVersion: tab.tab.version,
        idempotencyKey: "custom-cover-d20",
        name: "커버차지",
        unitAmountMinor: 5000,
        quantity: 2,
        reason: "라이브 커버"
      },
      manager.cookie,
      manager.csrf
    );
    const duplicateCustomBody = (await readJsonObject(duplicateCustom)).data as OrderTabDetailResponse;
    expect(duplicateCustom.status).toBe(201);
    expect(duplicateCustomBody.items.filter((item) => item.type === "custom")).toHaveLength(1);

    const discountResponse = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items/adjustments`,
      {
        expectedVersion: custom.tab.version,
        idempotencyKey: "adjust-discount-d20",
        label: "할인",
        amountMinor: -3000,
        reason: "단골 할인"
      },
      manager.cookie,
      manager.csrf
    );
    const discount = (await readJsonObject(discountResponse)).data as OrderTabDetailResponse;
    expect(discountResponse.status).toBe(201);
    expect(discount.tab).toMatchObject({ totalAmountMinor: 7000, activeItemCount: 2, version: 3 });
    const discountItem = discount.items.find((item) => item.type === "adjustment" && item.lineTotalAmountMinor < 0);
    expect(discountItem).toMatchObject({
      menuItemName: "할인",
      priceLabel: "할인",
      unitAmountMinor: -3000,
      quantity: 1,
      lineTotalAmountMinor: -3000,
      reason: "단골 할인"
    });

    const surchargeResponse = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items/adjustments`,
      {
        expectedVersion: discount.tab.version,
        idempotencyKey: "adjust-surcharge-d20",
        label: "추가금",
        amountMinor: 2000,
        reason: "잔 파손"
      },
      manager.cookie,
      manager.csrf
    );
    const surcharge = (await readJsonObject(surchargeResponse)).data as OrderTabDetailResponse;
    expect(surchargeResponse.status).toBe(201);
    expect(surcharge.tab).toMatchObject({ totalAmountMinor: 9000, activeItemCount: 3, version: 4 });

    const tooLargeDiscount = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items/adjustments`,
      {
        expectedVersion: surcharge.tab.version,
        idempotencyKey: "adjust-too-large-d20",
        label: "할인",
        amountMinor: -10000,
        reason: "초과 할인"
      },
      manager.cookie,
      manager.csrf
    );
    expect(tooLargeDiscount.status).toBe(422);
    expect(await readJsonObject(tooLargeDiscount)).toMatchObject({ error: { code: "ORDER_TOTAL_NEGATIVE" } });

    if (!discountItem) throw new Error("discount item missing");
    const voidDiscount = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items/${discountItem.id}/void`,
      { expectedVersion: surcharge.tab.version, itemExpectedVersion: discountItem.version, reason: "할인 취소" },
      manager.cookie,
      manager.csrf
    );
    const restored = (await readJsonObject(voidDiscount)).data as OrderTabDetailResponse;
    expect(voidDiscount.status).toBe(200);
    expect(restored.tab).toMatchObject({ totalAmountMinor: 12000, activeItemCount: 2, version: 5 });
    expect(restored.items.find((item) => item.id === discountItem.id)).toMatchObject({
      status: "voided",
      voidReason: "할인 취소",
      lineTotalAmountMinor: -3000
    });
    expect(restored.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["custom_item_added", "adjustment_added", "item_voided"])
    );
  });

  it("hides D20 capabilities in permissions and rejects staff default custom/adjustment actions", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const staffUser = await seedUser(runtime, "staff1");
    const managerUser = await seedUser(runtime, "manager1", "ManagerPass!1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const staff = await login(runtime, "staff1", "StaffPass!1");
    const manager = await login(runtime, "manager1", "ManagerPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Permission Adjustment Bar");
    await addMember(runtime, bar.id, staffUser.id, admin.cookie, admin.csrf, "staff");
    await addMember(runtime, bar.id, managerUser.id, admin.cookie, admin.csrf, "manager");
    const tab = await createOrderTab(runtime, bar.id, staff.cookie, staff.csrf, "Staff D20");

    const staffDetail = await getJson(runtime.app, `/api/bars/${bar.id}/order-tabs/${tab.tab.id}`, staff.cookie);
    const staffDetailBody = (await readJsonObject(staffDetail)).data as OrderTabDetailResponse;
    expect(staffDetailBody.permissions).toMatchObject({
      canManageOrders: true,
      canAddCustomOrderItem: false,
      canApplyOrderAdjustment: false
    });

    const managerDetail = await getJson(runtime.app, `/api/bars/${bar.id}/order-tabs/${tab.tab.id}`, manager.cookie);
    const managerDetailBody = (await readJsonObject(managerDetail)).data as OrderTabDetailResponse;
    expect(managerDetailBody.permissions).toMatchObject({
      canManageOrders: true,
      canAddCustomOrderItem: true,
      canApplyOrderAdjustment: true
    });

    const customForbidden = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items/custom`,
      {
        expectedVersion: tab.tab.version,
        idempotencyKey: "staff-custom-forbidden",
        name: "커버차지",
        unitAmountMinor: 5000,
        quantity: 1,
        reason: "권한 확인"
      },
      staff.cookie,
      staff.csrf
    );
    expect(customForbidden.status).toBe(403);
    expect(await readJsonObject(customForbidden)).toMatchObject({ error: { code: "ORDER_CUSTOM_ITEM_PERMISSION_REQUIRED" } });

    const adjustmentForbidden = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items/adjustments`,
      {
        expectedVersion: tab.tab.version,
        idempotencyKey: "staff-adjust-forbidden",
        label: "할인",
        amountMinor: -1000,
        reason: "권한 확인"
      },
      staff.cookie,
      staff.csrf
    );
    expect(adjustmentForbidden.status).toBe(403);
    expect(await readJsonObject(adjustmentForbidden)).toMatchObject({ error: { code: "ORDER_ADJUSTMENT_PERMISSION_REQUIRED" } });
  });
});

describe("D21 checkout, settlement, cancellation, and daily summary API", () => {
  it("rate limits new settle attempts while preserving idempotent settle retries", async () => {
    const runtime = createRuntime({
      rateLimitConfig: {
        scopes: {
          "order.settle": { maxAttempts: 1, windowMs: 60_000 }
        }
      }
    });
    await seedSystemAdmin(runtime);
    const staffUser = await seedUser(runtime, "staff1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const staff = await login(runtime, "staff1", "StaffPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Rate Limited Settlement Bar");
    await addMember(runtime, bar.id, staffUser.id, admin.cookie, admin.csrf, "staff");
    const menu = await seedOrderableMenu(runtime, bar.id, staffUser.id);
    const tab = await createOrderTab(runtime, bar.id, staff.cookie, staff.csrf, "RL1");

    const addLine = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items`,
      {
        expectedVersion: tab.tab.version,
        idempotencyKey: "rate-limit-line-add",
        menuItemId: menu.menuItem.id,
        priceId: menu.price.id,
        quantity: 1
      },
      staff.cookie,
      staff.csrf
    );
    const lineAdded = (await readJsonObject(addLine)).data as OrderTabDetailResponse;
    const checkout = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/checkout-request`,
      { expectedVersion: lineAdded.tab.version },
      staff.cookie,
      staff.csrf
    );
    const requested = (await readJsonObject(checkout)).data as OrderTabDetailResponse;

    const firstSettle = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/settle`,
      {
        expectedVersion: requested.tab.version,
        idempotencyKey: "rate-limit-settle-first",
        transferConfirmed: true
      },
      staff.cookie,
      staff.csrf
    );
    expect(firstSettle.status).toBe(200);
    const settled = (await readJsonObject(firstSettle)).data as OrderTabDetailResponse;

    const idempotentRetry = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/settle`,
      {
        expectedVersion: requested.tab.version,
        idempotencyKey: "rate-limit-settle-first",
        transferConfirmed: true
      },
      staff.cookie,
      staff.csrf
    );
    expect(idempotentRetry.status).toBe(200);
    expect((await readJsonObject(idempotentRetry)).data).toMatchObject({
      tab: { id: settled.tab.id, status: "closed", version: settled.tab.version }
    });

    const limitedSettle = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/settle`,
      {
        expectedVersion: settled.tab.version,
        idempotencyKey: "rate-limit-settle-second",
        transferConfirmed: true
      },
      staff.cookie,
      staff.csrf
    );
    expect(limitedSettle.status).toBe(429);
    expect(await readJsonObject(limitedSettle)).toMatchObject({
      error: { code: "RATE_LIMITED", details: { scope: "order.settle" } }
    });
  });

  it("requests checkout, reopens, settles idempotently, fixes final totals, and blocks closed mutations", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const staffUser = await seedUser(runtime, "staff1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const staff = await login(runtime, "staff1", "StaffPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Settlement Bar");
    await addMember(runtime, bar.id, staffUser.id, admin.cookie, admin.csrf, "staff");
    const menu = await seedOrderableMenu(runtime, bar.id, staffUser.id);
    const tab = await createOrderTab(runtime, bar.id, staff.cookie, staff.csrf, "S1");

    const addLine = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items`,
      {
        expectedVersion: tab.tab.version,
        idempotencyKey: "settle-line-add",
        menuItemId: menu.menuItem.id,
        priceId: menu.price.id,
        quantity: 2
      },
      staff.cookie,
      staff.csrf
    );
    const lineAdded = (await readJsonObject(addLine)).data as OrderTabDetailResponse;
    expect(addLine.status).toBe(201);
    expect(lineAdded.tab).toMatchObject({ totalAmountMinor: 36000, activeItemCount: 1, version: 2 });

    const checkout = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/checkout-request`,
      { expectedVersion: lineAdded.tab.version },
      staff.cookie,
      staff.csrf
    );
    const requested = (await readJsonObject(checkout)).data as OrderTabDetailResponse;
    expect(checkout.status).toBe(200);
    expect(requested.tab).toMatchObject({ status: "checkout_requested", checkoutRequestedAt: "2026-06-23T00:00:00.000Z", version: 3 });

    const reopen = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/reopen`,
      { expectedVersion: requested.tab.version, reason: "추가 주문 확인" },
      staff.cookie,
      staff.csrf
    );
    const reopened = (await readJsonObject(reopen)).data as OrderTabDetailResponse;
    expect(reopen.status).toBe(200);
    expect(reopened.tab).toMatchObject({ status: "open", checkoutRequestedAt: null, version: 4 });

    const secondCheckout = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/checkout-request`,
      { expectedVersion: reopened.tab.version },
      staff.cookie,
      staff.csrf
    );
    const secondRequested = (await readJsonObject(secondCheckout)).data as OrderTabDetailResponse;
    expect(secondCheckout.status).toBe(200);
    expect(secondRequested.tab).toMatchObject({ status: "checkout_requested", version: 5 });

    const invalidSettle = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/settle`,
      {
        expectedVersion: secondRequested.tab.version,
        idempotencyKey: "settle-invalid-transfer",
        transferConfirmed: false
      },
      staff.cookie,
      staff.csrf
    );
    expect(invalidSettle.status).toBe(400);
    expect(await readJsonObject(invalidSettle)).toMatchObject({ error: { code: "INPUT_INVALID" } });

    const settle = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/settle`,
      {
        expectedVersion: secondRequested.tab.version,
        idempotencyKey: "settle-s1-transfer",
        transferConfirmed: true,
        note: "계좌이체 확인"
      },
      staff.cookie,
      staff.csrf
    );
    const settled = (await readJsonObject(settle)).data as OrderTabDetailResponse;
    expect(settle.status).toBe(200);
    expect(settled.tab).toMatchObject({
      status: "closed",
      totalAmountMinor: 36000,
      finalTotalAmountMinor: 36000,
      activeItemCount: 1,
      settledAt: "2026-06-23T00:00:00.000Z",
      closedAt: "2026-06-23T00:00:00.000Z",
      version: 6
    });
    expect(settled.events.map((event) => event.type)).toEqual(expect.arrayContaining(["checkout_requested", "tab_reopened", "tab_settled"]));

    await runtime.menuItemRepository.replaceMenuItemPrices(
      bar.id,
      menu.menuItem.id,
      [{ id: menu.price.id, label: "샷", normalizedLabel: "샷", volumeText: "30ml", amountMinor: 99000, displayOrder: 0 }],
      staffUser.id,
      "2026-06-23T03:00:00.000Z"
    );
    const reread = await getJson(runtime.app, `/api/bars/${bar.id}/order-tabs/${tab.tab.id}`, staff.cookie);
    const finalSnapshot = (await readJsonObject(reread)).data as OrderTabDetailResponse;
    expect(finalSnapshot.tab).toMatchObject({ status: "closed", finalTotalAmountMinor: 36000, totalAmountMinor: 36000 });

    const duplicateSettle = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/settle`,
      {
        expectedVersion: secondRequested.tab.version,
        idempotencyKey: "settle-s1-transfer",
        transferConfirmed: true,
        note: "계좌이체 확인"
      },
      staff.cookie,
      staff.csrf
    );
    const duplicateSettleBody = (await readJsonObject(duplicateSettle)).data as OrderTabDetailResponse;
    expect(duplicateSettle.status).toBe(200);
    expect(duplicateSettleBody.tab).toMatchObject({ status: "closed", finalTotalAmountMinor: 36000, version: 6 });

    const secondSettle = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/settle`,
      {
        expectedVersion: settled.tab.version,
        idempotencyKey: "settle-s1-second-key",
        transferConfirmed: true
      },
      staff.cookie,
      staff.csrf
    );
    expect(secondSettle.status).toBe(409);
    expect(await readJsonObject(secondSettle)).toMatchObject({ error: { code: "ORDER_TAB_IMMUTABLE" } });

    const closedMutation = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${tab.tab.id}/items`,
      {
        expectedVersion: settled.tab.version,
        idempotencyKey: "closed-line-blocked",
        menuItemId: menu.menuItem.id,
        priceId: menu.price.id,
        quantity: 1
      },
      staff.cookie,
      staff.csrf
    );
    expect(closedMutation.status).toBe(409);
    expect(await readJsonObject(closedMutation)).toMatchObject({ error: { code: "ORDER_TAB_IMMUTABLE" } });

    const list = await getJson(runtime.app, `/api/bars/${bar.id}/order-tabs`, staff.cookie);
    const listData = (await readJsonObject(list)).data as OrderTabsResponse;
    expect(listData.dailySummary).toMatchObject({
      businessDate: "2026-06-23",
      settledTabCount: 1,
      settledTotalAmountMinor: 36000,
      settledItemCount: 1,
      cancelledTabCount: 0
    });
  });

  it("rejects unauthenticated settle requests and only cancels empty or all-void tabs", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const staffUser = await seedUser(runtime, "staff1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const staff = await login(runtime, "staff1", "StaffPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Cancel Bar");
    await addMember(runtime, bar.id, staffUser.id, admin.cookie, admin.csrf, "staff");
    const menu = await seedOrderableMenu(runtime, bar.id, staffUser.id);

    const emptyTab = await createOrderTab(runtime, bar.id, staff.cookie, staff.csrf, "빈 테이블");
    const unauthenticated = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${emptyTab.tab.id}/settle`,
      { expectedVersion: emptyTab.tab.version, idempotencyKey: "unauth-settle", transferConfirmed: true }
    );
    expect(unauthenticated.status).toBe(401);

    const emptyCancel = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${emptyTab.tab.id}/cancel`,
      { expectedVersion: emptyTab.tab.version, reason: "손님 착석 취소" },
      staff.cookie,
      staff.csrf
    );
    const cancelledEmpty = (await readJsonObject(emptyCancel)).data as OrderTabDetailResponse;
    expect(emptyCancel.status).toBe(200);
    expect(cancelledEmpty.tab).toMatchObject({
      status: "cancelled",
      totalAmountMinor: 0,
      activeItemCount: 0,
      cancelledReason: "손님 착석 취소",
      cancelledAt: "2026-06-23T00:00:00.000Z"
    });

    const activeTab = await createOrderTab(runtime, bar.id, staff.cookie, staff.csrf, "활성 주문");
    const lineResponse = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${activeTab.tab.id}/items`,
      {
        expectedVersion: activeTab.tab.version,
        idempotencyKey: "cancel-line-add",
        menuItemId: menu.menuItem.id,
        priceId: menu.price.id,
        quantity: 1
      },
      staff.cookie,
      staff.csrf
    );
    const lineAdded = (await readJsonObject(lineResponse)).data as OrderTabDetailResponse;
    const blockedCancel = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${activeTab.tab.id}/cancel`,
      { expectedVersion: lineAdded.tab.version, reason: "주문 남음" },
      staff.cookie,
      staff.csrf
    );
    expect(blockedCancel.status).toBe(409);
    expect(await readJsonObject(blockedCancel)).toMatchObject({ error: { code: "ORDER_TAB_CANCEL_NOT_EMPTY" } });

    const activeItem = lineAdded.items[0];
    if (!activeItem) throw new Error("active item missing");
    const voidResponse = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${activeTab.tab.id}/items/${activeItem.id}/void`,
      { expectedVersion: lineAdded.tab.version, itemExpectedVersion: activeItem.version, reason: "주문 취소" },
      staff.cookie,
      staff.csrf
    );
    const voided = (await readJsonObject(voidResponse)).data as OrderTabDetailResponse;
    const allVoidCancel = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/order-tabs/${activeTab.tab.id}/cancel`,
      { expectedVersion: voided.tab.version, reason: "전체 주문 void 후 취소" },
      staff.cookie,
      staff.csrf
    );
    const cancelledAllVoid = (await readJsonObject(allVoidCancel)).data as OrderTabDetailResponse;
    expect(allVoidCancel.status).toBe(200);
    expect(cancelledAllVoid.tab).toMatchObject({
      status: "cancelled",
      totalAmountMinor: 0,
      activeItemCount: 0,
      cancelledReason: "전체 주문 void 후 취소"
    });

    const list = await getJson(runtime.app, `/api/bars/${bar.id}/order-tabs`, staff.cookie);
    const listData = (await readJsonObject(list)).data as OrderTabsResponse;
    expect(listData.dailySummary).toMatchObject({
      businessDate: "2026-06-23",
      settledTabCount: 0,
      cancelledTabCount: 2,
      settledTotalAmountMinor: 0
    });
  });
});
