import { describe, expect, it } from "vitest";
import { createAdminApi } from "../../server/app";
import { AuthService } from "../../server/auth/authService";
import { MemoryAuthRepository } from "../../server/auth/memoryAuthRepository";
import { FastTestPasswordHasher } from "../../server/auth/passwordHasher";
import { MemoryBadgeRepository } from "../../server/badges/memoryBadgeRepository";
import { MemoryBarRepository } from "../../server/bars/memoryBarRepository";
import { MemoryCategoryRepository } from "../../server/categories/memoryCategoryRepository";
import {
  createFakeCloudflareDeploymentAdapter,
  createFakeGitHubPublicationAdapter,
  type FakeCloudflareDeploymentAdapter,
  type FakeGitHubPublicationAdapter
} from "../../server/integrations/publicationAdapters";
import { MemoryItemTypeRepository } from "../../server/item-types/memoryItemTypeRepository";
import { MemoryMembershipRepository } from "../../server/memberships/memoryMembershipRepository";
import { MemoryMenuItemRepository } from "../../server/menu-items/memoryMenuItemRepository";
import { MemoryPublicationRepository } from "../../server/publications/memoryPublicationRepository";
import { MemoryRateLimitRepository } from "../../server/rate-limits/memoryRateLimitRepository";
import type { RateLimitConfig } from "../../server/rate-limits/rateLimitService";
import type { PublicationMenuBuilder } from "../../server/publications/publicationService";
import type { PublishCurrentMenuResponse } from "../../contracts/publications";

const config = {
  setupToken: "setup-token",
  recoveryToken: "recovery-token"
};

type PublicationRuntime = {
  app: ReturnType<typeof createAdminApi>;
  service: AuthService;
  github: FakeGitHubPublicationAdapter;
  cloudflare: FakeCloudflareDeploymentAdapter;
  publicationRepository: MemoryPublicationRepository;
};

type JsonObject = Record<string, unknown>;

function createRuntime(options: {
  slugs?: string[];
  githubDelayMs?: number;
  menuBuilder?: PublicationMenuBuilder;
  rateLimitConfig?: RateLimitConfig;
  now?: () => Date;
} = {}): PublicationRuntime {
  const authRepository = new MemoryAuthRepository();
  const barRepository = new MemoryBarRepository();
  const categoryRepository = new MemoryCategoryRepository();
  const itemTypeRepository = new MemoryItemTypeRepository();
  const badgeRepository = new MemoryBadgeRepository();
  const menuItemRepository = new MemoryMenuItemRepository(categoryRepository, itemTypeRepository, badgeRepository);
  const membershipRepository = new MemoryMembershipRepository();
  const publicationRepository = new MemoryPublicationRepository();
  const rateLimitRepository = new MemoryRateLimitRepository();
  const github = createFakeGitHubPublicationAdapter({ writeDelayMs: options.githubDelayMs ?? 0 });
  const cloudflare = createFakeCloudflareDeploymentAdapter();
  const hasher = new FastTestPasswordHasher();
  let slugIndex = 0;
  const slugs = options.slugs ?? ["bar-a7k2m9", "bar-z9q8w7", "bar-m4n5p6"];
  const now = options.now ?? (() => new Date("2026-06-23T00:00:00.000Z"));
  const service = new AuthService(authRepository, {
    passwordHasher: hasher,
    config,
    now
  });
  return {
    app: createAdminApi({
      repository: authRepository,
      barRepository,
      categoryRepository,
      itemTypeRepository,
      badgeRepository,
      menuItemRepository,
      membershipRepository,
      publicationRepository,
      rateLimitRepository,
      rateLimitConfig: options.rateLimitConfig,
      githubPublicationAdapter: github,
      cloudflareDeploymentAdapter: cloudflare,
      publicationMenuBuilder: options.menuBuilder,
      passwordHasher: hasher,
      config,
      now,
      barSlugGenerator: () => slugs[Math.min(slugIndex++, slugs.length - 1)] ?? "bar-a7k2m9"
    }),
    service,
    github,
    cloudflare,
    publicationRepository
  };
}

async function readJsonObject(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function postJson(app: PublicationRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function patchJson(app: PublicationRuntime["app"], path: string, body: unknown, cookie = "", csrf = "") {
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

async function login(runtime: PublicationRuntime, username: string, password: string) {
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

async function seedUser(runtime: PublicationRuntime, username: string, options: { isSystemAdmin?: boolean } = {}) {
  return runtime.service.createSeedUser({
    username,
    password: username === "admin1" ? "AdminPass!1" : "StaffPass!1",
    isSystemAdmin: options.isSystemAdmin ?? false,
    forcedPasswordChange: false
  });
}

async function createBar(runtime: PublicationRuntime, cookie: string, csrf: string, name = "Publish Bar") {
  const response = await postJson(runtime.app, "/api/bars", { name, currency: "KRW" }, cookie, csrf);
  const body = await readJsonObject(response);
  expect(response.status).toBe(201);
  return body.data as { id: string; name: string; encodedSlug: string };
}

async function seedPublishableBar(runtime: PublicationRuntime, options: { name?: string } = {}) {
  await seedUser(runtime, "admin1", { isSystemAdmin: true });
  const staffUser = await seedUser(runtime, "staff1");
  await seedUser(runtime, "other1");
  const admin = await login(runtime, "admin1", "AdminPass!1");
  const bar = await createBar(runtime, admin.cookie, admin.csrf, options.name ?? "Publish Bar");
  const otherBar = await createBar(runtime, admin.cookie, admin.csrf, `${options.name ?? "Publish Bar"} Other`);
  await postJson(runtime.app, `/api/bars/${bar.id}/members`, { userId: staffUser.id, role: "staff" }, admin.cookie, admin.csrf);
  const staff = await login(runtime, "staff1", "StaffPass!1");
  const category = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, "추천");
  await createMenuItem(runtime, bar.id, category.id, admin.cookie, admin.csrf, "맥캘란 12");
  return { admin, staff, bar, otherBar };
}

async function createCategory(runtime: PublicationRuntime, barId: string, cookie: string, csrf: string, name: string) {
  const response = await postJson(runtime.app, `/api/bars/${barId}/categories`, { name }, cookie, csrf);
  const body = await readJsonObject(response);
  expect(response.status).toBe(201);
  const category = (body.data as { categories: Array<{ id: string; name: string }> }).categories.find((item) => item.name === name);
  if (!category) throw new Error(`category missing: ${name}`);
  return category;
}

async function createMenuItem(
  runtime: PublicationRuntime,
  barId: string,
  categoryId: string,
  cookie: string,
  csrf: string,
  name: string
) {
  const response = await postJson(
    runtime.app,
    `/api/bars/${barId}/menu-items`,
    {
      categoryId,
      name,
      description: "셰리 오크",
      itemType: { source: "system", id: "system-type-whisky" },
      prices: [{ label: "샷", volumeText: "30ml", amountMinor: 18000 }],
      internalMemo: "public 제외"
    },
    cookie,
    csrf
  );
  const body = await readJsonObject(response);
  expect(response.status).toBe(201);
  return (body.data as { item: { id: string } }).item;
}

describe("D15 publications API", () => {
  it("requires auth, csrf, and publish permission without leaking tenant bars", async () => {
    const runtime = createRuntime();
    const { bar, otherBar, staff } = await seedPublishableBar(runtime);

    const unauthenticated = await postJson(runtime.app, `/api/bars/${bar.id}/publications`, { confirmSavedOnly: true });
    expect(unauthenticated.status).toBe(401);
    expect(await readJsonObject(unauthenticated)).toMatchObject({ error: { code: "AUTH_REQUIRED" } });

    const missingCsrf = await postJson(runtime.app, `/api/bars/${bar.id}/publications`, { confirmSavedOnly: true }, staff.cookie);
    expect(missingCsrf.status).toBe(403);
    expect(await readJsonObject(missingCsrf)).toMatchObject({ error: { code: "CSRF_REQUIRED" } });

    const forbidden = await postJson(runtime.app, `/api/bars/${bar.id}/publications`, { confirmSavedOnly: true }, staff.cookie, staff.csrf);
    expect(forbidden.status).toBe(403);
    expect(await readJsonObject(forbidden)).toMatchObject({ error: { code: "PUBLICATION_PERMISSION_REQUIRED" } });

    const otherTenant = await runtime.app.request(`/api/bars/${otherBar.id}/publications`, { headers: { cookie: staff.cookie } });
    expect(otherTenant.status).toBe(404);
    expect(await readJsonObject(otherTenant)).toMatchObject({ error: { code: "BAR_NOT_FOUND" } });
  });

  it("rate limits publish requests before external repository writes", async () => {
    const runtime = createRuntime({
      rateLimitConfig: {
        scopes: {
          "publication.publish": { maxAttempts: 1, windowMs: 60_000 }
        }
      }
    });
    const { bar, admin } = await seedPublishableBar(runtime);

    const firstPublish = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/publications`,
      { confirmSavedOnly: true },
      admin.cookie,
      admin.csrf
    );
    expect(firstPublish.status).toBe(201);
    expect(runtime.github.commits).toHaveLength(1);

    const limitedPublish = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/publications`,
      { confirmSavedOnly: true },
      admin.cookie,
      admin.csrf
    );
    expect(limitedPublish.status).toBe(429);
    expect(await readJsonObject(limitedPublish)).toMatchObject({
      error: { code: "RATE_LIMITED", details: { scope: "publication.publish" } }
    });
    expect(runtime.github.commits).toHaveLength(1);
  });

  it("validates request body before publishing", async () => {
    const runtime = createRuntime();
    const { bar, admin } = await seedPublishableBar(runtime);

    const response = await postJson(runtime.app, `/api/bars/${bar.id}/publications`, {}, admin.cookie, admin.csrf);
    const invalidConcept = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/publications`,
      { confirmSavedOnly: true, layoutConcept: "admin_console" },
      admin.cookie,
      admin.csrf
    );

    expect(response.status).toBe(400);
    expect(await readJsonObject(response)).toMatchObject({ error: { code: "INPUT_INVALID" } });
    expect(invalidConcept.status).toBe(400);
    expect(await readJsonObject(invalidConcept)).toMatchObject({ error: { code: "INPUT_INVALID" } });
    expect(runtime.github.commits).toHaveLength(0);
  });

  it("commits schema-valid menu JSON with the selected customer concept and excludes private fields", async () => {
    const runtime = createRuntime();
    const { bar, admin } = await seedPublishableBar(runtime);

    const response = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/publications`,
      { confirmSavedOnly: true, layoutConcept: "menu_book" },
      admin.cookie,
      admin.csrf
    );
    const body = (await readJsonObject(response)).data as PublishCurrentMenuResponse;

    expect(response.status).toBe(201);
    expect(body.publication).toMatchObject({
      status: "success",
      operation: "menu_json",
      revision: 1,
      menuPath: `public/menus/${bar.encodedSlug}.json`
    });
    expect(body.commit).toMatchObject({
      operation: "menu_json",
      path: `public/menus/${bar.encodedSlug}.json`,
      message: "Publish public menu",
      skippedExternalWrite: true
    });
    expect(body.deployment).toMatchObject({
      status: "success",
      sourceCommitSha: body.commit.commitSha,
      skippedExternalRead: true
    });
    expect(runtime.github.commits).toHaveLength(1);
    const file = await runtime.github.readFile(`public/menus/${bar.encodedSlug}.json`);
    expect(JSON.parse(file?.content ?? "{}")).toMatchObject({ layout: { concept: "menu_book" } });
    expect(file?.content).toContain("\"status\":\"published\"");
    expect(file?.content).toContain("\"revision\":1");
    expect(file?.content).not.toMatch(/internalMemo|public 제외|userId|barId|token|password/);
  });

  it("uses trigger file for same-content republish without changing revision or publishedAt", async () => {
    const runtime = createRuntime();
    const { bar, admin } = await seedPublishableBar(runtime);

    const firstResponse = await postJson(runtime.app, `/api/bars/${bar.id}/publications`, { confirmSavedOnly: true }, admin.cookie, admin.csrf);
    const first = (await readJsonObject(firstResponse)).data as PublishCurrentMenuResponse;
    const secondResponse = await postJson(runtime.app, `/api/bars/${bar.id}/publications`, { confirmSavedOnly: true }, admin.cookie, admin.csrf);
    const second = (await readJsonObject(secondResponse)).data as PublishCurrentMenuResponse;

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(second.publication.operation).toBe("trigger");
    expect(second.publication.revision).toBe(first.publication.revision);
    expect(second.publication.publishedAt).toBe(first.publication.publishedAt);
    expect(second.commit.path).toBe(`public/publish-triggers/${bar.encodedSlug}.json`);
    expect(runtime.github.commits.map((commit) => commit.operation)).toEqual(["menu_json", "trigger"]);
  });

  it("rejects inactive customer concepts instead of publishing removed designs", async () => {
    const runtime = createRuntime();
    const { bar, admin } = await seedPublishableBar(runtime);

    const firstResponse = await postJson(runtime.app, `/api/bars/${bar.id}/publications`, { confirmSavedOnly: true }, admin.cookie, admin.csrf);
    const first = (await readJsonObject(firstResponse)).data as PublishCurrentMenuResponse;
    const secondResponse = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/publications`,
      { confirmSavedOnly: true, layoutConcept: "curation" },
      admin.cookie,
      admin.csrf
    );

    expect(first.publication.operation).toBe("menu_json");
    expect(secondResponse.status).toBe(400);
    expect(await readJsonObject(secondResponse)).toMatchObject({ error: { code: "INPUT_INVALID" } });
    const file = await runtime.github.readFile(`public/menus/${bar.encodedSlug}.json`);
    expect(JSON.parse(file?.content ?? "{}")).toMatchObject({ layout: { concept: "menu_book" } });
    expect(runtime.github.commits).toHaveLength(1);
  });

  it("does not commit when public schema validation fails", async () => {
    const invalidBuilder: PublicationMenuBuilder = async () =>
      ({
        bar: { id: "bar-invalid", name: "Invalid", encodedSlug: "bar-a7k2m9", customerPath: "/bar-a7k2m9" },
        menu: {
          schemaVersion: 1,
          status: "published",
          revision: 0,
          publishedAt: null,
          generatedAt: "2026-06-23T00:00:00.000Z",
          contentHash: "0".repeat(64),
          encodedSlug: "bar-a7k2m9",
          bar: { name: "", currency: "KRW", businessHours: [], links: [] },
          categories: []
        },
        scopeOptions: [],
        schema: { valid: true, schemaVersion: 1 },
        hash: { contentHash: "0".repeat(64), canonicalJson: "{}" }
      }) as never;
    const runtime = createRuntime({ menuBuilder: invalidBuilder });
    const { bar, admin } = await seedPublishableBar(runtime);

    const response = await postJson(runtime.app, `/api/bars/${bar.id}/publications`, { confirmSavedOnly: true }, admin.cookie, admin.csrf);

    expect(response.status).toBe(422);
    expect(await readJsonObject(response)).toMatchObject({ error: { code: "PUBLIC_SCHEMA_INVALID" } });
    expect(runtime.github.commits).toHaveLength(0);
  });

  it("serializes commits through the customer repository lock", async () => {
    const runtime = createRuntime({ githubDelayMs: 80 });
    await seedUser(runtime, "admin1", { isSystemAdmin: true });
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const firstBar = await createBar(runtime, admin.cookie, admin.csrf, "First");
    const secondBar = await createBar(runtime, admin.cookie, admin.csrf, "Second");
    const firstCategory = await createCategory(runtime, firstBar.id, admin.cookie, admin.csrf, "추천");
    const secondCategory = await createCategory(runtime, secondBar.id, admin.cookie, admin.csrf, "추천");
    await createMenuItem(runtime, firstBar.id, firstCategory.id, admin.cookie, admin.csrf, "맥캘란 12");
    await createMenuItem(runtime, secondBar.id, secondCategory.id, admin.cookie, admin.csrf, "하우스 하이볼");

    const [first, second] = await Promise.all([
      postJson(runtime.app, `/api/bars/${firstBar.id}/publications`, { confirmSavedOnly: true }, admin.cookie, admin.csrf),
      postJson(runtime.app, `/api/bars/${secondBar.id}/publications`, { confirmSavedOnly: true }, admin.cookie, admin.csrf)
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(runtime.github.commits).toHaveLength(2);
    expect(runtime.github.commits.map((commit) => commit.commitSha)).toEqual([
      expect.stringMatching(/^fake-commit-0001-/),
      expect.stringMatching(/^fake-commit-0002-/)
    ]);
  });

  it("does not mark an unrelated Cloudflare deployment as success for the target commit", async () => {
    const runtime = createRuntime();
    runtime.cloudflare.addUnrelatedDeployment("fake-commit-unrelated", "success");
    runtime.cloudflare.planNextDeployment(["queued", "queued"]);
    const { bar, admin } = await seedPublishableBar(runtime);

    const response = await postJson(runtime.app, `/api/bars/${bar.id}/publications`, { confirmSavedOnly: true }, admin.cookie, admin.csrf);
    const body = (await readJsonObject(response)).data as PublishCurrentMenuResponse;

    expect(response.status).toBe(201);
    expect(body.publication.status).toBe("waiting_cloudflare");
    expect(body.publication.deployment).toMatchObject({
      status: "queued",
      sourceCommitSha: body.commit.commitSha
    });

    const listResponse = await runtime.app.request(`/api/bars/${bar.id}/publications`, { headers: { cookie: admin.cookie } });
    const listBody = await readJsonObject(listResponse);
    expect(listResponse.status).toBe(200);
    expect(listBody).toMatchObject({
      data: {
        polling: { active: true, intervalMs: 30000, timeoutSeconds: 180 },
        publications: [{ status: "waiting_cloudflare" }]
      }
    });
  });

  it("polls Cloudflare deployments by commit SHA until success", async () => {
    const runtime = createRuntime();
    runtime.cloudflare.planNextDeployment(["queued", "building", "success"]);
    const { bar, admin } = await seedPublishableBar(runtime);

    const response = await postJson(runtime.app, `/api/bars/${bar.id}/publications`, { confirmSavedOnly: true }, admin.cookie, admin.csrf);
    const created = (await readJsonObject(response)).data as PublishCurrentMenuResponse;
    expect(created.publication.status).toBe("waiting_cloudflare");
    expect(created.publication.deployment?.status).toBe("queued");

    const buildingResponse = await runtime.app.request(`/api/bars/${bar.id}/publications`, { headers: { cookie: admin.cookie } });
    const building = (await readJsonObject(buildingResponse)).data as { publications: Array<PublishCurrentMenuResponse["publication"]> };
    expect(building.publications[0]?.status).toBe("waiting_cloudflare");
    expect(building.publications[0]?.deployment?.status).toBe("building");

    const successResponse = await runtime.app.request(`/api/bars/${bar.id}/publications`, { headers: { cookie: admin.cookie } });
    const success = (await readJsonObject(successResponse)).data as { publications: Array<PublishCurrentMenuResponse["publication"]>; polling: { active: boolean } };
    expect(success.publications[0]).toMatchObject({
      status: "success",
      deployment: { status: "success", sourceCommitSha: created.commit.commitSha }
    });
    expect(success.polling.active).toBe(false);
  });

  it("marks waiting deployments as timeout_unknown after 3 minutes", async () => {
    let currentTime = Date.parse("2026-06-23T00:00:00.000Z");
    const runtime = createRuntime({ now: () => new Date(currentTime) });
    runtime.cloudflare.planNextDeployment(["queued", "queued", "queued"]);
    const { bar, admin } = await seedPublishableBar(runtime);

    const response = await postJson(runtime.app, `/api/bars/${bar.id}/publications`, { confirmSavedOnly: true }, admin.cookie, admin.csrf);
    const created = (await readJsonObject(response)).data as PublishCurrentMenuResponse;
    expect(created.publication.status).toBe("waiting_cloudflare");

    currentTime += 181_000;
    const timeoutResponse = await runtime.app.request(`/api/bars/${bar.id}/publications`, { headers: { cookie: admin.cookie } });
    const timeout = (await readJsonObject(timeoutResponse)).data as { publications: Array<PublishCurrentMenuResponse["publication"]> };
    expect(timeout.publications[0]).toMatchObject({
      status: "timeout_unknown",
      deployment: { status: "timeout_unknown" },
      error: { code: "CLOUDFLARE_TIMEOUT_UNKNOWN" }
    });
  });

  it("keeps only the latest 100 successful and latest 100 failed publication rows per bar", async () => {
    const repository = new MemoryPublicationRepository();
    const barId = "bar-retention";
    for (let index = 0; index < 105; index += 1) {
      const id = `success-${index}`;
      await repository.createPublication({
        id,
        barId,
        revision: index + 1,
        contentHash: `${index % 10}`.repeat(64),
        menuPath: "public/menus/YmFyLWE3azJtOQ.json",
        triggerPath: "public/publish-triggers/YmFyLWE3azJtOQ.json",
        actorUserId: "admin",
        createdAt: new Date(Date.UTC(2026, 5, 23, 0, index)).toISOString()
      });
      await repository.createSnapshot({
        id: `snapshot-${index}`,
        publicationId: id,
        barId,
        revision: index + 1,
        contentHash: `${index % 10}`.repeat(64),
        publicJson: "{}",
        menuPath: "public/menus/YmFyLWE3azJtOQ.json",
        commitSha: `commit-${index}`,
        publishedAt: new Date(Date.UTC(2026, 5, 23, 0, index)).toISOString(),
        createdAt: new Date(Date.UTC(2026, 5, 23, 0, index)).toISOString()
      });
      await repository.updatePublication({
        id,
        status: "success",
        commitSha: `commit-${index}`,
        completedAt: new Date(Date.UTC(2026, 5, 23, 0, index)).toISOString()
      });
    }
    for (let index = 0; index < 105; index += 1) {
      const id = `failed-${index}`;
      await repository.createPublication({
        id,
        barId,
        revision: index + 1,
        contentHash: `${(index + 1) % 10}`.repeat(64),
        menuPath: "public/menus/YmFyLWE3azJtOQ.json",
        triggerPath: "public/publish-triggers/YmFyLWE3azJtOQ.json",
        actorUserId: "admin",
        createdAt: new Date(Date.UTC(2026, 5, 24, 0, index)).toISOString()
      });
      await repository.updatePublication({
        id,
        status: index % 2 === 0 ? "failed" : "timeout_unknown",
        errorCode: "CLOUDFLARE_DEPLOYMENT_FAILED",
        errorMessage: "failed",
        completedAt: new Date(Date.UTC(2026, 5, 24, 0, index)).toISOString()
      });
    }

    await repository.prunePublicationHistory(barId, 100, 100);

    const rows = await repository.listPublications(barId, 250);
    expect(rows.filter((publication) => publication.status === "success")).toHaveLength(100);
    expect(rows.filter((publication) => ["failed", "timeout_unknown"].includes(publication.status))).toHaveLength(100);
    expect(await repository.findPublicationById("success-0")).toBeNull();
    expect(await repository.findPublicationById("failed-0")).toBeNull();
    expect(await repository.findLatestSuccessfulSnapshot(barId)).toMatchObject({ publicationId: "success-104" });
  });
});

describe("D17 publication recovery and bar lifecycle", () => {
  it("republishes a historical snapshot without changing current edit data", async () => {
    const runtime = createRuntime();
    const { bar, admin } = await seedPublishableBar(runtime);

    const firstResponse = await postJson(runtime.app, `/api/bars/${bar.id}/publications`, { confirmSavedOnly: true }, admin.cookie, admin.csrf);
    const first = (await readJsonObject(firstResponse)).data as PublishCurrentMenuResponse;
    const category = await createCategory(runtime, bar.id, admin.cookie, admin.csrf, "클래식");
    await createMenuItem(runtime, bar.id, category.id, admin.cookie, admin.csrf, "올드 패션드");

    const previewBefore = await runtime.app.request(`/api/bars/${bar.id}/preview`, { headers: { cookie: admin.cookie } });
    expect(await readJsonObject(previewBefore)).toMatchObject({
      data: { menu: { categories: expect.arrayContaining([expect.objectContaining({ name: "클래식" })]) } }
    });

    const republishResponse = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/publications/${first.publication.id}/republish`,
      { confirmCurrentEditUnchanged: true },
      admin.cookie,
      admin.csrf
    );
    const republished = (await readJsonObject(republishResponse)).data as PublishCurrentMenuResponse;

    expect(republishResponse.status).toBe(201);
    expect(republished.publication).toMatchObject({
      status: "success",
      operation: "snapshot_republish",
      revision: first.publication.revision,
      contentHash: first.publication.contentHash
    });
    const customerFile = await runtime.github.readFile(`public/menus/${bar.encodedSlug}.json`);
    expect(customerFile?.content).toContain("맥캘란 12");
    expect(customerFile?.content).not.toContain("올드 패션드");

    const previewAfter = await runtime.app.request(`/api/bars/${bar.id}/preview`, { headers: { cookie: admin.cookie } });
    expect(await readJsonObject(previewAfter)).toMatchObject({
      data: { menu: { categories: expect.arrayContaining([expect.objectContaining({ name: "클래식" })]) } }
    });
  });

  it("deactivates a bar by deleting customer JSON while preserving D1 history", async () => {
    const runtime = createRuntime();
    const { bar, admin, staff } = await seedPublishableBar(runtime);
    await postJson(runtime.app, `/api/bars/${bar.id}/publications`, { confirmSavedOnly: true }, admin.cookie, admin.csrf);
    expect(await runtime.github.readFile(`public/menus/${bar.encodedSlug}.json`)).not.toBeNull();

    const forbidden = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/lifecycle`,
      { action: "deactivate", confirmImpact: true },
      staff.cookie,
      staff.csrf
    );
    expect(forbidden.status).toBe(403);
    expect(await readJsonObject(forbidden)).toMatchObject({ error: { code: "SYSTEM_ADMIN_REQUIRED" } });

    const response = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/lifecycle`,
      { action: "deactivate", confirmImpact: true },
      admin.cookie,
      admin.csrf
    );
    const body = (await readJsonObject(response)).data as {
      bar: { status: string; publicMenuStatus: string; lifecycleEvents: Array<{ action: string }> };
      publication: { operation: string; status: string };
    };

    expect(response.status).toBe(200);
    expect(body.bar).toMatchObject({
      status: "inactive",
      publicMenuStatus: "preparing",
      lifecycleEvents: [expect.objectContaining({ action: "deactivate" })]
    });
    expect(body.publication).toMatchObject({ operation: "delete_menu_json", status: "success" });
    expect(await runtime.github.readFile(`public/menus/${bar.encodedSlug}.json`)).toBeNull();

    const list = await runtime.app.request(`/api/bars/${bar.id}/publications`, { headers: { cookie: admin.cookie } });
    expect(list.status).toBe(404);
  });

  it("reactivates without a successful snapshot by restoring preparing JSON", async () => {
    const runtime = createRuntime();
    await seedUser(runtime, "admin1", { isSystemAdmin: true });
    const admin = await login(runtime, "admin1", "AdminPass!1");
    const bar = await createBar(runtime, admin.cookie, admin.csrf, "Preparing Restore Bar");

    const deactivate = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/lifecycle`,
      { action: "deactivate", confirmImpact: true },
      admin.cookie,
      admin.csrf
    );
    expect(deactivate.status).toBe(200);
    const activate = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/lifecycle`,
      { action: "activate", confirmImpact: true },
      admin.cookie,
      admin.csrf
    );
    const activated = (await readJsonObject(activate)).data as {
      bar: { status: string; publicMenuStatus: string };
      publication: { operation: string; status: string };
    };

    expect(activate.status).toBe(200);
    expect(activated.bar).toMatchObject({ status: "active", publicMenuStatus: "preparing" });
    expect(activated.publication).toMatchObject({ operation: "restore_preparing", status: "success" });
    const file = await runtime.github.readFile(`public/menus/${bar.encodedSlug}.json`);
    expect(file?.content).toContain("\"status\":\"preparing\"");
    expect(file?.content).toContain("\"categories\":[]");
  });

  it("validates D17 mutation bodies and hides missing snapshots", async () => {
    const runtime = createRuntime();
    const { bar, admin } = await seedPublishableBar(runtime);

    const invalidLifecycle = await postJson(runtime.app, `/api/bars/${bar.id}/lifecycle`, {}, admin.cookie, admin.csrf);
    expect(invalidLifecycle.status).toBe(400);
    expect(await readJsonObject(invalidLifecycle)).toMatchObject({ error: { code: "INPUT_INVALID" } });

    const missingSnapshot = await postJson(
      runtime.app,
      `/api/bars/${bar.id}/publications/missing/republish`,
      { confirmCurrentEditUnchanged: true },
      admin.cookie,
      admin.csrf
    );
    expect(missingSnapshot.status).toBe(404);
    expect(await readJsonObject(missingSnapshot)).toMatchObject({ error: { code: "PUBLICATION_SNAPSHOT_NOT_FOUND" } });
  });
});
