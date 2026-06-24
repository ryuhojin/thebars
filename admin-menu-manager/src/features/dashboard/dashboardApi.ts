import type { DashboardResponse } from "../../../contracts/dashboard";
import { AuthApiError } from "../auth/authApi";

type DashboardEnvelope =
  | { data: DashboardResponse; meta: { requestId: string } }
  | {
      error: {
        code: string;
        message: string;
        fieldErrors: Record<string, string[]>;
        details?: Record<string, unknown>;
      };
      meta: { requestId: string };
    };

const DASHBOARD_CACHE_TTL_MS = 5_000;

let dashboardCache: { data: DashboardResponse; loadedAt: number } | null = null;
let dashboardRequest: Promise<DashboardResponse> | null = null;
let dashboardCacheVersion = 0;

export async function readDashboard(): Promise<DashboardResponse> {
  if (dashboardCache && Date.now() - dashboardCache.loadedAt < DASHBOARD_CACHE_TTL_MS) {
    return dashboardCache.data;
  }
  if (dashboardRequest) return dashboardRequest;

  const requestVersion = dashboardCacheVersion;
  dashboardRequest = fetchDashboard()
    .then((data) => {
      if (requestVersion === dashboardCacheVersion) dashboardCache = { data, loadedAt: Date.now() };
      return data;
    })
    .finally(() => {
      dashboardRequest = null;
    });

  return dashboardRequest;
}

async function fetchDashboard(): Promise<DashboardResponse> {
  const response = await fetch("/api/dashboard", {
    headers: { accept: "application/json" },
    credentials: "include"
  });
  const envelope = (await response.json()) as DashboardEnvelope;
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

export function clearDashboardCache(): void {
  dashboardCacheVersion += 1;
  dashboardCache = null;
  dashboardRequest = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("thebar:auth-cache-clear", clearDashboardCache);
}
