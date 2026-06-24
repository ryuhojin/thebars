import type {
  ApproveGrapeCandidateRequest,
  BarItemTypesResponse,
  CreateBarItemTypeRequest,
  CreateSystemItemTypeRequest,
  GrapeVarietiesResponse,
  GrapeVarietyCandidatesResponse,
  ItemTypesResponse,
  RejectGrapeCandidateRequest,
  SubmitGrapeCandidateRequest,
  SystemItemType,
  UpdateBarItemTypeOverrideRequest,
  UpdateBarItemTypeRequest,
  UpdateSystemItemTypeRequest
} from "../../../contracts/itemTypes";
import type { ApiEnvelope } from "../auth/authApi";
import { AuthApiError } from "../auth/authApi";

export async function readItemTypes(): Promise<ItemTypesResponse> {
  return getJson("/api/system/item-types");
}

export async function createSystemItemType(payload: CreateSystemItemTypeRequest): Promise<SystemItemType> {
  return postJson("/api/system/item-types", payload);
}

export async function updateSystemItemType(itemTypeId: string, payload: UpdateSystemItemTypeRequest): Promise<SystemItemType> {
  return patchJson(`/api/system/item-types/${encodeURIComponent(itemTypeId)}`, payload);
}

export async function deleteSystemItemType(itemTypeId: string): Promise<{ deleted: true }> {
  return deleteJson(`/api/system/item-types/${encodeURIComponent(itemTypeId)}`);
}

export async function readBarItemTypes(barId: string): Promise<BarItemTypesResponse> {
  return getJson(`/api/bars/${encodeURIComponent(barId)}/item-types`);
}

export async function createBarItemType(barId: string, payload: CreateBarItemTypeRequest): Promise<BarItemTypesResponse> {
  return postJson(`/api/bars/${encodeURIComponent(barId)}/item-types`, payload);
}

export async function updateBarItemType(
  barId: string,
  itemTypeId: string,
  payload: UpdateBarItemTypeRequest
): Promise<BarItemTypesResponse> {
  return patchJson(`/api/bars/${encodeURIComponent(barId)}/item-types/${encodeURIComponent(itemTypeId)}`, payload);
}

export async function deleteBarItemType(barId: string, itemTypeId: string): Promise<{ deleted: true }> {
  return deleteJson(`/api/bars/${encodeURIComponent(barId)}/item-types/${encodeURIComponent(itemTypeId)}`);
}

export async function updateBarItemTypeOverride(
  barId: string,
  systemItemTypeId: string,
  payload: UpdateBarItemTypeOverrideRequest
): Promise<BarItemTypesResponse> {
  return patchJson(
    `/api/bars/${encodeURIComponent(barId)}/item-types/overrides/${encodeURIComponent(systemItemTypeId)}`,
    payload
  );
}

export async function readGrapeVarieties(): Promise<GrapeVarietiesResponse> {
  return getJson("/api/system/grape-varieties");
}

export async function readGrapeCandidates(): Promise<GrapeVarietyCandidatesResponse> {
  return getJson("/api/system/grape-variety-candidates");
}

export async function submitGrapeCandidate(payload: SubmitGrapeCandidateRequest): Promise<GrapeVarietyCandidatesResponse> {
  return postJson("/api/system/grape-variety-candidates", payload);
}

export async function approveGrapeCandidate(
  candidateId: string,
  payload: ApproveGrapeCandidateRequest
): Promise<GrapeVarietyCandidatesResponse> {
  return postJson(`/api/system/grape-variety-candidates/${encodeURIComponent(candidateId)}/approve`, payload);
}

export async function rejectGrapeCandidate(
  candidateId: string,
  payload: RejectGrapeCandidateRequest
): Promise<GrapeVarietyCandidatesResponse> {
  return postJson(`/api/system/grape-variety-candidates/${encodeURIComponent(candidateId)}/reject`, payload);
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
