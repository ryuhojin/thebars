import { describe, expect, it } from "vitest";
import { createAdminApi } from "../../server/app";
import { AuthService } from "../../server/auth/authService";
import { MemoryAuthRepository } from "../../server/auth/memoryAuthRepository";
import { FastTestPasswordHasher } from "../../server/auth/passwordHasher";
import { MemoryBarRepository } from "../../server/bars/memoryBarRepository";
import { MemoryCategoryRepository } from "../../server/categories/memoryCategoryRepository";
import { MemoryMembershipRepository } from "../../server/memberships/memoryMembershipRepository";

const config = {
  setupToken: "setup-token",
  recoveryToken: "recovery-token"
};

type CategoriesRuntime = {
  app: ReturnType<typeof createAdminApi>;
  authRepository: MemoryAuthRepository;
  barRepository: MemoryBarRepository;
  categoryRepository: MemoryCategoryRepository;
  membershipRepository: MemoryMembershipRepository;
  service: AuthService;
};

type JsonObject = Record<string, unknown>;
type CategoryDto = {
  id: string;
  name: string;
  parentId: string | null;
  publicId: string;
  sortOrder: number;
  menuCount: number;
  childCount: number;
};

function createRuntime(slugs = ["bar-a7k2m9", "bar-f9q2x1"]): CategoriesRuntime {
  const authRepository = new MemoryAuthRepository();
  const barRepository = new MemoryBarRepository();
  const categoryRepository = new MemoryCategoryRepository();
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
      categoryRepository,
      membershipRepository,
      passwordHasher: hasher,
      config,
      now: () => new Date("2026-06-23T00:00:00.000Z"),
      barSlugGenerator: () => slugs[Math.min(slugIndex++, slugs.length - 1)] ?? "bar-a7k2m9"
    }),
    authRepository,
    barRepository,
    categoryRepository,
    membershipRepository,
    service
  };
}

async function readJsonObject(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function postJson(app: CategoriesRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function patchJson(app: CategoriesRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function deleteJson(app: CategoriesRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function login(runtime: CategoriesRuntime, username: string, password: string) {
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

async function seedSystemAdmin(runtime: CategoriesRuntime) {
  await runtime.service.createSeedUser({
    username: "admin1",
    password: "AdminPass!1",
    isSystemAdmin: true,
    forcedPasswordChange: false
  });
}

async function seedUser(runtime: CategoriesRuntime, username: string, password = "StaffPass!1") {
  return runtime.service.createSeedUser({
    username,
    password,
    forcedPasswordChange: false
  });
}

async function createBar(runtime: CategoriesRuntime, cookie: string, csrf: string, name: string) {
  const response = await postJson(runtime.app, "/api/bars", { name, currency: "KRW" }, cookie, csrf);
  const body = await readJsonObject(response);
  expect(response.status).toBe(201);
  return body.data as { id: string; name: string };
}

async function createCategory(
  runtime: CategoriesRuntime,
  barId: string,
  cookie: string,
  csrf: string,
  body: { name: string; parentId?: string | null; description?: string; showDescription?: boolean; isVisible?: boolean }
) {
  const response = await postJson(runtime.app, `/api/bars/${barId}/categories`, body, cookie, csrf);
  const responseBody = await readJsonObject(response);
  expect(response.status).toBe(201);
  const category = ((responseBody.data as { categories: CategoryDto[] }).categories).find((item) => item.name === body.name.trim());
  if (!category) throw new Error(`created category ${body.name} missing`);
  return category;
}

describe("D09 categories API", () => {
  it("requires authentication", async () => {
    const runtime = createRuntime();

    const response = await runtime.app.request("/api/bars/bar-1/categories");

    expect(response.status).toBe(401);
    expect(await readJsonObject(response)).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
  });

  it("manages two-level category structures and guards structural conflicts", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Sample Bar");

    const invalid = await postJson(runtime.app, `/api/bars/${bar.id}/categories`, { name: "" }, admin.cookie, admin.csrf);
    expect(invalid.status).toBe(400);
    expect(await readJsonObject(invalid)).toMatchObject({ error: { code: "INPUT_INVALID" } });

    const whisky = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, {
      name: "위스키",
      description: "싱글몰트와 버번",
      showDescription: true
    });
    const cocktails = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "칵테일" });
    const singleMalt = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "싱글몰트", parentId: whisky.id });
    const bourbon = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, { name: "버번", parentId: whisky.id });
    expect(whisky.publicId).toBe("cat_1");
    expect(singleMalt.parentId).toBe(whisky.id);

    const duplicateRoot = await postJson(runtime.app, `/api/bars/${bar.id}/categories`, { name: " 위스키 " }, admin.cookie, admin.csrf);
    expect(duplicateRoot.status).toBe(409);
    expect(await readJsonObject(duplicateRoot)).toMatchObject({ error: { code: "CATEGORY_NAME_EXISTS" } });

    const thirdLevel = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/categories`,
      { name: "스페이사이드", parentId: singleMalt.id },
      admin.cookie,
      admin.csrf
    );
    expect(thirdLevel.status).toBe(409);
    expect(await readJsonObject(thirdLevel)).toMatchObject({ error: { code: "CATEGORY_MAX_DEPTH" } });

    runtime.categoryRepository.setDirectMenuUsageForTest(bar.id, cocktails.id, 3);
    const childUnderMenuParent = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/categories`,
      { name: "클래식", parentId: cocktails.id },
      admin.cookie,
      admin.csrf
    );
    expect(childUnderMenuParent.status).toBe(409);
    expect(await readJsonObject(childUnderMenuParent)).toMatchObject({ error: { code: "CATEGORY_PARENT_HAS_MENU" } });

    const update = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/categories/${whisky.id}`,
      { name: "위스키", description: "바틀과 글라스", showDescription: true, isVisible: false },
      admin.cookie,
      admin.csrf
    );
    expect(update.status).toBe(200);
    expect(await readJsonObject(update)).toMatchObject({
      data: { categories: expect.arrayContaining([expect.objectContaining({ id: whisky.id, isVisible: false, description: "바틀과 글라스" })]) }
    });

    const reorder = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/categories/reorder`,
      { parentId: whisky.id, orderedIds: [bourbon.id, singleMalt.id] },
      admin.cookie,
      admin.csrf
    );
    expect(reorder.status).toBe(200);
    const reorderedChildren = ((await readJsonObject(reorder)).data as { categories: CategoryDto[] }).categories.filter(
      (category) => category.parentId === whisky.id
    );
    expect(reorderedChildren.map((category) => category.id)).toEqual([bourbon.id, singleMalt.id]);

    runtime.categoryRepository.setDirectMenuUsageForTest(bar.id, cocktails.id, 0);
    const move = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/categories/${bourbon.id}/move`,
      { parentId: cocktails.id },
      admin.cookie,
      admin.csrf
    );
    expect(move.status).toBe(200);
    expect(await readJsonObject(move)).toMatchObject({
      data: { categories: expect.arrayContaining([expect.objectContaining({ id: bourbon.id, parentId: cocktails.id })]) }
    });

    runtime.categoryRepository.setDirectMenuUsageForTest(bar.id, singleMalt.id, 1);
    const deleteInUse = await deleteJson(runtime.app, `/api/bars/${bar.id}/categories/${singleMalt.id}`, {}, admin.cookie, admin.csrf);
    expect(deleteInUse.status).toBe(409);
    expect(await readJsonObject(deleteInUse)).toMatchObject({ error: { code: "CATEGORY_IN_USE" } });

    runtime.categoryRepository.setDirectMenuUsageForTest(bar.id, singleMalt.id, 0);
    const deleteParentWithoutConfirm = await deleteJson(runtime.app, `/api/bars/${bar.id}/categories/${whisky.id}`, {}, admin.cookie, admin.csrf);
    expect(deleteParentWithoutConfirm.status).toBe(409);
    expect(await readJsonObject(deleteParentWithoutConfirm)).toMatchObject({
      error: { code: "CATEGORY_DELETE_CONFIRM_REQUIRED", details: { childCount: 1 } }
    });

    const deleteParent = await deleteJson(
      runtime.app,
      `/api/bars/${bar.id}/categories/${whisky.id}`,
      { confirmCascade: true },
      admin.cookie,
      admin.csrf
    );
    expect(deleteParent.status).toBe(200);
    expect(await readJsonObject(deleteParent)).toMatchObject({ data: { deleted: true } });
  });

  it("isolates category management by bar edit permission", async () => {
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

    const managerCreate = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/categories`,
      { name: "매니저 카테고리" },
      managerLogin.cookie,
      managerLogin.csrf
    );
    expect(managerCreate.status).toBe(201);
    expect(await readJsonObject(managerCreate)).toMatchObject({
      data: { categories: [expect.objectContaining({ name: "매니저 카테고리", updatedByUsername: "manager1" })] }
    });

    const staffCreate = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/categories`,
      { name: "스태프 카테고리" },
      staffLogin.cookie,
      staffLogin.csrf
    );
    const outsiderReadOtherBar = await runtime.app.request(`/api/bars/${otherBar.id}/categories`, {
      headers: { cookie: outsiderLogin.cookie }
    });
    const missingCategory = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/categories/not-found`,
      { name: "없음", description: "", showDescription: false, isVisible: true },
      managerLogin.cookie,
      managerLogin.csrf
    );
    expect(staffCreate.status).toBe(403);
    expect(await readJsonObject(staffCreate)).toMatchObject({ error: { code: "BAR_PERMISSION_REQUIRED" } });
    expect(outsiderReadOtherBar.status).toBe(404);
    expect(await readJsonObject(outsiderReadOtherBar)).toMatchObject({ error: { code: "BAR_NOT_FOUND" } });
    expect(missingCategory.status).toBe(404);
    expect(await readJsonObject(missingCategory)).toMatchObject({ error: { code: "CATEGORY_NOT_FOUND" } });
  });
});
