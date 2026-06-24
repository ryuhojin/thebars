import type {
  AuditListResponse,
  AuditLogQuery,
  MaintenanceRunRequest,
  MaintenanceRunResponse
} from "../../../contracts/audit";
import type { PilotReadinessResponse } from "../../../contracts/pilotReadiness";
import type { ApiEnvelope } from "../auth/authApi";
import { AuthApiError } from "../auth/authApi";

export async function readAuditLogs(query: Partial<AuditLogQuery> = {}): Promise<AuditListResponse> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.actorUserId && query.actorUserId !== "all") params.set("actorUserId", query.actorUserId);
  if (query.barId && query.barId !== "all") params.set("barId", query.barId);
  if (query.operation && query.operation !== "all") params.set("operation", query.operation);
  if (query.result && query.result !== "all") params.set("result", query.result);
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return getJson(`/api/system/audit${suffix}`);
}

export async function runMaintenance(payload: MaintenanceRunRequest): Promise<MaintenanceRunResponse> {
  return postJson("/api/system/audit/maintenance-runs", payload);
}

export async function readPilotReadiness(): Promise<PilotReadinessResponse> {
  return getJson("/api/system/pilot-readiness");
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
