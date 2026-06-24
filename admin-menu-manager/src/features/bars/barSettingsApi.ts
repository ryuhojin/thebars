import type { BarSettingsResponse, UpdateBarSettingsRequest } from "../../../contracts/barSettings";
import type { ApiEnvelope } from "../auth/authApi";
import { AuthApiError } from "../auth/authApi";

export async function readBarSettings(barId: string): Promise<BarSettingsResponse> {
  return getJson(`/api/bars/${encodeURIComponent(barId)}/settings`);
}

export async function updateBarSettings(barId: string, payload: UpdateBarSettingsRequest): Promise<BarSettingsResponse> {
  const response = await fetch(`/api/bars/${encodeURIComponent(barId)}/settings`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-csrf-token": csrfToken()
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });
  return readEnvelope<BarSettingsResponse>(response);
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
