import type {
  DailyOrderSummary,
  OrderTabEventType,
  OrderTabItemStatus,
  OrderTabItemType,
  OrderTabListQuery,
  OrderTabStatus,
  OrderTabSummary
} from "../../contracts/orderTabs";

export type OrderTabRecord = {
  id: string;
  barId: string;
  tabNumber: number;
  tableLabel: string;
  guestDescription: string;
  status: OrderTabStatus;
  totalAmountMinor: number;
  currency: string;
  activeItemCount: number;
  version: number;
  openedAt: string;
  checkoutRequestedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  finalTotalAmountMinor: number | null;
  settledAt: string | null;
  settledByUserId: string | null;
  cancelledReason: string | null;
  cancelledByUserId: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderTabEventRecord = {
  id: string;
  barId: string;
  orderTabId: string;
  type: OrderTabEventType;
  beforeStatus: OrderTabStatus | null;
  afterStatus: OrderTabStatus;
  expectedVersion: number | null;
  resultingVersion: number;
  note: string;
  actorUserId: string | null;
  createdAt: string;
};

export type OrderTabItemRecord = {
  id: string;
  barId: string;
  orderTabId: string;
  type: OrderTabItemType;
  status: OrderTabItemStatus;
  menuItemId: string | null;
  menuItemPublicId: string | null;
  menuItemName: string;
  priceId: string | null;
  priceLabel: string;
  volumeText: string;
  unitAmountMinor: number;
  quantity: number;
  lineTotalAmountMinor: number;
  currency: string;
  reason: string | null;
  version: number;
  voidReason: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  voidedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  voidedAt: string | null;
};

export type OrderIdempotencyOperation = "order_item_add" | "order_custom_item_add" | "order_adjustment_add" | "order_settle";

export type IdempotencyRecord = {
  id: string;
  barId: string;
  actorUserId: string;
  operation: OrderIdempotencyOperation;
  scopeId: string;
  idempotencyKey: string;
  requestHash: string;
  responseStatus: number;
  responseJson: string;
  createdAt: string;
  expiresAt: string;
};

export type OrderRetentionPolicy = {
  orderTerminalCutoff: string;
  dailySummaryCutoffDate: string;
};

export type OrderRetentionResult = {
  closedCancelledOrderTabs: number;
  dailyOrderSummaries: number;
};

export type CreateOrderTabInput = {
  id: string;
  eventId: string;
  barId: string;
  tableLabel: string;
  guestDescription: string;
  status: OrderTabStatus;
  currency: string;
  totalAmountMinor: number;
  activeItemCount: number;
  createdByUserId: string;
  now: string;
  checkoutRequestedAt?: string | null;
  note?: string;
};

export type OrderTabTransitionInput = {
  barId: string;
  orderTabId: string;
  eventId: string;
  expectedVersion: number;
  actorUserId: string;
  now: string;
};

export type ReopenOrderTabInput = OrderTabTransitionInput & {
  reason: string;
};

export type SettleOrderTabInput = OrderTabTransitionInput & {
  note: string;
  dailySummaryId: string;
  businessDate: string;
};

export type CancelOrderTabInput = OrderTabTransitionInput & {
  reason: string;
  dailySummaryId: string;
  businessDate: string;
};

export type UpdateOrderTabDetailsInput = {
  barId: string;
  orderTabId: string;
  eventId: string;
  tableLabel: string;
  guestDescription: string;
  expectedVersion: number;
  updatedByUserId: string;
  now: string;
};

export type UpdateOrderTabDetailsResult =
  | { kind: "updated"; tab: OrderTabRecord; event: OrderTabEventRecord }
  | { kind: "not_found" }
  | { kind: "version_conflict"; current: OrderTabRecord }
  | { kind: "immutable"; current: OrderTabRecord };

export type MenuOrderItemSnapshotInput = {
  id: string;
  eventId: string;
  barId: string;
  orderTabId: string;
  expectedVersion: number;
  menuItemId: string;
  menuItemPublicId: string;
  menuItemName: string;
  priceId: string;
  priceLabel: string;
  volumeText: string;
  unitAmountMinor: number;
  quantity: number;
  currency: string;
  actorUserId: string;
  now: string;
  confirmReopen: boolean;
};

export type CustomOrderItemInput = {
  id: string;
  eventId: string;
  barId: string;
  orderTabId: string;
  expectedVersion: number;
  name: string;
  unitAmountMinor: number;
  quantity: number;
  reason: string;
  currency: string;
  actorUserId: string;
  now: string;
  confirmReopen: boolean;
};

export type AdjustmentOrderItemInput = {
  id: string;
  eventId: string;
  barId: string;
  orderTabId: string;
  expectedVersion: number;
  label: string;
  amountMinor: number;
  reason: string;
  currency: string;
  actorUserId: string;
  now: string;
  confirmReopen: boolean;
};

export type UpdateOrderItemQuantityInput = {
  eventId: string;
  barId: string;
  orderTabId: string;
  itemId: string;
  expectedVersion: number;
  itemExpectedVersion: number;
  quantity: number;
  actorUserId: string;
  now: string;
};

export type VoidOrderItemInput = {
  eventId: string;
  barId: string;
  orderTabId: string;
  itemId: string;
  expectedVersion: number;
  itemExpectedVersion: number;
  reason: string;
  actorUserId: string;
  now: string;
};

export type OrderItemMutationResult =
  | { kind: "updated"; tab: OrderTabRecord; item: OrderTabItemRecord; event: OrderTabEventRecord }
  | { kind: "not_found" }
  | { kind: "item_not_found"; current: OrderTabRecord }
  | { kind: "version_conflict"; current: OrderTabRecord }
  | { kind: "item_version_conflict"; current: OrderTabRecord; item: OrderTabItemRecord }
  | { kind: "immutable"; current: OrderTabRecord }
  | { kind: "line_immutable"; current: OrderTabRecord; item: OrderTabItemRecord }
  | { kind: "quantity_not_supported"; current: OrderTabRecord; item: OrderTabItemRecord }
  | { kind: "total_negative"; current: OrderTabRecord }
  | { kind: "reopen_required"; current: OrderTabRecord };

export type OrderTabTransitionResult =
  | { kind: "updated"; tab: OrderTabRecord; event: OrderTabEventRecord; dailySummary?: DailyOrderSummary }
  | { kind: "not_found" }
  | { kind: "version_conflict"; current: OrderTabRecord }
  | { kind: "immutable"; current: OrderTabRecord }
  | { kind: "invalid_transition"; current: OrderTabRecord }
  | { kind: "empty_settle"; current: OrderTabRecord }
  | { kind: "cancel_not_empty"; current: OrderTabRecord };

export interface OrderTabRepository {
  listOrderTabs(barId: string, query: OrderTabListQuery): Promise<OrderTabRecord[]>;
  readOrderTabSummary(barId: string): Promise<OrderTabSummary>;
  findOrderTabById(barId: string, orderTabId: string): Promise<OrderTabRecord | null>;
  createOrderTab(input: CreateOrderTabInput): Promise<{ tab: OrderTabRecord; event: OrderTabEventRecord }>;
  updateOrderTabDetails(input: UpdateOrderTabDetailsInput): Promise<UpdateOrderTabDetailsResult>;
  requestCheckout(input: OrderTabTransitionInput): Promise<OrderTabTransitionResult>;
  reopenOrderTab(input: ReopenOrderTabInput): Promise<OrderTabTransitionResult>;
  settleOrderTab(input: SettleOrderTabInput): Promise<OrderTabTransitionResult>;
  cancelOrderTab(input: CancelOrderTabInput): Promise<OrderTabTransitionResult>;
  readDailyOrderSummary(barId: string, businessDate: string, currency: string): Promise<DailyOrderSummary>;
  listOrderTabItems(barId: string, orderTabId: string): Promise<OrderTabItemRecord[]>;
  addMenuOrderItem(input: MenuOrderItemSnapshotInput): Promise<OrderItemMutationResult>;
  addCustomOrderItem(input: CustomOrderItemInput): Promise<OrderItemMutationResult>;
  addAdjustmentOrderItem(input: AdjustmentOrderItemInput): Promise<OrderItemMutationResult>;
  updateOrderItemQuantity(input: UpdateOrderItemQuantityInput): Promise<OrderItemMutationResult>;
  voidOrderItem(input: VoidOrderItemInput): Promise<OrderItemMutationResult>;
  listOrderTabEvents(barId: string, orderTabId: string, limit: number): Promise<OrderTabEventRecord[]>;
  findIdempotencyRecord(
    barId: string,
    actorUserId: string,
    operation: OrderIdempotencyOperation,
    scopeId: string,
    idempotencyKey: string
  ): Promise<IdempotencyRecord | null>;
  storeIdempotencyRecord(record: IdempotencyRecord): Promise<void>;
  previewRetention(policy: OrderRetentionPolicy): Promise<OrderRetentionResult>;
  pruneRetention(policy: OrderRetentionPolicy): Promise<OrderRetentionResult>;
}
