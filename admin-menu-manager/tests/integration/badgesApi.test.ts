import { describe, expect, it } from "vitest";
import { readableTextColor } from "../../contracts/badges";
import { createAdminApi } from "../../server/app";
import { AuthService } from "../../server/auth/authService";
import { MemoryAuthRepository } from "../../server/auth/memoryAuthRepository";
import { FastTestPasswordHasher } from "../../server/auth/passwordHasher";
import { MemoryBadgeRepository } from "../../server/badges/memoryBadgeRepository";
import { MemoryBarRepository } from "../../server/bars/memoryBarRepository";
import { MemoryMembershipRepository } from "../../server/memberships/memoryMembershipRepository";

const config = {
  setupToken: "setup-token",
  recoveryToken: "recovery-token"
};

type BadgesRuntime = {
  app: ReturnType<typeof createAdminApi>;
  authRepository: MemoryAuthRepository;
  badgeRepository: MemoryBadgeRepository;
  barRepository: MemoryBarRepository;
  membershipRepository: MemoryMembershipRepository;
  service: AuthService;
};

type JsonObject = Record<string, unknown>;

function createRuntime(slugs = ["bar-a7k2m9", "bar-f9q2x1"]): BadgesRuntime {
  const authRepository = new MemoryAuthRepository();
  const badgeRepository = new MemoryBadgeRepository();
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
    app: createAdminApi({
      repository: authRepository,
      badgeRepository,
      barRepository,
      membershipRepository,
      passwordHasher: hasher,
      config,
      now: () => new Date("2026-06-23T00:00:00.000Z"),
      barSlugGenerator: () => slugs[Math.min(slugIndex++, slugs.length - 1)] ?? "bar-a7k2m9"
    }),
    authRepository,
    badgeRepository,
    barRepository,
    membershipRepository,
    service
  };
}

async function readJsonObject(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function postJson(app: BadgesRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function patchJson(app: BadgesRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function deleteJson(app: BadgesRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
  return app.request(path, {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { "x-csrf-token": csrf } : {})
    },
    body: JSON.stringify(body)
  });
}

async function login(runtime: BadgesRuntime, username: string, password: string) {
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

async function seedSystemAdmin(runtime: BadgesRuntime) {
  await runtime.service.createSeedUser({
    username: "admin1",
    password: "AdminPass!1",
    isSystemAdmin: true,
    forcedPasswordChange: false
  });
}

async function seedUser(runtime: BadgesRuntime, username: string, password = "StaffPass!1") {
  return runtime.service.createSeedUser({
    username,
    password,
    forcedPasswordChange: false
  });
}

async function createBar(runtime: BadgesRuntime, cookie: string, csrf: string, name: string) {
  const response = await postJson(runtime.app, "/api/bars", { name, currency: "KRW" }, cookie, csrf);
  const body = await readJsonObject(response);
  expect(response.status).toBe(201);
  return body.data as { id: string; name: string };
}

describe("D08 badges API", () => {
  it("normalizes badge colors and chooses readable text color", () => {
    expect(readableTextColor("#FFFFFF")).toBe("#000000");
    expect(readableTextColor("#000000")).toBe("#FFFFFF");
    expect(readableTextColor("#ffffff80")).toBe("#000000");
  });

  it("requires authentication", async () => {
    const runtime = createRuntime();

    const response = await runtime.app.request("/api/system/badges");

    expect(response.status).toBe(401);
    expect(await readJsonObject(response)).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
  });

  it("lets system admins manage shared colors and common badges with replacement and impact guards", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const manager = await seedUser(runtime, "manager1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Sample Bar");
    await postJson(runtime.app, `/api/bars/${bar.id}/members`, { userId: manager.id, role: "manager" }, admin.cookie, admin.csrf);
    const managerLogin = await login(runtime, "manager1", "StaffPass!1");

    const managerCreateColor = await postJson(
      runtime.app,
      "/api/system/badge-colors",
      { name: "Limited Red", backgroundHex: "#B91C1C" },
      managerLogin.cookie,
      managerLogin.csrf
    );
    expect(managerCreateColor.status).toBe(403);
    expect(await readJsonObject(managerCreateColor)).toMatchObject({ error: { code: "SYSTEM_ADMIN_REQUIRED" } });

    const invalidColor = await postJson(
      runtime.app,
      "/api/system/badge-colors",
      { name: "Invalid", backgroundHex: "B91C1C" },
      admin.cookie,
      admin.csrf
    );
    expect(invalidColor.status).toBe(400);
    expect(await readJsonObject(invalidColor)).toMatchObject({ error: { code: "INPUT_INVALID" } });

    const createColor = await postJson(
      runtime.app,
      "/api/system/badge-colors",
      { name: "Limited Red", backgroundHex: "#b91c1c" },
      admin.cookie,
      admin.csrf
    );
    expect(createColor.status).toBe(201);
    expect(await readJsonObject(createColor)).toMatchObject({
      data: { colors: expect.arrayContaining([expect.objectContaining({ name: "Limited Red", backgroundHex: "#B91C1C" })]) }
    });

    const duplicateColor = await postJson(
      runtime.app,
      "/api/system/badge-colors",
      { name: " limited  red ", backgroundHex: "#991B1B" },
      admin.cookie,
      admin.csrf
    );
    expect(duplicateColor.status).toBe(409);
    expect(await readJsonObject(duplicateColor)).toMatchObject({ error: { code: "BADGE_COLOR_NAME_EXISTS" } });

    const deactivateUsedColorWithoutReplacement = await patchJson(
      runtime.app,
      "/api/system/badge-colors/badge-color-warm-brown",
      { name: "Warm Brown", backgroundHex: "#725A3D", isActive: false },
      admin.cookie,
      admin.csrf
    );
    expect(deactivateUsedColorWithoutReplacement.status).toBe(409);
    expect(await readJsonObject(deactivateUsedColorWithoutReplacement)).toMatchObject({
      error: { code: "BADGE_COLOR_REPLACEMENT_REQUIRED" }
    });

    const deactivateUsedColor = await patchJson(
      runtime.app,
      "/api/system/badge-colors/badge-color-warm-brown",
      {
        name: "Warm Brown",
        backgroundHex: "#725A3D",
        isActive: false,
        replacementColorId: "badge-color-deep-slate"
      },
      admin.cookie,
      admin.csrf
    );
    expect(deactivateUsedColor.status).toBe(200);
    expect(await readJsonObject(deactivateUsedColor)).toMatchObject({
      data: {
        colors: expect.arrayContaining([expect.objectContaining({ id: "badge-color-warm-brown", isActive: false })]),
        systemBadges: expect.arrayContaining([
          expect.objectContaining({ id: "system-badge-recommended", color: expect.objectContaining({ id: "badge-color-deep-slate" }) })
        ])
      }
    });

    const createBadge = await postJson(
      runtime.app,
      "/api/system/badges",
      { name: "스페셜", colorId: "badge-color-forest" },
      admin.cookie,
      admin.csrf
    );
    expect(createBadge.status).toBe(201);

    const duplicateBadge = await postJson(
      runtime.app,
      "/api/system/badges",
      { name: " 스페셜 ", colorId: "badge-color-forest" },
      admin.cookie,
      admin.csrf
    );
    expect(duplicateBadge.status).toBe(409);
    expect(await readJsonObject(duplicateBadge)).toMatchObject({ error: { code: "BADGE_NAME_EXISTS" } });

    runtime.badgeRepository.setSystemBadgeUsageForTest("system-badge-new", 2);
    const deactivateInUse = await patchJson(
      runtime.app,
      "/api/system/badges/system-badge-new",
      { name: "신메뉴", colorId: "badge-color-muted-plum", isActive: false },
      admin.cookie,
      admin.csrf
    );
    expect(deactivateInUse.status).toBe(409);
    expect(await readJsonObject(deactivateInUse)).toMatchObject({
      error: { code: "BADGE_IN_USE_CONFIRM_REQUIRED", details: { usageCount: 2 } }
    });

    const confirmDeactivate = await patchJson(
      runtime.app,
      "/api/system/badges/system-badge-new",
      { name: "신메뉴", colorId: "badge-color-muted-plum", isActive: false, confirmImpact: true },
      admin.cookie,
      admin.csrf
    );
    expect(confirmDeactivate.status).toBe(200);
    expect(await readJsonObject(confirmDeactivate)).toMatchObject({
      data: { systemBadges: expect.arrayContaining([expect.objectContaining({ id: "system-badge-new", isActive: false, usageCount: 0 })]) }
    });
  });

  it("isolates bar badge visibility and bar-specific badges by menu edit permission", async () => {
    const runtime = createRuntime(["bar-a7k2m9", "bar-f9q2x1"]);
    await seedSystemAdmin(runtime);
    const manager = await seedUser(runtime, "manager1");
    const staff = await seedUser(runtime, "staff1");
    const outsider = await seedUser(runtime, "other1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Sample Bar");
    const otherBar = await createBar(runtime, admin.cookie, admin.csrf, "Other Bar");
    await postJson(runtime.app, `/api/bars/${bar.id}/members`, { userId: manager.id, role: "manager" }, admin.cookie, admin.csrf);
    await postJson(runtime.app, `/api/bars/${bar.id}/members`, { userId: staff.id, role: "staff" }, admin.cookie, admin.csrf);
    const managerLogin = await login(runtime, "manager1", "StaffPass!1");
    const staffLogin = await login(runtime, "staff1", "StaffPass!1");
    const outsiderLogin = await login(runtime, "other1", "StaffPass!1");

    const list = await runtime.app.request(`/api/bars/${bar.id}/badges`, { headers: { cookie: managerLogin.cookie } });
    expect(list.status).toBe(200);
    expect(await readJsonObject(list)).toMatchObject({
      data: {
        bar: { id: bar.id },
        systemBadges: expect.arrayContaining([expect.objectContaining({ id: "system-badge-recommended", isHiddenForBar: true })])
      }
    });

    const toggleVisibility = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/badges/visibility/system-badge-recommended`,
      { isHidden: false },
      managerLogin.cookie,
      managerLogin.csrf
    );
    expect(toggleVisibility.status).toBe(200);
    expect(await readJsonObject(toggleVisibility)).toMatchObject({
      data: { systemBadges: expect.arrayContaining([expect.objectContaining({ id: "system-badge-recommended", isHiddenForBar: false })]) }
    });

    const createBarBadge = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/badges`,
      { name: "오늘의 픽", colorId: "badge-color-forest" },
      managerLogin.cookie,
      managerLogin.csrf
    );
    const createBody = await readJsonObject(createBarBadge);
    const created = (createBody.data as { barBadges: Array<{ id: string }> }).barBadges[0];
    if (!created) throw new Error("created bar badge missing");
    expect(createBarBadge.status).toBe(201);
    expect(createBody).toMatchObject({ data: { barBadges: [expect.objectContaining({ name: "오늘의 픽", barId: bar.id })] } });

    const duplicateBarBadge = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/badges`,
      { name: " 오늘의  픽 ", colorId: "badge-color-forest" },
      managerLogin.cookie,
      managerLogin.csrf
    );
    expect(duplicateBarBadge.status).toBe(409);
    expect(await readJsonObject(duplicateBarBadge)).toMatchObject({ error: { code: "BADGE_NAME_EXISTS" } });

    const staffCreate = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/badges`,
      { name: "스태프", colorId: "badge-color-forest" },
      staffLogin.cookie,
      staffLogin.csrf
    );
    const outsiderReadOtherBar = await runtime.app.request(`/api/bars/${otherBar.id}/badges`, {
      headers: { cookie: outsiderLogin.cookie }
    });
    expect(staffCreate.status).toBe(403);
    expect(await readJsonObject(staffCreate)).toMatchObject({ error: { code: "BAR_PERMISSION_REQUIRED" } });
    expect(outsiderReadOtherBar.status).toBe(404);
    expect(await readJsonObject(outsiderReadOtherBar)).toMatchObject({ error: { code: "BAR_NOT_FOUND" } });

    runtime.badgeRepository.setBarBadgeUsageForTest(bar.id, created.id, 1);
    const deleteInUse = await deleteJson(runtime.app, `/api/bars/${bar.id}/badges/${created.id}`, {}, managerLogin.cookie, managerLogin.csrf);
    expect(deleteInUse.status).toBe(409);
    expect(await readJsonObject(deleteInUse)).toMatchObject({
      error: { code: "BADGE_IN_USE_CONFIRM_REQUIRED", details: { usageCount: 1 } }
    });

    const confirmedDelete = await deleteJson(
      runtime.app,
      `/api/bars/${bar.id}/badges/${created.id}`,
      { confirmImpact: true },
      managerLogin.cookie,
      managerLogin.csrf
    );
    expect(confirmedDelete.status).toBe(200);
    expect(await readJsonObject(confirmedDelete)).toMatchObject({ data: { deleted: true } });
  });
});
