import { z } from "zod";

export const orderTabStatusSchema = z.enum(["open", "checkout_requested", "closed", "cancelled"]);
export const orderTabStatusFilterSchema = z.enum(["all", "open", "checkout_requested", "closed", "cancelled"]).default("all");
export const orderTabEventTypeSchema = z.enum([
  "tab_created",
  "tab_updated",
  "menu_item_added",
  "custom_item_added",
  "adjustment_added",
  "item_quantity_updated",
  "item_voided",
  "checkout_requested",
  "tab_reopened",
  "tab_settled",
  "tab_cancelled"
]);
export const orderTabItemTypeSchema = z.enum(["menu", "custom", "adjustment"]);
export const orderTabItemStatusSchema = z.enum(["active", "voided"]);

export const orderTabListQuerySchema = z.object({
  status: orderTabStatusFilterSchema.optional(),
  query: z.string().trim().max(80, "검색어는 80자 이하로 입력하세요.").optional()
});

export const createOrderTabRequestSchema = z.object({
  tableLabel: z.string().trim().min(1, "테이블 라벨을 입력하세요.").max(40, "테이블 라벨은 40자 이하로 입력하세요."),
  guestDescription: z.string().trim().max(200, "손님 설명은 200자 이하로 입력하세요.").optional()
});

export const updateOrderTabRequestSchema = z.object({
  expectedVersion: z.number().int().positive("현재 version을 포함해 다시 저장하세요."),
  tableLabel: z.string().trim().min(1, "테이블 라벨을 입력하세요.").max(40, "테이블 라벨은 40자 이하로 입력하세요."),
  guestDescription: z.string().trim().max(200, "손님 설명은 200자 이하로 입력하세요.").optional()
});

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, "idempotency key를 포함해 다시 시도하세요.")
  .max(120, "idempotency key는 120자 이하여야 합니다.");

export const addMenuOrderItemRequestSchema = z.object({
  expectedVersion: z.number().int().positive("현재 version을 포함해 다시 저장하세요."),
  idempotencyKey: idempotencyKeySchema,
  menuItemId: z.string().min(1, "메뉴를 선택하세요."),
  priceId: z.string().min(1, "가격 항목을 선택하세요."),
  quantity: z.number().int("수량은 정수여야 합니다.").min(1, "수량은 1 이상이어야 합니다.").max(99, "수량은 99 이하로 입력하세요."),
  confirmReopen: z.boolean().optional()
});

const orderLineNameSchema = z.string().trim().min(1, "항목명을 입력하세요.").max(80, "항목명은 80자 이하로 입력하세요.");
const orderLineReasonSchema = z.string().trim().min(1, "사유를 입력하세요.").max(160, "사유는 160자 이하로 입력하세요.");
const orderLineQuantitySchema = z
  .number()
  .int("수량은 정수여야 합니다.")
  .min(1, "수량은 1 이상이어야 합니다.")
  .max(99, "수량은 99 이하로 입력하세요.");
const customAmountSchema = z
  .number()
  .int("금액은 정수여야 합니다.")
  .min(0, "금액은 0 이상이어야 합니다.")
  .max(10_000_000, "금액은 10,000,000 이하로 입력하세요.");
const adjustmentAmountSchema = z
  .number()
  .int("조정 금액은 정수여야 합니다.")
  .min(-10_000_000, "조정 금액은 -10,000,000 이상이어야 합니다.")
  .max(10_000_000, "조정 금액은 10,000,000 이하로 입력하세요.")
  .refine((value) => value !== 0, "조정 금액은 0이 아니어야 합니다.");

export const addCustomOrderItemRequestSchema = z.object({
  expectedVersion: z.number().int().positive("현재 version을 포함해 다시 저장하세요."),
  idempotencyKey: idempotencyKeySchema,
  name: orderLineNameSchema,
  unitAmountMinor: customAmountSchema,
  quantity: orderLineQuantitySchema,
  reason: orderLineReasonSchema,
  confirmReopen: z.boolean().optional()
});

export const addAdjustmentOrderItemRequestSchema = z.object({
  expectedVersion: z.number().int().positive("현재 version을 포함해 다시 저장하세요."),
  idempotencyKey: idempotencyKeySchema,
  label: orderLineNameSchema,
  amountMinor: adjustmentAmountSchema,
  reason: orderLineReasonSchema,
  confirmReopen: z.boolean().optional()
});

export const updateOrderItemQuantityRequestSchema = z.object({
  expectedVersion: z.number().int().positive("현재 version을 포함해 다시 저장하세요."),
  itemExpectedVersion: z.number().int().positive("주문 라인 version을 포함해 다시 저장하세요."),
  quantity: z.number().int("수량은 정수여야 합니다.").min(1, "수량은 1 이상이어야 합니다.").max(99, "수량은 99 이하로 입력하세요.")
});

export const voidOrderItemRequestSchema = z.object({
  expectedVersion: z.number().int().positive("현재 version을 포함해 다시 저장하세요."),
  itemExpectedVersion: z.number().int().positive("주문 라인 version을 포함해 다시 저장하세요."),
  reason: z.string().trim().min(1, "취소 사유를 입력하세요.").max(160, "취소 사유는 160자 이하여야 합니다.")
});

export const requestCheckoutOrderTabRequestSchema = z.object({
  expectedVersion: z.number().int().positive("현재 version을 포함해 다시 저장하세요.")
});

export const reopenOrderTabRequestSchema = z.object({
  expectedVersion: z.number().int().positive("현재 version을 포함해 다시 저장하세요."),
  reason: z.string().trim().max(160, "재오픈 사유는 160자 이하로 입력하세요.").optional()
});

export const settleOrderTabRequestSchema = z.object({
  expectedVersion: z.number().int().positive("현재 version을 포함해 다시 저장하세요."),
  idempotencyKey: idempotencyKeySchema,
  transferConfirmed: z.literal(true, { error: "계좌이체 확인이 필요합니다." }),
  note: z.string().trim().max(160, "정산 메모는 160자 이하로 입력하세요.").optional()
});

export const cancelOrderTabRequestSchema = z.object({
  expectedVersion: z.number().int().positive("현재 version을 포함해 다시 저장하세요."),
  reason: z.string().trim().min(1, "취소 사유를 입력하세요.").max(160, "취소 사유는 160자 이하여야 합니다.")
});

export const orderTabBarSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  currency: z.string().length(3),
  status: z.enum(["active", "inactive"])
});

export const orderTabSchema = z.object({
  id: z.string().min(1),
  barId: z.string().min(1),
  tabNumber: z.number().int().positive(),
  displayCode: z.string().min(1),
  tableLabel: z.string().min(1),
  guestDescription: z.string(),
  status: orderTabStatusSchema,
  totalAmountMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  activeItemCount: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  openedAt: z.string().min(1),
  checkoutRequestedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  finalTotalAmountMinor: z.number().int().nonnegative().nullable(),
  settledAt: z.string().nullable(),
  settledByUserId: z.string().nullable(),
  cancelledReason: z.string().nullable(),
  cancelledByUserId: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const orderTabItemSchema = z.object({
  id: z.string().min(1),
  orderTabId: z.string().min(1),
  type: orderTabItemTypeSchema,
  status: orderTabItemStatusSchema,
  menuItemId: z.string().min(1).nullable(),
  menuItemPublicId: z.string().min(1).nullable(),
  menuItemName: z.string().min(1),
  priceId: z.string().min(1).nullable(),
  priceLabel: z.string().min(1),
  volumeText: z.string(),
  unitAmountMinor: z.number().int(),
  quantity: z.number().int().positive(),
  lineTotalAmountMinor: z.number().int(),
  currency: z.string().length(3),
  reason: z.string().nullable(),
  version: z.number().int().positive(),
  voidReason: z.string().nullable(),
  createdByUserId: z.string().nullable(),
  updatedByUserId: z.string().nullable(),
  voidedByUserId: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  voidedAt: z.string().nullable()
});

export const orderTabPermissionsSchema = z.object({
  canManageOrders: z.literal(true),
  canAddCustomOrderItem: z.boolean(),
  canApplyOrderAdjustment: z.boolean()
});

export const orderMenuPickerPriceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  volumeText: z.string(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().length(3)
});

export const orderMenuPickerItemSchema = z.object({
  id: z.string().min(1),
  publicId: z.string().min(1),
  name: z.string().min(1),
  categoryPath: z.string().min(1),
  prices: z.array(orderMenuPickerPriceSchema).min(1)
});

export const orderMenuPickerSchema = z.object({
  items: z.array(orderMenuPickerItemSchema)
});

export const orderTabSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  open: z.number().int().nonnegative(),
  checkoutRequested: z.number().int().nonnegative(),
  closed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  activeTotalAmountMinor: z.number().int().nonnegative()
});

export const dailyOrderSummarySchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().length(3),
  settledTabCount: z.number().int().nonnegative(),
  cancelledTabCount: z.number().int().nonnegative(),
  settledTotalAmountMinor: z.number().int().nonnegative(),
  settledItemCount: z.number().int().nonnegative(),
  updatedAt: z.string().nullable()
});

export const orderTabEventSchema = z.object({
  id: z.string().min(1),
  orderTabId: z.string().min(1),
  type: orderTabEventTypeSchema,
  beforeStatus: orderTabStatusSchema.nullable(),
  afterStatus: orderTabStatusSchema,
  expectedVersion: z.number().int().positive().nullable(),
  resultingVersion: z.number().int().positive(),
  note: z.string(),
  actorUserId: z.string().nullable(),
  createdAt: z.string().min(1)
});

export const orderTabsResponseSchema = z.object({
  bar: orderTabBarSchema,
  canManageOrders: z.literal(true),
  permissions: orderTabPermissionsSchema,
  query: orderTabListQuerySchema,
  summary: orderTabSummarySchema,
  dailySummary: dailyOrderSummarySchema,
  tabs: z.array(orderTabSchema)
});

export const orderTabDetailResponseSchema = z.object({
  bar: orderTabBarSchema,
  canManageOrders: z.literal(true),
  permissions: orderTabPermissionsSchema,
  tab: orderTabSchema,
  items: z.array(orderTabItemSchema),
  menuPicker: orderMenuPickerSchema,
  events: z.array(orderTabEventSchema)
});

export type OrderTabStatus = z.infer<typeof orderTabStatusSchema>;
export type OrderTabStatusFilter = z.infer<typeof orderTabStatusFilterSchema>;
export type OrderTabEventType = z.infer<typeof orderTabEventTypeSchema>;
export type OrderTabItemType = z.infer<typeof orderTabItemTypeSchema>;
export type OrderTabItemStatus = z.infer<typeof orderTabItemStatusSchema>;
export type OrderTabListQuery = z.infer<typeof orderTabListQuerySchema>;
export type CreateOrderTabRequest = z.infer<typeof createOrderTabRequestSchema>;
export type UpdateOrderTabRequest = z.infer<typeof updateOrderTabRequestSchema>;
export type AddMenuOrderItemRequest = z.infer<typeof addMenuOrderItemRequestSchema>;
export type AddCustomOrderItemRequest = z.infer<typeof addCustomOrderItemRequestSchema>;
export type AddAdjustmentOrderItemRequest = z.infer<typeof addAdjustmentOrderItemRequestSchema>;
export type UpdateOrderItemQuantityRequest = z.infer<typeof updateOrderItemQuantityRequestSchema>;
export type VoidOrderItemRequest = z.infer<typeof voidOrderItemRequestSchema>;
export type RequestCheckoutOrderTabRequest = z.infer<typeof requestCheckoutOrderTabRequestSchema>;
export type ReopenOrderTabRequest = z.infer<typeof reopenOrderTabRequestSchema>;
export type SettleOrderTabRequest = z.infer<typeof settleOrderTabRequestSchema>;
export type CancelOrderTabRequest = z.infer<typeof cancelOrderTabRequestSchema>;
export type OrderTabDto = z.infer<typeof orderTabSchema>;
export type OrderTabItemDto = z.infer<typeof orderTabItemSchema>;
export type OrderMenuPickerPrice = z.infer<typeof orderMenuPickerPriceSchema>;
export type OrderMenuPickerItem = z.infer<typeof orderMenuPickerItemSchema>;
export type OrderMenuPicker = z.infer<typeof orderMenuPickerSchema>;
export type OrderTabPermissions = z.infer<typeof orderTabPermissionsSchema>;
export type OrderTabSummary = z.infer<typeof orderTabSummarySchema>;
export type DailyOrderSummary = z.infer<typeof dailyOrderSummarySchema>;
export type OrderTabEventDto = z.infer<typeof orderTabEventSchema>;
export type OrderTabsResponse = z.infer<typeof orderTabsResponseSchema>;
export type OrderTabDetailResponse = z.infer<typeof orderTabDetailResponseSchema>;
