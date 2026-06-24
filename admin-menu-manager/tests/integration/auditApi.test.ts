import { describe, expect, it } from "vitest";
import { createAdminApi } from "../../server/app";
import { AuthService } from "../../server/auth/authService";
import { MemoryAuthRepository } from "../../server/auth/memoryAuthRepository";
import { FastTestPasswordHasher } from "../../server/auth/passwordHasher";
import { MemoryAuditRepository } from "../../server/audit/memoryAuditRepository";
import { MemoryBarRepository } from "../../server/bars/memoryBarRepository";
import { MemoryMembershipRepository } from "../../server/memberships/memoryMembershipRepository";
import { MemoryOrderTabRepository } from "../../server/order-tabs/memoryOrderTabRepository";
import { MemoryPublicationRepository } from "../../server/publications/memoryPublicationRepository";

const config = {
  setupToken: "setup-token",
  recoveryToken: "recovery-token"
};

type AuditRuntime = {
  app: ReturnType<typeof createAdminApi>;
  service: AuthService;
  auditRepository: MemoryAuditRepository;
  barRepository: MemoryBarRepository;
  orderTabRepository: MemoryOrderTabRepository;
};

type JsonObject = Record<string, unknown>;

function createRuntime(): AuditRuntime {
  const authRepository = new MemoryAuthRepository();
  const auditRepository = new MemoryAuditRepository();
  const barRepository = new MemoryBarRepository();
  const membershipRepository = new MemoryMembershipRepository();
  const orderTabRepository = new MemoryOrderTabRepository();
  const publicationRepository = new MemoryPublicationRepository();
  const hasher = new FastTestPasswordHasher();
  let slugIndex = 0;
  const slugs = ["bar-a7k2m9", "bar-f9q2x1"];
  const now = () => new Date("2026-06-23T00:00:00.000Z");
  const service = new AuthService(authRepository, {
    passwordHasher: hasher,
    config,
    now
  });
  return {
    app: createAdminApi({
      repository: authRepository,
      auditRepository,
      barRepository,
      membershipRepository,
      orderTabRepository,
      publicationRepository,
      passwordHasher: hasher,
      config,
      now,
      barSlugGenerator: () => slugs[Math.min(slugIndex++, slugs.length - 1)] ?? "bar-a7k2m9"
    }),
    service,
    auditRepository,
    barRepository,
    orderTabRepository
  };
}

async function readJsonObject(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function postJson(app: AuditRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function login(runtime: AuditRuntime, username: string, password: string) {
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

async function seedUsers(runtime: AuditRuntime) {
  const admin = await runtime.service.createSeedUser({
    username: "admin1",
    password: "AdminPass!1",
    isSystemAdmin: true,
    forcedPasswordChange: false
  });
  const staff = await runtime.service.createSeedUser({
    username: "staff1",
    password: "StaffPass!1",
    forcedPasswordChange: false
  });
  return { admin, staff };
}

async function createBar(runtime: AuditRuntime, admin: Awaited<ReturnType<AuthService["createSeedUser"]>>) {
  return runtime.barRepository.createBar({
    id: "bar-test",
    name: "Audit Bar",
    slug: "bar-a7k2m9",
    encodedSlug: "bar-a7k2m9",
    currency: "KRW",
    settingsDraftHash: "hash",
    createdByUserId: admin.id,
    now: "2026-06-23T00:00:00.000Z"
  });
}

describe("D22 audit API", () => {
  it("requires authentication and system-admin authorization", async () => {
    const runtime = createRuntime();
    await seedUsers(runtime);

    const unauthenticated = await runtime.app.request("/api/system/audit");
    expect(unauthenticated.status).toBe(401);
    expect(await readJsonObject(unauthenticated)).toMatchObject({ error: { code: "AUTH_REQUIRED" } });

    const staff = await login(runtime, "staff1", "StaffPass!1");
    const forbidden = await runtime.app.request("/api/system/audit", { headers: { cookie: staff.cookie } });
    expect(forbidden.status).toBe(403);
    expect(await readJsonObject(forbidden)).toMatchObject({ error: { code: "SYSTEM_ADMIN_REQUIRED" } });
  });

  it("records failed login audit entries without passwords or session tokens", async () => {
    const runtime = createRuntime();
    await seedUsers(runtime);

    const failedLogin = await postJson(runtime.app, "/api/auth/login", { username: "admin1", password: "WrongPass!1" });
    expect(failedLogin.status).toBe(401);

    const admin = await login(runtime, "admin1", "AdminPass!1");
    const response = await runtime.app.request("/api/system/audit?operation=auth.login_failed&q=admin1", {
      headers: { cookie: admin.cookie }
    });
    const body = await readJsonObject(response);
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        items: [{ operation: "auth.login_failed", result: "failure", targetLabel: "admin1" }],
        summary: { total: 1, failure: 1 }
      }
    });
    expect(serialized).not.toContain("WrongPass!1");
    expect(serialized).not.toContain("bar_session");
    expect(serialized).not.toContain("bar_csrf");
  });

  it("records important mutations with filters and request IDs", async () => {
    const runtime = createRuntime();
    await seedUsers(runtime);
    const admin = await login(runtime, "admin1", "AdminPass!1");

    const created = await postJson(runtime.app, "/api/bars", { name: "Audit Bar", currency: "KRW" }, admin.cookie, admin.csrf);
    expect(created.status).toBe(201);

    const response = await runtime.app.request("/api/system/audit?operation=bar.created&q=%2Fbars", {
      headers: { cookie: admin.cookie }
    });
    const body = await readJsonObject(response);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        items: [{ operation: "bar.created", result: "success", actorUsername: "admin1" }],
        summary: { total: 1, success: 1 }
      }
    });
    expect((body.data as { items: Array<{ requestId: string }> }).items[0]?.requestId).toEqual(expect.any(String));
  });

  it("runs retention dry-run without deleting and execute deletes only eligible terminal data", async () => {
    const runtime = createRuntime();
    const { admin } = await seedUsers(runtime);
    const bar = await createBar(runtime, admin);
    const adminLogin = await login(runtime, "admin1", "AdminPass!1");

    await runtime.orderTabRepository.createOrderTab({
      id: "tab-old-closed",
      eventId: "event-old-closed",
      barId: bar.id,
      tableLabel: "T1",
      guestDescription: "",
      status: "closed",
      currency: "KRW",
      totalAmountMinor: 10000,
      activeItemCount: 1,
      createdByUserId: admin.id,
      now: "2024-06-22T00:00:00.000Z"
    });
    await runtime.orderTabRepository.createOrderTab({
      id: "tab-old-open",
      eventId: "event-old-open",
      barId: bar.id,
      tableLabel: "T2",
      guestDescription: "",
      status: "open",
      currency: "KRW",
      totalAmountMinor: 0,
      activeItemCount: 0,
      createdByUserId: admin.id,
      now: "2024-06-22T00:00:00.000Z"
    });
    await runtime.orderTabRepository.readDailyOrderSummary(bar.id, "2022-06-22", "KRW");

    const dryRun = await postJson(
      runtime.app,
      "/api/system/audit/maintenance-runs",
      { dryRun: true },
      adminLogin.cookie,
      adminLogin.csrf
    );
    const dryRunBody = await readJsonObject(dryRun);
    expect(dryRun.status).toBe(201);
    expect(dryRunBody).toMatchObject({
      data: {
        run: { status: "dry_run", dryRun: true },
        deleted: { closedCancelledOrderTabs: 1, dailyOrderSummaries: 1 }
      }
    });
    expect(await runtime.orderTabRepository.findOrderTabById(bar.id, "tab-old-closed")).not.toBeNull();

    const execute = await postJson(
      runtime.app,
      "/api/system/audit/maintenance-runs",
      { dryRun: false },
      adminLogin.cookie,
      adminLogin.csrf
    );
    const executeBody = await readJsonObject(execute);
    expect(execute.status).toBe(201);
    expect(executeBody).toMatchObject({
      data: {
        run: { status: "completed", dryRun: false },
        deleted: { closedCancelledOrderTabs: 1, dailyOrderSummaries: 1 }
      }
    });
    expect(await runtime.orderTabRepository.findOrderTabById(bar.id, "tab-old-closed")).toBeNull();
    expect(await runtime.orderTabRepository.findOrderTabById(bar.id, "tab-old-open")).not.toBeNull();

    const audit = await runtime.app.request("/api/system/audit?operation=maintenance.retention", {
      headers: { cookie: adminLogin.cookie }
    });
    const auditBody = await readJsonObject(audit);
    const auditItems = (auditBody.data as { items: Array<{ operation: string; result: string; targetLabel: string }> }).items;
    expect(auditItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: "maintenance.retention", result: "success", targetLabel: "보관 작업 실행" })
      ])
    );
  });
});
