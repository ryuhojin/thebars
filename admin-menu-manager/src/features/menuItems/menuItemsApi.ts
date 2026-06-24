import type {
  BulkUpdateMenuItemsRequest,
  BulkUpdateMenuItemsResponse,
  CreateMenuItemRequest,
  MenuItemDetailResponse,
  MenuItemListQuery,
  MenuItemsResponse,
  UpdateMenuItemRequest
} from "../../../contracts/menuItems";
import type { ApiEnvelope } from "../auth/authApi";
import { AuthApiError } from "../auth/authApi";

export async function readMenuItems(barId: string, query?: MenuItemListQuery): Promise<MenuItemsResponse> {
  const search = query ? toSearchParams(query) : "";
  return getJson(`/api/bars/${encodeURIComponent(barId)}/menu-items${search}`);
}

export async function readMenuItem(barId: string, menuItemId: string): Promise<MenuItemDetailResponse> {
  return getJson(`/api/bars/${encodeURIComponent(barId)}/menu-items/${encodeURIComponent(menuItemId)}`);
}

export async function createMenuItem(barId: string, payload: CreateMenuItemRequest): Promise<MenuItemDetailResponse> {
  return postJson(`/api/bars/${encodeURIComponent(barId)}/menu-items`, payload);
}

export async function updateMenuItem(
  barId: string,
  menuItemId: string,
  payload: UpdateMenuItemRequest
): Promise<MenuItemDetailResponse> {
  return patchJson(`/api/bars/${encodeURIComponent(barId)}/menu-items/${encodeURIComponent(menuItemId)}`, payload);
}

export async function deleteMenuItem(barId: string, menuItemId: string): Promise<{ deleted: true }> {
  return deleteJson(`/api/bars/${encodeURIComponent(barId)}/menu-items/${encodeURIComponent(menuItemId)}`);
}

export async function bulkUpdateMenuItems(
  barId: string,
  payload: BulkUpdateMenuItemsRequest
): Promise<BulkUpdateMenuItemsResponse> {
  return postJson(`/api/bars/${encodeURIComponent(barId)}/menu-items/bulk`, payload);
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

async function deleteJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: "DELETE",
    headers: {
      accept: "application/json",
      "x-csrf-token": csrfToken()
    },
    credentials: "include"
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

function toSearchParams(query: MenuItemListQuery): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === "" || value === "all") return;
    params.set(key, String(value));
  });
  const text = params.toString();
  return text ? `?${text}` : "";
}
