import type { DailyOrderSummary, OrderTabListQuery, OrderTabStatus, OrderTabSummary } from "../../contracts/orderTabs";
import type {
  AdjustmentOrderItemInput,
  CancelOrderTabInput,
  CreateOrderTabInput,
  CustomOrderItemInput,
  IdempotencyRecord,
  MenuOrderItemSnapshotInput,
  OrderIdempotencyOperation,
  OrderItemMutationResult,
  OrderRetentionPolicy,
  OrderRetentionResult,
  OrderTabEventRecord,
  OrderTabItemRecord,
  OrderTabRecord,
  OrderTabRepository,
  OrderTabTransitionInput,
  OrderTabTransitionResult,
  ReopenOrderTabInput,
  SettleOrderTabInput,
  UpdateOrderItemQuantityInput,
  UpdateOrderTabDetailsInput,
  UpdateOrderTabDetailsResult,
  VoidOrderItemInput
} from "./repository";

export class MemoryOrderTabRepository implements OrderTabRepository {
  private readonly tabs = new Map<string, OrderTabRecord>();
  private readonly events = new Map<string, OrderTabEventRecord>();
  private readonly items = new Map<string, OrderTabItemRecord>();
  private readonly idempotencyRecords = new Map<string, IdempotencyRecord>();
  private readonly dailySummaries = new Map<string, DailyOrderSummary>();
  private readonly nextTabNumberByBar = new Map<string, number>();

  reset() {
    this.tabs.clear();
    this.events.clear();
    this.items.clear();
    this.idempotencyRecords.clear();
    this.dailySummaries.clear();
    this.nextTabNumberByBar.clear();
  }

  async listOrderTabs(barId: string, query: OrderTabListQuery): Promise<OrderTabRecord[]> {
    const status = query.status ?? "all";
    const text = normalizeSearch(query.query ?? "");
    return [...this.tabs.values()]
      .filter((tab) => tab.barId === barId)
      .filter((tab) => {
        if (status === "all") return true;
        if (status === "active") return tab.status === "open" || tab.status === "checkout_requested";
        return tab.status === status;
      })
      .filter((tab) => !text || normalizeSearch(`#${tab.tabNumber} ${tab.tableLabel} ${tab.guestDescription}`).includes(text))
      .sort((left, right) => sortByStatus(left.status) - sortByStatus(right.status) || right.updatedAt.localeCompare(left.updatedAt) || right.tabNumber - left.tabNumber)
      .map(cloneTab);
  }

  async readOrderTabSummary(barId: string): Promise<OrderTabSummary> {
    const tabs = [...this.tabs.values()].filter((tab) => tab.barId === barId);
    return {
      total: tabs.length,
      open: tabs.filter((tab) => tab.status === "open").length,
      checkoutRequested: tabs.filter((tab) => tab.status === "checkout_requested").length,
      closed: tabs.filter((tab) => tab.status === "closed").length,
      cancelled: tabs.filter((tab) => tab.status === "cancelled").length,
      activeTotalAmountMinor: tabs
        .filter((tab) => tab.status === "open" || tab.status === "checkout_requested")
        .reduce((total, tab) => total + tab.totalAmountMinor, 0)
    };
  }

  async findOrderTabById(barId: string, orderTabId: string): Promise<OrderTabRecord | null> {
    const tab = this.tabs.get(orderTabId);
    return tab?.barId === barId ? cloneTab(tab) : null;
  }

  async createOrderTab(input: CreateOrderTabInput): Promise<{ tab: OrderTabRecord; event: OrderTabEventRecord }> {
    const tabNumber = this.allocateTabNumber(input.barId);
    const tab: OrderTabRecord = {
      id: input.id,
      barId: input.barId,
      tabNumber,
      tableLabel: input.tableLabel,
      guestDescription: input.guestDescription,
      status: input.status,
      totalAmountMinor: input.totalAmountMinor,
      currency: input.currency,
      activeItemCount: input.activeItemCount,
      version: 1,
      openedAt: input.now,
      checkoutRequestedAt: input.checkoutRequestedAt ?? (input.status === "checkout_requested" ? input.now : null),
      closedAt: input.status === "closed" ? input.now : null,
      cancelledAt: input.status === "cancelled" ? input.now : null,
      finalTotalAmountMinor: input.status === "closed" ? input.totalAmountMinor : null,
      settledAt: input.status === "closed" ? input.now : null,
      settledByUserId: input.status === "closed" ? input.createdByUserId : null,
      cancelledReason: input.status === "cancelled" ? input.note ?? "취소" : null,
      cancelledByUserId: input.status === "cancelled" ? input.createdByUserId : null,
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.createdByUserId,
      createdAt: input.now,
      updatedAt: input.now
    };
    const event: OrderTabEventRecord = {
      id: input.eventId,
      barId: input.barId,
      orderTabId: tab.id,
      type: "tab_created",
      beforeStatus: null,
      afterStatus: tab.status,
      expectedVersion: null,
      resultingVersion: tab.version,
      note: input.note ?? "테이블 생성",
      actorUserId: input.createdByUserId,
      createdAt: input.now
    };
    this.tabs.set(tab.id, tab);
    this.events.set(event.id, event);
    return { tab: cloneTab(tab), event: cloneEvent(event) };
  }

  async updateOrderTabDetails(input: UpdateOrderTabDetailsInput): Promise<UpdateOrderTabDetailsResult> {
    const current = this.tabs.get(input.orderTabId);
    if (!current || current.barId !== input.barId) return { kind: "not_found" };
    if (current.version !== input.expectedVersion) return { kind: "version_conflict", current: cloneTab(current) };
    if (current.status === "closed" || current.status === "cancelled") return { kind: "immutable", current: cloneTab(current) };

    const updated: OrderTabRecord = {
      ...current,
      tableLabel: input.tableLabel,
      guestDescription: input.guestDescription,
      version: current.version + 1,
      updatedByUserId: input.updatedByUserId,
      updatedAt: input.now
    };
    const event: OrderTabEventRecord = {
      id: input.eventId,
      barId: input.barId,
      orderTabId: input.orderTabId,
      type: "tab_updated",
      beforeStatus: current.status,
      afterStatus: updated.status,
      expectedVersion: input.expectedVersion,
      resultingVersion: updated.version,
      note: "테이블 설명 수정",
      actorUserId: input.updatedByUserId,
      createdAt: input.now
    };
    this.tabs.set(updated.id, updated);
    this.events.set(event.id, event);
    return { kind: "updated", tab: cloneTab(updated), event: cloneEvent(event) };
  }

  async requestCheckout(input: OrderTabTransitionInput): Promise<OrderTabTransitionResult> {
    const current = this.tabs.get(input.orderTabId);
    const guard = this.guardTransitionTab(current, input.barId, input.expectedVersion);
    if (guard) return guard;
    if (!current) return { kind: "not_found" };
    if (current.status !== "open") return { kind: "invalid_transition", current: cloneTab(current) };
    const updated = this.recalculateTab(current, {
      status: "checkout_requested",
      checkoutRequestedAt: input.now,
      version: current.version + 1,
      updatedByUserId: input.actorUserId,
      updatedAt: input.now
    });
    const event = this.createEvent({
      id: input.eventId,
      barId: input.barId,
      orderTabId: input.orderTabId,
      type: "checkout_requested",
      beforeStatus: current.status,
      afterStatus: updated.status,
      expectedVersion: input.expectedVersion,
      resultingVersion: updated.version,
      note: "계산 요청",
      actorUserId: input.actorUserId,
      createdAt: input.now
    });
    return { kind: "updated", tab: cloneTab(updated), event: cloneEvent(event) };
  }

  async reopenOrderTab(input: ReopenOrderTabInput): Promise<OrderTabTransitionResult> {
    const current = this.tabs.get(input.orderTabId);
    const guard = this.guardTransitionTab(current, input.barId, input.expectedVersion);
    if (guard) return guard;
    if (!current) return { kind: "not_found" };
    if (current.status !== "checkout_requested") return { kind: "invalid_transition", current: cloneTab(current) };
    const updated = this.recalculateTab(current, {
      status: "open",
      checkoutRequestedAt: null,
      version: current.version + 1,
      updatedByUserId: input.actorUserId,
      updatedAt: input.now
    });
    const event = this.createEvent({
      id: input.eventId,
      barId: input.barId,
      orderTabId: input.orderTabId,
      type: "tab_reopened",
      beforeStatus: current.status,
      afterStatus: updated.status,
      expectedVersion: input.expectedVersion,
      resultingVersion: updated.version,
      note: input.reason ? `재오픈: ${input.reason}` : "테이블 재오픈",
      actorUserId: input.actorUserId,
      createdAt: input.now
    });
    return { kind: "updated", tab: cloneTab(updated), event: cloneEvent(event) };
  }

  async settleOrderTab(input: SettleOrderTabInput): Promise<OrderTabTransitionResult> {
    const current = this.tabs.get(input.orderTabId);
    const guard = this.guardTransitionTab(current, input.barId, input.expectedVersion);
    if (guard) return guard;
    if (!current) return { kind: "not_found" };
    if (current.status !== "open" && current.status !== "checkout_requested") return { kind: "invalid_transition", current: cloneTab(current) };
    const totals = this.calculateActiveTotals(current.barId, current.id);
    if (totals.activeItemCount === 0) return { kind: "empty_settle", current: cloneTab(current) };
    const updated: OrderTabRecord = {
      ...current,
      status: "closed",
      totalAmountMinor: totals.totalAmountMinor,
      activeItemCount: totals.activeItemCount,
      checkoutRequestedAt: current.checkoutRequestedAt,
      closedAt: input.now,
      finalTotalAmountMinor: totals.totalAmountMinor,
      settledAt: input.now,
      settledByUserId: input.actorUserId,
      version: current.version + 1,
      updatedByUserId: input.actorUserId,
      updatedAt: input.now
    };
    this.tabs.set(updated.id, updated);
    const event = this.createEvent({
      id: input.eventId,
      barId: input.barId,
      orderTabId: input.orderTabId,
      type: "tab_settled",
      beforeStatus: current.status,
      afterStatus: updated.status,
      expectedVersion: input.expectedVersion,
      resultingVersion: updated.version,
      note: input.note ? `정산 완료: ${input.note}` : "정산 완료",
      actorUserId: input.actorUserId,
      createdAt: input.now
    });
    const dailySummary = this.rebuildDailyOrderSummary(input.barId, input.businessDate, updated.currency, input.now);
    return { kind: "updated", tab: cloneTab(updated), event: cloneEvent(event), dailySummary };
  }

  async cancelOrderTab(input: CancelOrderTabInput): Promise<OrderTabTransitionResult> {
    const current = this.tabs.get(input.orderTabId);
    const guard = this.guardTransitionTab(current, input.barId, input.expectedVersion);
    if (guard) return guard;
    if (!current) return { kind: "not_found" };
    if (current.status !== "open" && current.status !== "checkout_requested") return { kind: "invalid_transition", current: cloneTab(current) };
    const totals = this.calculateActiveTotals(current.barId, current.id);
    if (totals.activeItemCount > 0) return { kind: "cancel_not_empty", current: cloneTab(current) };
    const updated: OrderTabRecord = {
      ...current,
      status: "cancelled",
      totalAmountMinor: 0,
      activeItemCount: 0,
      checkoutRequestedAt: current.checkoutRequestedAt,
      cancelledAt: input.now,
      cancelledReason: input.reason,
      cancelledByUserId: input.actorUserId,
      version: current.version + 1,
      updatedByUserId: input.actorUserId,
      updatedAt: input.now
    };
    this.tabs.set(updated.id, updated);
    const event = this.createEvent({
      id: input.eventId,
      barId: input.barId,
      orderTabId: input.orderTabId,
      type: "tab_cancelled",
      beforeStatus: current.status,
      afterStatus: updated.status,
      expectedVersion: input.expectedVersion,
      resultingVersion: updated.version,
      note: `테이블 취소: ${input.reason}`,
      actorUserId: input.actorUserId,
      createdAt: input.now
    });
    const dailySummary = this.rebuildDailyOrderSummary(input.barId, input.businessDate, updated.currency, input.now);
    return { kind: "updated", tab: cloneTab(updated), event: cloneEvent(event), dailySummary };
  }

  async readDailyOrderSummary(barId: string, businessDate: string, currency: string): Promise<DailyOrderSummary> {
    const existing = this.dailySummaries.get(dailySummaryKey(barId, businessDate));
    return existing ? { ...existing } : this.rebuildDailyOrderSummary(barId, businessDate, currency, null);
  }

  async listOrderTabEvents(barId: string, orderTabId: string, limit: number): Promise<OrderTabEventRecord[]> {
    return [...this.events.values()]
      .filter((event) => event.barId === barId && event.orderTabId === orderTabId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
      .slice(0, limit)
      .map(cloneEvent);
  }

  async listOrderTabItems(barId: string, orderTabId: string): Promise<OrderTabItemRecord[]> {
    return [...this.items.values()]
      .filter((item) => item.barId === barId && item.orderTabId === orderTabId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .map(cloneItem);
  }

  async addMenuOrderItem(input: MenuOrderItemSnapshotInput): Promise<OrderItemMutationResult> {
    const current = this.tabs.get(input.orderTabId);
    const guard = this.guardMutableTab(current, input.barId, input.expectedVersion, input.confirmReopen);
    if (guard) return guard;
    if (!current) return { kind: "not_found" };
    const nextVersion = current.version + 1;
    const item: OrderTabItemRecord = {
      id: input.id,
      barId: input.barId,
      orderTabId: input.orderTabId,
      type: "menu",
      status: "active",
      menuItemId: input.menuItemId,
      menuItemPublicId: input.menuItemPublicId,
      menuItemName: input.menuItemName,
      priceId: input.priceId,
      priceLabel: input.priceLabel,
      volumeText: input.volumeText,
      unitAmountMinor: input.unitAmountMinor,
      quantity: input.quantity,
      lineTotalAmountMinor: input.unitAmountMinor * input.quantity,
      currency: input.currency,
      reason: null,
      version: 1,
      voidReason: null,
      createdByUserId: input.actorUserId,
      updatedByUserId: input.actorUserId,
      voidedByUserId: null,
      createdAt: input.now,
      updatedAt: input.now,
      voidedAt: null
    };
    this.items.set(item.id, item);
    const updated = this.recalculateTab(current, {
      status: current.status === "checkout_requested" ? "open" : current.status,
      checkoutRequestedAt: current.status === "checkout_requested" ? null : current.checkoutRequestedAt,
      version: nextVersion,
      updatedByUserId: input.actorUserId,
      updatedAt: input.now
    });
    const event = this.createEvent({
      id: input.eventId,
      barId: input.barId,
      orderTabId: input.orderTabId,
      type: "menu_item_added",
      beforeStatus: current.status,
      afterStatus: updated.status,
      expectedVersion: input.expectedVersion,
      resultingVersion: nextVersion,
      note: `메뉴 추가: ${input.menuItemName} ${input.quantity}개`,
      actorUserId: input.actorUserId,
      createdAt: input.now
    });
    return { kind: "updated", tab: cloneTab(updated), item: cloneItem(item), event: cloneEvent(event) };
  }

  async addCustomOrderItem(input: CustomOrderItemInput): Promise<OrderItemMutationResult> {
    const current = this.tabs.get(input.orderTabId);
    const guard = this.guardMutableTab(current, input.barId, input.expectedVersion, input.confirmReopen);
    if (guard) return guard;
    if (!current) return { kind: "not_found" };
    const lineTotal = input.unitAmountMinor * input.quantity;
    if (current.totalAmountMinor + lineTotal < 0) return { kind: "total_negative", current: cloneTab(current) };
    const nextVersion = current.version + 1;
    const item: OrderTabItemRecord = {
      id: input.id,
      barId: input.barId,
      orderTabId: input.orderTabId,
      type: "custom",
      status: "active",
      menuItemId: null,
      menuItemPublicId: null,
      menuItemName: input.name,
      priceId: null,
      priceLabel: "기타 항목",
      volumeText: "",
      unitAmountMinor: input.unitAmountMinor,
      quantity: input.quantity,
      lineTotalAmountMinor: lineTotal,
      currency: input.currency,
      reason: input.reason,
      version: 1,
      voidReason: null,
      createdByUserId: input.actorUserId,
      updatedByUserId: input.actorUserId,
      voidedByUserId: null,
      createdAt: input.now,
      updatedAt: input.now,
      voidedAt: null
    };
    this.items.set(item.id, item);
    const updated = this.recalculateTab(current, {
      status: current.status === "checkout_requested" ? "open" : current.status,
      checkoutRequestedAt: current.status === "checkout_requested" ? null : current.checkoutRequestedAt,
      version: nextVersion,
      updatedByUserId: input.actorUserId,
      updatedAt: input.now
    });
    const event = this.createEvent({
      id: input.eventId,
      barId: input.barId,
      orderTabId: input.orderTabId,
      type: "custom_item_added",
      beforeStatus: current.status,
      afterStatus: updated.status,
      expectedVersion: input.expectedVersion,
      resultingVersion: nextVersion,
      note: `기타 항목 추가: ${input.name} ${input.quantity}개 · ${input.reason}`,
      actorUserId: input.actorUserId,
      createdAt: input.now
    });
    return { kind: "updated", tab: cloneTab(updated), item: cloneItem(item), event: cloneEvent(event) };
  }

  async addAdjustmentOrderItem(input: AdjustmentOrderItemInput): Promise<OrderItemMutationResult> {
    const current = this.tabs.get(input.orderTabId);
    const guard = this.guardMutableTab(current, input.barId, input.expectedVersion, input.confirmReopen);
    if (guard) return guard;
    if (!current) return { kind: "not_found" };
    if (current.totalAmountMinor + input.amountMinor < 0) return { kind: "total_negative", current: cloneTab(current) };
    const nextVersion = current.version + 1;
    const item: OrderTabItemRecord = {
      id: input.id,
      barId: input.barId,
      orderTabId: input.orderTabId,
      type: "adjustment",
      status: "active",
      menuItemId: null,
      menuItemPublicId: null,
      menuItemName: input.label,
      priceId: null,
      priceLabel: input.amountMinor < 0 ? "할인" : "추가금",
      volumeText: "",
      unitAmountMinor: input.amountMinor,
      quantity: 1,
      lineTotalAmountMinor: input.amountMinor,
      currency: input.currency,
      reason: input.reason,
      version: 1,
      voidReason: null,
      createdByUserId: input.actorUserId,
      updatedByUserId: input.actorUserId,
      voidedByUserId: null,
      createdAt: input.now,
      updatedAt: input.now,
      voidedAt: null
    };
    this.items.set(item.id, item);
    const updated = this.recalculateTab(current, {
      status: current.status === "checkout_requested" ? "open" : current.status,
      checkoutRequestedAt: current.status === "checkout_requested" ? null : current.checkoutRequestedAt,
      version: nextVersion,
      updatedByUserId: input.actorUserId,
      updatedAt: input.now
    });
    const event = this.createEvent({
      id: input.eventId,
      barId: input.barId,
      orderTabId: input.orderTabId,
      type: "adjustment_added",
      beforeStatus: current.status,
      afterStatus: updated.status,
      expectedVersion: input.expectedVersion,
      resultingVersion: nextVersion,
      note: `금액 조정: ${input.label} ${input.amountMinor} · ${input.reason}`,
      actorUserId: input.actorUserId,
      createdAt: input.now
    });
    return { kind: "updated", tab: cloneTab(updated), item: cloneItem(item), event: cloneEvent(event) };
  }

  async updateOrderItemQuantity(input: UpdateOrderItemQuantityInput): Promise<OrderItemMutationResult> {
    const current = this.tabs.get(input.orderTabId);
    const guard = this.guardMutableTab(current, input.barId, input.expectedVersion, true);
    if (guard) return guard;
    if (!current) return { kind: "not_found" };
    const item = this.items.get(input.itemId);
    if (!item || item.barId !== input.barId || item.orderTabId !== input.orderTabId) return { kind: "item_not_found", current: cloneTab(current) };
    if (item.version !== input.itemExpectedVersion) return { kind: "item_version_conflict", current: cloneTab(current), item: cloneItem(item) };
    if (item.status !== "active") return { kind: "line_immutable", current: cloneTab(current), item: cloneItem(item) };
    if (item.type === "adjustment") return { kind: "quantity_not_supported", current: cloneTab(current), item: cloneItem(item) };
    const nextVersion = current.version + 1;
    const nextLineTotal = item.unitAmountMinor * input.quantity;
    if (current.totalAmountMinor + nextLineTotal - item.lineTotalAmountMinor < 0) return { kind: "total_negative", current: cloneTab(current) };
    const updatedItem: OrderTabItemRecord = {
      ...item,
      quantity: input.quantity,
      lineTotalAmountMinor: nextLineTotal,
      version: item.version + 1,
      updatedByUserId: input.actorUserId,
      updatedAt: input.now
    };
    this.items.set(updatedItem.id, updatedItem);
    const updated = this.recalculateTab(current, {
      version: nextVersion,
      updatedByUserId: input.actorUserId,
      updatedAt: input.now
    });
    const event = this.createEvent({
      id: input.eventId,
      barId: input.barId,
      orderTabId: input.orderTabId,
      type: "item_quantity_updated",
      beforeStatus: current.status,
      afterStatus: updated.status,
      expectedVersion: input.expectedVersion,
      resultingVersion: nextVersion,
      note: `수량 변경: ${updatedItem.menuItemName} ${input.quantity}개`,
      actorUserId: input.actorUserId,
      createdAt: input.now
    });
    return { kind: "updated", tab: cloneTab(updated), item: cloneItem(updatedItem), event: cloneEvent(event) };
  }

  async voidOrderItem(input: VoidOrderItemInput): Promise<OrderItemMutationResult> {
    const current = this.tabs.get(input.orderTabId);
    const guard = this.guardMutableTab(current, input.barId, input.expectedVersion, true);
    if (guard) return guard;
    if (!current) return { kind: "not_found" };
    const item = this.items.get(input.itemId);
    if (!item || item.barId !== input.barId || item.orderTabId !== input.orderTabId) return { kind: "item_not_found", current: cloneTab(current) };
    if (item.version !== input.itemExpectedVersion) return { kind: "item_version_conflict", current: cloneTab(current), item: cloneItem(item) };
    if (item.status !== "active") return { kind: "line_immutable", current: cloneTab(current), item: cloneItem(item) };
    if (current.totalAmountMinor - item.lineTotalAmountMinor < 0) return { kind: "total_negative", current: cloneTab(current) };
    const nextVersion = current.version + 1;
    const updatedItem: OrderTabItemRecord = {
      ...item,
      status: "voided",
      version: item.version + 1,
      voidReason: input.reason,
      updatedByUserId: input.actorUserId,
      voidedByUserId: input.actorUserId,
      updatedAt: input.now,
      voidedAt: input.now
    };
    this.items.set(updatedItem.id, updatedItem);
    const updated = this.recalculateTab(current, {
      version: nextVersion,
      updatedByUserId: input.actorUserId,
      updatedAt: input.now
    });
    const event = this.createEvent({
      id: input.eventId,
      barId: input.barId,
      orderTabId: input.orderTabId,
      type: "item_voided",
      beforeStatus: current.status,
      afterStatus: updated.status,
      expectedVersion: input.expectedVersion,
      resultingVersion: nextVersion,
      note: `취소: ${updatedItem.menuItemName} · ${input.reason}`,
      actorUserId: input.actorUserId,
      createdAt: input.now
    });
    return { kind: "updated", tab: cloneTab(updated), item: cloneItem(updatedItem), event: cloneEvent(event) };
  }

  async findIdempotencyRecord(
    barId: string,
    actorUserId: string,
    operation: OrderIdempotencyOperation,
    scopeId: string,
    idempotencyKey: string
  ): Promise<IdempotencyRecord | null> {
    const record = this.idempotencyRecords.get(idempotencyKeyFor(barId, actorUserId, operation, scopeId, idempotencyKey));
    return record ? { ...record } : null;
  }

  async storeIdempotencyRecord(record: IdempotencyRecord): Promise<void> {
    this.idempotencyRecords.set(idempotencyKeyFor(record.barId, record.actorUserId, record.operation, record.scopeId, record.idempotencyKey), { ...record });
  }

  async previewRetention(policy: OrderRetentionPolicy): Promise<OrderRetentionResult> {
    return this.countRetention(policy);
  }

  async pruneRetention(policy: OrderRetentionPolicy): Promise<OrderRetentionResult> {
    const result = this.countRetention(policy);
    const removableTabIds = new Set(
      [...this.tabs.values()]
        .filter((tab) => shouldPruneTerminalTab(tab, policy.orderTerminalCutoff))
        .map((tab) => tab.id)
    );
    for (const tabId of removableTabIds) this.tabs.delete(tabId);
    for (const event of [...this.events.values()]) {
      if (removableTabIds.has(event.orderTabId)) this.events.delete(event.id);
    }
    for (const item of [...this.items.values()]) {
      if (removableTabIds.has(item.orderTabId)) this.items.delete(item.id);
    }
    for (const [key, summary] of [...this.dailySummaries.entries()]) {
      if (summary.businessDate < policy.dailySummaryCutoffDate) this.dailySummaries.delete(key);
    }
    return result;
  }

  private allocateTabNumber(barId: string): number {
    const next = this.nextTabNumberByBar.get(barId) ?? 1;
    this.nextTabNumberByBar.set(barId, next + 1);
    return next;
  }

  private guardMutableTab(
    current: OrderTabRecord | undefined,
    barId: string,
    expectedVersion: number,
    allowReopenFromCheckout: boolean
  ): OrderItemMutationResult | null {
    if (!current || current.barId !== barId) return { kind: "not_found" };
    if (current.version !== expectedVersion) return { kind: "version_conflict", current: cloneTab(current) };
    if (current.status === "closed" || current.status === "cancelled") return { kind: "immutable", current: cloneTab(current) };
    if (current.status === "checkout_requested" && !allowReopenFromCheckout) return { kind: "reopen_required", current: cloneTab(current) };
    return null;
  }

  private guardTransitionTab(
    current: OrderTabRecord | undefined,
    barId: string,
    expectedVersion: number
  ): Exclude<OrderTabTransitionResult, { kind: "updated" }> | null {
    if (!current || current.barId !== barId) return { kind: "not_found" };
    if (current.version !== expectedVersion) return { kind: "version_conflict", current: cloneTab(current) };
    if (current.status === "closed" || current.status === "cancelled") return { kind: "immutable", current: cloneTab(current) };
    return null;
  }

  private calculateActiveTotals(barId: string, orderTabId: string): { totalAmountMinor: number; activeItemCount: number } {
    const activeItems = [...this.items.values()].filter((item) => item.barId === barId && item.orderTabId === orderTabId && item.status === "active");
    return {
      totalAmountMinor: activeItems.reduce((total, item) => total + item.lineTotalAmountMinor, 0),
      activeItemCount: activeItems.length
    };
  }

  private rebuildDailyOrderSummary(barId: string, businessDate: string, currency: string, now: string | null): DailyOrderSummary {
    const tabs = [...this.tabs.values()].filter((tab) => tab.barId === barId);
    const settledTabs = tabs.filter((tab) => tab.status === "closed" && (tab.settledAt ?? tab.closedAt ?? "").slice(0, 10) === businessDate);
    const cancelledTabs = tabs.filter((tab) => tab.status === "cancelled" && (tab.cancelledAt ?? "").slice(0, 10) === businessDate);
    const summary: DailyOrderSummary = {
      businessDate,
      currency,
      settledTabCount: settledTabs.length,
      cancelledTabCount: cancelledTabs.length,
      settledTotalAmountMinor: settledTabs.reduce((total, tab) => total + (tab.finalTotalAmountMinor ?? tab.totalAmountMinor), 0),
      settledItemCount: settledTabs.reduce((total, tab) => total + tab.activeItemCount, 0),
      updatedAt: now
    };
    this.dailySummaries.set(dailySummaryKey(barId, businessDate), summary);
    return { ...summary };
  }

  private recalculateTab(current: OrderTabRecord, patch: Partial<OrderTabRecord>): OrderTabRecord {
    const activeItems = [...this.items.values()].filter((item) => item.barId === current.barId && item.orderTabId === current.id && item.status === "active");
    const updated: OrderTabRecord = {
      ...current,
      ...patch,
      totalAmountMinor: activeItems.reduce((total, item) => total + item.lineTotalAmountMinor, 0),
      activeItemCount: activeItems.length
    };
    this.tabs.set(updated.id, updated);
    return updated;
  }

  private createEvent(event: OrderTabEventRecord): OrderTabEventRecord {
    this.events.set(event.id, event);
    return event;
  }

  private countRetention(policy: OrderRetentionPolicy): OrderRetentionResult {
    return {
      closedCancelledOrderTabs: [...this.tabs.values()].filter((tab) => shouldPruneTerminalTab(tab, policy.orderTerminalCutoff)).length,
      dailyOrderSummaries: [...this.dailySummaries.values()].filter((summary) => summary.businessDate < policy.dailySummaryCutoffDate).length
    };
  }
}

function cloneTab(tab: OrderTabRecord): OrderTabRecord {
  return { ...tab };
}

function cloneEvent(event: OrderTabEventRecord): OrderTabEventRecord {
  return { ...event };
}

function cloneItem(item: OrderTabItemRecord): OrderTabItemRecord {
  return { ...item };
}

function idempotencyKeyFor(barId: string, actorUserId: string, operation: string, scopeId: string, idempotencyKey: string): string {
  return `${barId}:${actorUserId}:${operation}:${scopeId}:${idempotencyKey}`;
}

function dailySummaryKey(barId: string, businessDate: string): string {
  return `${barId}:${businessDate}`;
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("ko");
}

function sortByStatus(status: OrderTabStatus): number {
  if (status === "checkout_requested") return 0;
  if (status === "open") return 1;
  if (status === "closed") return 2;
  return 3;
}

function shouldPruneTerminalTab(tab: OrderTabRecord, cutoff: string): boolean {
  if (tab.status !== "closed" && tab.status !== "cancelled") return false;
  const terminalAt = tab.settledAt ?? tab.closedAt ?? tab.cancelledAt ?? tab.updatedAt;
  return terminalAt < cutoff;
}
