import { describe, expect, it, vi } from "vitest";
import { createGitHubContentsPublicationAdapter } from "../../server/integrations/publicationAdapters";
import { createPublicationRuntime } from "../../server/publications/runtime";

describe("publication GitHub adapters", () => {
  it("uses the GitHub Contents API for public menu writes", async () => {
    const fetcher = vi.fn(async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (init?.method === "GET") return new Response("{}", { status: 404 });
      return new Response(
        JSON.stringify({
          content: { sha: "file-sha-1" },
          commit: { sha: "commit-sha-1" }
        }),
        { status: 201, headers: { "content-type": "application/json" } }
      );
    });
    const adapter = createGitHubContentsPublicationAdapter({
      owner: "ryuhojin",
      repo: "thebars",
      branch: "main",
      token: "secret-token",
      fetcher: fetcher as typeof fetch
    });

    await expect(adapter.readFile("public/menus/new-bar.json")).resolves.toBeNull();
    const result = await adapter.writeFile({
      operation: "menu_json",
      path: "public/menus/new-bar.json",
      content: JSON.stringify({ name: "BAR RO" }),
      expectedSha: null,
      message: "Publish BAR RO"
    });

    expect(result).toMatchObject({
      adapter: "github",
      commitSha: "commit-sha-1",
      fileSha: "file-sha-1",
      skippedExternalWrite: false
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, request] = fetcher.mock.calls[1] ?? [];
    expect(url).toBe("https://api.github.com/repos/ryuhojin/thebars/contents/public/menus/new-bar.json");
    expect(request?.method).toBe("PUT");
    expect(request?.headers).toMatchObject({ authorization: "Bearer secret-token" });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      branch: "main",
      message: "Publish BAR RO"
    });
  });

  it("does not use a fake GitHub adapter for D1 runtimes without GitHub configuration", async () => {
    const runtime = createPublicationRuntime({ DB: {} as D1Database });

    await expect(
      runtime.githubAdapter.writeFile({
        operation: "menu_json",
        path: "public/menus/missing.json",
        content: "{}",
        expectedSha: null,
        message: "Publish"
      })
    ).rejects.toMatchObject({ code: "GITHUB_CONFIG_MISSING" });
  });
});
