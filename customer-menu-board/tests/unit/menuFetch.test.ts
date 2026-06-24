import { describe, expect, it, vi } from "vitest";
import { buildPublicMenuJsonUrl, fetchPublicMenu, PublicMenuFetchError } from "../../src/lib/menuFetch";

const validMenu = {
  schemaVersion: 1,
  status: "published",
  revision: 12,
  publishedAt: "2026-06-23T00:00:00.000Z",
  generatedAt: "2026-06-23T00:00:00.000Z",
  contentHash: "0000000000000000000000000000000000000000000000000000000000000000",
  encodedSlug: "YmFyLWE3azJtOQ",
  bar: {
    name: "Sample Bar",
    intro: "공개 메뉴",
    currency: "KRW",
    businessHours: [],
    links: []
  },
  categories: []
};

describe("customer public menu fetch", () => {
  it("requests only the static public JSON with cache and credential policy", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(validMenu), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const menu = await fetchPublicMenu("YmFyLWE3azJtOQ", "/menus");

    expect(menu.bar.name).toBe("Sample Bar");
    expect(fetchMock).toHaveBeenCalledWith("/menus/YmFyLWE3azJtOQ.json", {
      cache: "no-cache",
      credentials: "omit",
      headers: { accept: "application/json" }
    });
  });

  it("maps not found, incompatible schema, and malformed JSON separately", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("missing", { status: 404 })));
    await expect(fetchPublicMenu("missing", "/menus")).rejects.toMatchObject({ code: "MENU_NOT_FOUND" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...validMenu, schemaVersion: 2 }), { status: 200 })));
    await expect(fetchPublicMenu("YmFyLWE3azJtOQ", "/menus")).rejects.toMatchObject({ code: "MENU_SCHEMA_INCOMPATIBLE" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{", { status: 200 })));
    await expect(fetchPublicMenu("YmFyLWE3azJtOQ", "/menus")).rejects.toMatchObject({ code: "MENU_SCHEMA_INVALID" });
  });

  it("rejects admin API JSON sources", () => {
    expect(() => buildPublicMenuJsonUrl("YmFyLWE3azJtOQ", "/api/menus")).toThrow(PublicMenuFetchError);
  });

  it("keeps Cloudflare Pages JSON misses from falling through to the SPA shell", async () => {
    const staticRoutingFiles = import.meta.glob("../../public/{_redirects,menus/404.html}", {
      eager: true,
      import: "default",
      query: "?raw"
    });
    const matchedFiles = Object.keys(staticRoutingFiles);

    expect(matchedFiles.some((path) => path.endsWith("/_redirects"))).toBe(false);
    expect(matchedFiles.some((path) => path.endsWith("/menus/404.html"))).toBe(true);
  });
});
