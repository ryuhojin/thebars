import type {
  AddAdjustmentOrderItemRequest,
  AddCustomOrderItemRequest,
  AddMenuOrderItemRequest,
  CancelOrderTabRequest,
  CreateOrderTabRequest,
  OrderTabDetailResponse,
  OrderTabDto,
  OrderTabEventDto,
  OrderTabItemDto,
  OrderTabListQuery,
  OrderMenuPicker,
  OrderTabPermissions,
  OrderTabsResponse,
  ReopenOrderTabRequest,
  RequestCheckoutOrderTabRequest,
  SettleOrderTabRequest,
  UpdateOrderItemQuantityRequest,
  UpdateOrderTabRequest,
  VoidOrderItemRequest
} from "../../contracts/orderTabs";
import { orderTabDetailResponseSchema, orderTabsResponseSchema } from "../../contracts/orderTabs";
import { nowIso } from "../auth/crypto";
import { AuthServiceError } from "../auth/errors";
import type { AuthUserRecord } from "../auth/repository";
import type { BarRecord, BarRepository } from "../bars/repository";
import type { CategoryRecord, CategoryRepository } from "../categories/repository";
import type { MembershipRepository } from "../memberships/repository";
import type { MenuItemPriceRecord, MenuItemRecord, MenuItemRepository } from "../menu-items/repository";
import type { OrderItemMutationResult, OrderTabEventRecord, OrderTabItemRecord, OrderTabRecord, OrderTabRepository, OrderTabTransitionResult } from "./repository";

type OrderAccess = {
  bar: BarRecord;
  permissions: OrderTabPermissions;
};

export type OrderTabServiceOptions = {
  now?: () => Date;
  categoryRepository?: CategoryRepository;
  menuItemRepository?: MenuItemRepository;
};

export class OrderTabService {
  private readonly now: () => Date;

  constructor(
    private readonly barRepository: BarRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly repository: OrderTabRepository,
    options: OrderTabServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.categoryRepository = options.categoryRepository;
    this.menuItemRepository = options.menuItemRepository;
  }

  private readonly categoryRepository?: CategoryRepository;
  private readonly menuItemRepository?: MenuItemRepository;

  async readOrderTabs(actor: AuthUserRecord, barId: string, query: OrderTabListQuery): Promise<OrderTabsResponse> {
    const access = await this.requireOrderAccess(actor, barId);
    const bar = access.bar;
    const normalizedQuery = normalizeQuery(query);
    const businessDate = businessDateFrom(this.now());
    const [tabs, summary, dailySummary] = await Promise.all([
      this.repository.listOrderTabs(bar.id, normalizedQuery),
      this.repository.readOrderTabSummary(bar.id),
      this.repository.readDailyOrderSummary(bar.id, businessDate, bar.currency)
    ]);
    return orderTabsResponseSchema.parse({
      bar: toBarDto(bar),
      canManageOrders: true,
      permissions: access.permissions,
      query: normalizedQuery,
      summary,
      dailySummary,
      tabs: tabs.map(toTabDto)
    });
  }

  async createOrderTab(actor: AuthUserRecord, barId: string, input: CreateOrderTabRequest): Promise<OrderTabDetailResponse> {
    const access = await this.requireOrderAccess(actor, barId);
    const bar = access.bar;
    const now = nowIso(this.now());
    try {
      const created = await this.repository.createOrderTab({
        id: crypto.randomUUID(),
        eventId: crypto.randomUUID(),
        barId: bar.id,
        tableLabel: input.tableLabel,
        guestDescription: input.guestDescription ?? "",
        status: "open",
        currency: bar.currency,
        totalAmountMinor: 0,
        activeItemCount: 0,
        createdByUserId: actor.id,
        now
      });
      return this.readDetailResponse(bar, created.tab, access.permissions);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async readOrderTab(actor: AuthUserRecord, barId: string, orderTabId: string): Promise<OrderTabDetailResponse> {
    const access = await this.requireOrderAccess(actor, barId);
    const bar = access.bar;
    const tab = await this.repository.findOrderTabById(bar.id, orderTabId);
    if (!tab) throw new AuthServiceError(404, "ORDER_TAB_NOT_FOUND", "주문 탭을 찾을 수 없습니다.");
    return this.readDetailResponse(bar, tab, access.permissions);
  }

  async updateOrderTab(
    actor: AuthUserRecord,
    barId: string,
    orderTabId: string,
    input: UpdateOrderTabRequest
  ): Promise<OrderTabDetailResponse> {
    const access = await this.requireOrderAccess(actor, barId);
    const bar = access.bar;
    const result = await this.repository.updateOrderTabDetails({
      barId: bar.id,
      orderTabId,
      eventId: crypto.randomUUID(),
      tableLabel: input.tableLabel,
      guestDescription: input.guestDescription ?? "",
      expectedVersion: input.expectedVersion,
      updatedByUserId: actor.id,
      now: nowIso(this.now())
    });
    if (result.kind === "not_found") {
      throw new AuthServiceError(404, "ORDER_TAB_NOT_FOUND", "주문 탭을 찾을 수 없습니다.");
    }
    if (result.kind === "version_conflict") {
      throw new AuthServiceError(409, "ORDER_TAB_VERSION_CONFLICT", "다른 변경이 먼저 저장되었습니다. 다시 불러온 뒤 저장하세요.", {}, { latestVersion: result.current.version });
    }
    if (result.kind === "immutable") {
      throw new AuthServiceError(409, "ORDER_TAB_IMMUTABLE", "닫혔거나 취소된 주문 탭은 수정할 수 없습니다.", {}, { status: result.current.status });
    }
    return this.readDetailResponse(bar, result.tab, access.permissions);
  }

  async requestCheckout(
    actor: AuthUserRecord,
    barId: string,
    orderTabId: string,
    input: RequestCheckoutOrderTabRequest
  ): Promise<OrderTabDetailResponse> {
    const access = await this.requireOrderAccess(actor, barId);
    const bar = access.bar;
    const result = await this.repository.requestCheckout({
      barId: bar.id,
      orderTabId,
      eventId: crypto.randomUUID(),
      expectedVersion: input.expectedVersion,
      actorUserId: actor.id,
      now: nowIso(this.now())
    });
    if (result.kind !== "updated") throwOrderTabTransitionError(result);
    return this.readDetailResponse(bar, result.tab, access.permissions);
  }

  async reopenOrderTab(
    actor: AuthUserRecord,
    barId: string,
    orderTabId: string,
    input: ReopenOrderTabRequest
  ): Promise<OrderTabDetailResponse> {
    const access = await this.requireOrderAccess(actor, barId);
    const bar = access.bar;
    const result = await this.repository.reopenOrderTab({
      barId: bar.id,
      orderTabId,
      eventId: crypto.randomUUID(),
      expectedVersion: input.expectedVersion,
      reason: input.reason ?? "",
      actorUserId: actor.id,
      now: nowIso(this.now())
    });
    if (result.kind !== "updated") throwOrderTabTransitionError(result);
    return this.readDetailResponse(bar, result.tab, access.permissions);
  }

  async settleOrderTab(
    actor: AuthUserRecord,
    barId: string,
    orderTabId: string,
    input: SettleOrderTabRequest
  ): Promise<OrderTabDetailResponse> {
    const access = await this.requireOrderAccess(actor, barId);
    const bar = access.bar;
    const requestHash = stableRequestHash({
      operation: "order_settle",
      orderTabId,
      expectedVersion: input.expectedVersion,
      transferConfirmed: input.transferConfirmed,
      note: input.note ?? ""
    });
    const existingIdempotency = await this.repository.findIdempotencyRecord(
      bar.id,
      actor.id,
      "order_settle",
      orderTabId,
      input.idempotencyKey
    );
    if (existingIdempotency) {
      if (existingIdempotency.requestHash !== requestHash) {
        throw new AuthServiceError(409, "IDEMPOTENCY_KEY_REUSED", "같은 idempotency key가 다른 요청에 사용되었습니다.");
      }
      return orderTabDetailResponseSchema.parse(JSON.parse(existingIdempotency.responseJson));
    }
    const nowDate = this.now();
    const now = nowIso(nowDate);
    const result = await this.repository.settleOrderTab({
      barId: bar.id,
      orderTabId,
      eventId: crypto.randomUUID(),
      expectedVersion: input.expectedVersion,
      actorUserId: actor.id,
      now,
      note: input.note ?? "",
      dailySummaryId: crypto.randomUUID(),
      businessDate: businessDateFrom(nowDate)
    });
    if (result.kind !== "updated") throwOrderTabTransitionError(result);
    const response = await this.readDetailResponse(bar, result.tab, access.permissions);
    await this.repository.storeIdempotencyRecord({
      id: crypto.randomUUID(),
      barId: bar.id,
      actorUserId: actor.id,
      operation: "order_settle",
      scopeId: orderTabId,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      responseStatus: 200,
      responseJson: JSON.stringify(response),
      createdAt: now,
      expiresAt: nowIso(new Date(nowDate.getTime() + 24 * 60 * 60 * 1000))
    });
    return response;
  }

  async cancelOrderTab(
    actor: AuthUserRecord,
    barId: string,
    orderTabId: string,
    input: CancelOrderTabRequest
  ): Promise<OrderTabDetailResponse> {
    const access = await this.requireOrderAccess(actor, barId);
    const bar = access.bar;
    const nowDate = this.now();
    const result = await this.repository.cancelOrderTab({
      barId: bar.id,
      orderTabId,
      eventId: crypto.randomUUID(),
      expectedVersion: input.expectedVersion,
      reason: input.reason,
      actorUserId: actor.id,
      now: nowIso(nowDate),
      dailySummaryId: crypto.randomUUID(),
      businessDate: businessDateFrom(nowDate)
    });
    if (result.kind !== "updated") throwOrderTabTransitionError(result);
    return this.readDetailResponse(bar, result.tab, access.permissions);
  }

  async addMenuOrderItem(
    actor: AuthUserRecord,
    barId: string,
    orderTabId: string,
    input: AddMenuOrderItemRequest
  ): Promise<OrderTabDetailResponse> {
    const access = await this.requireOrderAccess(actor, barId);
    const bar = access.bar;
    const existingTab = await this.repository.findOrderTabById(bar.id, orderTabId);
    if (!existingTab) throw new AuthServiceError(404, "ORDER_TAB_NOT_FOUND", "주문 탭을 찾을 수 없습니다.");
    const requestHash = stableRequestHash({
      operation: "order_item_add",
      orderTabId,
      expectedVersion: input.expectedVersion,
      menuItemId: input.menuItemId,
      priceId: input.priceId,
      quantity: input.quantity,
      confirmReopen: Boolean(input.confirmReopen)
    });
    const existingIdempotency = await this.repository.findIdempotencyRecord(
      bar.id,
      actor.id,
      "order_item_add",
      orderTabId,
      input.idempotencyKey
    );
    if (existingIdempotency) {
      if (existingIdempotency.requestHash !== requestHash) {
        throw new AuthServiceError(409, "IDEMPOTENCY_KEY_REUSED", "같은 idempotency key가 다른 요청에 사용되었습니다.");
      }
      return orderTabDetailResponseSchema.parse(JSON.parse(existingIdempotency.responseJson));
    }

    const snapshot = await this.requireMenuSnapshot(bar, input.menuItemId, input.priceId);
    const nowDate = this.now();
    const now = nowIso(nowDate);
    const result = await this.repository.addMenuOrderItem({
      id: crypto.randomUUID(),
      eventId: crypto.randomUUID(),
      barId: bar.id,
      orderTabId,
      expectedVersion: input.expectedVersion,
      menuItemId: snapshot.menuItem.id,
      menuItemPublicId: snapshot.menuItem.publicId,
      menuItemName: snapshot.menuItem.name,
      priceId: snapshot.price.id,
      priceLabel: snapshot.price.label,
      volumeText: snapshot.price.volumeText,
      unitAmountMinor: snapshot.price.amountMinor,
      quantity: input.quantity,
      currency: bar.currency,
      actorUserId: actor.id,
      now,
      confirmReopen: Boolean(input.confirmReopen)
    });
    if (result.kind !== "updated") throwOrderItemMutationError(result);
    const response = await this.readDetailResponse(bar, result.tab, access.permissions);
    await this.repository.storeIdempotencyRecord({
      id: crypto.randomUUID(),
      barId: bar.id,
      actorUserId: actor.id,
      operation: "order_item_add",
      scopeId: orderTabId,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      responseStatus: 200,
      responseJson: JSON.stringify(response),
      createdAt: now,
      expiresAt: nowIso(new Date(nowDate.getTime() + 24 * 60 * 60 * 1000))
    });
    return response;
  }

  async addCustomOrderItem(
    actor: AuthUserRecord,
    barId: string,
    orderTabId: string,
    input: AddCustomOrderItemRequest
  ): Promise<OrderTabDetailResponse> {
    const access = await this.requireCustomOrderAccess(actor, barId);
    const bar = access.bar;
    const existingTab = await this.repository.findOrderTabById(bar.id, orderTabId);
    if (!existingTab) throw new AuthServiceError(404, "ORDER_TAB_NOT_FOUND", "주문 탭을 찾을 수 없습니다.");
    const requestHash = stableRequestHash({
      operation: "order_custom_item_add",
      orderTabId,
      expectedVersion: input.expectedVersion,
      name: input.name,
      unitAmountMinor: input.unitAmountMinor,
      quantity: input.quantity,
      reason: input.reason,
      confirmReopen: Boolean(input.confirmReopen)
    });
    const existingIdempotency = await this.repository.findIdempotencyRecord(
      bar.id,
      actor.id,
      "order_custom_item_add",
      orderTabId,
      input.idempotencyKey
    );
    if (existingIdempotency) {
      if (existingIdempotency.requestHash !== requestHash) {
        throw new AuthServiceError(409, "IDEMPOTENCY_KEY_REUSED", "같은 idempotency key가 다른 요청에 사용되었습니다.");
      }
      return orderTabDetailResponseSchema.parse(JSON.parse(existingIdempotency.responseJson));
    }
    const nowDate = this.now();
    const now = nowIso(nowDate);
    const result = await this.repository.addCustomOrderItem({
      id: crypto.randomUUID(),
      eventId: crypto.randomUUID(),
      barId: bar.id,
      orderTabId,
      expectedVersion: input.expectedVersion,
      name: input.name,
      unitAmountMinor: input.unitAmountMinor,
      quantity: input.quantity,
      reason: input.reason,
      currency: bar.currency,
      actorUserId: actor.id,
      now,
      confirmReopen: Boolean(input.confirmReopen)
    });
    if (result.kind !== "updated") throwOrderItemMutationError(result);
    const response = await this.readDetailResponse(bar, result.tab, access.permissions);
    await this.repository.storeIdempotencyRecord({
      id: crypto.randomUUID(),
      barId: bar.id,
      actorUserId: actor.id,
      operation: "order_custom_item_add",
      scopeId: orderTabId,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      responseStatus: 200,
      responseJson: JSON.stringify(response),
      createdAt: now,
      expiresAt: nowIso(new Date(nowDate.getTime() + 24 * 60 * 60 * 1000))
    });
    return response;
  }

  async addAdjustmentOrderItem(
    actor: AuthUserRecord,
    barId: string,
    orderTabId: string,
    input: AddAdjustmentOrderItemRequest
  ): Promise<OrderTabDetailResponse> {
    const access = await this.requireAdjustmentOrderAccess(actor, barId);
    const bar = access.bar;
    const existingTab = await this.repository.findOrderTabById(bar.id, orderTabId);
    if (!existingTab) throw new AuthServiceError(404, "ORDER_TAB_NOT_FOUND", "주문 탭을 찾을 수 없습니다.");
    const requestHash = stableRequestHash({
      operation: "order_adjustment_add",
      orderTabId,
      expectedVersion: input.expectedVersion,
      label: input.label,
      amountMinor: input.amountMinor,
      reason: input.reason,
      confirmReopen: Boolean(input.confirmReopen)
    });
    const existingIdempotency = await this.repository.findIdempotencyRecord(
      bar.id,
      actor.id,
      "order_adjustment_add",
      orderTabId,
      input.idempotencyKey
    );
    if (existingIdempotency) {
      if (existingIdempotency.requestHash !== requestHash) {
        throw new AuthServiceError(409, "IDEMPOTENCY_KEY_REUSED", "같은 idempotency key가 다른 요청에 사용되었습니다.");
      }
      return orderTabDetailResponseSchema.parse(JSON.parse(existingIdempotency.responseJson));
    }
    const nowDate = this.now();
    const now = nowIso(nowDate);
    const result = await this.repository.addAdjustmentOrderItem({
      id: crypto.randomUUID(),
      eventId: crypto.randomUUID(),
      barId: bar.id,
      orderTabId,
      expectedVersion: input.expectedVersion,
      label: input.label,
      amountMinor: input.amountMinor,
      reason: input.reason,
      currency: bar.currency,
      actorUserId: actor.id,
      now,
      confirmReopen: Boolean(input.confirmReopen)
    });
    if (result.kind !== "updated") throwOrderItemMutationError(result);
    const response = await this.readDetailResponse(bar, result.tab, access.permissions);
    await this.repository.storeIdempotencyRecord({
      id: crypto.randomUUID(),
      barId: bar.id,
      actorUserId: actor.id,
      operation: "order_adjustment_add",
      scopeId: orderTabId,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      responseStatus: 200,
      responseJson: JSON.stringify(response),
      createdAt: now,
      expiresAt: nowIso(new Date(nowDate.getTime() + 24 * 60 * 60 * 1000))
    });
    return response;
  }

  async updateOrderItemQuantity(
    actor: AuthUserRecord,
    barId: string,
    orderTabId: string,
    itemId: string,
    input: UpdateOrderItemQuantityRequest
  ): Promise<OrderTabDetailResponse> {
    const access = await this.requireOrderAccess(actor, barId);
    const bar = access.bar;
    const result = await this.repository.updateOrderItemQuantity({
      eventId: crypto.randomUUID(),
      barId: bar.id,
      orderTabId,
      itemId,
      expectedVersion: input.expectedVersion,
      itemExpectedVersion: input.itemExpectedVersion,
      quantity: input.quantity,
      actorUserId: actor.id,
      now: nowIso(this.now())
    });
    if (result.kind !== "updated") throwOrderItemMutationError(result);
    return this.readDetailResponse(bar, result.tab, access.permissions);
  }

  async voidOrderItem(
    actor: AuthUserRecord,
    barId: string,
    orderTabId: string,
    itemId: string,
    input: VoidOrderItemRequest
  ): Promise<OrderTabDetailResponse> {
    const access = await this.requireOrderAccess(actor, barId);
    const bar = access.bar;
    const result = await this.repository.voidOrderItem({
      eventId: crypto.randomUUID(),
      barId: bar.id,
      orderTabId,
      itemId,
      expectedVersion: input.expectedVersion,
      itemExpectedVersion: input.itemExpectedVersion,
      reason: input.reason,
      actorUserId: actor.id,
      now: nowIso(this.now())
    });
    if (result.kind !== "updated") throwOrderItemMutationError(result);
    return this.readDetailResponse(bar, result.tab, access.permissions);
  }

  private async readDetailResponse(bar: BarRecord, tab: OrderTabRecord, permissions: OrderTabPermissions): Promise<OrderTabDetailResponse> {
    const [events, items, menuPicker] = await Promise.all([
      this.repository.listOrderTabEvents(bar.id, tab.id, 30),
      this.repository.listOrderTabItems(bar.id, tab.id),
      this.readMenuPicker(bar)
    ]);
    return orderTabDetailResponseSchema.parse({
      bar: toBarDto(bar),
      canManageOrders: true,
      permissions,
      tab: toTabDto(tab),
      items: items.map(toItemDto),
      menuPicker,
      events: events.map(toEventDto)
    });
  }

  private async requireMenuSnapshot(
    bar: BarRecord,
    menuItemId: string,
    priceId: string
  ): Promise<{ menuItem: MenuItemRecord; price: MenuItemPriceRecord }> {
    if (!this.menuItemRepository) {
      throw new AuthServiceError(409, "ORDER_MENU_PICKER_UNAVAILABLE", "주문에 추가할 메뉴를 불러올 수 없습니다.");
    }
    const menuItem = await this.menuItemRepository.findMenuItemById(bar.id, menuItemId);
    if (!menuItem || menuItem.saleStatus !== "available" || !menuItem.isVisible) {
      throw new AuthServiceError(409, "ORDER_MENU_ITEM_UNAVAILABLE", "주문에 추가할 수 없는 메뉴입니다.");
    }
    const prices = await this.menuItemRepository.listMenuItemPrices(bar.id, menuItem.id);
    const price = prices.find((item) => item.id === priceId);
    if (!price) throw new AuthServiceError(409, "ORDER_MENU_PRICE_UNAVAILABLE", "선택한 가격 항목을 사용할 수 없습니다.");
    return { menuItem, price };
  }

  private async readMenuPicker(bar: BarRecord): Promise<OrderMenuPicker> {
    if (!this.menuItemRepository || !this.categoryRepository) return { items: [] };
    const [menuItems, categories] = await Promise.all([
      this.menuItemRepository.listMenuItems(bar.id),
      this.categoryRepository.listCategories(bar.id)
    ]);
    const categoryPathById = buildCategoryPathMap(categories);
    const pickerItems = await Promise.all(
      menuItems
        .filter((item) => item.saleStatus === "available" && item.isVisible)
        .sort(
          (left, right) =>
            (categoryPathById.get(left.categoryId) ?? "").localeCompare(categoryPathById.get(right.categoryId) ?? "", "ko") ||
            left.sortOrder - right.sortOrder ||
            left.name.localeCompare(right.name, "ko")
        )
        .map(async (item) => {
          const prices = await this.menuItemRepository?.listMenuItemPrices(bar.id, item.id);
          const orderedPrices = (prices ?? []).sort((left, right) => left.displayOrder - right.displayOrder || left.label.localeCompare(right.label, "ko"));
          if (orderedPrices.length === 0) return null;
          return {
            id: item.id,
            publicId: item.publicId,
            name: item.name,
            categoryPath: categoryPathById.get(item.categoryId) ?? "삭제된 카테고리",
            prices: orderedPrices.map((price) => ({
              id: price.id,
              label: price.label,
              volumeText: price.volumeText,
              amountMinor: price.amountMinor,
              currency: bar.currency
            }))
          };
        })
    );
    return { items: pickerItems.filter((item): item is NonNullable<typeof item> => item !== null) };
  }

  private async requireOrderAccess(actor: AuthUserRecord, barId: string): Promise<OrderAccess> {
    const bar = await this.barRepository.findBarById(barId);
    if (!bar || bar.status !== "active") throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    if (actor.isSystemAdmin) {
      return {
        bar,
        permissions: {
          canManageOrders: true,
          canAddCustomOrderItem: true,
          canApplyOrderAdjustment: true
        }
      };
    }
    const membership = await this.membershipRepository.findActiveMembershipForUser(bar.id, actor.id);
    if (!membership) throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    const rolePermissions = await this.membershipRepository.ensureDefaultRolePermissions(bar.id, nowIso(this.now()));
    const rolePermission = rolePermissions.find((permission) => permission.role === membership.role);
    if (!rolePermission?.canManageOrders) {
      throw new AuthServiceError(403, "ORDER_PERMISSION_REQUIRED", "이 바에서 주문 탭을 관리할 권한이 없습니다.");
    }
    return {
      bar,
      permissions: {
        canManageOrders: true,
        canAddCustomOrderItem: rolePermission.canAddCustomOrderItem,
        canApplyOrderAdjustment: rolePermission.canApplyOrderAdjustment
      }
    };
  }

  private async requireCustomOrderAccess(actor: AuthUserRecord, barId: string): Promise<OrderAccess> {
    const access = await this.requireOrderAccess(actor, barId);
    if (!access.permissions.canAddCustomOrderItem) {
      throw new AuthServiceError(403, "ORDER_CUSTOM_ITEM_PERMISSION_REQUIRED", "기타 주문 항목을 추가할 권한이 없습니다.");
    }
    return access;
  }

  private async requireAdjustmentOrderAccess(actor: AuthUserRecord, barId: string): Promise<OrderAccess> {
    const access = await this.requireOrderAccess(actor, barId);
    if (!access.permissions.canApplyOrderAdjustment) {
      throw new AuthServiceError(403, "ORDER_ADJUSTMENT_PERMISSION_REQUIRED", "금액 조정을 적용할 권한이 없습니다.");
    }
    return access;
  }
}

function normalizeQuery(query: OrderTabListQuery): Required<OrderTabListQuery> {
  return {
    status: query.status ?? "all",
    query: query.query ?? ""
  };
}

function toBarDto(bar: BarRecord) {
  return {
    id: bar.id,
    name: bar.name,
    currency: bar.currency,
    status: bar.status
  };
}

function toTabDto(tab: OrderTabRecord): OrderTabDto {
  return {
    id: tab.id,
    barId: tab.barId,
    tabNumber: tab.tabNumber,
    displayCode: `#${tab.tabNumber}`,
    tableLabel: tab.tableLabel,
    guestDescription: tab.guestDescription,
    status: tab.status,
    totalAmountMinor: tab.totalAmountMinor,
    currency: tab.currency,
    activeItemCount: tab.activeItemCount,
    version: tab.version,
    openedAt: tab.openedAt,
    checkoutRequestedAt: tab.checkoutRequestedAt,
    closedAt: tab.closedAt,
    cancelledAt: tab.cancelledAt,
    finalTotalAmountMinor: tab.finalTotalAmountMinor,
    settledAt: tab.settledAt,
    settledByUserId: tab.settledByUserId,
    cancelledReason: tab.cancelledReason,
    cancelledByUserId: tab.cancelledByUserId,
    createdAt: tab.createdAt,
    updatedAt: tab.updatedAt
  };
}

function toEventDto(event: OrderTabEventRecord): OrderTabEventDto {
  return {
    id: event.id,
    orderTabId: event.orderTabId,
    type: event.type,
    beforeStatus: event.beforeStatus,
    afterStatus: event.afterStatus,
    expectedVersion: event.expectedVersion,
    resultingVersion: event.resultingVersion,
    note: event.note,
    actorUserId: event.actorUserId,
    createdAt: event.createdAt
  };
}

function toItemDto(item: OrderTabItemRecord): OrderTabItemDto {
  return {
    id: item.id,
    orderTabId: item.orderTabId,
    type: item.type,
    status: item.status,
    menuItemId: item.menuItemId,
    menuItemPublicId: item.menuItemPublicId,
    menuItemName: item.menuItemName,
    priceId: item.priceId,
    priceLabel: item.priceLabel,
    volumeText: item.volumeText,
    unitAmountMinor: item.unitAmountMinor,
    quantity: item.quantity,
    lineTotalAmountMinor: item.lineTotalAmountMinor,
    currency: item.currency,
    reason: item.reason,
    version: item.version,
    voidReason: item.voidReason,
    createdByUserId: item.createdByUserId,
    updatedByUserId: item.updatedByUserId,
    voidedByUserId: item.voidedByUserId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    voidedAt: item.voidedAt
  };
}

function buildCategoryPathMap(categories: CategoryRecord[]): Map<string, string> {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const paths = new Map<string, string>();
  for (const category of categories) {
    const names = [category.name];
    let parentId = category.parentId;
    while (parentId) {
      const parent = byId.get(parentId);
      if (!parent) break;
      names.unshift(parent.name);
      parentId = parent.parentId;
    }
    paths.set(category.id, names.join(" / "));
  }
  return paths;
}

function stableRequestHash(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

function businessDateFrom(date: Date): string {
  return nowIso(date).slice(0, 10);
}

function throwOrderTabTransitionError(result: Exclude<OrderTabTransitionResult, { kind: "updated" }>): never {
  if (result.kind === "not_found") {
    throw new AuthServiceError(404, "ORDER_TAB_NOT_FOUND", "주문 탭을 찾을 수 없습니다.");
  }
  if (result.kind === "version_conflict") {
    throw new AuthServiceError(409, "ORDER_TAB_VERSION_CONFLICT", "다른 변경이 먼저 저장되었습니다. 다시 불러온 뒤 저장하세요.", {}, { latestVersion: result.current.version });
  }
  if (result.kind === "immutable") {
    throw new AuthServiceError(409, "ORDER_TAB_IMMUTABLE", "닫혔거나 취소된 주문 탭은 수정할 수 없습니다.", {}, { status: result.current.status });
  }
  if (result.kind === "empty_settle") {
    throw new AuthServiceError(422, "ORDER_TAB_EMPTY", "주문 라인이 없는 탭은 정산할 수 없습니다.", {}, { status: result.current.status });
  }
  if (result.kind === "cancel_not_empty") {
    throw new AuthServiceError(409, "ORDER_TAB_CANCEL_NOT_EMPTY", "주문 항목이 남아 있는 탭은 취소할 수 없습니다. 먼저 모든 항목을 취소 처리하세요.", {}, {
      activeItemCount: result.current.activeItemCount
    });
  }
  throw new AuthServiceError(409, "ORDER_TAB_STATUS_CONFLICT", "현재 주문 탭 상태에서는 이 작업을 수행할 수 없습니다.", {}, { status: result.current.status });
}

function throwOrderItemMutationError(result: Exclude<OrderItemMutationResult, { kind: "updated" }>): never {
  if (result.kind === "not_found") {
    throw new AuthServiceError(404, "ORDER_TAB_NOT_FOUND", "주문 탭을 찾을 수 없습니다.");
  }
  if (result.kind === "item_not_found") {
    throw new AuthServiceError(404, "ORDER_ITEM_NOT_FOUND", "주문 라인을 찾을 수 없습니다.");
  }
  if (result.kind === "version_conflict") {
    throw new AuthServiceError(409, "ORDER_TAB_VERSION_CONFLICT", "다른 변경이 먼저 저장되었습니다. 다시 불러온 뒤 저장하세요.", {}, { latestVersion: result.current.version });
  }
  if (result.kind === "item_version_conflict") {
    throw new AuthServiceError(409, "ORDER_ITEM_VERSION_CONFLICT", "다른 라인 변경이 먼저 저장되었습니다. 다시 불러온 뒤 저장하세요.", {}, {
      latestVersion: result.current.version,
      itemLatestVersion: result.item.version
    });
  }
  if (result.kind === "immutable") {
    throw new AuthServiceError(409, "ORDER_TAB_IMMUTABLE", "닫혔거나 취소된 주문 탭은 수정할 수 없습니다.", {}, { status: result.current.status });
  }
  if (result.kind === "line_immutable") {
    throw new AuthServiceError(409, "ORDER_ITEM_IMMUTABLE", "취소 처리된 주문 항목은 수정할 수 없습니다.", {}, { itemStatus: result.item.status });
  }
  if (result.kind === "quantity_not_supported") {
    throw new AuthServiceError(409, "ORDER_ITEM_QUANTITY_NOT_SUPPORTED", "이 주문 라인은 수량을 수정할 수 없습니다.", {}, { itemType: result.item.type });
  }
  if (result.kind === "total_negative") {
    throw new AuthServiceError(422, "ORDER_TOTAL_NEGATIVE", "할인 또는 항목 취소 결과가 현재 주문 합계를 초과합니다.", {}, { currentTotalAmountMinor: result.current.totalAmountMinor });
  }
  throw new AuthServiceError(409, "ORDER_TAB_REOPEN_REQUIRED", "계산 요청 중인 탭에 주문을 추가하려면 다시 열기를 확인하세요.", {}, { status: result.current.status });
}

function mapRepositoryError(error: unknown): AuthServiceError {
  if (error instanceof AuthServiceError) return error;
  if (error instanceof Error && /UNIQUE|constraint|ORDER_TAB_NUMBER/i.test(error.message)) {
    return new AuthServiceError(409, "ORDER_TAB_NUMBER_CONFLICT", "주문 탭 번호를 할당하지 못했습니다. 다시 시도하세요.");
  }
  throw error;
}
