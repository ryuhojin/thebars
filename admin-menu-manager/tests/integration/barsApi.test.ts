import { describe, expect, it } from "vitest";
import { createAdminApi } from "../../server/app";
import { AuthService } from "../../server/auth/authService";
import { MemoryAuthRepository } from "../../server/auth/memoryAuthRepository";
import { FastTestPasswordHasher } from "../../server/auth/passwordHasher";
import { MemoryBarRepository } from "../../server/bars/memoryBarRepository";

const config = {
  setupToken: "setup-token",
  recoveryToken: "recovery-token"
};

type BarsRuntime = {
  app: ReturnType<typeof createAdminApi>;
  authRepository: MemoryAuthRepository;
  barRepository: MemoryBarRepository;
  service: AuthService;
};

type JsonObject = Record<string, unknown>;

function createRuntime(slugs: string[] = ["bar-a7k2m9"]): BarsRuntime {
  const authRepository = new MemoryAuthRepository();
  const barRepository = new MemoryBarRepository();
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
    service,
    app: createAdminApi({
      repository: authRepository,
      barRepository,
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

async function postJson(app: BarsRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function login(runtime: BarsRuntime, username: string, password: string) {
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

async function seedSystemAdmin(runtime: BarsRuntime) {
  await runtime.service.createSeedUser({
    username: "admin1",
    password: "AdminPass!1",
    isSystemAdmin: true,
    forcedPasswordChange: false
  });
}

describe("D03 bars API", () => {
  it("requires authentication", async () => {
    const runtime = createRuntime();
    const response = await runtime.app.request("/api/bars");

    expect(response.status).toBe(401);
    expect(await readJsonObject(response)).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
  });

  it("blocks forced password users before bar access", async () => {
    const runtime = createRuntime();
    await runtime.service.createSeedUser({
      username: "forced1",
      password: "TempPass!1",
      forcedPasswordChange: true
    });
    const { cookie, csrf } = await login(runtime, "forced1", "TempPass!1");

    const response = await postJson(runtime.app, "/api/bars", { name: "Sample Bar", currency: "KRW" }, cookie, csrf);

    expect(response.status).toBe(403);
    expect(await readJsonObject(response)).toMatchObject({ error: { code: "PASSWORD_CHANGE_REQUIRED" } });
  });

  it("allows only system admins to list and create bars, and hides bar reads from non-members", async () => {
    const runtime = createRuntime();
    await runtime.service.createSeedUser({ username: "staff1", password: "StaffPass!1", forcedPasswordChange: false });
    const { cookie, csrf } = await login(runtime, "staff1", "StaffPass!1");

    const listResponse = await runtime.app.request("/api/bars", { headers: { cookie } });
    const createResponse = await postJson(runtime.app, "/api/bars", { name: "Sample Bar", currency: "KRW" }, cookie, csrf);
    const readResponse = await runtime.app.request("/api/bars/bar-doesnotexist", { headers: { cookie } });

    expect(listResponse.status).toBe(403);
    expect(createResponse.status).toBe(403);
    expect(readResponse.status).toBe(404);
    expect(await readJsonObject(createResponse)).toMatchObject({ error: { code: "SYSTEM_ADMIN_REQUIRED" } });
    expect(await readJsonObject(readResponse)).toMatchObject({ error: { code: "BAR_NOT_FOUND" } });
  });

  it("creates bars with immutable server-generated slug and preparing public state", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const { cookie, csrf } = await login(runtime, "admin1", "AdminPass!1");

    const createResponse = await postJson(
      runtime.app,
      "/api/bars",
      { name: "Sample Bar", currency: "KRW", slug: "client-value" },
      cookie,
      csrf
    );
    const createBody = await readJsonObject(createResponse);
    const created = createBody.data as { id: string; slug: string; encodedSlug: string; customerPath: string };

    expect(createResponse.status).toBe(201);
    expect(createBody).toMatchObject({
      data: {
        name: "Sample Bar",
        slug: "bar-a7k2m9",
        encodedSlug: "YmFyLWE3azJtOQ",
        customerPath: "/YmFyLWE3azJtOQ",
        status: "active",
        currency: "KRW",
        publicMenuStatus: "preparing",
        directPublishEnabled: false,
        recentPublication: { status: "preparing" }
      }
    });

    const listResponse = await runtime.app.request("/api/bars", { headers: { cookie } });
    expect(await readJsonObject(listResponse)).toMatchObject({
      data: {
        summary: { totalBars: 1, activeBars: 1, inactiveBars: 0 },
        items: [{ id: created.id, slug: "bar-a7k2m9" }]
      }
    });

    const detailResponse = await runtime.app.request(`/api/bars/${created.id}`, { headers: { cookie } });
    expect(await readJsonObject(detailResponse)).toMatchObject({
      data: {
        id: created.id,
        overviewCards: [
          { id: "public-menu", status: "unavailable" },
          { id: "open-orders", status: "unavailable" },
          { id: "publication", status: "available", value: "준비 중" },
          { id: "unpublished", status: "unavailable" }
        ]
      }
    });

    const dashboardResponse = await runtime.app.request("/api/dashboard", { headers: { cookie } });
    const dashboardBody = await readJsonObject(dashboardResponse);
    const dashboard = dashboardBody.data as {
      selectedBarId: string;
      accessibleBars: Array<{ id: string; role: string; status: string }>;
      metrics: Array<{ id: string; value: string; status: string }>;
    };
    expect(dashboard.selectedBarId).toBe(created.id);
    expect(dashboard.accessibleBars).toEqual([
      {
        id: created.id,
        name: "Sample Bar",
        role: "system-admin",
        status: "active",
        directPublishEnabled: false,
        href: `/bars/${created.id}`
      }
    ]);
    expect(dashboard.metrics.find((metric) => metric.id === "bars-total")).toMatchObject({
      value: "1",
      status: "available"
    });
  });

  it("validates required bar input and returns missing bars as 404", async () => {
    const runtime = createRuntime();
    await seedSystemAdmin(runtime);
    const { cookie, csrf } = await login(runtime, "admin1", "AdminPass!1");

    const invalidResponse = await postJson(runtime.app, "/api/bars", { name: "", currency: "krw" }, cookie, csrf);
    const missingResponse = await runtime.app.request("/api/bars/missing-bar", { headers: { cookie } });

    expect(invalidResponse.status).toBe(400);
    expect(await readJsonObject(invalidResponse)).toMatchObject({
      error: { code: "INPUT_INVALID", fieldErrors: { name: ["바 이름을 입력하세요."] } }
    });
    expect(missingResponse.status).toBe(404);
    expect(await readJsonObject(missingResponse)).toMatchObject({ error: { code: "BAR_NOT_FOUND" } });
  });

  it("retries slug collisions and reports exhausted collisions as 409 without partial duplicates", async () => {
    const runtime = createRuntime(["bar-a7k2m9", "bar-a7k2m9", "bar-f9q2x1"]);
    await seedSystemAdmin(runtime);
    const { cookie, csrf } = await login(runtime, "admin1", "AdminPass!1");

    const firstResponse = await postJson(runtime.app, "/api/bars", { name: "Sample Bar", currency: "KRW" }, cookie, csrf);
    const secondResponse = await postJson(runtime.app, "/api/bars", { name: "Cigar Room", currency: "KRW" }, cookie, csrf);
    const secondBody = await readJsonObject(secondResponse);

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(secondBody).toMatchObject({ data: { slug: "bar-f9q2x1" } });

    const exhaustedRuntime = createRuntime(Array.from({ length: 9 }, () => "bar-a7k2m9"));
    await seedSystemAdmin(exhaustedRuntime);
    const exhaustedLogin = await login(exhaustedRuntime, "admin1", "AdminPass!1");
    await postJson(
      exhaustedRuntime.app,
      "/api/bars",
      { name: "Existing", currency: "KRW" },
      exhaustedLogin.cookie,
      exhaustedLogin.csrf
    );
    const exhaustedResponse = await postJson(
      exhaustedRuntime.app,
      "/api/bars",
      { name: "Collision", currency: "KRW" },
      exhaustedLogin.cookie,
      exhaustedLogin.csrf
    );
    const listResponse = await exhaustedRuntime.app.request("/api/bars", { headers: { cookie: exhaustedLogin.cookie } });

    expect(exhaustedResponse.status).toBe(409);
    expect(await readJsonObject(exhaustedResponse)).toMatchObject({ error: { code: "BAR_SLUG_COLLISION" } });
    expect(await readJsonObject(listResponse)).toMatchObject({ data: { summary: { totalBars: 1 } } });
  });
});
