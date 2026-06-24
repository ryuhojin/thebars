import type { PublicMenuPreviewResponse } from "../../../contracts/preview";
import { DEFAULT_PUBLIC_MENU_CONCEPT, type PublicMenuAvailableConcept } from "../../../contracts/publicMenu";
import type { ApiEnvelope } from "../auth/authApi";
import { AuthApiError } from "../auth/authApi";

export async function readPublicMenuPreview(
  barId: string,
  layoutConcept: PublicMenuAvailableConcept = DEFAULT_PUBLIC_MENU_CONCEPT
): Promise<PublicMenuPreviewResponse> {
  const params = new URLSearchParams({ layoutConcept });
  const response = await fetch(`/api/bars/${encodeURIComponent(barId)}/preview?${params.toString()}`, {
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
