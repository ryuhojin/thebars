import { describe, expect, it } from "vitest";
import { createAdminApi } from "../../server/app";
import { AuthService } from "../../server/auth/authService";
import { MemoryAuthRepository } from "../../server/auth/memoryAuthRepository";
import { FastTestPasswordHasher } from "../../server/auth/passwordHasher";
import { MemoryRateLimitRepository } from "../../server/rate-limits/memoryRateLimitRepository";
import type { RateLimitConfig } from "../../server/rate-limits/rateLimitService";

const config = {
  setupToken: "setup-token",
  recoveryToken: "recovery-token"
};

type TestRuntime = {
  app: ReturnType<typeof createAdminApi>;
  repository: MemoryAuthRepository;
  rateLimitRepository: MemoryRateLimitRepository;
  hasher: FastTestPasswordHasher;
  now: Date;
};

type JsonObject = Record<string, unknown>;

async function readJsonObject(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

function createRuntime(rateLimitConfig?: RateLimitConfig): TestRuntime {
  const repository = new MemoryAuthRepository();
  const rateLimitRepository = new MemoryRateLimitRepository();
  const hasher = new FastTestPasswordHasher();
  const runtime = {
    repository,
    rateLimitRepository,
    hasher,
    now: new Date("2026-06-23T00:00:00.000Z"),
    app: undefined as unknown as ReturnType<typeof createAdminApi>
  };
  runtime.app = createAdminApi({
    repository,
    passwordHasher: hasher,
    config,
    rateLimitRepository,
    rateLimitConfig,
    now: () => runtime.now
  });
  return runtime;
}

async function postJson(app: TestRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
  return app.request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { "x-csrf-token": csrf } : {})
    },
    body: JSON.stringify(body)
  });
}

async function getJson(app: TestRuntime["app"], path: string, cookie = "") {
  return app.request(path, {
    headers: cookie ? { cookie } : undefined
  });
}

function setCookieHeader(response: Response): string {
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies = getSetCookie ? getSetCookie.call(response.headers) : [response.headers.get("set-cookie") ?? ""];
  return cookies
    .flatMap((value) => splitSetCookie(value))
    .map((value) => value.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

function csrfFromCookie(cookie: string): string {
  const csrf = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("bar_csrf="));
  if (!csrf) throw new Error("csrf cookie missing");
  return csrf.replace("bar_csrf=", "");
}

function splitSetCookie(value: string): string[] {
  if (!value.includes(", bar_")) return [value];
  return value.split(/,\s+(?=bar_)/);
}

async function setupAdmin(runtime: TestRuntime) {
  return postJson(runtime.app, "/api/setup", {
    setupToken: "setup-token",
    username: "admin1",
    password: "AdminPass!1",
    passwordConfirm: "AdminPass!1"
  });
}

describe("D01 auth API", () => {
  it("creates the first system admin once and enforces username uniqueness", async () => {
    const runtime = createRuntime();
    const response = await setupAdmin(runtime);
    const body = await readJsonObject(response);

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      data: {
        setupComplete: true,
        user: { username: "admin1", isSystemAdmin: true, forcedPasswordChange: false }
      }
    });
    expect(await setupAdmin(runtime)).toHaveProperty("status", 409);
  });

  it("locks an account after five failed logins and supports maintenance unlock", async () => {
    const runtime = createRuntime();
    await setupAdmin(runtime);

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const response = await postJson(runtime.app, "/api/auth/login", {
        username: "admin1",
        password: "WrongPass!1"
      });
      expect(response.status).toBe(401);
    }

    const lockedResponse = await postJson(runtime.app, "/api/auth/login", {
      username: "admin1",
      password: "WrongPass!1"
    });
    const lockedBody = await readJsonObject(lockedResponse);
    const lockedError = lockedBody.error as { details: { lockedUntil: string } };
    expect(lockedResponse.status).toBe(429);
    expect(lockedError.details.lockedUntil).toBe("2026-06-23T00:15:00.000Z");

    const service = new AuthService(runtime.repository, {
      passwordHasher: runtime.hasher,
      config,
      now: () => runtime.now
    });
    await service.unlockUserForMaintenance("admin1");
    const loginResponse = await postJson(runtime.app, "/api/auth/login", {
      username: "admin1",
      password: "AdminPass!1"
    });
    expect(loginResponse.status).toBe(200);
  });

  it("blocks protected features until forced password change is complete", async () => {
    const runtime = createRuntime();
    const service = new AuthService(runtime.repository, {
      passwordHasher: runtime.hasher,
      config,
      now: () => runtime.now
    });
    await service.createSeedUser({
      username: "staff1",
      password: "TempPass!1",
      forcedPasswordChange: true
    });

    const loginResponse = await postJson(runtime.app, "/api/auth/login", {
      username: "staff1",
      password: "TempPass!1"
    });
    const loginBody = await readJsonObject(loginResponse);
    const loginData = loginBody.data as { nextPath: string };
    const cookie = setCookieHeader(loginResponse);
    const csrf = csrfFromCookie(cookie);
    expect(loginData.nextPath).toBe("/change-password");

    const blockedResponse = await getJson(runtime.app, "/api/auth/guard-smoke", cookie);
    expect(blockedResponse.status).toBe(403);
    expect(await readJsonObject(blockedResponse)).toMatchObject({ error: { code: "PASSWORD_CHANGE_REQUIRED" } });

    const changeResponse = await postJson(
      runtime.app,
      "/api/auth/change-password",
      {
        currentPassword: "TempPass!1",
        newPassword: "NewPass!123",
        newPasswordConfirm: "NewPass!123"
      },
      cookie,
      csrf
    );
    expect(changeResponse.status).toBe(200);

    const allowedResponse = await getJson(runtime.app, "/api/auth/guard-smoke", cookie);
    expect(allowedResponse.status).toBe(200);
  });

  it("requires CSRF for protected mutations and revokes logout sessions", async () => {
    const runtime = createRuntime();
    await setupAdmin(runtime);
    const loginResponse = await postJson(runtime.app, "/api/auth/login", {
      username: "admin1",
      password: "AdminPass!1"
    });
    const cookie = setCookieHeader(loginResponse);
    const csrf = csrfFromCookie(cookie);

    const missingCsrf = await postJson(
      runtime.app,
      "/api/auth/change-password",
      {
        currentPassword: "AdminPass!1",
        newPassword: "ChangedPass!1",
        newPasswordConfirm: "ChangedPass!1"
      },
      cookie
    );
    expect(missingCsrf.status).toBe(403);

    const logoutResponse = await postJson(runtime.app, "/api/auth/logout", {}, cookie, csrf);
    expect(logoutResponse.status).toBe(200);
    const sessionResponse = await getJson(runtime.app, "/api/auth/session", cookie);
    expect(sessionResponse.status).toBe(401);
  });

  it("sets security headers and secure session cookies on HTTPS requests", async () => {
    const runtime = createRuntime();
    await setupAdmin(runtime);

    const health = await getJson(runtime.app, "/api/health");
    expect(health.headers.get("x-content-type-options")).toBe("nosniff");
    expect(health.headers.get("x-frame-options")).toBe("DENY");
    expect(health.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(health.headers.get("permissions-policy")).toContain("camera=()");

    const loginResponse = await postJson(runtime.app, "https://admin.example.test/api/auth/login", {
      username: "admin1",
      password: "AdminPass!1"
    });
    const getSetCookie = (loginResponse.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    const cookies = getSetCookie ? getSetCookie.call(loginResponse.headers) : splitSetCookie(loginResponse.headers.get("set-cookie") ?? "");
    const sessionCookie = cookies.find((cookie) => cookie.startsWith("bar_session=")) ?? "";
    const csrfCookie = cookies.find((cookie) => cookie.startsWith("bar_csrf=")) ?? "";

    expect(loginResponse.status).toBe(200);
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("Secure");
    expect(sessionCookie).toContain("SameSite=Lax");
    expect(csrfCookie).toContain("Secure");
    expect(csrfCookie).toContain("SameSite=Lax");
    expect(csrfCookie).not.toContain("HttpOnly");
  });

  it("slides sessions after five minutes and keeps existing sessions during recovery", async () => {
    const runtime = createRuntime();
    await setupAdmin(runtime);
    const loginResponse = await postJson(runtime.app, "/api/auth/login", {
      username: "admin1",
      password: "AdminPass!1"
    });
    const cookie = setCookieHeader(loginResponse);

    runtime.now = new Date("2026-06-23T00:06:00.000Z");
    const sessionResponse = await getJson(runtime.app, "/api/auth/session", cookie);
    const sessionBody = await readJsonObject(sessionResponse);
    const sessionData = sessionBody.data as { expiresAt: string };
    expect(sessionResponse.status).toBe(200);
    expect(sessionData.expiresAt).toBe("2026-06-23T08:06:00.000Z");

    const recoveryResponse = await postJson(runtime.app, "/api/recovery", {
      recoveryToken: "recovery-token",
      newPassword: "Recovered!1",
      newPasswordConfirm: "Recovered!1"
    });
    expect(recoveryResponse.status).toBe(200);
    expect((await getJson(runtime.app, "/api/auth/session", cookie)).status).toBe(200);
  });

  it("rejects inactive accounts and invalid input without leaking usernames", async () => {
    const runtime = createRuntime();
    await setupAdmin(runtime);
    const service = new AuthService(runtime.repository, {
      passwordHasher: runtime.hasher,
      config,
      now: () => runtime.now
    });
    await service.deactivateUserForMaintenance("admin1");

    const inactiveResponse = await postJson(runtime.app, "/api/auth/login", {
      username: "admin1",
      password: "AdminPass!1"
    });
    expect(inactiveResponse.status).toBe(403);

    const invalidResponse = await postJson(runtime.app, "/api/auth/login", {
      username: "missing",
      password: "whatever"
    });
    const invalidBody = await readJsonObject(invalidResponse);
    const invalidError = invalidBody.error as { message: string };
    expect(invalidResponse.status).toBe(401);
    expect(invalidError.message).toBe("아이디 또는 비밀번호를 확인하세요.");

    const inputResponse = await postJson(runtime.app, "/api/setup", {
      setupToken: "setup-token",
      username: "bad",
      password: "short",
      passwordConfirm: "different"
    });
    expect(inputResponse.status).toBe(400);
  });

  it("rate limits setup, recovery, and login without using the account lock code path", async () => {
    const runtime = createRuntime({
      scopes: {
        "auth.setup": { maxAttempts: 1, windowMs: 60_000 },
        "auth.recovery": { maxAttempts: 1, windowMs: 60_000 },
        "auth.login": { maxAttempts: 1, windowMs: 60_000 }
      }
    });

    const firstSetup = await postJson(runtime.app, "/api/setup", {
      setupToken: "wrong-token",
      username: "admin1",
      password: "AdminPass!1",
      passwordConfirm: "AdminPass!1"
    });
    expect(firstSetup.status).toBe(403);

    const limitedSetup = await postJson(runtime.app, "/api/setup", {
      setupToken: "wrong-token",
      username: "admin1",
      password: "AdminPass!1",
      passwordConfirm: "AdminPass!1"
    });
    expect(limitedSetup.status).toBe(429);
    expect(await readJsonObject(limitedSetup)).toMatchObject({
      error: { code: "RATE_LIMITED", details: { retryAfterSeconds: 60, scope: "auth.setup" } }
    });

    runtime.now = new Date("2026-06-23T00:02:00.000Z");
    expect(await setupAdmin(runtime)).toHaveProperty("status", 201);

    const firstRecovery = await postJson(runtime.app, "/api/recovery", {
      recoveryToken: "wrong-token",
      newPassword: "Recovered!1",
      newPasswordConfirm: "Recovered!1"
    });
    expect(firstRecovery.status).toBe(403);

    const limitedRecovery = await postJson(runtime.app, "/api/recovery", {
      recoveryToken: "wrong-token",
      newPassword: "Recovered!1",
      newPasswordConfirm: "Recovered!1"
    });
    expect(limitedRecovery.status).toBe(429);
    expect(await readJsonObject(limitedRecovery)).toMatchObject({
      error: { code: "RATE_LIMITED", details: { scope: "auth.recovery" } }
    });

    const firstLogin = await postJson(runtime.app, "/api/auth/login", {
      username: "admin1",
      password: "WrongPass!1"
    });
    expect(firstLogin.status).toBe(401);

    const limitedLogin = await postJson(runtime.app, "/api/auth/login", {
      username: "admin1",
      password: "WrongPass!1"
    });
    expect(limitedLogin.status).toBe(429);
    expect(await readJsonObject(limitedLogin)).toMatchObject({
      error: { code: "RATE_LIMITED", details: { scope: "auth.login" } }
    });
  });
});
