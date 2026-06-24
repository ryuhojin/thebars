import type { ApiError } from "../../contracts/apiEnvelope";

export class AuthServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
  }

  toApiError(): ApiError {
    return {
      code: this.code,
      message: this.message,
      fieldErrors: this.fieldErrors,
      details: Object.keys(this.details).length > 0 ? this.details : undefined
    };
  }
}

export function inputError(fieldErrors: Record<string, string[]>): AuthServiceError {
  return new AuthServiceError(400, "INPUT_INVALID", "입력값을 확인하세요.", fieldErrors);
}
