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

export async function readBarMembers(barId: string): Promise<BarMembersResponse> {
  return getJson(`/api/bars/${encodeURIComponent(barId)}/members`);
}

export async function addBarMember(
  barId: string,
  payload: AddBarMembershipRequest
): Promise<BarMembershipCommandResponse> {
  return postJson(`/api/bars/${encodeURIComponent(barId)}/members`, payload);
}

export async function updateBarMember(
  barId: string,
  membershipId: string,
  payload: UpdateBarMembershipRequest
): Promise<BarMembershipCommandResponse> {
  return patchJson(`/api/bars/${encodeURIComponent(barId)}/members/${encodeURIComponent(membershipId)}`, payload);
}

export async function deactivateBarMember(
  barId: string,
  membershipId: string
): Promise<BarMembershipCommandResponse> {
  return postJson(`/api/bars/${encodeURIComponent(barId)}/members/${encodeURIComponent(membershipId)}/deactivate`, {});
}

export async function updateRolePermissions(
  barId: string,
  payload: UpdateRolePermissionsRequest
): Promise<RolePermissionsResponse> {
  return patchJson(`/api/bars/${encodeURIComponent(barId)}/role-permissions`, payload);
}

export async function readCurrentPermissions(
  barId: string,
  required?: string
): Promise<CurrentBarPermissionsResponse> {
  const query = required ? `?require=${encodeURIComponent(required)}` : "";
  return getJson(`/api/bars/${encodeURIComponent(barId)}/current-permissions${query}`);
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
