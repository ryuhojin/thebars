import type { AdminBootstrapResponse } from "../../../contracts/adminBootstrap";
import type { ApiEnvelope } from "../auth/authApi";
import { AuthApiError, primeSessionCache } from "../auth/authApi";
import { primeDashboardCache } from "../dashboard/dashboardApi";
import { primeCurrentPermissionsCache } from "../memberships/membershipsApi";

const bootstrapRequests = new Map<string, Promise<AdminBootstrapResponse>>();

export async function readAdminBootstrap(options: { barId?: string | null } = {}): Promise<AdminBootstrapResponse> {
  const query = options.barId ? `?barId=${encodeURIComponent(options.barId)}` : "";
  const cacheKey = options.barId ?? "";
  const pending = bootstrapRequests.get(cacheKey);
  if (pending) return pending;

  const request = fetch(`/api/admin/bootstrap${query}`, {
    headers: { accept: "application/json" },
    credentials: "include"
  })
    .then((response) => readEnvelope<AdminBootstrapResponse>(response))
    .then((data) => {
      primeAdminBootstrap(data);
      return data;
    })
    .finally(() => {
      bootstrapRequests.delete(cacheKey);
    });

  bootstrapRequests.set(cacheKey, request);
  return request;
}

export function primeAdminBootstrap(data: AdminBootstrapResponse | null | undefined): void {
  if (!data) return;
  primeSessionCache(data.session);
  primeDashboardCache(data.dashboard);
  if (data.currentPermissions) primeCurrentPermissionsCache(data.currentPermissions);
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
