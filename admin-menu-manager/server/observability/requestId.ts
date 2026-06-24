export const requestIdHeader = "x-request-id";

export function createRequestId(input?: string | null): string {
  const trimmed = input?.trim();
  if (trimmed) return trimmed;
  return crypto.randomUUID();
}
