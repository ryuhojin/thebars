import type {
  BadgesResponse,
  BarBadgesResponse,
  CreateBadgeColorRequest,
  CreateBarBadgeRequest,
  CreateSystemBadgeRequest,
  DeleteBarBadgeRequest,
  UpdateBadgeColorRequest,
  UpdateBarBadgeRequest,
  UpdateBarSystemBadgeVisibilityRequest,
  UpdateSystemBadgeRequest
} from "../../../contracts/badges";
import type { ApiEnvelope } from "../auth/authApi";
import { AuthApiError } from "../auth/authApi";

export async function readBadges(): Promise<BadgesResponse> {
  return getJson("/api/system/badges");
}

export async function createBadgeColor(payload: CreateBadgeColorRequest): Promise<BadgesResponse> {
  return postJson("/api/system/badge-colors", payload);
}

export async function updateBadgeColor(colorId: string, payload: UpdateBadgeColorRequest): Promise<BadgesResponse> {
  return patchJson(`/api/system/badge-colors/${encodeURIComponent(colorId)}`, payload);
}

export async function createSystemBadge(payload: CreateSystemBadgeRequest): Promise<BadgesResponse> {
  return postJson("/api/system/badges", payload);
}

export async function updateSystemBadge(badgeId: string, payload: UpdateSystemBadgeRequest): Promise<BadgesResponse> {
  return patchJson(`/api/system/badges/${encodeURIComponent(badgeId)}`, payload);
}

export async function readBarBadges(barId: string): Promise<BarBadgesResponse> {
  return getJson(`/api/bars/${encodeURIComponent(barId)}/badges`);
}

export async function createBarBadge(barId: string, payload: CreateBarBadgeRequest): Promise<BarBadgesResponse> {
  return postJson(`/api/bars/${encodeURIComponent(barId)}/badges`, payload);
}

export async function updateBarSystemBadgeVisibility(
  barId: string,
  systemBadgeId: string,
  payload: UpdateBarSystemBadgeVisibilityRequest
): Promise<BarBadgesResponse> {
  return patchJson(`/api/bars/${encodeURIComponent(barId)}/badges/visibility/${encodeURIComponent(systemBadgeId)}`, payload);
}

export async function updateBarBadge(
  barId: string,
  badgeId: string,
  payload: UpdateBarBadgeRequest
): Promise<BarBadgesResponse> {
  return patchJson(`/api/bars/${encodeURIComponent(barId)}/badges/${encodeURIComponent(badgeId)}`, payload);
}

export async function deleteBarBadge(barId: string, badgeId: string, payload: DeleteBarBadgeRequest): Promise<{ deleted: true }> {
  return deleteJson(`/api/bars/${encodeURIComponent(barId)}/badges/${encodeURIComponent(badgeId)}`, payload);
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

async function deleteJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "DELETE",
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
