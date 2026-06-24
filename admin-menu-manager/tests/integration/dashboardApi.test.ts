import { describe, expect, it } from "vitest";
import { createAdminApi } from "../../server/app";
import { AuthService } from "../../server/auth/authService";
import { MemoryAuthRepository } from "../../server/auth/memoryAuthRepository";
import { FastTestPasswordHasher } from "../../server/auth/passwordHasher";

const config = {
  setupToken: "setup-token",
  recoveryToken: "recovery-token"
};

type DashboardRuntime = {
  app: ReturnType<typeof createAdminApi>;
  repository: MemoryAuthRepository;
  service: AuthService;
};

type JsonObject = Record<string, unknown>;

function createRuntime(): DashboardRuntime {
  const repository = new MemoryAuthRepository();
  const hasher = new FastTestPasswordHasher();
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
      now: () => new Date("2026-06-23T00:00:00.000Z")
    })
  };
}

async function readJsonObject(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function postJson(app: DashboardRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function login(runtime: DashboardRuntime, username: string, password: string) {
  const response = await postJson(runtime.app, "/api/auth/login", { username, password });
  return { response, cookie: setCookieHeader(response) };
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

async function seedSystemAdmin(runtime: DashboardRuntime) {
  await runtime.service.createSeedUser({
    username: "admin1",
    password: "AdminPass!1",
    isSystemAdmin: true,
    forcedPasswordChange: false
  });
}

describe("D02 dashboard API", () => {
  it("requires authentication", async () => {
    const runtime = createRuntime();
    const response = await runtime.app.request("/api/dashboard");
    const body = await readJsonObject(response);

    expect(response.status).toBe(401);
    expect(body).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
  });

  it("blocks forced password users from the dashboard", async () => {
    const runtime = createRuntime();
    await runtime.service.createSeedUser({
      username: "forced1",
      password: "TempPass!1",
      forcedPasswordChange: true
    });
    const { cookie } = await login(runtime, "forced1", "TempPass!1");

    const response = await runtime.app.request("/api/dashboard", { headers: { cookie } });
    expect(response.status).toBe(403);
    expect(await readJsonObject(response)).toMatchObject({ error: { code: "PASSWORD_CHANGE_REQUIRED" } });
  });

  it("returns system admin metrics without pre-creating bar data", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    await runtime.service.createSeedUser({ username: "staff1", password: "StaffPass!1", forcedPasswordChange: false });
    await runtime.service.createSeedUser({ username: "staff2", password: "StaffPass!2", forcedPasswordChange: false });
    await runtime.service.deactivateUserForMaintenance("staff2");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await postJson(runtime.app, "/api/auth/login", { username: "staff1", password: "WrongPass!123" });
    }
    const { cookie } = await login(runtime, "admin1", "AdminPass!1");

    const response = await runtime.app.request("/api/dashboard", { headers: { cookie } });
    const body = await readJsonObject(response);
    const data = body.data as {
      mode: string;
      accessibleBars: unknown[];
      metrics: Array<{ id: string; value: string; status: string; unavailableReason?: string }>;
      activities: Array<{ id: string }>;
      quickActions: Array<{ id: string; status: string }>;
    };

    expect(response.status).toBe(200);
    expect(data.mode).toBe("system-admin");
    expect(data.accessibleBars).toEqual([]);
    expect(data.metrics.find((metric) => metric.id === "users-active")).toMatchObject({
      value: "2",
      status: "available"
    });
    expect(data.metrics.find((metric) => metric.id === "bars-total")).toMatchObject({
      value: "0",
      status: "available"
    });
    expect(data.activities.map((activity) => activity.id)).toEqual(["locked-users", "inactive-users"]);
    expect(data.quickActions.find((action) => action.id === "bar-new")).toMatchObject({ status: "available" });
  });

  it("separates bar-user dashboard data from system-admin identity metrics", async () => {
    const runtime = createRuntime();
    await runtime.service.createSeedUser({ username: "staff1", password: "StaffPass!1", forcedPasswordChange: false });
    const { cookie } = await login(runtime, "staff1", "StaffPass!1");

    const response = await runtime.app.request("/api/dashboard", { headers: { cookie } });
    const body = await readJsonObject(response);
    const data = body.data as {
      mode: string;
      accessibleBars: unknown[];
      metrics: Array<{ id: string }>;
      emptyState: { title: string };
    };

    expect(response.status).toBe(200);
    expect(data.mode).toBe("bar-user");
    expect(data.accessibleBars).toEqual([]);
    expect(data.metrics.map((metric) => metric.id)).not.toContain("users-active");
    expect(data.emptyState.title).toBe("접근 가능한 바가 없습니다.");
  });
});
