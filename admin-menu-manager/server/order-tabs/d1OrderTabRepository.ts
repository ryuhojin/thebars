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

type OrderTabRow = {
  id: string;
  bar_id: string;
  tab_number: number;
  table_label: string;
  guest_description: string;
  status: OrderTabStatus;
  total_amount_minor: number;
  currency: string;
  active_item_count: number;
  version: number;
  opened_at: string;
  checkout_requested_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  final_total_amount_minor: number | null;
  settled_at: string | null;
  settled_by_user_id: string | null;
  cancelled_reason: string | null;
  cancelled_by_user_id: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type OrderTabEventRow = {
  id: string;
  bar_id: string;
  order_tab_id: string;
  event_type: OrderTabEventRecord["type"];
  before_status: OrderTabStatus | null;
  after_status: OrderTabStatus;
  expected_version: number | null;
  resulting_version: number;
  note: string;
  actor_user_id: string | null;
  created_at: string;
};

type OrderTabItemRow = {
  id: string;
  bar_id: string;
  order_tab_id: string;
  item_type: OrderTabItemRecord["type"];
  status: OrderTabItemRecord["status"];
  menu_item_id: string | null;
  menu_item_public_id: string | null;
  menu_item_name: string;
  menu_item_price_id: string | null;
  price_label: string;
  volume_text: string;
  unit_amount_minor: number;
  quantity: number;
  line_total_amount_minor: number;
  currency: string;
  reason: string | null;
  version: number;
  void_reason: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  voided_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  voided_at: string | null;
};

type IdempotencyRow = {
  id: string;
  bar_id: string;
  actor_user_id: string;
  operation: IdempotencyRecord["operation"];
  scope_id: string;
  idempotency_key: string;
  request_hash: string;
  response_status: number;
  response_json: string;
  created_at: string;
  expires_at: string;
};

type DailyOrderSummaryRow = {
  business_date: string;
  currency: string;
  settled_tab_count: number;
  cancelled_tab_count: number;
  settled_total_amount_minor: number;
  settled_item_count: number;
  updated_at: string;
};

export class D1OrderTabRepository implements OrderTabRepository {
  constructor(private readonly db: D1Database) {}

  async listOrderTabs(barId: string, query: OrderTabListQuery): Promise<OrderTabRecord[]> {
    const where = ["bar_id = ?"];
    const params: unknown[] = [barId];
    if (query.status === "active") {
      where.push("status IN ('open', 'checkout_requested')");
    } else if (query.status && query.status !== "all") {
      where.push("status = ?");
      params.push(query.status);
    }
    const text = query.query?.trim();
    if (text) {
      where.push("(LOWER(table_label) LIKE LOWER(?) OR LOWER(guest_description) LIKE LOWER(?) OR CAST(tab_number AS TEXT) LIKE ?)");
      params.push(`%${text}%`, `%${text}%`, `%${text.replace(/^#/, "")}%`);
    }
    const result = await this.db
      .prepare(
        `SELECT *
         FROM order_tabs
         WHERE ${where.join(" AND ")}
         ORDER BY
           CASE status WHEN 'checkout_requested' THEN 0 WHEN 'open' THEN 1 WHEN 'closed' THEN 2 ELSE 3 END,
           updated_at DESC,
           tab_number DESC`
      )
      .bind(...params)
      .all<OrderTabRow>();
    return (result.results ?? []).map(toTabRecord);
  }

  async readOrderTabSummary(barId: string): Promise<OrderTabSummary> {
    const row = await this.db
      .prepare(
        `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
          SUM(CASE WHEN status = 'checkout_requested' THEN 1 ELSE 0 END) AS checkout_requested,
          SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
          SUM(CASE WHEN status IN ('open', 'checkout_requested') THEN total_amount_minor ELSE 0 END) AS active_total_amount_minor
         FROM order_tabs
         WHERE bar_id = ?`
      )
      .bind(barId)
      .first<{
        total: number | null;
        open: number | null;
        checkout_requested: number | null;
        closed: number | null;
        cancelled: number | null;
        active_total_amount_minor: number | null;
      }>();
    return {
      total: row?.total ?? 0,
      open: row?.open ?? 0,
      checkoutRequested: row?.checkout_requested ?? 0,
      closed: row?.closed ?? 0,
      cancelled: row?.cancelled ?? 0,
      activeTotalAmountMinor: row?.active_total_amount_minor ?? 0
    };
  }

  async findOrderTabById(barId: string, orderTabId: string): Promise<OrderTabRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM order_tabs WHERE bar_id = ? AND id = ?")
      .bind(barId, orderTabId)
      .first<OrderTabRow>();
    return row ? toTabRecord(row) : null;
  }

  async createOrderTab(input: CreateOrderTabInput): Promise<{ tab: OrderTabRecord; event: OrderTabEventRecord }> {
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO order_tab_counters (bar_id, next_tab_number, created_at, updated_at)
         VALUES (?, 1, ?, ?)`
      )
      .bind(input.barId, input.now, input.now)
      .run();
    const counter = await this.db
      .prepare("SELECT next_tab_number FROM order_tab_counters WHERE bar_id = ?")
      .bind(input.barId)
      .first<{ next_tab_number: number }>();
    const tabNumber = counter?.next_tab_number ?? 1;
    const checkoutRequestedAt = input.checkoutRequestedAt ?? (input.status === "checkout_requested" ? input.now : null);
    const closedAt = input.status === "closed" ? input.now : null;
    const cancelledAt = input.status === "cancelled" ? input.now : null;
    await this.db.batch([
      this.db
        .prepare("UPDATE order_tab_counters SET next_tab_number = ?, updated_at = ? WHERE bar_id = ?")
        .bind(tabNumber + 1, input.now, input.barId),
      this.db
        .prepare(
          `INSERT INTO order_tabs (
            id, bar_id, tab_number, table_label, guest_description, status, total_amount_minor,
            currency, active_item_count, version, opened_at, checkout_requested_at, closed_at, cancelled_at,
            final_total_amount_minor, settled_at, settled_by_user_id, cancelled_reason, cancelled_by_user_id,
            created_by_user_id, updated_by_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          input.id,
          input.barId,
          tabNumber,
          input.tableLabel,
          input.guestDescription,
          input.status,
          input.totalAmountMinor,
          input.currency,
          input.activeItemCount,
          input.now,
          checkoutRequestedAt,
          closedAt,
          cancelledAt,
          input.status === "closed" ? input.totalAmountMinor : null,
          input.status === "closed" ? input.now : null,
          input.status === "closed" ? input.createdByUserId : null,
          input.status === "cancelled" ? input.note ?? "취소" : null,
          input.status === "cancelled" ? input.createdByUserId : null,
          input.createdByUserId,
          input.createdByUserId,
          input.now,
          input.now
        ),
      this.db
        .prepare(
          `INSERT INTO order_tab_events (
            id, bar_id, order_tab_id, event_type, before_status, after_status, expected_version,
            resulting_version, note, actor_user_id, created_at
          ) VALUES (?, ?, ?, 'tab_created', NULL, ?, NULL, 1, ?, ?, ?)`
        )
        .bind(input.eventId, input.barId, input.id, input.status, input.note ?? "테이블 생성", input.createdByUserId, input.now)
    ]);
    const tab = await this.findOrderTabById(input.barId, input.id);
    const event = await this.findEventById(input.eventId);
    if (!tab || !event) throw new Error("ORDER_TAB_INSERT_FAILED");
    return { tab, event };
  }

  async updateOrderTabDetails(input: UpdateOrderTabDetailsInput): Promise<UpdateOrderTabDetailsResult> {
    const current = await this.findOrderTabById(input.barId, input.orderTabId);
    if (!current) return { kind: "not_found" };
    if (current.version !== input.expectedVersion) return { kind: "version_conflict", current };
    if (current.status === "closed" || current.status === "cancelled") return { kind: "immutable", current };
    const nextVersion = current.version + 1;
    const result = await this.db
      .prepare(
        `UPDATE order_tabs
         SET table_label = ?, guest_description = ?, version = ?, updated_by_user_id = ?, updated_at = ?
         WHERE bar_id = ? AND id = ? AND version = ?`
      )
      .bind(
        input.tableLabel,
        input.guestDescription,
        nextVersion,
        input.updatedByUserId,
        input.now,
        input.barId,
        input.orderTabId,
        input.expectedVersion
      )
      .run();
    if (readChangeCount(result) === 0) {
      const latest = await this.findOrderTabById(input.barId, input.orderTabId);
      return latest ? { kind: "version_conflict", current: latest } : { kind: "not_found" };
    }
    await this.db
      .prepare(
        `INSERT INTO order_tab_events (
          id, bar_id, order_tab_id, event_type, before_status, after_status, expected_version,
          resulting_version, note, actor_user_id, created_at
        ) VALUES (?, ?, ?, 'tab_updated', ?, ?, ?, ?, '테이블 설명 수정', ?, ?)`
      )
      .bind(
        input.eventId,
        input.barId,
        input.orderTabId,
        current.status,
        current.status,
        input.expectedVersion,
        nextVersion,
        input.updatedByUserId,
        input.now
      )
      .run();
    const tab = await this.findOrderTabById(input.barId, input.orderTabId);
    const event = await this.findEventById(input.eventId);
    if (!tab || !event) throw new Error("ORDER_TAB_UPDATE_FAILED");
    return { kind: "updated", tab, event };
  }

  async requestCheckout(input: OrderTabTransitionInput): Promise<OrderTabTransitionResult> {
    const current = await this.findOrderTabById(input.barId, input.orderTabId);
    const guard = guardTransitionTab(current, input.expectedVersion);
    if (guard) return guard;
    if (!current) return { kind: "not_found" };
    if (current.status !== "open") return { kind: "invalid_transition", current };
    const nextVersion = current.version + 1;
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE order_tabs
           SET status = 'checkout_requested', checkout_requested_at = ?, version = ?, updated_by_user_id = ?, updated_at = ?
           WHERE bar_id = ? AND id = ? AND version = ?`
        )
        .bind(input.now, nextVersion, input.actorUserId, input.now, input.barId, input.orderTabId, input.expectedVersion),
      eventInsertStatement(this.db, {
        id: input.eventId,
        barId: input.barId,
        orderTabId: input.orderTabId,
        type: "checkout_requested",
        beforeStatus: current.status,
        afterStatus: "checkout_requested",
        expectedVersion: input.expectedVersion,
        resultingVersion: nextVersion,
        note: "계산 요청",
        actorUserId: input.actorUserId,
        createdAt: input.now
      })
    ]);
    const tab = await this.findOrderTabById(input.barId, input.orderTabId);
    const event = await this.findEventById(input.eventId);
    if (!tab || !event) throw new Error("ORDER_CHECKOUT_REQUEST_FAILED");
    return { kind: "updated", tab, event };
  }

  async reopenOrderTab(input: ReopenOrderTabInput): Promise<OrderTabTransitionResult> {
    const current = await this.findOrderTabById(input.barId, input.orderTabId);
    const guard = guardTransitionTab(current, input.expectedVersion);
    if (guard) return guard;
    if (!current) return { kind: "not_found" };
    if (current.status !== "checkout_requested") return { kind: "invalid_transition", current };
    const nextVersion = current.version + 1;
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE order_tabs
           SET status = 'open', checkout_requested_at = NULL, version = ?, updated_by_user_id = ?, updated_at = ?
           WHERE bar_id = ? AND id = ? AND version = ?`
        )
        .bind(nextVersion, input.actorUserId, input.now, input.barId, input.orderTabId, input.expectedVersion),
      eventInsertStatement(this.db, {
        id: input.eventId,
        barId: input.barId,
        orderTabId: input.orderTabId,
        type: "tab_reopened",
        beforeStatus: current.status,
        afterStatus: "open",
        expectedVersion: input.expectedVersion,
        resultingVersion: nextVersion,
        note: input.reason ? `재오픈: ${input.reason}` : "테이블 재오픈",
        actorUserId: input.actorUserId,
        createdAt: input.now
      })
    ]);
    const tab = await this.findOrderTabById(input.barId, input.orderTabId);
    const event = await this.findEventById(input.eventId);
    if (!tab || !event) throw new Error("ORDER_REOPEN_FAILED");
    return { kind: "updated", tab, event };
  }

  async settleOrderTab(input: SettleOrderTabInput): Promise<OrderTabTransitionResult> {
    const current = await this.findOrderTabById(input.barId, input.orderTabId);
    const guard = guardTransitionTab(current, input.expectedVersion);
    if (guard) return guard;
    if (!current) return { kind: "not_found" };
    if (current.status !== "open" && current.status !== "checkout_requested") return { kind: "invalid_transition", current };
    const totals = await this.readActiveTotals(input.barId, input.orderTabId);
    if (totals.activeItemCount === 0) return { kind: "empty_settle", current };
    const nextVersion = current.version + 1;
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE order_tabs
           SET status = 'closed', total_amount_minor = ?, active_item_count = ?, final_total_amount_minor = ?,
             closed_at = ?, settled_at = ?, settled_by_user_id = ?, version = ?, updated_by_user_id = ?, updated_at = ?
           WHERE bar_id = ? AND id = ? AND version = ?`
        )
        .bind(
          totals.totalAmountMinor,
          totals.activeItemCount,
          totals.totalAmountMinor,
          input.now,
          input.now,
          input.actorUserId,
          nextVersion,
          input.actorUserId,
          input.now,
          input.barId,
          input.orderTabId,
          input.expectedVersion
        ),
      eventInsertStatement(this.db, {
        id: input.eventId,
        barId: input.barId,
        orderTabId: input.orderTabId,
        type: "tab_settled",
        beforeStatus: current.status,
        afterStatus: "closed",
        expectedVersion: input.expectedVersion,
        resultingVersion: nextVersion,
        note: input.note ? `정산 완료: ${input.note}` : "정산 완료",
        actorUserId: input.actorUserId,
        createdAt: input.now
      })
    ]);
    const dailySummary = await this.rebuildDailyOrderSummary(input.barId, input.dailySummaryId, input.businessDate, current.currency, input.now);
    const tab = await this.findOrderTabById(input.barId, input.orderTabId);
    const event = await this.findEventById(input.eventId);
    if (!tab || !event) throw new Error("ORDER_SETTLE_FAILED");
    return { kind: "updated", tab, event, dailySummary };
  }

  async cancelOrderTab(input: CancelOrderTabInput): Promise<OrderTabTransitionResult> {
    const current = await this.findOrderTabById(input.barId, input.orderTabId);
    const guard = guardTransitionTab(current, input.expectedVersion);
    if (guard) return guard;
    if (!current) return { kind: "not_found" };
    if (current.status !== "open" && current.status !== "checkout_requested") return { kind: "invalid_transition", current };
    const totals = await this.readActiveTotals(input.barId, input.orderTabId);
    if (totals.activeItemCount > 0) return { kind: "cancel_not_empty", current };
    const nextVersion = current.version + 1;
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE order_tabs
           SET status = 'cancelled', total_amount_minor = 0, active_item_count = 0,
             cancelled_at = ?, cancelled_reason = ?, cancelled_by_user_id = ?,
             version = ?, updated_by_user_id = ?, updated_at = ?
           WHERE bar_id = ? AND id = ? AND version = ?`
        )
        .bind(input.now, input.reason, input.actorUserId, nextVersion, input.actorUserId, input.now, input.barId, input.orderTabId, input.expectedVersion),
      eventInsertStatement(this.db, {
        id: input.eventId,
        barId: input.barId,
        orderTabId: input.orderTabId,
        type: "tab_cancelled",
        beforeStatus: current.status,
        afterStatus: "cancelled",
        expectedVersion: input.expectedVersion,
        resultingVersion: nextVersion,
        note: `테이블 취소: ${input.reason}`,
        actorUserId: input.actorUserId,
        createdAt: input.now
      })
    ]);
    const dailySummary = await this.rebuildDailyOrderSummary(input.barId, input.dailySummaryId, input.businessDate, current.currency, input.now);
    const tab = await this.findOrderTabById(input.barId, input.orderTabId);
    const event = await this.findEventById(input.eventId);
    if (!tab || !event) throw new Error("ORDER_CANCEL_FAILED");
    return { kind: "updated", tab, event, dailySummary };
  }

  async readDailyOrderSummary(barId: string, businessDate: string, currency: string): Promise<DailyOrderSummary> {
    const row = await this.db
      .prepare(
        `SELECT business_date, currency, settled_tab_count, cancelled_tab_count,
          settled_total_amount_minor, settled_item_count, updated_at
         FROM daily_order_summaries
         WHERE bar_id = ? AND business_date = ?`
      )
      .bind(barId, businessDate)
      .first<DailyOrderSummaryRow>();
    return row ? toDailySummary(row) : emptyDailySummary(businessDate, currency);
  }

  async listOrderTabItems(barId: string, orderTabId: string): Promise<OrderTabItemRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT *
         FROM order_tab_items
         WHERE bar_id = ? AND order_tab_id = ?
         ORDER BY created_at ASC, id ASC`
      )
      .bind(barId, orderTabId)
      .all<OrderTabItemRow>();
    return (result.results ?? []).map(toItemRecord);
  }

  async addMenuOrderItem(input: MenuOrderItemSnapshotInput): Promise<OrderItemMutationResult> {
    const current = await this.findOrderTabById(input.barId, input.orderTabId);
    const guard = guardMutableTab(current, input.expectedVersion, input.confirmReopen);
    if (guard) return guard;
    if (!current) return { kind: "not_found" };
    const nextVersion = current.version + 1;
    const lineTotal = input.unitAmountMinor * input.quantity;
    const nextStatus = current.status === "checkout_requested" ? "open" : current.status;
    const nextCheckoutRequestedAt = current.status === "checkout_requested" ? null : current.checkoutRequestedAt;
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO order_tab_items (
            id, bar_id, order_tab_id, item_type, status, menu_item_id, menu_item_public_id,
            menu_item_name, menu_item_price_id, price_label, volume_text, unit_amount_minor,
            quantity, line_total_amount_minor, currency, version, void_reason,
            created_by_user_id, updated_by_user_id, voided_by_user_id, created_at, updated_at, voided_at
          ) VALUES (?, ?, ?, 'menu', 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?, NULL, ?, ?, NULL)`
        )
        .bind(
          input.id,
          input.barId,
          input.orderTabId,
          input.menuItemId,
          input.menuItemPublicId,
          input.menuItemName,
          input.priceId,
          input.priceLabel,
          input.volumeText,
          input.unitAmountMinor,
          input.quantity,
          lineTotal,
          input.currency,
          input.actorUserId,
          input.actorUserId,
          input.now,
          input.now
        ),
      this.db
        .prepare(
          `UPDATE order_tabs
           SET status = ?, total_amount_minor = total_amount_minor + ?, active_item_count = active_item_count + 1,
             version = ?, checkout_requested_at = ?, updated_by_user_id = ?, updated_at = ?
           WHERE bar_id = ? AND id = ? AND version = ?`
        )
        .bind(
          nextStatus,
          lineTotal,
          nextVersion,
          nextCheckoutRequestedAt,
          input.actorUserId,
          input.now,
          input.barId,
          input.orderTabId,
          input.expectedVersion
        ),
      eventInsertStatement(this.db, {
        id: input.eventId,
        barId: input.barId,
        orderTabId: input.orderTabId,
        type: "menu_item_added",
        beforeStatus: current.status,
        afterStatus: nextStatus,
        expectedVersion: input.expectedVersion,
        resultingVersion: nextVersion,
        note: `메뉴 추가: ${input.menuItemName} ${input.quantity}개`,
        actorUserId: input.actorUserId,
        createdAt: input.now
      })
    ]);
    const tab = await this.findOrderTabById(input.barId, input.orderTabId);
    const item = await this.findOrderTabItemById(input.barId, input.orderTabId, input.id);
    const event = await this.findEventById(input.eventId);
    if (!tab || !item || !event) throw new Error("ORDER_ITEM_ADD_FAILED");
    return { kind: "updated", tab, item, event };
  }

  async addCustomOrderItem(input: CustomOrderItemInput): Promise<OrderItemMutationResult> {
    const current = await this.findOrderTabById(input.barId, input.orderTabId);
    const guard = guardMutableTab(current, input.expectedVersion, input.confirmReopen);
    if (guard) return guard;
    if (!current) return { kind: "not_found" };
    const lineTotal = input.unitAmountMinor * input.quantity;
    if (current.totalAmountMinor + lineTotal < 0) return { kind: "total_negative", current };
    const nextVersion = current.version + 1;
    const nextStatus = current.status === "checkout_requested" ? "open" : current.status;
    const nextCheckoutRequestedAt = current.status === "checkout_requested" ? null : current.checkoutRequestedAt;
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO order_tab_items (
            id, bar_id, order_tab_id, item_type, status, menu_item_id, menu_item_public_id,
            menu_item_name, menu_item_price_id, price_label, volume_text, unit_amount_minor,
            quantity, line_total_amount_minor, currency, reason, version, void_reason,
            created_by_user_id, updated_by_user_id, voided_by_user_id, created_at, updated_at, voided_at
          ) VALUES (?, ?, ?, 'custom', 'active', NULL, NULL, ?, NULL, '기타 항목', '', ?, ?, ?, ?, ?, 1, NULL, ?, ?, NULL, ?, ?, NULL)`
        )
        .bind(
          input.id,
          input.barId,
          input.orderTabId,
          input.name,
          input.unitAmountMinor,
          input.quantity,
          lineTotal,
          input.currency,
          input.reason,
          input.actorUserId,
          input.actorUserId,
          input.now,
          input.now
        ),
      this.db
        .prepare(
          `UPDATE order_tabs
           SET status = ?, total_amount_minor = total_amount_minor + ?, active_item_count = active_item_count + 1,
             version = ?, checkout_requested_at = ?, updated_by_user_id = ?, updated_at = ?
           WHERE bar_id = ? AND id = ? AND version = ?`
        )
        .bind(
          nextStatus,
          lineTotal,
          nextVersion,
          nextCheckoutRequestedAt,
          input.actorUserId,
          input.now,
          input.barId,
          input.orderTabId,
          input.expectedVersion
        ),
      eventInsertStatement(this.db, {
        id: input.eventId,
        barId: input.barId,
        orderTabId: input.orderTabId,
        type: "custom_item_added",
        beforeStatus: current.status,
        afterStatus: nextStatus,
        expectedVersion: input.expectedVersion,
        resultingVersion: nextVersion,
        note: `기타 항목 추가: ${input.name} ${input.quantity}개 · ${input.reason}`,
        actorUserId: input.actorUserId,
        createdAt: input.now
      })
    ]);
    const tab = await this.findOrderTabById(input.barId, input.orderTabId);
    const item = await this.findOrderTabItemById(input.barId, input.orderTabId, input.id);
    const event = await this.findEventById(input.eventId);
    if (!tab || !item || !event) throw new Error("ORDER_CUSTOM_ITEM_ADD_FAILED");
    return { kind: "updated", tab, item, event };
  }

  async addAdjustmentOrderItem(input: AdjustmentOrderItemInput): Promise<OrderItemMutationResult> {
    const current = await this.findOrderTabById(input.barId, input.orderTabId);
    const guard = guardMutableTab(current, input.expectedVersion, input.confirmReopen);
    if (guard) return guard;
    if (!current) return { kind: "not_found" };
    if (current.totalAmountMinor + input.amountMinor < 0) return { kind: "total_negative", current };
    const nextVersion = current.version + 1;
    const nextStatus = current.status === "checkout_requested" ? "open" : current.status;
    const nextCheckoutRequestedAt = current.status === "checkout_requested" ? null : current.checkoutRequestedAt;
    const priceLabel = input.amountMinor < 0 ? "할인" : "추가금";
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO order_tab_items (
            id, bar_id, order_tab_id, item_type, status, menu_item_id, menu_item_public_id,
            menu_item_name, menu_item_price_id, price_label, volume_text, unit_amount_minor,
            quantity, line_total_amount_minor, currency, reason, version, void_reason,
            created_by_user_id, updated_by_user_id, voided_by_user_id, created_at, updated_at, voided_at
          ) VALUES (?, ?, ?, 'adjustment', 'active', NULL, NULL, ?, NULL, ?, '', ?, 1, ?, ?, ?, 1, NULL, ?, ?, NULL, ?, ?, NULL)`
        )
        .bind(
          input.id,
          input.barId,
          input.orderTabId,
          input.label,
          priceLabel,
          input.amountMinor,
          input.amountMinor,
          input.currency,
          input.reason,
          input.actorUserId,
          input.actorUserId,
          input.now,
          input.now
        ),
      this.db
        .prepare(
          `UPDATE order_tabs
           SET status = ?, total_amount_minor = total_amount_minor + ?, active_item_count = active_item_count + 1,
             version = ?, checkout_requested_at = ?, updated_by_user_id = ?, updated_at = ?
           WHERE bar_id = ? AND id = ? AND version = ?`
        )
        .bind(
          nextStatus,
          input.amountMinor,
          nextVersion,
          nextCheckoutRequestedAt,
          input.actorUserId,
          input.now,
          input.barId,
          input.orderTabId,
          input.expectedVersion
        ),
      eventInsertStatement(this.db, {
        id: input.eventId,
        barId: input.barId,
        orderTabId: input.orderTabId,
        type: "adjustment_added",
        beforeStatus: current.status,
        afterStatus: nextStatus,
        expectedVersion: input.expectedVersion,
        resultingVersion: nextVersion,
        note: `금액 조정: ${input.label} ${input.amountMinor} · ${input.reason}`,
        actorUserId: input.actorUserId,
        createdAt: input.now
      })
    ]);
    const tab = await this.findOrderTabById(input.barId, input.orderTabId);
    const item = await this.findOrderTabItemById(input.barId, input.orderTabId, input.id);
    const event = await this.findEventById(input.eventId);
    if (!tab || !item || !event) throw new Error("ORDER_ADJUSTMENT_ADD_FAILED");
    return { kind: "updated", tab, item, event };
  }

  async updateOrderItemQuantity(input: UpdateOrderItemQuantityInput): Promise<OrderItemMutationResult> {
    const current = await this.findOrderTabById(input.barId, input.orderTabId);
    const guard = guardMutableTab(current, input.expectedVersion, true);
    if (guard) return guard;
    if (!current) return { kind: "not_found" };
    const item = await this.findOrderTabItemById(input.barId, input.orderTabId, input.itemId);
    if (!item) return { kind: "item_not_found", current };
    if (item.version !== input.itemExpectedVersion) return { kind: "item_version_conflict", current, item };
    if (item.status !== "active") return { kind: "line_immutable", current, item };
    if (item.type === "adjustment") return { kind: "quantity_not_supported", current, item };
    const nextItemVersion = item.version + 1;
    const nextTabVersion = current.version + 1;
    const nextLineTotal = item.unitAmountMinor * input.quantity;
    const totalDelta = nextLineTotal - item.lineTotalAmountMinor;
    if (current.totalAmountMinor + totalDelta < 0) return { kind: "total_negative", current };
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE order_tab_items
           SET quantity = ?, line_total_amount_minor = ?, version = ?, updated_by_user_id = ?, updated_at = ?
           WHERE bar_id = ? AND order_tab_id = ? AND id = ? AND status = 'active' AND version = ?`
        )
        .bind(input.quantity, nextLineTotal, nextItemVersion, input.actorUserId, input.now, input.barId, input.orderTabId, input.itemId, input.itemExpectedVersion),
      this.db
        .prepare(
          `UPDATE order_tabs
           SET total_amount_minor = total_amount_minor + ?, version = ?, updated_by_user_id = ?, updated_at = ?
           WHERE bar_id = ? AND id = ? AND version = ?`
        )
        .bind(totalDelta, nextTabVersion, input.actorUserId, input.now, input.barId, input.orderTabId, input.expectedVersion),
      eventInsertStatement(this.db, {
        id: input.eventId,
        barId: input.barId,
        orderTabId: input.orderTabId,
        type: "item_quantity_updated",
        beforeStatus: current.status,
        afterStatus: current.status,
        expectedVersion: input.expectedVersion,
        resultingVersion: nextTabVersion,
        note: `수량 변경: ${item.menuItemName} ${input.quantity}개`,
        actorUserId: input.actorUserId,
        createdAt: input.now
      })
    ]);
    const tab = await this.findOrderTabById(input.barId, input.orderTabId);
    const updatedItem = await this.findOrderTabItemById(input.barId, input.orderTabId, input.itemId);
    const event = await this.findEventById(input.eventId);
    if (!tab || !updatedItem || !event) throw new Error("ORDER_ITEM_QUANTITY_UPDATE_FAILED");
    return { kind: "updated", tab, item: updatedItem, event };
  }

  async voidOrderItem(input: VoidOrderItemInput): Promise<OrderItemMutationResult> {
    const current = await this.findOrderTabById(input.barId, input.orderTabId);
    const guard = guardMutableTab(current, input.expectedVersion, true);
    if (guard) return guard;
    if (!current) return { kind: "not_found" };
    const item = await this.findOrderTabItemById(input.barId, input.orderTabId, input.itemId);
    if (!item) return { kind: "item_not_found", current };
    if (item.version !== input.itemExpectedVersion) return { kind: "item_version_conflict", current, item };
    if (item.status !== "active") return { kind: "line_immutable", current, item };
    if (current.totalAmountMinor - item.lineTotalAmountMinor < 0) return { kind: "total_negative", current };
    const nextItemVersion = item.version + 1;
    const nextTabVersion = current.version + 1;
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE order_tab_items
           SET status = 'voided', version = ?, void_reason = ?, updated_by_user_id = ?, voided_by_user_id = ?, updated_at = ?, voided_at = ?
           WHERE bar_id = ? AND order_tab_id = ? AND id = ? AND status = 'active' AND version = ?`
        )
        .bind(nextItemVersion, input.reason, input.actorUserId, input.actorUserId, input.now, input.now, input.barId, input.orderTabId, input.itemId, input.itemExpectedVersion),
      this.db
        .prepare(
          `UPDATE order_tabs
           SET total_amount_minor = total_amount_minor - ?, active_item_count = active_item_count - 1,
             version = ?, updated_by_user_id = ?, updated_at = ?
           WHERE bar_id = ? AND id = ? AND version = ?`
        )
        .bind(item.lineTotalAmountMinor, nextTabVersion, input.actorUserId, input.now, input.barId, input.orderTabId, input.expectedVersion),
      eventInsertStatement(this.db, {
        id: input.eventId,
        barId: input.barId,
        orderTabId: input.orderTabId,
        type: "item_voided",
        beforeStatus: current.status,
        afterStatus: current.status,
        expectedVersion: input.expectedVersion,
        resultingVersion: nextTabVersion,
        note: `취소: ${item.menuItemName} · ${input.reason}`,
        actorUserId: input.actorUserId,
        createdAt: input.now
      })
    ]);
    const tab = await this.findOrderTabById(input.barId, input.orderTabId);
    const updatedItem = await this.findOrderTabItemById(input.barId, input.orderTabId, input.itemId);
    const event = await this.findEventById(input.eventId);
    if (!tab || !updatedItem || !event) throw new Error("ORDER_ITEM_VOID_FAILED");
    return { kind: "updated", tab, item: updatedItem, event };
  }

  async listOrderTabEvents(barId: string, orderTabId: string, limit: number): Promise<OrderTabEventRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT *
         FROM order_tab_events
         WHERE bar_id = ? AND order_tab_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`
      )
      .bind(barId, orderTabId, limit)
      .all<OrderTabEventRow>();
    return (result.results ?? []).map(toEventRecord);
  }

  async findIdempotencyRecord(
    barId: string,
    actorUserId: string,
    operation: OrderIdempotencyOperation,
    scopeId: string,
    idempotencyKey: string
  ): Promise<IdempotencyRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT *
         FROM idempotency_keys
         WHERE bar_id = ? AND actor_user_id = ? AND operation = ? AND scope_id = ? AND idempotency_key = ?`
      )
      .bind(barId, actorUserId, operation, scopeId, idempotencyKey)
      .first<IdempotencyRow>();
    return row ? toIdempotencyRecord(row) : null;
  }

  async storeIdempotencyRecord(record: IdempotencyRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO idempotency_keys (
          id, bar_id, actor_user_id, operation, scope_id, idempotency_key,
          request_hash, response_status, response_json, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        record.id,
        record.barId,
        record.actorUserId,
        record.operation,
        record.scopeId,
        record.idempotencyKey,
        record.requestHash,
        record.responseStatus,
        record.responseJson,
        record.createdAt,
        record.expiresAt
      )
      .run();
  }

  async previewRetention(policy: OrderRetentionPolicy): Promise<OrderRetentionResult> {
    return this.countRetention(policy);
  }

  async pruneRetention(policy: OrderRetentionPolicy): Promise<OrderRetentionResult> {
    const result = await this.countRetention(policy);
    await this.db.batch([
      this.db
        .prepare(
          `DELETE FROM order_tabs
           WHERE status IN ('closed', 'cancelled')
             AND COALESCE(settled_at, closed_at, cancelled_at, updated_at) < ?`
        )
        .bind(policy.orderTerminalCutoff),
      this.db
        .prepare("DELETE FROM daily_order_summaries WHERE business_date < ?")
        .bind(policy.dailySummaryCutoffDate)
    ]);
    return result;
  }

  private async readActiveTotals(barId: string, orderTabId: string): Promise<{ totalAmountMinor: number; activeItemCount: number }> {
    const row = await this.db
      .prepare(
        `SELECT
          COALESCE(SUM(line_total_amount_minor), 0) AS total_amount_minor,
          COUNT(*) AS active_item_count
         FROM order_tab_items
         WHERE bar_id = ? AND order_tab_id = ? AND status = 'active'`
      )
      .bind(barId, orderTabId)
      .first<{ total_amount_minor: number | null; active_item_count: number | null }>();
    return {
      totalAmountMinor: row?.total_amount_minor ?? 0,
      activeItemCount: row?.active_item_count ?? 0
    };
  }

  private async rebuildDailyOrderSummary(
    barId: string,
    dailySummaryId: string,
    businessDate: string,
    currency: string,
    now: string
  ): Promise<DailyOrderSummary> {
    const row = await this.db
      .prepare(
        `SELECT
          SUM(CASE WHEN status = 'closed' AND substr(COALESCE(settled_at, closed_at), 1, 10) = ? THEN 1 ELSE 0 END) AS settled_tab_count,
          SUM(CASE WHEN status = 'cancelled' AND substr(cancelled_at, 1, 10) = ? THEN 1 ELSE 0 END) AS cancelled_tab_count,
          SUM(CASE WHEN status = 'closed' AND substr(COALESCE(settled_at, closed_at), 1, 10) = ? THEN COALESCE(final_total_amount_minor, total_amount_minor) ELSE 0 END) AS settled_total_amount_minor,
          SUM(CASE WHEN status = 'closed' AND substr(COALESCE(settled_at, closed_at), 1, 10) = ? THEN active_item_count ELSE 0 END) AS settled_item_count
         FROM order_tabs
         WHERE bar_id = ?`
      )
      .bind(businessDate, businessDate, businessDate, businessDate, barId)
      .first<{
        settled_tab_count: number | null;
        cancelled_tab_count: number | null;
        settled_total_amount_minor: number | null;
        settled_item_count: number | null;
      }>();
    const summary = {
      settledTabCount: row?.settled_tab_count ?? 0,
      cancelledTabCount: row?.cancelled_tab_count ?? 0,
      settledTotalAmountMinor: row?.settled_total_amount_minor ?? 0,
      settledItemCount: row?.settled_item_count ?? 0
    };
    await this.db
      .prepare(
        `INSERT INTO daily_order_summaries (
          id, bar_id, business_date, currency, settled_tab_count, cancelled_tab_count,
          settled_total_amount_minor, settled_item_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(bar_id, business_date) DO UPDATE SET
          currency = excluded.currency,
          settled_tab_count = excluded.settled_tab_count,
          cancelled_tab_count = excluded.cancelled_tab_count,
          settled_total_amount_minor = excluded.settled_total_amount_minor,
          settled_item_count = excluded.settled_item_count,
          updated_at = excluded.updated_at`
      )
      .bind(
        dailySummaryId,
        barId,
        businessDate,
        currency,
        summary.settledTabCount,
        summary.cancelledTabCount,
        summary.settledTotalAmountMinor,
        summary.settledItemCount,
        now,
        now
      )
      .run();
    return this.readDailyOrderSummary(barId, businessDate, currency);
  }

  private async findEventById(eventId: string): Promise<OrderTabEventRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM order_tab_events WHERE id = ?")
      .bind(eventId)
      .first<OrderTabEventRow>();
    return row ? toEventRecord(row) : null;
  }

  private async countRetention(policy: OrderRetentionPolicy): Promise<OrderRetentionResult> {
    const tabs = await this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM order_tabs
         WHERE status IN ('closed', 'cancelled')
           AND COALESCE(settled_at, closed_at, cancelled_at, updated_at) < ?`
      )
      .bind(policy.orderTerminalCutoff)
      .first<{ count: number | null }>();
    const summaries = await this.db
      .prepare("SELECT COUNT(*) AS count FROM daily_order_summaries WHERE business_date < ?")
      .bind(policy.dailySummaryCutoffDate)
      .first<{ count: number | null }>();
    return {
      closedCancelledOrderTabs: tabs?.count ?? 0,
      dailyOrderSummaries: summaries?.count ?? 0
    };
  }

  private async findOrderTabItemById(barId: string, orderTabId: string, itemId: string): Promise<OrderTabItemRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM order_tab_items WHERE bar_id = ? AND order_tab_id = ? AND id = ?")
      .bind(barId, orderTabId, itemId)
      .first<OrderTabItemRow>();
    return row ? toItemRecord(row) : null;
  }
}

function toTabRecord(row: OrderTabRow): OrderTabRecord {
  return {
    id: row.id,
    barId: row.bar_id,
    tabNumber: row.tab_number,
    tableLabel: row.table_label,
    guestDescription: row.guest_description,
    status: row.status,
    totalAmountMinor: row.total_amount_minor,
    currency: row.currency,
    activeItemCount: row.active_item_count,
    version: row.version,
    openedAt: row.opened_at,
    checkoutRequestedAt: row.checkout_requested_at,
    closedAt: row.closed_at,
    cancelledAt: row.cancelled_at,
    finalTotalAmountMinor: row.final_total_amount_minor,
    settledAt: row.settled_at,
    settledByUserId: row.settled_by_user_id,
    cancelledReason: row.cancelled_reason,
    cancelledByUserId: row.cancelled_by_user_id,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toEventRecord(row: OrderTabEventRow): OrderTabEventRecord {
  return {
    id: row.id,
    barId: row.bar_id,
    orderTabId: row.order_tab_id,
    type: row.event_type,
    beforeStatus: row.before_status,
    afterStatus: row.after_status,
    expectedVersion: row.expected_version,
    resultingVersion: row.resulting_version,
    note: row.note,
    actorUserId: row.actor_user_id,
    createdAt: row.created_at
  };
}

function toItemRecord(row: OrderTabItemRow): OrderTabItemRecord {
  return {
    id: row.id,
    barId: row.bar_id,
    orderTabId: row.order_tab_id,
    type: row.item_type,
    status: row.status,
    menuItemId: row.menu_item_id,
    menuItemPublicId: row.menu_item_public_id,
    menuItemName: row.menu_item_name,
    priceId: row.menu_item_price_id,
    priceLabel: row.price_label,
    volumeText: row.volume_text,
    unitAmountMinor: row.unit_amount_minor,
    quantity: row.quantity,
    lineTotalAmountMinor: row.line_total_amount_minor,
    currency: row.currency,
    reason: row.reason,
    version: row.version,
    voidReason: row.void_reason,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    voidedByUserId: row.voided_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    voidedAt: row.voided_at
  };
}

function toIdempotencyRecord(row: IdempotencyRow): IdempotencyRecord {
  return {
    id: row.id,
    barId: row.bar_id,
    actorUserId: row.actor_user_id,
    operation: row.operation,
    scopeId: row.scope_id,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    responseStatus: row.response_status,
    responseJson: row.response_json,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

function toDailySummary(row: DailyOrderSummaryRow): DailyOrderSummary {
  return {
    businessDate: row.business_date,
    currency: row.currency,
    settledTabCount: row.settled_tab_count,
    cancelledTabCount: row.cancelled_tab_count,
    settledTotalAmountMinor: row.settled_total_amount_minor,
    settledItemCount: row.settled_item_count,
    updatedAt: row.updated_at
  };
}

function emptyDailySummary(businessDate: string, currency: string): DailyOrderSummary {
  return {
    businessDate,
    currency,
    settledTabCount: 0,
    cancelledTabCount: 0,
    settledTotalAmountMinor: 0,
    settledItemCount: 0,
    updatedAt: null
  };
}

function guardMutableTab(
  current: OrderTabRecord | null,
  expectedVersion: number,
  allowReopenFromCheckout: boolean
): OrderItemMutationResult | null {
  if (!current) return { kind: "not_found" };
  if (current.version !== expectedVersion) return { kind: "version_conflict", current };
  if (current.status === "closed" || current.status === "cancelled") return { kind: "immutable", current };
  if (current.status === "checkout_requested" && !allowReopenFromCheckout) return { kind: "reopen_required", current };
  return null;
}

function guardTransitionTab(
  current: OrderTabRecord | null,
  expectedVersion: number
): Exclude<OrderTabTransitionResult, { kind: "updated" }> | null {
  if (!current) return { kind: "not_found" };
  if (current.version !== expectedVersion) return { kind: "version_conflict", current };
  if (current.status === "closed" || current.status === "cancelled") return { kind: "immutable", current };
  return null;
}

function eventInsertStatement(db: D1Database, event: OrderTabEventRecord): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO order_tab_events (
        id, bar_id, order_tab_id, event_type, before_status, after_status, expected_version,
        resulting_version, note, actor_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      event.id,
      event.barId,
      event.orderTabId,
      event.type,
      event.beforeStatus,
      event.afterStatus,
      event.expectedVersion,
      event.resultingVersion,
      event.note,
      event.actorUserId,
      event.createdAt
    );
}

function readChangeCount(result: D1Result): number {
  return (result.meta as { changes?: number } | undefined)?.changes ?? 0;
}
