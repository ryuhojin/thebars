import type {
  CreateSystemUserRequest,
  CreateSystemUserResponse,
  SystemUserCommandResponse,
  SystemUserDetail,
  SystemUserListQuery,
  SystemUserListResponse
} from "../../../contracts/systemUsers";
import type { ApiEnvelope } from "../auth/authApi";
import { AuthApiError } from "../auth/authApi";

export async function readSystemUsers(query: Partial<SystemUserListQuery> = {}): Promise<SystemUserListResponse> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status && query.status !== "all") params.set("status", query.status);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return getJson(`/api/system/users${suffix}`);
}

export async function readSystemUser(userId: string): Promise<SystemUserDetail> {
  return getJson(`/api/system/users/${encodeURIComponent(userId)}`);
}

export async function createSystemUser(payload: CreateSystemUserRequest): Promise<CreateSystemUserResponse> {
  return postJson("/api/system/users", payload);
}

export async function activateSystemUser(userId: string): Promise<SystemUserCommandResponse> {
  return postJson(`/api/system/users/${encodeURIComponent(userId)}/activate`, {});
}

export async function deactivateSystemUser(userId: string): Promise<SystemUserCommandResponse> {
  return postJson(`/api/system/users/${encodeURIComponent(userId)}/deactivate`, {});
}

export async function unlockSystemUser(userId: string): Promise<SystemUserCommandResponse> {
  return postJson(`/api/system/users/${encodeURIComponent(userId)}/unlock`, {});
}

export async function resetSystemUserPassword(userId: string): Promise<CreateSystemUserResponse> {
  return postJson(`/api/system/users/${encodeURIComponent(userId)}/reset-password`, {});
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
