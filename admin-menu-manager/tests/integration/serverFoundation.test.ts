import { describe, expect, it } from "vitest";
import { createAdminApi } from "../../server/app";
import { FoundationRepository, type D1LikeDatabase } from "../../server/repositories/foundationRepository";

type JsonObject = Record<string, unknown>;

async function readJsonObject(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

describe("admin API foundation", () => {
  it("returns request ID and security headers", async () => {
    const app = createAdminApi();
    const response = await app.request("/api/health", {
      headers: { "x-request-id": "req_foundation" }
    });
    const body = await readJsonObject(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("req_foundation");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(body).toMatchObject({
      data: { status: "ok", service: "admin-menu-manager" },
      meta: { requestId: "req_foundation" }
    });
  });

  it("reports missing D1 binding without pretending production connectivity", async () => {
    const app = createAdminApi();
    const response = await app.request("/api/d00/foundation", {
      headers: { "x-request-id": "req_d00" }
    });
    const body = await readJsonObject(response);
    const data = body.data as { d1: string; adapters: { github: string; cloudflare: string } };

    expect(response.status).toBe(200);
    expect(data.d1).toBe("missing-binding");
    expect(data.adapters.github).toBe("fake-interface-only");
    expect(data.adapters.cloudflare).toBe("fake-interface-only");
  });

  it("runs the D1 smoke query against a local D1-shaped binding", async () => {
    const fakeDb: D1LikeDatabase = {
      prepare() {
        return {
          async first<T>() {
            return { ok: 1 } as T;
          }
        };
      }
    };
    const repository = new FoundationRepository(fakeDb);

    await expect(repository.runSmokeQuery()).resolves.toBe("available");
  });

  it("validates D01 auth endpoint input through the shared envelope", async () => {
    const app = createAdminApi();
    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "x-request-id": "req_no_d01" }
    });
    const body = await readJsonObject(response);
    const error = body.error as { code: string };

    expect(response.status).toBe(400);
    expect(error.code).toBe("INPUT_INVALID");
  });
});
