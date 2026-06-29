import type {
  AddAdjustmentOrderItemRequest,
  AddCustomOrderItemRequest,
  AddMenuOrderItemRequest,
  CancelOrderTabRequest,
  CreateOrderTabRequest,
  OrderTabDetailResponse,
  OrderTabListQuery,
  OrderTabsResponse,
  ReopenOrderTabRequest,
  RequestCheckoutOrderTabRequest,
  SettleOrderTabRequest,
  UpdateOrderItemQuantityRequest,
  UpdateOrderTabRequest,
  VoidOrderItemRequest
} from "../../../contracts/orderTabs";
import type { ApiEnvelope } from "../auth/authApi";
import { AuthApiError } from "../auth/authApi";

export async function readOrderTabs(barId: string, query?: OrderTabListQuery): Promise<OrderTabsResponse> {
  const search = query ? toSearchParams(query) : "";
  return getJson(`/api/bars/${encodeURIComponent(barId)}/order-tabs${search}`);
}

export async function createOrderTab(barId: string, payload: CreateOrderTabRequest): Promise<OrderTabDetailResponse> {
  return postJson(`/api/bars/${encodeURIComponent(barId)}/order-tabs`, payload);
}

export async function readOrderTab(barId: string, orderTabId: string): Promise<OrderTabDetailResponse> {
  return getJson(`/api/bars/${encodeURIComponent(barId)}/order-tabs/${encodeURIComponent(orderTabId)}`);
}

export async function updateOrderTab(
  barId: string,
  orderTabId: string,
  payload: UpdateOrderTabRequest
): Promise<OrderTabDetailResponse> {
  return patchJson(`/api/bars/${encodeURIComponent(barId)}/order-tabs/${encodeURIComponent(orderTabId)}`, payload);
}

export async function requestCheckoutOrderTab(
  barId: string,
  orderTabId: string,
  payload: RequestCheckoutOrderTabRequest
): Promise<OrderTabDetailResponse> {
  return postJson(`/api/bars/${encodeURIComponent(barId)}/order-tabs/${encodeURIComponent(orderTabId)}/checkout-request`, payload);
}

export async function reopenOrderTab(
  barId: string,
  orderTabId: string,
  payload: ReopenOrderTabRequest
): Promise<OrderTabDetailResponse> {
  return postJson(`/api/bars/${encodeURIComponent(barId)}/order-tabs/${encodeURIComponent(orderTabId)}/reopen`, payload);
}

export async function settleOrderTab(
  barId: string,
  orderTabId: string,
  payload: SettleOrderTabRequest
): Promise<OrderTabDetailResponse> {
  return postJson(`/api/bars/${encodeURIComponent(barId)}/order-tabs/${encodeURIComponent(orderTabId)}/settle`, payload);
}

export async function cancelOrderTab(
  barId: string,
  orderTabId: string,
  payload: CancelOrderTabRequest
): Promise<OrderTabDetailResponse> {
  return postJson(`/api/bars/${encodeURIComponent(barId)}/order-tabs/${encodeURIComponent(orderTabId)}/cancel`, payload);
}

export async function addMenuOrderItem(
  barId: string,
  orderTabId: string,
  payload: AddMenuOrderItemRequest
): Promise<OrderTabDetailResponse> {
  return postJson(`/api/bars/${encodeURIComponent(barId)}/order-tabs/${encodeURIComponent(orderTabId)}/items`, payload);
}

export async function addCustomOrderItem(
  barId: string,
  orderTabId: string,
  payload: AddCustomOrderItemRequest
): Promise<OrderTabDetailResponse> {
  return postJson(`/api/bars/${encodeURIComponent(barId)}/order-tabs/${encodeURIComponent(orderTabId)}/items/custom`, payload);
}

export async function addAdjustmentOrderItem(
  barId: string,
  orderTabId: string,
  payload: AddAdjustmentOrderItemRequest
): Promise<OrderTabDetailResponse> {
  return postJson(`/api/bars/${encodeURIComponent(barId)}/order-tabs/${encodeURIComponent(orderTabId)}/items/adjustments`, payload);
}

export async function updateOrderItemQuantity(
  barId: string,
  orderTabId: string,
  itemId: string,
  payload: UpdateOrderItemQuantityRequest
): Promise<OrderTabDetailResponse> {
  return patchJson(
    `/api/bars/${encodeURIComponent(barId)}/order-tabs/${encodeURIComponent(orderTabId)}/items/${encodeURIComponent(itemId)}`,
    payload
  );
}

export async function voidOrderItem(
  barId: string,
  orderTabId: string,
  itemId: string,
  payload: VoidOrderItemRequest
): Promise<OrderTabDetailResponse> {
  return postJson(
    `/api/bars/${encodeURIComponent(barId)}/order-tabs/${encodeURIComponent(orderTabId)}/items/${encodeURIComponent(itemId)}/void`,
    payload
  );
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: { accept: "application/json" },
    credentials: "include"
  });
  return readEnvelope<T>(response);
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-csrf-token": csrfToken()
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });
  return readEnvelope<T>(response);
}

async function patchJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-csrf-token": csrfToken()
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });
  return readEnvelope<T>(response);
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if ("error" in envelope) {
    throw new AuthApiError(
      envelope.error.code,
      envelope.error.message,
      envelope.error.fieldErrors,
      envelope.error.details ?? {}
    );
  }
  return envelope.data;
}

function csrfToken(): string {
  const fromStorage = sessionStorage.getItem("bar_csrf");
  if (fromStorage) return fromStorage;
  const fromCookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("bar_csrf="));
  return fromCookie ? decodeURIComponent(fromCookie.replace("bar_csrf=", "")) : "";
}

function toSearchParams(query: OrderTabListQuery): string {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.query?.trim()) params.set("query", query.query.trim());
  const text = params.toString();
  return text ? `?${text}` : "";
}
