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

type MembershipRuntime = {
  app: ReturnType<typeof createAdminApi>;
  authRepository: MemoryAuthRepository;
  barRepository: MemoryBarRepository;
  membershipRepository: MemoryMembershipRepository;
  service: AuthService;
};

type JsonObject = Record<string, unknown>;

function createRuntime(slugs = ["bar-a7k2m9", "bar-f9q2x1"]): MembershipRuntime {
  const authRepository = new MemoryAuthRepository();
  const barRepository = new MemoryBarRepository();
  const membershipRepository = new MemoryMembershipRepository();
  const hasher = new FastTestPasswordHasher();
  let slugIndex = 0;
  const service = new AuthService(authRepository, {
    passwordHasher: hasher,
    config,
    now: () => new Date("2026-06-23T00:00:00.000Z")
  });
  return {
    authRepository,
    barRepository,
    membershipRepository,
    service,
    app: createAdminApi({
      repository: authRepository,
      barRepository,
      membershipRepository,
      passwordHasher: hasher,
      config,
      now: () => new Date("2026-06-23T00:00:00.000Z"),
      barSlugGenerator: () => slugs[Math.min(slugIndex++, slugs.length - 1)] ?? "bar-a7k2m9"
    })
  };
}

async function readJsonObject(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function postJson(app: MembershipRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function patchJson(app: MembershipRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
  return app.request(path, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { "x-csrf-token": csrf } : {})
    },
    body: JSON.stringify(body)
  });
}

async function login(runtime: MembershipRuntime, username: string, password: string) {
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

async function seedSystemAdmin(runtime: MembershipRuntime) {
  await runtime.service.createSeedUser({
    username: "admin1",
    password: "AdminPass!1",
    isSystemAdmin: true,
    forcedPasswordChange: false
  });
}

async function seedUser(runtime: MembershipRuntime, username: string, password = "StaffPass!1") {
  return runtime.service.createSeedUser({
    username,
    password,
    forcedPasswordChange: false
  });
}

async function createBar(runtime: MembershipRuntime, cookie: string, csrf: string, name: string) {
  const response = await postJson(runtime.app, "/api/bars", { name, currency: "KRW" }, cookie, csrf);
  const body = await readJsonObject(response);
  expect(response.status).toBe(201);
  return (body.data as { id: string; name: string });
}

describe("D05 memberships API", () => {
  it("requires authentication", async () => {
    const runtime = createRuntime();
    const response = await runtime.app.request("/api/bars/bar-id/members");

    expect(response.status).toBe(401);
    expect(await readJsonObject(response)).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
  });

  it("returns default role permissions and supports add, role change, deactivate, and reactivate", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const staff = await seedUser(runtime, "staff1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Sample Bar");

    const initialResponse = await runtime.app.request(`/api/bars/${bar.id}/members`, { headers: { cookie: admin.cookie } });
    const initialBody = await readJsonObject(initialResponse);
    expect(initialResponse.status).toBe(200);
    expect(initialBody).toMatchObject({
      data: {
        bar: { id: bar.id, name: "Sample Bar" },
        rolePermissions: [
          { role: "owner", canEditMenu: true, canManageOrders: true, canAddCustomOrderItem: true, canApplyOrderAdjustment: true },
          { role: "manager", canEditMenu: true, canManageOrders: true, canAddCustomOrderItem: true, canApplyOrderAdjustment: true },
          { role: "staff", canEditMenu: false, canManageOrders: true, canAddCustomOrderItem: false, canApplyOrderAdjustment: false }
        ]
      }
    });

    const addResponse = await postJson(runtime.app, `/api/bars/${bar.id}/members`, { userId: staff.id, role: "staff" }, admin.cookie, admin.csrf);
    const addBody = await readJsonObject(addResponse);
    const membership = (addBody.data as { membership: { id: string } }).membership;
    expect(addResponse.status).toBe(201);
    expect(addBody).toMatchObject({ data: { membership: { username: "staff1", role: "staff", isActive: true } } });

    const duplicateResponse = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/members`,
      { userId: staff.id, role: "manager" },
      admin.cookie,
      admin.csrf
    );
    expect(duplicateResponse.status).toBe(409);
    expect(await readJsonObject(duplicateResponse)).toMatchObject({ error: { code: "MEMBERSHIP_ALREADY_ACTIVE" } });

    const updateResponse = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/members/${membership.id}`,
      { role: "manager" },
      admin.cookie,
      admin.csrf
    );
    expect(updateResponse.status).toBe(200);
    expect(await readJsonObject(updateResponse)).toMatchObject({ data: { membership: { role: "manager" } } });

    const deactivateResponse = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/members/${membership.id}/deactivate`,
      {},
      admin.cookie,
      admin.csrf
    );
    expect(deactivateResponse.status).toBe(200);
    expect(await readJsonObject(deactivateResponse)).toMatchObject({ data: { membership: { isActive: false } } });

    const reactivateResponse = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/members`,
      { userId: staff.id, role: "owner" },
      admin.cookie,
      admin.csrf
    );
    expect(reactivateResponse.status).toBe(201);
    expect(await readJsonObject(reactivateResponse)).toMatchObject({
      data: { membership: { id: membership.id, role: "owner", isActive: true } }
    });
  });

  it("blocks non-system mutations and invalid membership targets", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const staff = await seedUser(runtime, "staff1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const staffLogin = await login(runtime, "staff1", "StaffPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Sample Bar");

    const staffMutation = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/members`,
      { userId: staff.id, role: "staff" },
      staffLogin.cookie,
      staffLogin.csrf
    );
    await runtime.service.deactivateUserForMaintenance("staff1");
    const inactiveAdd = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/members`,
      { userId: staff.id, role: "staff" },
      admin.cookie,
      admin.csrf
    );
    const adminUser = await runtime.authRepository.findUserByUsername("admin1");
    const adminAdd = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/members`,
      { userId: adminUser?.id, role: "owner" },
      admin.cookie,
      admin.csrf
    );
    const missingMember = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/members/missing`,
      { role: "manager" },
      admin.cookie,
      admin.csrf
    );

    expect(staffMutation.status).toBe(403);
    expect(await readJsonObject(staffMutation)).toMatchObject({ error: { code: "SYSTEM_ADMIN_REQUIRED" } });
    expect(inactiveAdd.status).toBe(409);
    expect(await readJsonObject(inactiveAdd)).toMatchObject({ error: { code: "USER_INACTIVE" } });
    expect(adminAdd.status).toBe(409);
    expect(await readJsonObject(adminAdd)).toMatchObject({ error: { code: "SYSTEM_ADMIN_MEMBERSHIP_NOT_ALLOWED" } });
    expect(missingMember.status).toBe(404);
    expect(await readJsonObject(missingMember)).toMatchObject({ error: { code: "MEMBERSHIP_NOT_FOUND" } });
  });

  it("applies role permission changes to the bar permission guard and blocks other bars", async () => {
    const runtime = createRuntime(["bar-a7k2m9", "bar-f9q2x1"]);
    await seedSystemAdmin(runtime);
    const staff = await seedUser(runtime, "staff1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const barOne = await createBar(runtime, admin.cookie, admin.csrf, "Sample Bar");
    const barTwo = await createBar(runtime, admin.cookie, admin.csrf, "Other Bar");
    await postJson(runtime.app, `/api/bars/${barOne.id}/members`, { userId: staff.id, role: "staff" }, admin.cookie, admin.csrf);
    const staffLogin = await login(runtime, "staff1", "StaffPass!1");

    const ownBar = await runtime.app.request(`/api/bars/${barOne.id}/current-permissions`, {
      headers: { cookie: staffLogin.cookie }
    });
    const otherBar = await runtime.app.request(`/api/bars/${barTwo.id}/current-permissions`, {
      headers: { cookie: staffLogin.cookie }
    });
    const editDenied = await runtime.app.request(`/api/bars/${barOne.id}/current-permissions?require=canEditMenu`, {
      headers: { cookie: staffLogin.cookie }
    });

    expect(ownBar.status).toBe(200);
    expect(await readJsonObject(ownBar)).toMatchObject({
      data: {
        role: "staff",
        permissions: { canEditMenu: false, canManageOrders: true },
        allowed: true
      }
    });
    expect(otherBar.status).toBe(404);
    expect(await readJsonObject(otherBar)).toMatchObject({ error: { code: "BAR_NOT_FOUND" } });
    expect(editDenied.status).toBe(403);
    expect(await readJsonObject(editDenied)).toMatchObject({ error: { code: "BAR_PERMISSION_REQUIRED" } });

    const updatePermissions = await patchJson(
      runtime.app,
      `/api/bars/${barOne.id}/role-permissions`,
      {
        permissions: [
          { role: "owner", canEditMenu: true, canManageOrders: true, canAddCustomOrderItem: true, canApplyOrderAdjustment: true },
          { role: "manager", canEditMenu: true, canManageOrders: true, canAddCustomOrderItem: true, canApplyOrderAdjustment: true },
          { role: "staff", canEditMenu: true, canManageOrders: true, canAddCustomOrderItem: false, canApplyOrderAdjustment: false }
        ]
      },
      admin.cookie,
      admin.csrf
    );
    const editAllowed = await runtime.app.request(`/api/bars/${barOne.id}/current-permissions?require=canEditMenu`, {
      headers: { cookie: staffLogin.cookie }
    });
    const barOverview = await runtime.app.request(`/api/bars/${barOne.id}`, { headers: { cookie: staffLogin.cookie } });

    expect(updatePermissions.status).toBe(200);
    expect(editAllowed.status).toBe(200);
    expect(await readJsonObject(editAllowed)).toMatchObject({ data: { allowed: true, permissions: { canEditMenu: true } } });
    expect(barOverview.status).toBe(200);
    expect(await readJsonObject(barOverview)).toMatchObject({ data: { id: barOne.id, name: "Sample Bar" } });
  });

  it("returns system-admin current permissions without default role permission repair", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Sample Bar");
    const ensureSpy = vi.spyOn(runtime.membershipRepository, "ensureDefaultRolePermissions");
    const readRoleSpy = vi.spyOn(runtime.membershipRepository, "readRolePermissions");

    const response = await runtime.app.request(`/api/bars/${bar.id}/current-permissions?require=canEditMenu`, {
      headers: { cookie: admin.cookie }
    });

    expect(response.status).toBe(200);
    expect(await readJsonObject(response)).toMatchObject({
      data: {
        role: "system-admin",
        permissions: {
          canEditMenu: true,
          canManageOrders: true,
          canAddCustomOrderItem: true,
          canApplyOrderAdjustment: true
        },
        required: "canEditMenu",
        allowed: true
      }
    });
    expect(ensureSpy).not.toHaveBeenCalled();
    expect(readRoleSpy).not.toHaveBeenCalled();
  });

  it("checks current permissions for bar users without repairing defaults or probing inaccessible bars", async () => {
    const runtime = createRuntime(["bar-a7k2m9", "bar-f9q2x1"]);
    await seedSystemAdmin(runtime);
    const staff = await seedUser(runtime, "staff1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const barOne = await createBar(runtime, admin.cookie, admin.csrf, "Sample Bar");
    const barTwo = await createBar(runtime, admin.cookie, admin.csrf, "Other Bar");
    await postJson(runtime.app, `/api/bars/${barOne.id}/members`, { userId: staff.id, role: "staff" }, admin.cookie, admin.csrf);
    const staffLogin = await login(runtime, "staff1", "StaffPass!1");
    const ensureSpy = vi.spyOn(runtime.membershipRepository, "ensureDefaultRolePermissions");
    const readRoleSpy = vi.spyOn(runtime.membershipRepository, "readRolePermissions");
    const barLookupSpy = vi.spyOn(runtime.barRepository, "findBarById");

    const ownBar = await runtime.app.request(`/api/bars/${barOne.id}/current-permissions`, {
      headers: { cookie: staffLogin.cookie }
    });
    const otherBar = await runtime.app.request(`/api/bars/${barTwo.id}/current-permissions`, {
      headers: { cookie: staffLogin.cookie }
    });

    expect(ownBar.status).toBe(200);
    expect(await readJsonObject(ownBar)).toMatchObject({
      data: {
        role: "staff",
        permissions: { canEditMenu: false, canManageOrders: true },
        allowed: true
      }
    });
    expect(otherBar.status).toBe(404);
    expect(await readJsonObject(otherBar)).toMatchObject({ error: { code: "BAR_NOT_FOUND" } });
    expect(ensureSpy).not.toHaveBeenCalled();
    expect(readRoleSpy).toHaveBeenCalledTimes(1);
    expect(barLookupSpy).not.toHaveBeenCalled();
  });

  it("shows accessible bars on the dashboard for active members only", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const staff = await seedUser(runtime, "staff1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Sample Bar");
    const addResponse = await postJson(runtime.app, `/api/bars/${bar.id}/members`, { userId: staff.id, role: "manager" }, admin.cookie, admin.csrf);
    const membership = ((await readJsonObject(addResponse)).data as { membership: { id: string } }).membership;
    const staffLogin = await login(runtime, "staff1", "StaffPass!1");

    const dashboard = await runtime.app.request("/api/dashboard", { headers: { cookie: staffLogin.cookie } });
    expect(dashboard.status).toBe(200);
    expect(await readJsonObject(dashboard)).toMatchObject({
      data: {
        mode: "bar-user",
        selectedBarId: bar.id,
        accessibleBars: [{ id: bar.id, name: "Sample Bar", role: "manager", status: "active", href: `/bars/${bar.id}` }]
      }
    });

    await postJson(runtime.app, `/api/bars/${bar.id}/members/${membership.id}/deactivate`, {}, admin.cookie, admin.csrf);
    const dashboardAfterDeactivate = await runtime.app.request("/api/dashboard", { headers: { cookie: staffLogin.cookie } });
    expect(await readJsonObject(dashboardAfterDeactivate)).toMatchObject({
      data: { selectedBarId: null, accessibleBars: [] }
    });
  });
});
