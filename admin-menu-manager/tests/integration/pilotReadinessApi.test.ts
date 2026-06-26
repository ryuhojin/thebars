import { describe, expect, it } from "vitest";
import type { ItemTemplate } from "../../contracts/itemTypes";
import type { MenuItemDetails } from "../../contracts/menuItems";
import { createAdminApi } from "../../server/app";
import { MemoryAuditRepository } from "../../server/audit/memoryAuditRepository";
import { AuthService } from "../../server/auth/authService";
import { MemoryAuthRepository } from "../../server/auth/memoryAuthRepository";
import { FastTestPasswordHasher } from "../../server/auth/passwordHasher";
import type { AuthUserRecord } from "../../server/auth/repository";
import { MemoryBadgeRepository } from "../../server/badges/memoryBadgeRepository";
import { MemoryBarRepository } from "../../server/bars/memoryBarRepository";
import { MemoryCategoryRepository } from "../../server/categories/memoryCategoryRepository";
import { MemoryItemTypeRepository } from "../../server/item-types/memoryItemTypeRepository";
import { MemoryMembershipRepository } from "../../server/memberships/memoryMembershipRepository";
import { MemoryMenuItemRepository } from "../../server/menu-items/memoryMenuItemRepository";
import { MemoryOrderTabRepository } from "../../server/order-tabs/memoryOrderTabRepository";
import { MemoryPublicationRepository } from "../../server/publications/memoryPublicationRepository";

const config = {
  setupToken: "setup-token",
  recoveryToken: "recovery-token"
};

type PilotRuntime = {
  app: ReturnType<typeof createAdminApi>;
  service: AuthService;
  barRepository: MemoryBarRepository;
  categoryRepository: MemoryCategoryRepository;
  membershipRepository: MemoryMembershipRepository;
  menuItemRepository: MemoryMenuItemRepository;
  orderTabRepository: MemoryOrderTabRepository;
};

function createRuntime(): PilotRuntime {
  const authRepository = new MemoryAuthRepository();
  const auditRepository = new MemoryAuditRepository();
  const badgeRepository = new MemoryBadgeRepository();
  const barRepository = new MemoryBarRepository();
  const categoryRepository = new MemoryCategoryRepository();
  const itemTypeRepository = new MemoryItemTypeRepository();
  const membershipRepository = new MemoryMembershipRepository();
  const menuItemRepository = new MemoryMenuItemRepository(categoryRepository, itemTypeRepository, badgeRepository);
  const orderTabRepository = new MemoryOrderTabRepository();
  const publicationRepository = new MemoryPublicationRepository();
  const hasher = new FastTestPasswordHasher();
  const now = () => new Date("2026-06-24T00:00:00.000Z");
  const service = new AuthService(authRepository, {
    passwordHasher: hasher,
    config,
    now
  });
  return {
    app: createAdminApi({
      repository: authRepository,
      auditRepository,
      badgeRepository,
      barRepository,
      categoryRepository,
      itemTypeRepository,
      membershipRepository,
      menuItemRepository,
      orderTabRepository,
      publicationRepository,
      passwordHasher: hasher,
      config,
      now
    }),
    service,
    barRepository,
    categoryRepository,
    membershipRepository,
    menuItemRepository,
    orderTabRepository
  };
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function postJson(app: PilotRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function login(runtime: PilotRuntime, username: string, password: string) {
  const response = await postJson(runtime.app, "/api/auth/login", { username, password });
  const cookie = setCookieHeader(response);
  if (!cookie.includes("bar_csrf=")) {
    throw new Error(`csrf cookie missing after login ${response.status}: ${await response.clone().text()}`);
  }
  const csrf = csrfFromCookie(cookie);
  return { response, cookie, csrf };
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

async function seedUsers(runtime: PilotRuntime) {
  const admin = await runtime.service.createSeedUser({
    username: "admin1",
    password: "AdminPass!1",
    isSystemAdmin: true,
    forcedPasswordChange: false
  });
  const owner = await runtime.service.createSeedUser({
    username: "owner1",
    password: "OwnerPass!1",
    forcedPasswordChange: false
  });
  const manager = await runtime.service.createSeedUser({
    username: "manager1",
    password: "ManagerPass!1",
    forcedPasswordChange: false
  });
  const staff = await runtime.service.createSeedUser({
    username: "staff1",
    password: "StaffPass!1",
    forcedPasswordChange: false
  });
  return { admin, owner, manager, staff };
}

async function seedPilotBar(
  runtime: PilotRuntime,
  input: {
    id: string;
    name: string;
    admin: AuthUserRecord;
    owner: AuthUserRecord;
    manager: AuthUserRecord;
    staff: AuthUserRecord;
    includeRepresentativeData?: boolean;
    includeOrderScenario?: boolean;
  }
) {
  const now = "2026-06-24T00:00:00.000Z";
  const bar = await runtime.barRepository.createBar({
    id: input.id,
    name: input.name,
    slug: toValidTestBarSlug(input.id),
    encodedSlug: input.id,
    currency: "KRW",
    settingsDraftHash: `hash-${input.id}`,
    createdByUserId: input.admin.id,
    now
  });
  for (const [role, user] of [
    ["owner", input.owner],
    ["manager", input.manager],
    ["staff", input.staff]
  ] as const) {
    await runtime.membershipRepository.upsertMembership({
      id: `${input.id}-${role}`,
      barId: bar.id,
      userId: user.id,
      role,
      createdByUserId: input.admin.id,
      now
    });
  }
  if (input.includeRepresentativeData) {
    for (const template of ["wine", "whisky", "cocktail", "food", "cigar"] as const) {
      await seedRepresentativeMenu(runtime, bar.id, input.admin.id, template);
    }
  }
  if (input.includeOrderScenario) {
    await runtime.orderTabRepository.createOrderTab({
      id: `${input.id}-tab-open`,
      eventId: `${input.id}-event-open`,
      barId: bar.id,
      tableLabel: "A1",
      guestDescription: "open sample",
      status: "open",
      currency: "KRW",
      totalAmountMinor: 12000,
      activeItemCount: 1,
      createdByUserId: input.staff.id,
      now
    });
    await runtime.orderTabRepository.createOrderTab({
      id: `${input.id}-tab-checkout`,
      eventId: `${input.id}-event-checkout`,
      barId: bar.id,
      tableLabel: "B2",
      guestDescription: "checkout sample",
      status: "checkout_requested",
      currency: "KRW",
      totalAmountMinor: 18000,
      activeItemCount: 1,
      createdByUserId: input.staff.id,
      now
    });
    await runtime.orderTabRepository.createOrderTab({
      id: `${input.id}-tab-closed`,
      eventId: `${input.id}-event-closed`,
      barId: bar.id,
      tableLabel: "C3",
      guestDescription: "closed sample",
      status: "closed",
      currency: "KRW",
      totalAmountMinor: 24000,
      activeItemCount: 1,
      createdByUserId: input.manager.id,
      now
    });
  }
  return bar;
}

function toValidTestBarSlug(id: string): string {
  const suffix = id.replace(/[^a-z0-9]/g, "").slice(-6).padStart(6, "0");
  return `bar-${suffix}`;
}

async function seedRepresentativeMenu(
  runtime: PilotRuntime,
  barId: string,
  actorUserId: string,
  template: ItemTemplate
) {
  const now = "2026-06-24T00:00:00.000Z";
  const category = await runtime.categoryRepository.createCategory({
    id: `${barId}-category-${template}`,
    barId,
    parentId: null,
    name: template,
    normalizedName: template,
    description: "",
    showDescription: false,
    isVisible: true,
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
    now
  });
  const item = await runtime.menuItemRepository.createMenuItem({
    id: `${barId}-menu-${template}`,
    barId,
    categoryId: category.id,
    systemItemTypeId: `system-type-${template}`,
    barItemTypeId: null,
    name: `${template} sample`,
    normalizedName: `${template} sample`,
    description: `${template} representative item`,
    internalMemo: "",
    saleStatus: "available",
    isVisible: true,
    abvBasisPoints: null,
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
    now
  });
  await runtime.menuItemRepository.upsertMenuItemDetails({
    barId,
    menuItemId: item.id,
    template,
    details: detailsFor(template),
    updatedByUserId: actorUserId,
    now
  });
}

function detailsFor(template: ItemTemplate): MenuItemDetails {
  if (template === "wine") {
    return {
      template,
      producer: "Pilot Domaine",
      country: "France",
      region: "Bourgogne",
      grapeVariety: "Pinot Noir",
      vintage: "2022",
      style: "Red",
      sweetness: "Dry",
      body: "Medium",
      acidity: "High",
      tannin: "Low"
    };
  }
  if (template === "whisky") {
    return {
      template,
      brand: "Pilot",
      country: "Scotland",
      region: "Speyside",
      classification: "Single Malt",
      ageStatement: "12Y",
      caskFinish: "Sherry",
      vintageOrDistilledYear: "",
      singleCask: false,
      caskStrength: false,
      nonChillFiltered: false
    };
  }
  if (template === "cocktail") {
    return {
      template,
      baseSpirit: "Gin",
      ingredients: "Gin, vermouth",
      tasteStyle: "Dry",
      method: "Stir",
      garnish: "Olive",
      glass: "Coupe"
    };
  }
  if (template === "food") {
    return {
      template,
      mainIngredients: "Cheese",
      allergens: "Milk",
      spiceLevel: "None",
      dietary: "Vegetarian",
      servingSize: "2",
      pairing: "Wine"
    };
  }
  if (template === "cigar") {
    return {
      template,
      brand: "Pilot",
      line: "Reserva",
      origin: "Dominican Republic",
      vitola: "Robusto",
      length: "5 inch",
      ringGauge: "50",
      wrapper: "Connecticut",
      binder: "Dominican",
      filler: "Dominican",
      strength: "Medium",
      flavor: "Woody",
      smokingTime: "45m"
    };
  }
  return { template: "general" };
}

describe("D24 pilot readiness API", () => {
  it("requires authentication and system-admin authorization", async () => {
    const runtime = createRuntime();
    await seedUsers(runtime);

    const unauthenticated = await runtime.app.request("/api/system/pilot-readiness");
    expect(unauthenticated.status).toBe(401);
    expect(await readJsonObject(unauthenticated)).toMatchObject({ error: { code: "AUTH_REQUIRED" } });

    const staff = await login(runtime, "staff1", "StaffPass!1");
    const forbidden = await runtime.app.request("/api/system/pilot-readiness", { headers: { cookie: staff.cookie } });
    expect(forbidden.status).toBe(403);
    expect(await readJsonObject(forbidden)).toMatchObject({ error: { code: "SYSTEM_ADMIN_REQUIRED" } });
  });

  it("reports ready automated pilot data while keeping production approval manual", async () => {
    const runtime = createRuntime();
    const users = await seedUsers(runtime);
    await seedPilotBar(runtime, { id: "bar-pilot-1", name: "Pilot One", ...users, includeRepresentativeData: true, includeOrderScenario: true });
    await seedPilotBar(runtime, { id: "bar-pilot-2", name: "Pilot Two", ...users, includeRepresentativeData: false, includeOrderScenario: false });
    const admin = await login(runtime, "admin1", "AdminPass!1");

    const response = await runtime.app.request("/api/system/pilot-readiness", { headers: { cookie: admin.cookie } });
    const body = await readJsonObject(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        overallStatus: "ready_for_pilot",
        humanApprovalRequired: true,
        pilotBars: [
          { name: "Pilot One", roleCoverage: { owner: true, manager: true, staff: true } },
          { name: "Pilot Two", roleCoverage: { owner: true, manager: true, staff: true } }
        ],
        sections: expect.arrayContaining([
          expect.objectContaining({ id: "pilot-data", status: "manual_required" }),
          expect.objectContaining({ id: "release-gate", status: "manual_required" })
        ])
      }
    });
    const serialized = JSON.stringify(body);
    expect(serialized).toContain("사람의 운영 배포 승인");
    expect(serialized).not.toMatch(/ghp_|github_pat_|Bearer\s+[A-Za-z0-9._-]{20,}/);
  });

  it("marks readiness as action required when two active pilot bars are missing", async () => {
    const runtime = createRuntime();
    const users = await seedUsers(runtime);
    await seedPilotBar(runtime, { id: "bar-pilot-1", name: "Pilot One", ...users, includeRepresentativeData: true, includeOrderScenario: true });
    const admin = await login(runtime, "admin1", "AdminPass!1");

    const response = await runtime.app.request("/api/system/pilot-readiness", { headers: { cookie: admin.cookie } });
    const body = await readJsonObject(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        overallStatus: "action_required",
        sections: expect.arrayContaining([
          expect.objectContaining({ id: "pilot-data", status: "action_required" })
        ])
      }
    });
  });
});
