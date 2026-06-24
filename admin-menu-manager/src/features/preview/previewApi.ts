import type { PublicMenuPreviewResponse } from "../../../contracts/preview";
import type { ApiEnvelope } from "../auth/authApi";
import { AuthApiError } from "../auth/authApi";

export async function readPublicMenuPreview(barId: string): Promise<PublicMenuPreviewResponse> {
  const response = await fetch(`/api/bars/${encodeURIComponent(barId)}/preview`, {
    headers: { accept: "application/json" },
    credentials: "include"
  });
  const envelope = (await response.json()) as ApiEnvelope<PublicMenuPreviewResponse>;
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
