import { describe, expect, it } from "vitest";
import { createAdminApi } from "../../server/app";
import { AuthService } from "../../server/auth/authService";
import { MemoryAuthRepository } from "../../server/auth/memoryAuthRepository";
import { FastTestPasswordHasher } from "../../server/auth/passwordHasher";

const config = {
  setupToken: "setup-token",
  recoveryToken: "recovery-token"
};

type UsersRuntime = {
  app: ReturnType<typeof createAdminApi>;
  repository: MemoryAuthRepository;
  service: AuthService;
};

type JsonObject = Record<string, unknown>;

function createRuntime(passwords = ["TempUser!123"]): UsersRuntime {
  const repository = new MemoryAuthRepository();
  const hasher = new FastTestPasswordHasher();
  let passwordIndex = 0;
  const service = new AuthService(repository, {
    passwordHasher: hasher,
    config,
    now: () => new Date("2026-06-23T00:00:00.000Z")
  });
  return {
    repository,
    service,
    app: createAdminApi({
      repository,
      passwordHasher: hasher,
      config,
      now: () => new Date("2026-06-23T00:00:00.000Z"),
      temporaryPasswordGenerator: () => passwords[Math.min(passwordIndex++, passwords.length - 1)] ?? "TempUser!123"
    })
  };
}

async function readJsonObject(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function postJson(app: UsersRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function login(runtime: UsersRuntime, username: string, password: string) {
  const response = await postJson(runtime.app, "/api/auth/login", { username, password });
  const cookie = setCookieHeader(response);
  return { response, cookie, csrf: csrfFromCookie(cookie) };
}

function setCookieHeader(response: Response): string {
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies = getSetCookie ? getSetCookie.call(response.headers) : [response.headers.get("set-cookie") ?? ""];
  return cookies
    .flatMap((value) => (value.includes(", bar_") ? value.split(/,\s+(?=bar_)/) : [value]))
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

async function seedSystemAdmin(runtime: UsersRuntime) {
  await runtime.service.createSeedUser({
    username: "admin1",
    password: "AdminPass!1",
    isSystemAdmin: true,
    forcedPasswordChange: false
  });
}

describe("D04 system users API", () => {
  it("requires authentication", async () => {
    const runtime = createRuntime();
    const response = await runtime.app.request("/api/system/users");

    expect(response.status).toBe(401);
    expect(await readJsonObject(response)).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
  });

  it("blocks forced-password and non-system users", async () => {
    const runtime = createRuntime();
    await runtime.service.createSeedUser({ username: "forced1", password: "TempPass!1", forcedPasswordChange: true });
    await runtime.service.createSeedUser({ username: "staff1", password: "StaffPass!1", forcedPasswordChange: false });

    const forced = await login(runtime, "forced1", "TempPass!1");
    const forcedResponse = await runtime.app.request("/api/system/users", { headers: { cookie: forced.cookie } });
    expect(forcedResponse.status).toBe(403);
    expect(await readJsonObject(forcedResponse)).toMatchObject({ error: { code: "PASSWORD_CHANGE_REQUIRED" } });

    const staff = await login(runtime, "staff1", "StaffPass!1");
    const listResponse = await runtime.app.request("/api/system/users", { headers: { cookie: staff.cookie } });
    const createResponse = await postJson(runtime.app, "/api/system/users", { username: "newuser" }, staff.cookie, staff.csrf);
    expect(listResponse.status).toBe(403);
    expect(createResponse.status).toBe(403);
    expect(await readJsonObject(createResponse)).toMatchObject({ error: { code: "SYSTEM_ADMIN_REQUIRED" } });
  });

  it("creates a general user with a one-time temporary password and searchable list", async () => {
    const runtime = createRuntime(["CreatedPass!1"]);
    await seedSystemAdmin(runtime);
    const admin = await login(runtime, "admin1", "AdminPass!1");

    const createResponse = await postJson(runtime.app, "/api/system/users", { username: "Owner01" }, admin.cookie, admin.csrf);
    const createBody = await readJsonObject(createResponse);

    expect(createResponse.status).toBe(201);
    expect(createBody).toMatchObject({
      data: {
        user: {
          username: "owner01",
          isSystemAdmin: false,
          status: "active",
          forcedPasswordChange: true,
          activeSessionCount: 0
        },
        temporaryPassword: "CreatedPass!1",
        oneTimeNotice: true
      }
    });

    const listResponse = await runtime.app.request("/api/system/users?q=owner&status=forced_password_change", {
      headers: { cookie: admin.cookie }
    });
    const listBody = await readJsonObject(listResponse);
    expect(listResponse.status).toBe(200);
    expect(listBody).toMatchObject({
      data: {
        items: [{ username: "owner01", forcedPasswordChange: true }],
        pagination: { totalItems: 1 }
      }
    });
    expect(JSON.stringify(listBody)).not.toContain("CreatedPass!1");
  });

  it("validates input, username uniqueness, and missing users", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const admin = await login(runtime, "admin1", "AdminPass!1");

    const invalidResponse = await postJson(runtime.app, "/api/system/users", { username: "BAD!" }, admin.cookie, admin.csrf);
    const firstResponse = await postJson(runtime.app, "/api/system/users", { username: "staff2" }, admin.cookie, admin.csrf);
    const duplicateResponse = await postJson(runtime.app, "/api/system/users", { username: "STAFF2" }, admin.cookie, admin.csrf);
    const missingResponse = await runtime.app.request("/api/system/users/missing-user", { headers: { cookie: admin.cookie } });

    expect(invalidResponse.status).toBe(400);
    expect(firstResponse.status).toBe(201);
    expect(duplicateResponse.status).toBe(409);
    expect(await readJsonObject(duplicateResponse)).toMatchObject({ error: { code: "USERNAME_ALREADY_EXISTS" } });
    expect(missingResponse.status).toBe(404);
    expect(await readJsonObject(missingResponse)).toMatchObject({ error: { code: "USER_NOT_FOUND" } });
  });

  it("deactivates users and immediately revokes existing sessions", async () => {
    const runtime = createRuntime(["InitialPass!1"]);
    await seedSystemAdmin(runtime);
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const createResponse = await postJson(runtime.app, "/api/system/users", { username: "staff2" }, admin.cookie, admin.csrf);
    const created = ((await readJsonObject(createResponse)).data as { user: { id: string }; temporaryPassword: string });
    const staff = await login(runtime, "staff2", created.temporaryPassword);

    const deactivateResponse = await postJson(
      runtime.app,
      `/api/system/users/${created.user.id}/deactivate`,
      {},
      admin.cookie,
      admin.csrf
    );
    const sessionResponse = await runtime.app.request("/api/auth/session", { headers: { cookie: staff.cookie } });

    expect(deactivateResponse.status).toBe(200);
    expect(await readJsonObject(deactivateResponse)).toMatchObject({
      data: { user: { username: "staff2", status: "inactive", activeSessionCount: 0 } }
    });
    expect(sessionResponse.status).toBe(401);
    expect(await readJsonObject(sessionResponse)).toMatchObject({ error: { code: "SESSION_EXPIRED" } });
  });

  it("unlocks accounts and resets passwords into forced change without revoking sessions", async () => {
    const runtime = createRuntime(["InitialPass!1", "ResetPass!1"]);
    await seedSystemAdmin(runtime);
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const createResponse = await postJson(runtime.app, "/api/system/users", { username: "manager1" }, admin.cookie, admin.csrf);
    const created = ((await readJsonObject(createResponse)).data as { user: { id: string }; temporaryPassword: string });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await postJson(runtime.app, "/api/auth/login", { username: "manager1", password: "WrongPass!1" });
    }
    const lockedList = await runtime.app.request("/api/system/users?status=locked", { headers: { cookie: admin.cookie } });
    expect(await readJsonObject(lockedList)).toMatchObject({ data: { items: [{ username: "manager1", status: "locked" }] } });

    const unlockResponse = await postJson(runtime.app, `/api/system/users/${created.user.id}/unlock`, {}, admin.cookie, admin.csrf);
    expect(unlockResponse.status).toBe(200);
    expect(await readJsonObject(unlockResponse)).toMatchObject({ data: { user: { status: "active", isLocked: false } } });

    const userLogin = await login(runtime, "manager1", created.temporaryPassword);
    const changeResponse = await postJson(
      runtime.app,
      "/api/auth/change-password",
      {
        currentPassword: created.temporaryPassword,
        newPassword: "ChangedPass!1",
        newPasswordConfirm: "ChangedPass!1"
      },
      userLogin.cookie,
      userLogin.csrf
    );
    const guardBeforeReset = await runtime.app.request("/api/auth/guard-smoke", { headers: { cookie: userLogin.cookie } });
    const resetResponse = await postJson(
      runtime.app,
      `/api/system/users/${created.user.id}/reset-password`,
      {},
      admin.cookie,
      admin.csrf
    );
    const guardResponse = await runtime.app.request("/api/auth/guard-smoke", { headers: { cookie: userLogin.cookie } });
    const newLoginResponse = await postJson(runtime.app, "/api/auth/login", {
      username: "manager1",
      password: "ResetPass!1"
    });
    const newLoginBody = await readJsonObject(newLoginResponse);

    expect(changeResponse.status).toBe(200);
    expect(guardBeforeReset.status).toBe(200);
    expect(resetResponse.status).toBe(200);
    expect(await readJsonObject(resetResponse)).toMatchObject({
      data: { temporaryPassword: "ResetPass!1", user: { forcedPasswordChange: true } }
    });
    expect(guardResponse.status).toBe(403);
    expect(await readJsonObject(guardResponse)).toMatchObject({ error: { code: "PASSWORD_CHANGE_REQUIRED" } });
    expect(newLoginBody).toMatchObject({ data: { nextPath: "/change-password" } });
  });

  it("does not mutate the system admin through user-management commands", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const listBody = await readJsonObject(await runtime.app.request("/api/system/users", { headers: { cookie: admin.cookie } }));
    const adminUser = (listBody.data as { items: Array<{ id: string; username: string }> }).items.find(
      (item) => item.username === "admin1"
    );
    expect(adminUser).toBeDefined();

    const response = await postJson(runtime.app, `/api/system/users/${adminUser?.id}/deactivate`, {}, admin.cookie, admin.csrf);

    expect(response.status).toBe(409);
    expect(await readJsonObject(response)).toMatchObject({ error: { code: "SYSTEM_ADMIN_USER_IMMUTABLE" } });
  });
});
