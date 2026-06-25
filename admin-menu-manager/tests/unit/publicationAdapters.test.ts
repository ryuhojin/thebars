import { describe, expect, it, vi } from "vitest";
import {
  createCloudflarePagesDeploymentAdapter,
  createGitHubContentsPublicationAdapter
} from "../../server/integrations/publicationAdapters";
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
      content: "eyJuYW1lIjoiQkFSIFJPIn0=",
      message: "Publish BAR RO"
    });
  });

  it("writes to a configured repository root and encodes Korean JSON safely", async () => {
    const fetcher = vi.fn(async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (init?.method === "GET") return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ content: { sha: "file-sha-2" }, commit: { sha: "commit-sha-2" } }), {
        status: 201,
        headers: { "content-type": "application/json" }
      });
    });
    const adapter = createGitHubContentsPublicationAdapter({
      owner: "ryuhojin",
      repo: "thebars",
      branch: "main",
      rootDirectory: "customer-menu-board",
      token: "secret-token",
      fetcher: fetcher as typeof fetch
    });

    await adapter.writeFile({
      operation: "menu_json",
      path: "public/menus/bar-ro.json",
      content: JSON.stringify({ name: "바 로" }),
      expectedSha: null,
      message: "Publish BAR RO"
    });

    const [url, request] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("https://api.github.com/repos/ryuhojin/thebars/contents/customer-menu-board/public/menus/bar-ro.json");
    expect(JSON.parse(String(request?.body))).toMatchObject({
      content: "eyJuYW1lIjoi67CUIOuhnCJ9"
    });
  });

  it("calls the native fetch through globalThis for Workers runtime binding", async () => {
    const originalFetch = globalThis.fetch;
    const workerFetch = vi.fn(function (this: typeof globalThis, _url: RequestInfo | URL, init?: RequestInit) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      expect(init?.method).toBe("PUT");
      return Promise.resolve(
        new Response(JSON.stringify({ content: { sha: "file-sha-3" }, commit: { sha: "commit-sha-3" } }), {
          status: 201,
          headers: { "content-type": "application/json" }
        })
      );
    });
    vi.stubGlobal("fetch", workerFetch);
    try {
      const adapter = createGitHubContentsPublicationAdapter({
        owner: "ryuhojin",
        repo: "thebars",
        branch: "main",
        rootDirectory: "customer-menu-board",
        token: "secret-token"
      });

      const result = await adapter.writeFile({
        operation: "menu_json",
        path: "public/menus/bar-ro.json",
        content: "{}",
        expectedSha: null,
        message: "Publish BAR RO"
      });

      expect(result.commitSha).toBe("commit-sha-3");
      expect(workerFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
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

describe("publication Cloudflare Pages adapters", () => {
  it("triggers a customer Pages build and maps deployments by source commit", async () => {
    const fetcher = vi.fn(async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ success: true, result: { id: "deployment-triggered" } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(
        JSON.stringify({
          success: true,
          result: [
            {
              id: "deployment-1",
              url: "https://deployment-1.thebars.pages.dev",
              created_on: "2026-06-25T01:20:00.000Z",
              modified_on: "2026-06-25T01:21:00.000Z",
              latest_stage: { status: "success", ended_on: "2026-06-25T01:21:00.000Z" },
              deployment_trigger: { metadata: { commit_hash: "commit-sha-1" } }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    const adapter = createCloudflarePagesDeploymentAdapter({
      accountId: "account-id",
      projectName: "thebars",
      token: "secret-token",
      fetcher: fetcher as typeof fetch
    });

    await adapter.observeCommit({
      encodedSlug: "YmFyLWtyYTQ1bQ",
      commitSha: "commit-sha-1",
      publicationId: "publication-1"
    });
    const deployments = await adapter.listRecentDeployments();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.cloudflare.com/client/v4/accounts/account-id/pages/projects/thebars/deployments");
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: "Bearer secret-token" });
    expect(deployments).toEqual([
      {
        adapter: "cloudflare-pages",
        deploymentId: "deployment-1",
        encodedSlug: "thebars",
        status: "success",
        sourceCommitSha: "commit-sha-1",
        deploymentUrl: "https://deployment-1.thebars.pages.dev",
        createdAt: "2026-06-25T01:20:00.000Z",
        updatedAt: "2026-06-25T01:21:00.000Z",
        skippedExternalRead: false
      }
    ]);
  });

  it("calls Cloudflare fetch through globalThis for Workers runtime binding", async () => {
    const originalFetch = globalThis.fetch;
    const workerFetch = vi.fn(function (this: typeof globalThis, _url: RequestInfo | URL, init?: RequestInit) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      expect(init?.method).toBe("POST");
      return Promise.resolve(new Response(JSON.stringify({ success: true, result: { id: "deployment-2" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      }));
    });
    vi.stubGlobal("fetch", workerFetch);
    try {
      const adapter = createCloudflarePagesDeploymentAdapter({
        accountId: "account-id",
        projectName: "thebars",
        token: "secret-token"
      });

      await adapter.observeCommit({
        encodedSlug: "YmFyLWtyYTQ1bQ",
        commitSha: "commit-sha-2",
        publicationId: "publication-2"
      });

      expect(workerFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("does not use a fake Cloudflare adapter for D1 runtimes without Cloudflare configuration", async () => {
    const runtime = createPublicationRuntime({
      DB: {} as D1Database,
      CUSTOMER_REPO_OWNER: "ryuhojin",
      CUSTOMER_REPO_NAME: "thebars",
      GITHUB_FINE_GRAINED_PAT: "secret-token"
    });

    await expect(
      runtime.cloudflareAdapter.observeCommit({
        encodedSlug: "YmFyLWtyYTQ1bQ",
        commitSha: "commit-sha-3",
        publicationId: "publication-3"
      })
    ).rejects.toMatchObject({ code: "CLOUDFLARE_CONFIG_MISSING" });
  });
});
