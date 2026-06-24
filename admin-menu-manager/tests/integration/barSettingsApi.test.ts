import { describe, expect, it } from "vitest";
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

type BarSettingsRuntime = {
  app: ReturnType<typeof createAdminApi>;
  authRepository: MemoryAuthRepository;
  barRepository: MemoryBarRepository;
  membershipRepository: MemoryMembershipRepository;
  service: AuthService;
};

type JsonObject = Record<string, unknown>;

function createRuntime(slugs = ["bar-a7k2m9", "bar-f9q2x1"]): BarSettingsRuntime {
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

async function postJson(app: BarSettingsRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function patchJson(app: BarSettingsRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function login(runtime: BarSettingsRuntime, username: string, password: string) {
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

async function seedSystemAdmin(runtime: BarSettingsRuntime) {
  await runtime.service.createSeedUser({
    username: "admin1",
    password: "AdminPass!1",
    isSystemAdmin: true,
    forcedPasswordChange: false
  });
}

async function seedUser(runtime: BarSettingsRuntime, username: string, password = "StaffPass!1") {
  return runtime.service.createSeedUser({
    username,
    password,
    forcedPasswordChange: false
  });
}

async function createBar(runtime: BarSettingsRuntime, cookie: string, csrf: string, name: string) {
  const response = await postJson(runtime.app, "/api/bars", { name, currency: "KRW" }, cookie, csrf);
  const body = await readJsonObject(response);
  expect(response.status).toBe(201);
  return (body.data as { id: string; name: string; currency: string });
}

function validSettings(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Sample Bar",
    description: "재즈와 싱글몰트를 위한 바",
    address: "서울시 마포구 와우산로 00, 지하 1층",
    mapUrl: "https://maps.example.test/sample",
    phoneNumberDigits: "0212345678",
    openingNote: "공휴일은 인스타그램 공지를 확인하세요.",
    currency: "KRW",
    businessHours: [
      { dayOfWeek: 1, opensAt: "18:00", closesAt: "02:00" },
      { dayOfWeek: 3, opensAt: "19:00", closesAt: "23:30" }
    ],
    links: [
      { label: "Instagram", url: "https://instagram.example.test/sample" },
      { label: "예약", url: "https://booking.example.test/sample" }
    ],
    ...overrides
  };
}

describe("D06 bar settings API", () => {
  it("requires authentication", async () => {
    const runtime = createRuntime();
    const response = await runtime.app.request("/api/bars/bar-id/settings");

    expect(response.status).toBe(401);
    expect(await readJsonObject(response)).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
  });

  it("lets system admins read and update public profile, overnight hours, links, and currency", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Sample Bar");

    const readBefore = await runtime.app.request(`/api/bars/${bar.id}/settings`, { headers: { cookie: admin.cookie } });
    expect(readBefore.status).toBe(200);
    expect(await readJsonObject(readBefore)).toMatchObject({
      data: {
        settings: {
          name: "Sample Bar",
          currency: "KRW",
          businessHours: [],
          links: []
        }
      }
    });

    const update = await patchJson(runtime.app, `/api/bars/${bar.id}/settings`, validSettings({ currency: "USD" }), admin.cookie, admin.csrf);
    const body = await readJsonObject(update);

    expect(update.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        settings: {
          name: "Sample Bar",
          currency: "USD",
          phoneNumberDigits: "0212345678",
          phoneNumberDisplay: "02-1234-5678",
          businessHours: [
            { dayOfWeek: 1, opensAt: "18:00", closesAt: "02:00", sortOrder: 0 },
            { dayOfWeek: 3, opensAt: "19:00", closesAt: "23:30", sortOrder: 1 }
          ],
          links: [
            { label: "Instagram", sortOrder: 0 },
            { label: "예약", sortOrder: 1 }
          ]
        }
      }
    });
    expect(((body.data as { settings: { settingsDraftHash: string } }).settings.settingsDraftHash)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("validates overlapping overnight hours, URL shape, and the 5-link limit", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Sample Bar");

    const overlapping = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/settings`,
      validSettings({
        businessHours: [
          { dayOfWeek: 1, opensAt: "18:00", closesAt: "02:00" },
          { dayOfWeek: 2, opensAt: "01:00", closesAt: "03:00" }
        ]
      }),
      admin.cookie,
      admin.csrf
    );
    const badUrl = await patchJson(runtime.app, `/api/bars/${bar.id}/settings`, validSettings({ mapUrl: "ftp://map" }), admin.cookie, admin.csrf);
    const tooManyLinks = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/settings`,
      validSettings({
        links: Array.from({ length: 6 }, (_, index) => ({ label: `링크${index + 1}`, url: `https://example.test/${index + 1}` }))
      }),
      admin.cookie,
      admin.csrf
    );

    expect(overlapping.status).toBe(400);
    expect(await readJsonObject(overlapping)).toMatchObject({ error: { code: "INPUT_INVALID" } });
    expect(badUrl.status).toBe(400);
    expect(await readJsonObject(badUrl)).toMatchObject({ error: { code: "INPUT_INVALID" } });
    expect(tooManyLinks.status).toBe(400);
    expect(await readJsonObject(tooManyLinks)).toMatchObject({ error: { code: "INPUT_INVALID" } });
  });

  it("allows canEditMenu members to edit non-currency settings but blocks currency changes and staff edits", async () => {
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

    const managerUpdate = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/settings`,
      validSettings({ name: "Member Edited Bar", currency: "KRW" }),
      managerLogin.cookie,
      managerLogin.csrf
    );
    const managerCurrency = await patchJson(
      runtime.app,
      `/api/bars/${bar.id}/settings`,
      validSettings({ currency: "USD" }),
      managerLogin.cookie,
      managerLogin.csrf
    );
    const staffUpdate = await patchJson(runtime.app, `/api/bars/${bar.id}/settings`, validSettings(), staffLogin.cookie, staffLogin.csrf);
    const outsiderRead = await runtime.app.request(`/api/bars/${bar.id}/settings`, { headers: { cookie: outsiderLogin.cookie } });
    const otherBarUpdate = await patchJson(
      runtime.app,
      `/api/bars/${otherBar.id}/settings`,
      validSettings(),
      managerLogin.cookie,
      managerLogin.csrf
    );

    expect(managerUpdate.status).toBe(200);
    expect(await readJsonObject(managerUpdate)).toMatchObject({ data: { settings: { name: "Member Edited Bar", currency: "KRW" } } });
    expect(managerCurrency.status).toBe(403);
    expect(await readJsonObject(managerCurrency)).toMatchObject({ error: { code: "CURRENCY_SYSTEM_ADMIN_REQUIRED" } });
    expect(staffUpdate.status).toBe(403);
    expect(await readJsonObject(staffUpdate)).toMatchObject({ error: { code: "BAR_PERMISSION_REQUIRED" } });
    expect(outsiderRead.status).toBe(404);
    expect(await readJsonObject(outsiderRead)).toMatchObject({ error: { code: "BAR_NOT_FOUND" } });
    expect(otherBarUpdate.status).toBe(404);
    expect(await readJsonObject(otherBarUpdate)).toMatchObject({ error: { code: "BAR_NOT_FOUND" } });
  });
});
