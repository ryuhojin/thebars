import type {
  AuthUser,
  ChangePasswordRequest,
  LoginRequest,
  LoginResponse,
  RecoveryRequest,
  SessionResponse,
  SetupRequest
} from "../../../contracts/auth";

export type ApiEnvelope<T> =
  | { data: T; meta: { requestId: string } }
  | {
      error: {
        code: string;
        message: string;
        fieldErrors: Record<string, string[]>;
        details?: Record<string, unknown>;
      };
      meta: { requestId: string };
    };

export class AuthApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

const SESSION_CACHE_TTL_MS = 60_000;

let sessionCache: { data: SessionResponse; checkedAt: number } | null = null;
let sessionRequest: Promise<SessionResponse> | null = null;

export async function setupAdmin(payload: SetupRequest): Promise<{ setupComplete: true; user: AuthUser }> {
  return postJson("/api/setup", payload);
}

export async function recoverAdmin(payload: RecoveryRequest): Promise<{ recovered: true }> {
  return postJson("/api/recovery", payload);
}

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  clearSessionCache();
  const response = await postJson<LoginResponse>("/api/auth/login", payload);
  sessionStorage.setItem("bar_csrf", response.csrfToken);
  return response;
}

export async function readSession(options: { cache?: "default" | "reload" } = {}): Promise<SessionResponse> {
  const cacheMode = options.cache ?? "default";
  if (cacheMode === "default" && sessionCache && Date.now() - sessionCache.checkedAt < SESSION_CACHE_TTL_MS) {
    return sessionCache.data;
  }
  if (cacheMode === "default" && sessionRequest) return sessionRequest;

  sessionRequest = fetch("/api/auth/session", {
    headers: { accept: "application/json" },
    credentials: "include"
  })
    .then((response) => readEnvelope<SessionResponse>(response))
    .then((data) => {
      sessionStorage.setItem("bar_csrf", data.csrfToken);
      sessionCache = { data, checkedAt: Date.now() };
      return data;
    })
    .catch((error: unknown) => {
      clearSessionCache();
      throw error;
    })
    .finally(() => {
      sessionRequest = null;
    });

  return sessionRequest;
}

export async function changePassword(payload: ChangePasswordRequest): Promise<{ passwordChanged: true; user: AuthUser }> {
  const result = await postJson<{ passwordChanged: true; user: AuthUser }>("/api/auth/change-password", payload, csrfToken());
  clearSessionCache();
  return result;
}

export async function logout(): Promise<{ loggedOut: true }> {
  const result = await postJson<{ loggedOut: true }>("/api/auth/logout", {}, csrfToken());
  sessionStorage.removeItem("bar_csrf");
  clearSessionCache();
  return result;
}

export function clearSessionCache(): void {
  sessionCache = null;
  sessionRequest = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("thebar:auth-cache-clear"));
}

async function postJson<T>(path: string, payload: unknown, csrf = ""): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(csrf ? { "x-csrf-token": csrf } : {})
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
