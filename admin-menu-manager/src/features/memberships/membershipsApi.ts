import type {
  AddBarMembershipRequest,
  BarMembershipCommandResponse,
  BarMembersResponse,
  CurrentBarPermissionsResponse,
  RolePermissionsResponse,
  UpdateBarMembershipRequest,
  UpdateRolePermissionsRequest
} from "../../../contracts/memberships";
import type { ApiEnvelope } from "../auth/authApi";
import { AuthApiError } from "../auth/authApi";

const CURRENT_PERMISSIONS_CACHE_TTL_MS = 30_000;

const currentPermissionsCache = new Map<string, { data: CurrentBarPermissionsResponse; loadedAt: number }>();
const currentPermissionsRequests = new Map<string, Promise<CurrentBarPermissionsResponse>>();
let currentPermissionsCacheVersion = 0;

export async function readBarMembers(barId: string): Promise<BarMembersResponse> {
  return getJson(`/api/bars/${encodeURIComponent(barId)}/members`);
}

export async function addBarMember(
  barId: string,
  payload: AddBarMembershipRequest
): Promise<BarMembershipCommandResponse> {
  const result = await postJson<BarMembershipCommandResponse>(`/api/bars/${encodeURIComponent(barId)}/members`, payload);
  clearCurrentPermissionsCache(barId);
  return result;
}

export async function updateBarMember(
  barId: string,
  membershipId: string,
  payload: UpdateBarMembershipRequest
): Promise<BarMembershipCommandResponse> {
  const result = await patchJson<BarMembershipCommandResponse>(
    `/api/bars/${encodeURIComponent(barId)}/members/${encodeURIComponent(membershipId)}`,
    payload
  );
  clearCurrentPermissionsCache(barId);
  return result;
}

export async function deactivateBarMember(
  barId: string,
  membershipId: string
): Promise<BarMembershipCommandResponse> {
  const result = await postJson<BarMembershipCommandResponse>(
    `/api/bars/${encodeURIComponent(barId)}/members/${encodeURIComponent(membershipId)}/deactivate`,
    {}
  );
  clearCurrentPermissionsCache(barId);
  return result;
}

export async function updateRolePermissions(
  barId: string,
  payload: UpdateRolePermissionsRequest
): Promise<RolePermissionsResponse> {
  const result = await patchJson<RolePermissionsResponse>(
    `/api/bars/${encodeURIComponent(barId)}/role-permissions`,
    payload
  );
  clearCurrentPermissionsCache(barId);
  return result;
}

export async function readCurrentPermissions(
  barId: string,
  required?: string
): Promise<CurrentBarPermissionsResponse> {
  const query = required ? `?require=${encodeURIComponent(required)}` : "";
  const path = `/api/bars/${encodeURIComponent(barId)}/current-permissions${query}`;
  const cacheKey = `${barId}:${required ?? ""}`;
  const cached = currentPermissionsCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < CURRENT_PERMISSIONS_CACHE_TTL_MS) return cached.data;
  const pending = currentPermissionsRequests.get(cacheKey);
  if (pending) return pending;

  const requestVersion = currentPermissionsCacheVersion;
  const request = getJson<CurrentBarPermissionsResponse>(path)
    .then((data) => {
      if (requestVersion === currentPermissionsCacheVersion) {
        currentPermissionsCache.set(cacheKey, { data, loadedAt: Date.now() });
      }
      return data;
    })
    .finally(() => {
      currentPermissionsRequests.delete(cacheKey);
    });
  currentPermissionsRequests.set(cacheKey, request);
  return request;
}

export function getCurrentPermissionsSnapshot(
  barId: string,
  required?: string
): CurrentBarPermissionsResponse | null {
  return currentPermissionsCache.get(`${barId}:${required ?? ""}`)?.data ?? null;
}

export function primeCurrentPermissionsCache(data: CurrentBarPermissionsResponse): void {
  currentPermissionsCache.set(`${data.barId}:${data.required ?? ""}`, { data, loadedAt: Date.now() });
}

export function clearCurrentPermissionsCache(barId?: string): void {
  currentPermissionsCacheVersion += 1;
  if (!barId) {
    currentPermissionsCache.clear();
    currentPermissionsRequests.clear();
    return;
  }
  for (const key of currentPermissionsCache.keys()) {
    if (key.startsWith(`${barId}:`)) currentPermissionsCache.delete(key);
  }
  for (const key of currentPermissionsRequests.keys()) {
    if (key.startsWith(`${barId}:`)) currentPermissionsRequests.delete(key);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("thebar:auth-cache-clear", () => clearCurrentPermissionsCache());
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
