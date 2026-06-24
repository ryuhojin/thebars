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

export async function readDashboard(): Promise<DashboardResponse> {
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
