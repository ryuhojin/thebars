import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { createAdminApi } from "./server/app";
import { AuthService } from "./server/auth/authService";
import { MemoryAuthRepository } from "./server/auth/memoryAuthRepository";
import { FastTestPasswordHasher } from "./server/auth/passwordHasher";
import { MemoryAuditRepository } from "./server/audit/memoryAuditRepository";
import { MemoryBadgeRepository } from "./server/badges/memoryBadgeRepository";
import { BarService } from "./server/bars/barService";
import { MemoryBarRepository } from "./server/bars/memoryBarRepository";
import { CategoryService } from "./server/categories/categoryService";
import { MemoryCategoryRepository } from "./server/categories/memoryCategoryRepository";
import { ItemTypeService } from "./server/item-types/itemTypeService";
import { MemoryItemTypeRepository } from "./server/item-types/memoryItemTypeRepository";
import { MembershipService } from "./server/memberships/membershipService";
import { MemoryMembershipRepository } from "./server/memberships/memoryMembershipRepository";
import { MenuItemService } from "./server/menu-items/menuItemService";
import { MemoryMenuItemRepository } from "./server/menu-items/memoryMenuItemRepository";
import { OrderTabService } from "./server/order-tabs/orderTabService";
import { MemoryOrderTabRepository } from "./server/order-tabs/memoryOrderTabRepository";
import { createFakeCloudflareDeploymentAdapter, createFakeGitHubPublicationAdapter } from "./server/integrations/publicationAdapters";
import { MemoryPublicationRepository } from "./server/publications/memoryPublicationRepository";
import { MemoryRateLimitRepository } from "./server/rate-limits/memoryRateLimitRepository";

const devRepository = new MemoryAuthRepository();
const devAuditRepository = new MemoryAuditRepository();
const devBadgeRepository = new MemoryBadgeRepository();
const devBarRepository = new MemoryBarRepository();
const devCategoryRepository = new MemoryCategoryRepository();
const devItemTypeRepository = new MemoryItemTypeRepository();
const devMenuItemRepository = new MemoryMenuItemRepository(devCategoryRepository, devItemTypeRepository, devBadgeRepository);
const devMembershipRepository = new MemoryMembershipRepository();
const devPublicationRepository = new MemoryPublicationRepository();
const devOrderTabRepository = new MemoryOrderTabRepository();
const devRateLimitRepository = new MemoryRateLimitRepository();
const devGitHubPublicationAdapter = createFakeGitHubPublicationAdapter();
const devCloudflareDeploymentAdapter = createFakeCloudflareDeploymentAdapter();
const devHasher = new FastTestPasswordHasher();
const devAuthConfig = {
  setupToken: "local-setup-token",
  recoveryToken: "local-recovery-token"
};
let seeded = false;
let seedPromise: Promise<void> | null = null;

async function resetDevAuth(options: { fixtures?: boolean } = {}) {
  const previous = seedPromise;
  if (previous) {
    try {
      await previous;
    } catch {
      // A failed seed is replaced by the explicit reset below.
    }
  }
  const next = doResetDevAuth(options);
  seedPromise = next;
  try {
    await next;
  } finally {
    if (seedPromise === next) seedPromise = null;
  }
}

async function doResetDevAuth({ fixtures = false }: { fixtures?: boolean } = {}) {
  seeded = false;
  devRepository.reset();
  devAuditRepository.reset();
  devBadgeRepository.reset();
  devBarRepository.reset();
  devCategoryRepository.reset();
  devItemTypeRepository.reset();
  devMenuItemRepository.reset();
  devMembershipRepository.reset();
  devPublicationRepository.reset();
  devOrderTabRepository.reset();
  devRateLimitRepository.reset();
  devGitHubPublicationAdapter.reset();
  devCloudflareDeploymentAdapter.reset();
  const service = new AuthService(devRepository, {
    passwordHasher: devHasher,
    config: devAuthConfig
  });
  const admin = await service.createSeedUser({
    username: "admin1",
    password: "AdminPass!1",
    isSystemAdmin: true,
    forcedPasswordChange: false
  });
  await service.createSeedUser({
    username: "forced1",
    password: "TempPass!1",
    forcedPasswordChange: true
  });
  const staff = await service.createSeedUser({
    username: "staff1",
    password: "StaffPass!1",
    forcedPasswordChange: false
  });
  if (fixtures) await seedDevFixtures(service, admin, staff);
  seeded = true;
}

async function ensureDevAuthSeeded() {
  if (seeded) return;
  const next = seedPromise ?? doResetDevAuth({ fixtures: true });
  seedPromise = next;
  try {
    await next;
  } finally {
    if (seedPromise === next) seedPromise = null;
  }
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "bar-ops-dev-api",
      configureServer(server) {
        const api = createAdminApi({
          repository: devRepository,
          auditRepository: devAuditRepository,
          badgeRepository: devBadgeRepository,
          barRepository: devBarRepository,
          categoryRepository: devCategoryRepository,
          itemTypeRepository: devItemTypeRepository,
          menuItemRepository: devMenuItemRepository,
          membershipRepository: devMembershipRepository,
          publicationRepository: devPublicationRepository,
          orderTabRepository: devOrderTabRepository,
          rateLimitRepository: devRateLimitRepository,
          githubPublicationAdapter: devGitHubPublicationAdapter,
          cloudflareDeploymentAdapter: devCloudflareDeploymentAdapter,
          passwordHasher: devHasher,
          config: devAuthConfig
        });

        server.middlewares.use(async (request: unknown, response: unknown, next: () => void) => {
          const devRequest = request as DevRequest;
          const devResponse = response as DevResponse;

          if (!devRequest.url?.startsWith("/api") && !devRequest.url?.startsWith("/__dev/reset-auth")) {
            next();
            return;
          }

          const origin = `http://${devRequest.headers.host ?? "127.0.0.1:5173"}`;
          if (devRequest.url?.startsWith("/__dev/reset-auth")) {
            const resetUrl = new URL(devRequest.url, origin);
            await resetDevAuth({ fixtures: resetUrl.searchParams.get("fixtures") === "full" });
            devResponse.statusCode = 204;
            devResponse.end();
            return;
          }

          await ensureDevAuthSeeded();
          const body =
            devRequest.method === "GET" || devRequest.method === "HEAD" ? undefined : await readRequestBody(devRequest);
          const headers = new Headers();
          for (const [key, value] of Object.entries(devRequest.headers)) {
            if (Array.isArray(value)) {
              for (const item of value) headers.append(key, item);
            } else if (value !== undefined) {
              headers.set(key, value);
            }
          }
          const apiResponse = await api.fetch(
            new Request(new URL(devRequest.url ?? "/api", origin), {
              method: devRequest.method,
              headers,
              body
            }),
            {}
          );

          devResponse.statusCode = apiResponse.status;
          const setCookieHeaders =
            (apiResponse.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
            splitSetCookie(apiResponse.headers.get("set-cookie") ?? "");
          apiResponse.headers.forEach((value, key) => {
            if (key.toLowerCase() === "set-cookie") {
              devResponse.setHeader("set-cookie", setCookieHeaders);
            } else {
              devResponse.setHeader(key, value);
            }
          });
          devResponse.end(new Uint8Array(await apiResponse.arrayBuffer()));
        });
      }
    }
  ],
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  preview: {
    host: "127.0.0.1",
    port: 4173
  }
});

async function seedDevFixtures(service: AuthService, admin: Awaited<ReturnType<AuthService["createSeedUser"]>>, staff: Awaited<ReturnType<AuthService["createSeedUser"]>>) {
  const owner = await service.createSeedUser({
    username: "owner1",
    password: "OwnerPass!1",
    forcedPasswordChange: false
  });
  const manager = await service.createSeedUser({
    username: "manager1",
    password: "ManagerPass!1",
    forcedPasswordChange: false
  });
  let fixtureSlugIndex = 0;
  const fixtureSlugs = ["bar-a7k2m9", "bar-f9q2x1", "bar-k4m8p2", "bar-v7n3d5"];
  const barService = new BarService(devBarRepository, {
    slugGenerator: () => fixtureSlugs[Math.min(fixtureSlugIndex++, fixtureSlugs.length - 1)] ?? "bar-a7k2m9"
  });
  const membershipService = new MembershipService(devRepository, devBarRepository, devMembershipRepository);
  const categoryService = new CategoryService(devRepository, devBarRepository, devMembershipRepository, devCategoryRepository);
  const itemTypeService = new ItemTypeService(devRepository, devBarRepository, devMembershipRepository, devItemTypeRepository);
  const menuService = new MenuItemService(
    devRepository,
    devBarRepository,
    devMembershipRepository,
    devCategoryRepository,
    devItemTypeRepository,
    devMenuItemRepository,
    { badgeRepository: devBadgeRepository }
  );
  const orderTabService = new OrderTabService(devBarRepository, devMembershipRepository, devOrderTabRepository, {
    categoryRepository: devCategoryRepository,
    menuItemRepository: devMenuItemRepository
  });
  const bar = await barService.createBar(admin, { name: "Sample Bar", currency: "KRW" });
  await seedAuditFixtures({ admin, manager, staff, barId: bar.id, barName: bar.name });
  await barService.updateSettings(admin, bar.id, {
    name: "Sample Bar",
    description: "클래식 칵테일과 위스키, 간단한 페어링 푸드를 편안하게 즐길 수 있는 바입니다.",
    address: "서울시 마포구 와우산로 00",
    mapUrl: "https://maps.example.com/sample-bar",
    phoneNumberDigits: "0212345678",
    openingNote: "오늘 18:00-다음날 02:00",
    currency: "KRW",
    businessHours: [
      { dayOfWeek: 1, opensAt: "18:00", closesAt: "02:00" },
      { dayOfWeek: 2, opensAt: "18:00", closesAt: "02:00" },
      { dayOfWeek: 3, opensAt: "18:00", closesAt: "02:00" },
      { dayOfWeek: 4, opensAt: "18:00", closesAt: "02:00" },
      { dayOfWeek: 5, opensAt: "18:00", closesAt: "03:00" },
      { dayOfWeek: 6, opensAt: "18:00", closesAt: "03:00" }
    ],
    links: [{ label: "Instagram", url: "https://example.com/sample-bar" }]
  });
  await membershipService.addMember(admin, bar.id, { userId: owner.id, role: "owner" });
  await membershipService.addMember(admin, bar.id, { userId: manager.id, role: "manager" });
  await membershipService.addMember(admin, bar.id, { userId: staff.id, role: "staff" });
  await seedSecondaryFixtureBar({
    admin,
    owner,
    manager,
    staff,
    barService,
    membershipService,
    categoryService,
    menuService
  });

  const recommendedBadge = "system-badge-recommended";
  const recommendedCategory = await createFixtureCategory(categoryService, admin, bar.id, { name: "추천", description: "Sample Bar가 추천하는 메뉴입니다.", showDescription: true });
  const whiskyCategory = await createFixtureCategory(categoryService, admin, bar.id, { name: "위스키" });
  const singleMaltCategory = await createFixtureCategory(categoryService, admin, bar.id, { name: "싱글몰트", parentId: whiskyCategory.id });
  const wineCategory = await createFixtureCategory(categoryService, admin, bar.id, { name: "와인" });
  const cocktailCategory = await createFixtureCategory(categoryService, admin, bar.id, { name: "칵테일" });
  const foodCategory = await createFixtureCategory(categoryService, admin, bar.id, { name: "푸드" });
  const cigarCategory = await createFixtureCategory(categoryService, admin, bar.id, { name: "시가" });
  await createFixtureCategory(categoryService, admin, bar.id, { name: "빈 카테고리", description: "등록된 메뉴가 없습니다.", showDescription: true });
  const hiddenCategory = await createFixtureCategory(categoryService, admin, bar.id, { name: "숨김", isVisible: false });
  const foodItemType = await itemTypeService.createSystemItemType(admin, {
    name: "푸드",
    template: "food",
    defaultPriceLabels: ["접시"]
  });

  const highball = await menuService.createMenuItem(admin, bar.id, {
    categoryId: recommendedCategory.id,
    name: "하우스 하이볼",
    description: "시트러스와 탄산감을 살린 가벼운 하이볼",
    itemType: { source: "system", id: "system-type-cocktail" },
    prices: [{ label: "잔", amountMinor: 12000 }],
    details: { template: "cocktail", baseSpirit: "위스키", ingredients: "위스키, 소다, 레몬", tasteStyle: "청량", method: "Build", garnish: "레몬", glass: "Highball" }
  });
  const macallan = await menuService.createMenuItem(admin, bar.id, {
    categoryId: singleMaltCategory.id,
    name: "맥캘란 12",
    description: "셰리 오크의 풍부한 건과일과 스파이스",
    abv: 40,
    itemType: { source: "system", id: "system-type-whisky" },
    prices: [
      { label: "샷", volumeText: "30ml", amountMinor: 18000 },
      { label: "보틀", volumeText: "700ml", amountMinor: 280000 }
    ],
    details: {
      template: "whisky",
      brand: "Macallan",
      country: "Scotland",
      region: "Speyside",
      classification: "Single Malt",
      ageStatement: "12Y",
      caskFinish: "Sherry Oak",
      vintageOrDistilledYear: "",
      singleCask: false,
      caskStrength: false,
      nonChillFiltered: false
    },
    internalMemo: "재고 2병 이하이면 owner 확인"
  });
  const negroni = await menuService.createMenuItem(admin, bar.id, {
    categoryId: cocktailCategory.id,
    name: "네그로니",
    description: "진, 캄파리, 스위트 베르무트",
    saleStatus: "sold_out",
    itemType: { source: "system", id: "system-type-cocktail" },
    prices: [{ label: "잔", amountMinor: 15000 }],
    details: { template: "cocktail", baseSpirit: "진", ingredients: "진, 캄파리, 스위트 베르무트", tasteStyle: "비터", method: "Stir", garnish: "오렌지", glass: "Rocks" }
  });
  await menuService.createMenuItem(admin, bar.id, {
    categoryId: wineCategory.id,
    name: "부르고뉴 피노 누아",
    description: "붉은 과실과 산도가 선명한 파일럿 와인 샘플",
    itemType: { source: "system", id: "system-type-wine" },
    prices: [
      { label: "글라스", volumeText: "125ml", amountMinor: 19000 },
      { label: "보틀", volumeText: "750ml", amountMinor: 98000 }
    ],
    details: {
      template: "wine",
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
    }
  });
  await menuService.createMenuItem(admin, bar.id, {
    categoryId: foodCategory.id,
    name: "치즈 플레이트",
    description: "숙성 치즈 3종과 견과류",
    itemType: { source: "system", id: foodItemType.id },
    prices: [{ label: "플레이트", amountMinor: 24000 }],
    details: {
      template: "food",
      mainIngredients: "브리, 고다, 블루치즈, 견과류",
      allergens: "우유, 견과류",
      spiceLevel: "없음",
      dietary: "채식 가능",
      servingSize: "2인",
      pairing: "위스키 또는 레드 와인"
    }
  });
  await menuService.createMenuItem(admin, bar.id, {
    categoryId: cigarCategory.id,
    name: "파일럿 로부스토",
    description: "현장 시가 판매 동선을 검증하기 위한 샘플",
    itemType: { source: "system", id: "system-type-cigar" },
    prices: [{ label: "개비", amountMinor: 32000 }],
    details: {
      template: "cigar",
      brand: "Pilot Cigar",
      line: "Reserva",
      origin: "Dominican Republic",
      vitola: "Robusto",
      length: "5 inch",
      ringGauge: "50",
      wrapper: "Connecticut",
      binder: "Dominican",
      filler: "Dominican/Nicaraguan",
      strength: "Medium",
      flavor: "우디, 크림, 은은한 스파이스",
      smokingTime: "45분"
    }
  });
  await menuService.createMenuItem(admin, bar.id, {
    categoryId: hiddenCategory.id,
    name: "비공개 테스트 메뉴",
    description: "고객 메뉴판에 포함되면 안 됩니다.",
    isVisible: false,
    prices: [{ label: "잔", amountMinor: 1 }],
    internalMemo: "공개 제외 확인용"
  });
  await menuService.bulkUpdateMenuItems(admin, bar.id, {
    expectedCount: 2,
    changes: [
      { menuItemId: requireFixtureMenuItemId(highball, "하우스 하이볼"), badges: [{ source: "system", id: recommendedBadge }] },
      { menuItemId: requireFixtureMenuItemId(macallan, "맥캘란 12"), badges: [{ source: "system", id: "system-badge-signature" }] }
    ]
  });
  await menuService.bulkUpdateMenuItems(admin, bar.id, {
    expectedCount: 1,
    changes: [{ menuItemId: requireFixtureMenuItemId(negroni, "네그로니"), badges: [{ source: "system", id: recommendedBadge }] }]
  });
  const tabA1 = await orderTabService.createOrderTab(staff, bar.id, {
    tableLabel: "A1",
    guestDescription: "2명 · 위스키 추천 요청"
  });
  await orderTabService.addMenuOrderItem(staff, bar.id, tabA1.tab.id, {
    expectedVersion: tabA1.tab.version,
    idempotencyKey: "fixture-a1-macallan-shot",
    menuItemId: requireFixtureMenuItemId(macallan, "맥캘란 12"),
    priceId: macallan.item?.prices.find((price) => price.label === "샷")?.id ?? "",
    quantity: 1
  });
  const tabBar3 = await orderTabService.createOrderTab(manager, bar.id, {
    tableLabel: "Bar 3",
    guestDescription: "단골 · 하이볼 먼저"
  });
  const tabBar3WithHighball = await orderTabService.addMenuOrderItem(manager, bar.id, tabBar3.tab.id, {
    expectedVersion: tabBar3.tab.version,
    idempotencyKey: "fixture-bar3-highball",
    menuItemId: requireFixtureMenuItemId(highball, "하우스 하이볼"),
    priceId: highball.item?.prices[0]?.id ?? "",
    quantity: 2
  });
  const tabBar3WithCustom = await orderTabService.addCustomOrderItem(manager, bar.id, tabBar3.tab.id, {
    expectedVersion: tabBar3WithHighball.tab.version,
    idempotencyKey: "fixture-bar3-cover",
    name: "커버차지",
    unitAmountMinor: 5000,
    quantity: 2,
    reason: "라이브 커버"
  });
  await orderTabService.addAdjustmentOrderItem(manager, bar.id, tabBar3.tab.id, {
    expectedVersion: tabBar3WithCustom.tab.version,
    idempotencyKey: "fixture-bar3-discount",
    label: "할인",
    amountMinor: -3000,
    reason: "단골 할인"
  });
  const tabB2 = await orderTabService.createOrderTab(staff, bar.id, {
    tableLabel: "B2",
    guestDescription: "계산 요청 대기 · 하이볼 1잔"
  });
  const tabB2Line = await orderTabService.addMenuOrderItem(staff, bar.id, tabB2.tab.id, {
    expectedVersion: tabB2.tab.version,
    idempotencyKey: "fixture-b2-highball",
    menuItemId: requireFixtureMenuItemId(highball, "하우스 하이볼"),
    priceId: highball.item?.prices[0]?.id ?? "",
    quantity: 1
  });
  await orderTabService.requestCheckout(staff, bar.id, tabB2.tab.id, {
    expectedVersion: tabB2Line.tab.version
  });
  const settledTab = await orderTabService.createOrderTab(manager, bar.id, {
    tableLabel: "C4",
    guestDescription: "정산 완료 샘플"
  });
  const settledLine = await orderTabService.addMenuOrderItem(manager, bar.id, settledTab.tab.id, {
    expectedVersion: settledTab.tab.version,
    idempotencyKey: "fixture-c4-macallan",
    menuItemId: requireFixtureMenuItemId(macallan, "맥캘란 12"),
    priceId: macallan.item?.prices.find((price) => price.label === "샷")?.id ?? "",
    quantity: 2
  });
  const settledCheckout = await orderTabService.requestCheckout(manager, bar.id, settledTab.tab.id, {
    expectedVersion: settledLine.tab.version
  });
  await orderTabService.settleOrderTab(manager, bar.id, settledTab.tab.id, {
    expectedVersion: settledCheckout.tab.version,
    idempotencyKey: "fixture-c4-settle",
    transferConfirmed: true,
    note: "fixture 계좌이체 확인"
  });
  const cancelledTab = await orderTabService.createOrderTab(staff, bar.id, {
    tableLabel: "D1",
    guestDescription: "취소 샘플"
  });
  await orderTabService.cancelOrderTab(staff, bar.id, cancelledTab.tab.id, {
    expectedVersion: cancelledTab.tab.version,
    reason: "손님 착석 취소"
  });
}

async function seedAuditFixtures({
  admin,
  manager,
  staff,
  barId,
  barName
}: {
  admin: Awaited<ReturnType<AuthService["createSeedUser"]>>;
  manager: Awaited<ReturnType<AuthService["createSeedUser"]>>;
  staff: Awaited<ReturnType<AuthService["createSeedUser"]>>;
  barId: string;
  barName: string;
}) {
  const base = {
    barId,
    barName,
    externalRef: null
  };
  await devAuditRepository.createAuditLog({
    id: "audit-fixture-001",
    occurredAt: "2026-06-23T23:40:00.000Z",
    requestId: "req-fixture-pub-001",
    actorUserId: admin.id,
    actorUsername: admin.normalizedUsername,
    operation: "publication.requested",
    result: "success",
    targetType: "publication",
    targetId: "pub-fixture-001",
    targetLabel: "Sample Bar 공개 12",
    errorCode: null,
    metadata: { method: "POST", status: 201, path: "/bars/{barId}/publications" },
    ...base
  });
  await devAuditRepository.createAuditLog({
    id: "audit-fixture-002",
    occurredAt: "2026-06-23T23:22:00.000Z",
    requestId: "req-fixture-order-001",
    actorUserId: manager.id,
    actorUsername: manager.normalizedUsername,
    operation: "order_tab.settled",
    result: "success",
    targetType: "order_tab",
    targetId: "tab-fixture-104",
    targetLabel: "테이블 4 정산",
    errorCode: null,
    metadata: { method: "POST", status: 200, path: "/bars/{barId}/order-tabs/{tabId}/settle" },
    ...base
  });
  await devAuditRepository.createAuditLog({
    id: "audit-fixture-003",
    occurredAt: "2026-06-23T22:58:00.000Z",
    requestId: "req-fixture-user-001",
    actorUserId: admin.id,
    actorUsername: admin.normalizedUsername,
    operation: "user.unlocked",
    result: "success",
    targetType: "user",
    targetId: staff.id,
    targetLabel: staff.normalizedUsername,
    errorCode: null,
    metadata: { method: "POST", status: 200, path: "/system/users/{userId}/unlock" },
    barId: null,
    barName: "",
    externalRef: null
  });
  await devAuditRepository.createAuditLog({
    id: "audit-fixture-004",
    occurredAt: "2026-06-23T22:47:00.000Z",
    requestId: "req-fixture-pub-002",
    actorUserId: admin.id,
    actorUsername: admin.normalizedUsername,
    operation: "publication.requested",
    result: "failure",
    targetType: "publication",
    targetId: "pub-fixture-check-needed",
    targetLabel: "배포 확인 필요",
    errorCode: "PUBLICATION_TIMEOUT_UNKNOWN",
    metadata: { method: "POST", status: 409, path: "/bars/{barId}/publications" },
    ...base
  });
  await devAuditRepository.createMaintenanceRun({
    id: "maintenance-fixture-001",
    startedAt: "2026-06-23T23:50:00.000Z",
    finishedAt: "2026-06-23T23:50:01.000Z",
    actorUserId: admin.id,
    actorUsername: admin.normalizedUsername,
    requestId: "req-fixture-maintenance-001",
    status: "dry_run",
    dryRun: true,
    result: {
      orderTerminalCutoff: "2025-06-23T23:50:00.000Z",
      dailySummaryCutoffDate: "2023-06-23",
      closedCancelledOrderTabs: 0,
      dailyOrderSummaries: 0,
      publicationHistoryOverflow: 0
    },
    errorCode: null,
    errorMessage: null
  });
}

type FixtureUser = Awaited<ReturnType<AuthService["createSeedUser"]>>;

async function seedSecondaryFixtureBar({
  admin,
  owner,
  manager,
  staff,
  barService,
  membershipService,
  categoryService,
  menuService
}: {
  admin: FixtureUser;
  owner: FixtureUser;
  manager: FixtureUser;
  staff: FixtureUser;
  barService: BarService;
  membershipService: MembershipService;
  categoryService: CategoryService;
  menuService: MenuItemService;
}) {
  const secondBar = await barService.createBar(admin, { name: "Whisky Lab", currency: "KRW" });
  await barService.updateSettings(admin, secondBar.id, {
    name: "Whisky Lab",
    description: "권한별 메뉴와 바 selector 화면 확인을 위한 두 번째 테스트 바입니다.",
    address: "서울시 용산구 테스트로 10",
    mapUrl: "https://maps.example.com/whisky-lab",
    phoneNumberDigits: "0298765432",
    openingNote: "화-토 19:00-01:00",
    currency: "KRW",
    businessHours: [
      { dayOfWeek: 2, opensAt: "19:00", closesAt: "01:00" },
      { dayOfWeek: 3, opensAt: "19:00", closesAt: "01:00" },
      { dayOfWeek: 4, opensAt: "19:00", closesAt: "01:00" },
      { dayOfWeek: 5, opensAt: "19:00", closesAt: "02:00" },
      { dayOfWeek: 6, opensAt: "19:00", closesAt: "02:00" }
    ],
    links: [{ label: "Reserve", url: "https://example.com/whisky-lab" }]
  });
  await membershipService.addMember(admin, secondBar.id, { userId: owner.id, role: "owner" });
  await membershipService.addMember(admin, secondBar.id, { userId: manager.id, role: "manager" });
  await membershipService.addMember(admin, secondBar.id, { userId: staff.id, role: "staff" });

  const signatureCategory = await createFixtureCategory(categoryService, admin, secondBar.id, {
    name: "시그니처",
    description: "Whisky Lab 전용 테스트 메뉴입니다.",
    showDescription: true
  });
  await createFixtureCategory(categoryService, admin, secondBar.id, {
    name: "테스트 빈 카테고리",
    description: "빈 상태 화면 확인용 카테고리입니다.",
    showDescription: true
  });
  await menuService.createMenuItem(admin, secondBar.id, {
    categoryId: signatureCategory.id,
    name: "랩 올드패션드",
    description: "버번과 데메라라 시럽으로 만든 테스트 시그니처",
    itemType: { source: "system", id: "system-type-cocktail" },
    prices: [{ label: "잔", amountMinor: 16000 }],
    details: {
      template: "cocktail",
      baseSpirit: "버번",
      ingredients: "버번, 비터, 데메라라",
      tasteStyle: "묵직",
      method: "Stir",
      garnish: "오렌지 필",
      glass: "Rocks"
    }
  });
}

function requireFixtureMenuItemId(response: Awaited<ReturnType<MenuItemService["createMenuItem"]>>, label: string): string {
  if (!response.item) throw new Error(`Fixture menu item not created: ${label}`);
  return response.item.id;
}

async function createFixtureCategory(
  service: CategoryService,
  actor: Awaited<ReturnType<AuthService["createSeedUser"]>>,
  barId: string,
  input: { name: string; parentId?: string; description?: string; showDescription?: boolean; isVisible?: boolean }
) {
  const response = await service.createCategory(actor, barId, {
    parentId: input.parentId ?? null,
    name: input.name,
    description: input.description ?? "",
    showDescription: input.showDescription ?? false,
    isVisible: input.isVisible ?? true
  });
  const category = response.categories.find((item) => item.name === input.name && item.parentId === (input.parentId ?? null));
  if (!category) throw new Error(`Fixture category not created: ${input.name}`);
  return category;
}

type DevRequest = {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  on: (event: string, callback: (chunk?: Uint8Array) => void) => void;
};

type DevResponse = {
  statusCode: number;
  setHeader: (name: string, value: string | string[]) => void;
  end: (body?: Uint8Array) => void;
};

function readRequestBody(request: DevRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    request.on("data", (chunk) => {
      if (chunk) chunks.push(chunk);
    });
    request.on("end", () => resolve(new TextDecoder().decode(concatBytes(chunks))));
    request.on("error", () => reject(new Error("Unable to read request body")));
  });
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function splitSetCookie(value: string): string[] {
  if (!value.includes(", bar_")) return [value];
  return value.split(/,\s+(?=bar_)/);
}
