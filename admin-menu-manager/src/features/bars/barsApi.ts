import type {
  BarDetail,
  BarListResponse,
  CreateBarRequest,
  UpdateBarLifecycleRequest,
  UpdateBarLifecycleResponse
} from "../../../contracts/bars";
import type { ApiEnvelope } from "../auth/authApi";
import { AuthApiError } from "../auth/authApi";

export async function readBars(): Promise<BarListResponse> {
  return getJson("/api/bars");
}

export async function readBar(barId: string): Promise<BarDetail> {
  return getJson(`/api/bars/${encodeURIComponent(barId)}`);
}

export async function createBar(payload: CreateBarRequest): Promise<BarDetail> {
  return postJson("/api/bars", payload);
}

export async function updateBarLifecycle(
  barId: string,
  payload: UpdateBarLifecycleRequest
): Promise<UpdateBarLifecycleResponse> {
  return postJson(`/api/bars/${encodeURIComponent(barId)}/lifecycle`, payload);
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

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: { accept: "application/json" },
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
