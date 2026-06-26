import { describe, expect, it, vi } from "vitest";
import { createAdminApi } from "../../server/app";
import { AuthService } from "../../server/auth/authService";
import { MemoryAuthRepository } from "../../server/auth/memoryAuthRepository";
import { FastTestPasswordHasher } from "../../server/auth/passwordHasher";
import { MemoryBarRepository } from "../../server/bars/memoryBarRepository";
import { MemoryMembershipRepository } from "../../server/memberships/memoryMembershipRepository";

const config = {
  setupToken: "setup-token",
  recoveryToken: "recovery-token"
};

type DashboardRuntime = {
  app: ReturnType<typeof createAdminApi>;
  repository: MemoryAuthRepository;
  barRepository: MemoryBarRepository;
  membershipRepository: MemoryMembershipRepository;
  service: AuthService;
};

type JsonObject = Record<string, unknown>;

function createRuntime(): DashboardRuntime {
  const repository = new MemoryAuthRepository();
  const barRepository = new MemoryBarRepository();
  const membershipRepository = new MemoryMembershipRepository();
  const hasher = new FastTestPasswordHasher();
  const service = new AuthService(repository, {
    passwordHasher: hasher,
    config,
    now: () => new Date("2026-06-23T00:00:00.000Z")
  });
  return {
    repository,
    barRepository,
    membershipRepository,
    service,
    app: createAdminApi({
      repository,
      barRepository,
      membershipRepository,
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

async function seedDashboardBar(runtime: DashboardRuntime, userId: string) {
  const now = "2026-06-23T00:00:00.000Z";
  const bar = await runtime.barRepository.createBar({
    id: "bar-dashboard",
    name: "Sample Bar",
    slug: "bar-a7k2m9",
    encodedSlug: "YmFyLWE3azJtOQ",
    currency: "KRW",
    settingsDraftHash: "dashboard-fixture",
    createdByUserId: userId,
    now
  });
  await runtime.membershipRepository.upsertMembership({
    id: "membership-dashboard",
    barId: bar.id,
    userId,
    role: "manager",
    createdByUserId: userId,
    now
  });
  await runtime.membershipRepository.ensureDefaultRolePermissions(bar.id, now);
  return bar;
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

  it("returns admin bootstrap data and keeps forced password users blocked", async () => {
    const runtime = createRuntime();
    const staff = await runtime.service.createSeedUser({
      username: "staff1",
      password: "StaffPass!1",
      forcedPasswordChange: false
    });
    const bar = await seedDashboardBar(runtime, staff.id);
    const { response: loginResponse, cookie } = await login(runtime, "staff1", "StaffPass!1");
    const loginBody = await readJsonObject(loginResponse);

    expect(loginResponse.status).toBe(200);
    expect(loginBody).toMatchObject({
      data: {
        expiresAt: "2026-06-23T08:00:00.000Z",
        bootstrap: {
          session: { user: { username: "staff1" } },
          dashboard: { selectedBarId: bar.id },
          currentPermissions: { barId: bar.id, role: "manager", permissions: { canEditMenu: true } }
        }
      }
    });

    const bootstrapResponse = await runtime.app.request(`/api/admin/bootstrap?barId=${bar.id}`, { headers: { cookie } });
    expect(bootstrapResponse.status).toBe(200);
    expect(await readJsonObject(bootstrapResponse)).toMatchObject({
      data: {
        session: { user: { username: "staff1" } },
        dashboard: { selectedBarId: bar.id, accessibleBars: [{ id: bar.id, role: "manager" }] },
        currentPermissions: { barId: bar.id, role: "manager", permissions: { canManageOrders: true } }
      }
    });

    await runtime.service.createSeedUser({
      username: "forced1",
      password: "TempPass!1",
      forcedPasswordChange: true
    });
    const { cookie: forcedCookie } = await login(runtime, "forced1", "TempPass!1");
    const forcedBootstrap = await runtime.app.request("/api/admin/bootstrap", { headers: { cookie: forcedCookie } });
    expect(forcedBootstrap.status).toBe(403);
    expect(await readJsonObject(forcedBootstrap)).toMatchObject({ error: { code: "PASSWORD_CHANGE_REQUIRED" } });
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

  it("does not read global summaries or duplicate memberships for bar-user dashboard", async () => {
    const runtime = createRuntime();
    const staff = await runtime.service.createSeedUser({
      username: "staff1",
      password: "StaffPass!1",
      forcedPasswordChange: false
    });
    const bar = await seedDashboardBar(runtime, staff.id);
    const { cookie } = await login(runtime, "staff1", "StaffPass!1");
    const userSummarySpy = vi.spyOn(runtime.repository, "readUserStatusSummary");
    const barSummarySpy = vi.spyOn(runtime.barRepository, "readBarStatusSummary");
    const membershipSpy = vi.spyOn(runtime.membershipRepository, "listActiveMembershipsForUser");
    const barLookupSpy = vi.spyOn(runtime.barRepository, "findBarById");

    const response = await runtime.app.request("/api/dashboard", { headers: { cookie } });
    const body = await readJsonObject(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        mode: "bar-user",
        selectedBarId: bar.id,
        accessibleBars: [{ id: bar.id, role: "manager" }]
      }
    });
    expect(userSummarySpy).not.toHaveBeenCalled();
    expect(barSummarySpy).not.toHaveBeenCalled();
    expect(membershipSpy).toHaveBeenCalledTimes(1);
    expect(barLookupSpy).toHaveBeenCalledTimes(1);
  });
});
