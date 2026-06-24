import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError, type ZodType } from "zod";
import type { AdminHonoEnv } from "../app";
import { fail } from "../../contracts/apiEnvelope";
import { AuthServiceError, inputError } from "./errors";
import type { AuthRuntime } from "./runtime";
import type { CreatedSession } from "./authService";

export async function parseJson<T>(context: Context<AdminHonoEnv>, schema: ZodType<T>): Promise<T> {
  let payload: unknown;
  try {
    payload = await context.req.json();
  } catch {
    throw inputError({ body: ["JSON 요청 본문이 필요합니다."] });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw inputError(toFieldErrors(parsed.error));
  }
  return parsed.data;
}

export function parseQuery<T>(context: Context<AdminHonoEnv>, schema: ZodType<T>): T {
  const parsed = schema.safeParse(context.req.query());
  if (!parsed.success) {
    throw inputError(toFieldErrors(parsed.error));
  }
  return parsed.data;
}

export function authErrorResponse(context: Context<AdminHonoEnv>, error: unknown): Response {
  const requestId = context.get("requestId");
  if (error instanceof AuthServiceError) {
    return context.json(fail(error.toApiError(), requestId), error.status as ContentfulStatusCode);
  }
  return context.json(
    fail(
      {
        code: "INTERNAL_ERROR",
        message: "요청을 처리하지 못했습니다.",
        fieldErrors: {}
      },
      requestId
    ),
    500
  );
}

export function getSessionCookie(context: Context<AdminHonoEnv>, runtime: AuthRuntime): string | null {
  return getCookie(context, runtime.service.sessionCookieName) ?? null;
}

export function getCsrfCookie(context: Context<AdminHonoEnv>, runtime: AuthRuntime): string | null {
  return getCookie(context, runtime.service.csrfCookieName) ?? null;
}

export function getCsrfHeader(context: Context<AdminHonoEnv>): string | null {
  return context.req.header("x-csrf-token") ?? null;
}

export function setSessionCookies(context: Context<AdminHonoEnv>, runtime: AuthRuntime, session: CreatedSession): void {
  const secure = new URL(context.req.url).protocol === "https:";
  const expires = new Date(session.expiresAt);
  setCookie(context, runtime.service.sessionCookieName, session.token, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    expires
  });
  setCookie(context, runtime.service.csrfCookieName, session.csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "Lax",
    path: "/",
    expires
  });
}

export function renewSessionCookies(
  context: Context<AdminHonoEnv>,
  runtime: AuthRuntime,
  sessionToken: string,
  csrfToken: string,
  expiresAt: string
): void {
  const secure = new URL(context.req.url).protocol === "https:";
  const expires = new Date(expiresAt);
  setCookie(context, runtime.service.sessionCookieName, sessionToken, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    expires
  });
  setCookie(context, runtime.service.csrfCookieName, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "Lax",
    path: "/",
    expires
  });
}

export function clearSessionCookies(context: Context<AdminHonoEnv>, runtime: AuthRuntime): void {
  deleteCookie(context, runtime.service.sessionCookieName, { path: "/" });
  deleteCookie(context, runtime.service.csrfCookieName, { path: "/" });
}

function toFieldErrors(error: ZodError): Record<string, string[]> {
  const flattened = error.flatten();
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(flattened.fieldErrors) as Array<[string, string[] | undefined]>) {
    if (value?.length) fieldErrors[key] = value;
  }
  if (flattened.formErrors.length) fieldErrors.body = flattened.formErrors;
  return fieldErrors;
}
