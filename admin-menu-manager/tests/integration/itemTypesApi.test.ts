import { describe, expect, it } from "vitest";
import { createAdminApi } from "../../server/app";
import { AuthService } from "../../server/auth/authService";
import { MemoryAuthRepository } from "../../server/auth/memoryAuthRepository";
import { FastTestPasswordHasher } from "../../server/auth/passwordHasher";
import { MemoryBarRepository } from "../../server/bars/memoryBarRepository";
import { MemoryItemTypeRepository } from "../../server/item-types/memoryItemTypeRepository";
import { MemoryMembershipRepository } from "../../server/memberships/memoryMembershipRepository";

const config = {
  setupToken: "setup-token",
  recoveryToken: "recovery-token"
};

type ItemTypesRuntime = {
  app: ReturnType<typeof createAdminApi>;
  authRepository: MemoryAuthRepository;
  barRepository: MemoryBarRepository;
  itemTypeRepository: MemoryItemTypeRepository;
  membershipRepository: MemoryMembershipRepository;
  service: AuthService;
};

type JsonObject = Record<string, unknown>;

function createRuntime(slugs = ["bar-a7k2m9", "bar-f9q2x1"]): ItemTypesRuntime {
  const authRepository = new MemoryAuthRepository();
  const barRepository = new MemoryBarRepository();
  const itemTypeRepository = new MemoryItemTypeRepository();
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
      barRepository,
      itemTypeRepository,
      membershipRepository,
      passwordHasher: hasher,
      config,
      now: () => new Date("2026-06-23T00:00:00.000Z"),
      barSlugGenerator: () => slugs[Math.min(slugIndex++, slugs.length - 1)] ?? "bar-a7k2m9"
    }),
    authRepository,
    barRepository,
    itemTypeRepository,
    membershipRepository,
    service
  };
}

async function readJsonObject(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function postJson(app: ItemTypesRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function patchJson(app: ItemTypesRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function deleteJson(app: ItemTypesRuntime["app"], path: string, cookie = "", csrf = "") {
  return app.request(path, {
    method: "DELETE",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { "x-csrf-token": csrf } : {})
    }
  });
}

async function login(runtime: ItemTypesRuntime, username: string, password: string) {
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

async function seedSystemAdmin(runtime: ItemTypesRuntime) {
  await runtime.service.createSeedUser({
    username: "admin1",
    password: "AdminPass!1",
    isSystemAdmin: true,
    forcedPasswordChange: false
  });
}

async function seedUser(runtime: ItemTypesRuntime, username: string, password = "StaffPass!1") {
  return runtime.service.createSeedUser({
    username,
    password,
    forcedPasswordChange: false
  });
}

async function createBar(runtime: ItemTypesRuntime, cookie: string, csrf: string, name: string) {
  const response = await postJson(runtime.app, "/api/bars", { name, currency: "KRW" }, cookie, csrf);
  const body = await readJsonObject(response);
  expect(response.status).toBe(201);
  return body.data as { id: string; name: string };
}

describe("D07 item types and grape variety API", () => {
  it("requires authentication", async () => {
    const runtime = createRuntime();

    const response = await runtime.app.request("/api/system/item-types");

    expect(response.status).toBe(401);
    expect(await readJsonObject(response)).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
  });

  it("lets system admins manage common item types and blocks invalid, duplicate, or in-use changes", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const admin = await login(runtime, "admin1", "AdminPass!1");

    const list = await runtime.app.request("/api/system/item-types", { headers: { cookie: admin.cookie } });
    expect(list.status).toBe(200);
    expect(await readJsonObject(list)).toMatchObject({
      data: {
        templates: expect.arrayContaining([expect.objectContaining({ value: "wine" })]),
        systemTypes: expect.arrayContaining([expect.objectContaining({ id: "system-type-wine", defaultPriceLabels: ["글라스", "보틀"] })])
      }
    });

    const invalid = await postJson(
      runtime.app,
      "/api/system/item-types",
      { name: "사케", template: "spirit", defaultPriceLabels: ["잔", " 잔 "] },
      admin.cookie,
      admin.csrf
    );
    expect(invalid.status).toBe(400);
    expect(await readJsonObject(invalid)).toMatchObject({ error: { code: "INPUT_INVALID" } });

    const create = await postJson(
      runtime.app,
      "/api/system/item-types",
      { name: "사케", template: "spirit", defaultPriceLabels: ["잔", "병"] },
      admin.cookie,
      admin.csrf
    );
    const createBody = await readJsonObject(create);
    const created = createBody.data as { id: string };
    expect(create.status).toBe(201);
    expect(createBody).toMatchObject({ data: { name: "사케", template: "spirit", isActive: true } });

    const duplicate = await postJson(
      runtime.app,
      "/api/system/item-types",
      { name: " 사케 ", template: "spirit", defaultPriceLabels: ["잔"] },
      admin.cookie,
      admin.csrf
    );
    expect(duplicate.status).toBe(409);
    expect(await readJsonObject(duplicate)).toMatchObject({ error: { code: "ITEM_TYPE_NAME_EXISTS" } });

    const update = await patchJson(
      runtime.app,
      `/api/system/item-types/${created.id}`,
      { name: "프리미엄 사케", template: "spirit", defaultPriceLabels: ["글라스", "도쿠리"], isActive: false },
      admin.cookie,
      admin.csrf
    );
    expect(update.status).toBe(200);
    expect(await readJsonObject(update)).toMatchObject({
      data: { name: "프리미엄 사케", defaultPriceLabels: ["글라스", "도쿠리"], isActive: false }
    });

    runtime.itemTypeRepository.setSystemUsageForTest("system-type-wine", 2);
    const deactivateInUse = await patchJson(
      runtime.app,
      "/api/system/item-types/system-type-wine",
      { name: "와인", template: "wine", defaultPriceLabels: ["글라스", "보틀"], isActive: false },
      admin.cookie,
      admin.csrf
    );
    const deleteInUse = await deleteJson(runtime.app, "/api/system/item-types/system-type-wine", admin.cookie, admin.csrf);
    expect(deactivateInUse.status).toBe(409);
    expect(await readJsonObject(deactivateInUse)).toMatchObject({ error: { code: "ITEM_TYPE_IN_USE" } });
    expect(deleteInUse.status).toBe(409);
    expect(await readJsonObject(deleteInUse)).toMatchObject({ error: { code: "ITEM_TYPE_IN_USE" } });
  });

  it("isolates bar-specific types to system admins and bar owners", async () => {
    const runtime = createRuntime(["bar-a7k2m9", "bar-f9q2x1"]);
    await seedSystemAdmin(runtime);
    const owner = await seedUser(runtime, "owner1");
    const manager = await seedUser(runtime, "manager1");
    const outsider = await seedUser(runtime, "other1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Sample Bar");
    const otherBar = await createBar(runtime, admin.cookie, admin.csrf, "Other Bar");
    await postJson(runtime.app, `/api/bars/${bar.id}/members`, { userId: owner.id, role: "owner" }, admin.cookie, admin.csrf);
    await postJson(runtime.app, `/api/bars/${bar.id}/members`, { userId: manager.id, role: "manager" }, admin.cookie, admin.csrf);
    const ownerLogin = await login(runtime, "owner1", "StaffPass!1");
    const managerLogin = await login(runtime, "manager1", "StaffPass!1");
    const outsiderLogin = await login(runtime, "other1", "StaffPass!1");

    const createBarType = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/item-types`,
      { name: "하우스 푸드", template: "food", defaultPriceLabels: ["접시"] },
      ownerLogin.cookie,
      ownerLogin.csrf
    );
    const createBody = await readJsonObject(createBarType);
    const created = (createBody.data as { barTypes: Array<{ id: string }> }).barTypes[0];
    if (!created) throw new Error("created bar item type missing");
    expect(createBarType.status).toBe(201);
    expect(createBody).toMatchObject({ data: { bar: { id: bar.id }, barTypes: [expect.objectContaining({ name: "하우스 푸드" })] } });

    const override = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/item-types/overrides/system-type-wine`,
      { isHidden: false, defaultPriceLabels: ["잔", "카라프", "병"] },
      ownerLogin.cookie,
      ownerLogin.csrf
    );
    expect(override.status).toBe(200);
    expect(await readJsonObject(override)).toMatchObject({
      data: { overrides: [expect.objectContaining({ systemItemTypeId: "system-type-wine", defaultPriceLabels: ["잔", "카라프", "병"] })] }
    });

    runtime.itemTypeRepository.setBarUsageForTest(bar.id, created.id, 1);
    const deleteInUse = await deleteJson(runtime.app, `/api/bars/${bar.id}/item-types/${created.id}`, ownerLogin.cookie, ownerLogin.csrf);
    expect(deleteInUse.status).toBe(409);
    expect(await readJsonObject(deleteInUse)).toMatchObject({ error: { code: "ITEM_TYPE_IN_USE" } });

    const managerCreate = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/item-types`,
      { name: "매니저 전용", template: "general", defaultPriceLabels: [] },
      managerLogin.cookie,
      managerLogin.csrf
    );
    const outsiderReadOtherBar = await runtime.app.request(`/api/bars/${otherBar.id}/item-types`, { headers: { cookie: outsiderLogin.cookie } });
    expect(managerCreate.status).toBe(403);
    expect(await readJsonObject(managerCreate)).toMatchObject({ error: { code: "BAR_OWNER_REQUIRED" } });
    expect(outsiderReadOtherBar.status).toBe(404);
    expect(await readJsonObject(outsiderReadOtherBar)).toMatchObject({ error: { code: "BAR_NOT_FOUND" } });
  });

  it("keeps grape variety candidates unusable until system-admin approval", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const manager = await seedUser(runtime, "manager1");
    const staff = await seedUser(runtime, "staff1");
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Sample Bar");
    await postJson(runtime.app, `/api/bars/${bar.id}/members`, { userId: manager.id, role: "manager" }, admin.cookie, admin.csrf);
    await postJson(runtime.app, `/api/bars/${bar.id}/members`, { userId: staff.id, role: "staff" }, admin.cookie, admin.csrf);
    const managerLogin = await login(runtime, "manager1", "StaffPass!1");
    const staffLogin = await login(runtime, "staff1", "StaffPass!1");

    const staffSubmit = await postJson(
      runtime.app,
      "/api/system/grape-variety-candidates",
      { barId: bar.id, proposedName: "피노 누아" },
      staffLogin.cookie,
      staffLogin.csrf
    );
    expect(staffSubmit.status).toBe(403);
    expect(await readJsonObject(staffSubmit)).toMatchObject({ error: { code: "BAR_PERMISSION_REQUIRED" } });

    const submit = await postJson(
      runtime.app,
      "/api/system/grape-variety-candidates",
      { barId: bar.id, proposedName: "피노 누아" },
      managerLogin.cookie,
      managerLogin.csrf
    );
    const submitBody = await readJsonObject(submit);
    const candidate = (submitBody.data as { candidates: Array<{ id: string }> }).candidates[0];
    if (!candidate) throw new Error("created grape candidate missing");
    expect(submit.status).toBe(201);
    expect(submitBody).toMatchObject({ data: { candidates: [expect.objectContaining({ proposedName: "피노 누아", status: "pending" })] } });

    const approvedBefore = await runtime.app.request("/api/system/grape-varieties", { headers: { cookie: managerLogin.cookie } });
    expect(approvedBefore.status).toBe(200);
    expect(await readJsonObject(approvedBefore)).toMatchObject({ data: { varieties: [] } });

    const managerQueueRead = await runtime.app.request("/api/system/grape-variety-candidates", { headers: { cookie: managerLogin.cookie } });
    expect(managerQueueRead.status).toBe(403);
    expect(await readJsonObject(managerQueueRead)).toMatchObject({ error: { code: "SYSTEM_ADMIN_REQUIRED" } });

    const approve = await postJson(
      runtime.app,
      `/api/system/grape-variety-candidates/${candidate.id}/approve`,
      { standardName: "피노 누아" },
      admin.cookie,
      admin.csrf
    );
    expect(approve.status).toBe(200);
    expect(await readJsonObject(approve)).toMatchObject({
      data: { candidates: [expect.objectContaining({ proposedName: "피노 누아", status: "approved", standardName: "피노 누아" })] }
    });

    const approvedAfter = await runtime.app.request("/api/system/grape-varieties", { headers: { cookie: managerLogin.cookie } });
    expect(approvedAfter.status).toBe(200);
    expect(await readJsonObject(approvedAfter)).toMatchObject({
      data: { varieties: [expect.objectContaining({ name: "피노 누아" })] }
    });

    const duplicateSubmit = await postJson(
      runtime.app,
      "/api/system/grape-variety-candidates",
      { barId: bar.id, proposedName: " 피노 누아 " },
      managerLogin.cookie,
      managerLogin.csrf
    );
    const approveAgain = await postJson(
      runtime.app,
      `/api/system/grape-variety-candidates/${candidate.id}/approve`,
      { standardName: "피노 누아" },
      admin.cookie,
      admin.csrf
    );
    expect(duplicateSubmit.status).toBe(409);
    expect(await readJsonObject(duplicateSubmit)).toMatchObject({ error: { code: "GRAPE_VARIETY_ALREADY_APPROVED" } });
    expect(approveAgain.status).toBe(409);
    expect(await readJsonObject(approveAgain)).toMatchObject({ error: { code: "GRAPE_CANDIDATE_NOT_PENDING" } });
  });
});
