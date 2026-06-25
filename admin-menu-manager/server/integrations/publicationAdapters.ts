import type { CloudflareDeploymentStatus } from "../../contracts/publications";

export type PublicationPayload = {
  encodedSlug: string;
  canonicalJson: string;
  canonicalHash: string;
};

export type PublicationFile = {
  path: string;
  sha: string;
  content: string;
};

export type PublicationCommitOperation =
  | "menu_json"
  | "trigger"
  | "snapshot_republish"
  | "delete_menu_json"
  | "restore_snapshot"
  | "restore_preparing";

export type PublicationWriteInput = {
  operation: PublicationCommitOperation;
  path: string;
  content: string;
  expectedSha: string | null;
  message: string;
};

export type PublicationWriteResult = {
  adapter: "fake-github" | "github";
  operation: PublicationCommitOperation;
  path: string;
  commitSha: string;
  fileSha: string;
  message: string;
  skippedExternalWrite: boolean;
};

export interface GitHubPublicationAdapter {
  readFile(path: string): Promise<PublicationFile | null>;
  writeFile(input: PublicationWriteInput): Promise<PublicationWriteResult>;
  deleteFile(input: Omit<PublicationWriteInput, "content">): Promise<PublicationWriteResult>;
  writePublicMenu(payload: PublicationPayload): Promise<PublicationWriteResult>;
}

export class GitHubPublicationAdapterError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export type FakeGitHubPublicationAdapterOptions = {
  writeDelayMs?: number;
};

export type GitHubContentsPublicationAdapterConfig = {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  rootDirectory?: string;
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
};

export class FakeGitHubPublicationAdapter implements GitHubPublicationAdapter {
  private readonly files = new Map<string, PublicationFile>();
  private readonly writeDelayMs: number;
  private counter = 0;
  private nextFailure: { code: string; message: string } | null = null;

  readonly commits: PublicationWriteResult[] = [];

  constructor(options: FakeGitHubPublicationAdapterOptions = {}) {
    this.writeDelayMs = options.writeDelayMs ?? 0;
  }

  reset(): void {
    this.files.clear();
    this.commits.length = 0;
    this.counter = 0;
    this.nextFailure = null;
  }

  failNextWrite(code = "GITHUB_WRITE_FAILED", message = "GitHub write failed"): void {
    this.nextFailure = { code, message };
  }

  async readFile(path: string): Promise<PublicationFile | null> {
    const file = this.files.get(path);
    return file ? { ...file } : null;
  }

  async writeFile(input: PublicationWriteInput): Promise<PublicationWriteResult> {
    if (this.writeDelayMs > 0) await delay(this.writeDelayMs);
    if (this.nextFailure) {
      const failure = this.nextFailure;
      this.nextFailure = null;
      throw new GitHubPublicationAdapterError(failure.code, failure.message);
    }
    const current = this.files.get(input.path);
    if ((current?.sha ?? null) !== input.expectedSha) {
      throw new GitHubPublicationAdapterError("GITHUB_FILE_SHA_CONFLICT", "GitHub file SHA changed.");
    }
    this.counter += 1;
    const fileSha = `fake-file-${this.counter}-${smallHash(input.content)}`;
    const commitSha = `fake-commit-${String(this.counter).padStart(4, "0")}-${smallHash(input.path + input.content)}`;
    const file = { path: input.path, sha: fileSha, content: input.content };
    this.files.set(input.path, file);
    const result: PublicationWriteResult = {
      adapter: "fake-github",
      operation: input.operation,
      path: input.path,
      commitSha,
      fileSha,
      message: input.message,
      skippedExternalWrite: true
    };
    this.commits.push(result);
    return { ...result };
  }

  async deleteFile(input: Omit<PublicationWriteInput, "content">): Promise<PublicationWriteResult> {
    if (this.writeDelayMs > 0) await delay(this.writeDelayMs);
    if (this.nextFailure) {
      const failure = this.nextFailure;
      this.nextFailure = null;
      throw new GitHubPublicationAdapterError(failure.code, failure.message);
    }
    const current = this.files.get(input.path);
    if ((current?.sha ?? null) !== input.expectedSha) {
      throw new GitHubPublicationAdapterError("GITHUB_FILE_SHA_CONFLICT", "GitHub file SHA changed.");
    }
    this.counter += 1;
    this.files.delete(input.path);
    const commitSha = `fake-commit-${String(this.counter).padStart(4, "0")}-${smallHash(input.path + input.operation)}`;
    const result: PublicationWriteResult = {
      adapter: "fake-github",
      operation: input.operation,
      path: input.path,
      commitSha,
      fileSha: "",
      message: input.message,
      skippedExternalWrite: true
    };
    this.commits.push(result);
    return { ...result };
  }

  async writePublicMenu(payload: PublicationPayload): Promise<PublicationWriteResult> {
    const path = `public/menus/${payload.encodedSlug}.json`;
    const current = await this.readFile(path);
    return this.writeFile({
      operation: "menu_json",
      path,
      content: payload.canonicalJson,
      expectedSha: current?.sha ?? null,
      message: "Publish public menu"
    });
  }
}

export class MissingGitHubPublicationAdapter implements GitHubPublicationAdapter {
  constructor(private readonly missingVariables: string[]) {}

  async readFile(): Promise<PublicationFile | null> {
    this.throwMissingConfig();
  }

  async writeFile(): Promise<PublicationWriteResult> {
    this.throwMissingConfig();
  }

  async deleteFile(): Promise<PublicationWriteResult> {
    this.throwMissingConfig();
  }

  async writePublicMenu(): Promise<PublicationWriteResult> {
    this.throwMissingConfig();
  }

  private throwMissingConfig(): never {
    throw new GitHubPublicationAdapterError(
      "GITHUB_CONFIG_MISSING",
      `GitHub publication is not configured: ${this.missingVariables.join(", ")}`
    );
  }
}

export class GitHubContentsPublicationAdapter implements GitHubPublicationAdapter {
  private readonly apiBaseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly config: GitHubContentsPublicationAdapterConfig) {
    this.apiBaseUrl = config.apiBaseUrl?.replace(/\/+$/, "") ?? "https://api.github.com";
    this.fetcher = config.fetcher ?? fetch;
  }

  async readFile(path: string): Promise<PublicationFile | null> {
    const response = await this.request(path, {
      method: "GET",
      query: { ref: this.config.branch }
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new GitHubPublicationAdapterError("GITHUB_READ_FAILED", `GitHub file read failed with status ${response.status}.`);
    }
    const body = await response.json() as GitHubContentResponse;
    if (body.type !== "file" || !body.sha || typeof body.content !== "string") {
      throw new GitHubPublicationAdapterError("GITHUB_READ_INVALID", "GitHub file response was invalid.");
    }
    return {
      path,
      sha: body.sha,
      content: decodeBase64(body.content)
    };
  }

  async writeFile(input: PublicationWriteInput): Promise<PublicationWriteResult> {
    const payload: GitHubWriteRequest = {
      message: input.message,
      content: encodeBase64(input.content),
      branch: this.config.branch
    };
    if (input.expectedSha) payload.sha = input.expectedSha;

    const response = await this.request(input.path, {
      method: "PUT",
      body: payload
    });
    if (response.status === 409) {
      throw new GitHubPublicationAdapterError("GITHUB_FILE_SHA_CONFLICT", "GitHub file SHA changed.");
    }
    if (!response.ok) {
      throw new GitHubPublicationAdapterError("GITHUB_WRITE_FAILED", `GitHub file write failed with status ${response.status}.`);
    }
    const body = await response.json() as GitHubWriteResponse;
    const commitSha = body.commit?.sha;
    const fileSha = body.content?.sha;
    if (!commitSha || !fileSha) {
      throw new GitHubPublicationAdapterError("GITHUB_WRITE_INVALID", "GitHub write response was invalid.");
    }
    return {
      adapter: "github",
      operation: input.operation,
      path: input.path,
      commitSha,
      fileSha,
      message: input.message,
      skippedExternalWrite: false
    };
  }

  async deleteFile(input: Omit<PublicationWriteInput, "content">): Promise<PublicationWriteResult> {
    if (!input.expectedSha) {
      return {
        adapter: "github",
        operation: input.operation,
        path: input.path,
        commitSha: `github-noop-${smallHash(input.path + input.message)}`,
        fileSha: "",
        message: input.message,
        skippedExternalWrite: true
      };
    }
    const response = await this.request(input.path, {
      method: "DELETE",
      body: {
        message: input.message,
        sha: input.expectedSha,
        branch: this.config.branch
      }
    });
    if (response.status === 409) {
      throw new GitHubPublicationAdapterError("GITHUB_FILE_SHA_CONFLICT", "GitHub file SHA changed.");
    }
    if (!response.ok) {
      throw new GitHubPublicationAdapterError("GITHUB_DELETE_FAILED", `GitHub file delete failed with status ${response.status}.`);
    }
    const body = await response.json() as GitHubDeleteResponse;
    const commitSha = body.commit?.sha;
    if (!commitSha) {
      throw new GitHubPublicationAdapterError("GITHUB_DELETE_INVALID", "GitHub delete response was invalid.");
    }
    return {
      adapter: "github",
      operation: input.operation,
      path: input.path,
      commitSha,
      fileSha: "",
      message: input.message,
      skippedExternalWrite: false
    };
  }

  async writePublicMenu(payload: PublicationPayload): Promise<PublicationWriteResult> {
    const path = `public/menus/${payload.encodedSlug}.json`;
    const current = await this.readFile(path);
    return this.writeFile({
      operation: "menu_json",
      path,
      content: payload.canonicalJson,
      expectedSha: current?.sha ?? null,
      message: "Publish public menu"
    });
  }

  private async request(
    path: string,
    options: {
      method: "GET" | "PUT" | "DELETE";
      query?: Record<string, string>;
      body?: unknown;
    }
  ): Promise<Response> {
    const githubPath = this.githubPath(path);
    const url = new URL(
      `${this.apiBaseUrl}/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repo)}/contents/${encodeGitHubPath(githubPath)}`
    );
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }
    try {
      return await this.fetcher(url.toString(), {
        method: options.method,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${this.config.token}`,
          "content-type": "application/json",
          "user-agent": "thebar-publication-service",
          "x-github-api-version": "2022-11-28"
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });
    } catch (error) {
      throw new GitHubPublicationAdapterError("GITHUB_REQUEST_FAILED", safeErrorMessage(error));
    }
  }

  private githubPath(path: string): string {
    const root = this.config.rootDirectory?.trim().replace(/^\/+|\/+$/g, "");
    return root ? `${root}/${path.replace(/^\/+/, "")}` : path;
  }
}

export type CloudflareDeploymentRecord = {
  adapter: "fake-cloudflare";
  deploymentId: string;
  encodedSlug: string;
  status: Exclude<CloudflareDeploymentStatus, "timeout_unknown">;
  sourceCommitSha: string;
  deploymentUrl: string;
  createdAt: string;
  updatedAt: string;
  skippedExternalRead: true;
};

export type CloudflareCommitObservation = {
  encodedSlug: string;
  commitSha: string;
  publicationId: string;
};

export interface CloudflareDeploymentAdapter {
  observeCommit(input: CloudflareCommitObservation): Promise<void>;
  listRecentDeployments(): Promise<CloudflareDeploymentRecord[]>;
}

export class CloudflareDeploymentAdapterError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export type FakeCloudflareDeploymentAdapterOptions = {
  readDelayMs?: number;
};

type FakeDeployment = CloudflareDeploymentRecord & {
  sequence: Array<Exclude<CloudflareDeploymentStatus, "timeout_unknown">>;
  index: number;
};

export class FakeCloudflareDeploymentAdapter implements CloudflareDeploymentAdapter {
  private readonly deployments = new Map<string, FakeDeployment>();
  private readonly plannedSequences: Array<Array<Exclude<CloudflareDeploymentStatus, "timeout_unknown">>> = [];
  private readonly readDelayMs: number;
  private counter = 0;
  private nextFailure: { code: string; message: string } | null = null;

  constructor(options: FakeCloudflareDeploymentAdapterOptions = {}) {
    this.readDelayMs = options.readDelayMs ?? 0;
  }

  reset(): void {
    this.deployments.clear();
    this.plannedSequences.length = 0;
    this.counter = 0;
    this.nextFailure = null;
  }

  planNextDeployment(sequence: Array<Exclude<CloudflareDeploymentStatus, "timeout_unknown">>): void {
    this.plannedSequences.push(sequence.length > 0 ? sequence : ["success"]);
  }

  failNextRead(code = "CLOUDFLARE_READ_FAILED", message = "Cloudflare deployment read failed"): void {
    this.nextFailure = { code, message };
  }

  addUnrelatedDeployment(commitSha: string, status: Exclude<CloudflareDeploymentStatus, "timeout_unknown"> = "success"): CloudflareDeploymentRecord {
    const deployment = this.createDeployment({
      encodedSlug: "unrelated",
      commitSha,
      publicationId: `unrelated-${this.counter + 1}`
    }, [status]);
    this.deployments.set(deployment.deploymentId, deployment);
    return toCloudflareDeploymentRecord(deployment);
  }

  async observeCommit(input: CloudflareCommitObservation): Promise<void> {
    const sequence = this.plannedSequences.shift() ?? ["success"];
    const deployment = this.createDeployment(input, sequence);
    this.deployments.set(deployment.deploymentId, deployment);
  }

  async listRecentDeployments(): Promise<CloudflareDeploymentRecord[]> {
    if (this.readDelayMs > 0) await delay(this.readDelayMs);
    if (this.nextFailure) {
      const failure = this.nextFailure;
      this.nextFailure = null;
      throw new CloudflareDeploymentAdapterError(failure.code, failure.message);
    }
    return [...this.deployments.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.deploymentId.localeCompare(left.deploymentId))
      .map((deployment) => {
        const current = toCloudflareDeploymentRecord(deployment);
        if (deployment.index < deployment.sequence.length - 1) {
          deployment.index += 1;
          deployment.status = deployment.sequence[deployment.index] ?? deployment.status;
          deployment.updatedAt = new Date(Date.parse(deployment.updatedAt) + 1000).toISOString();
        }
        return current;
      });
  }

  private createDeployment(
    input: CloudflareCommitObservation,
    sequence: Array<Exclude<CloudflareDeploymentStatus, "timeout_unknown">>
  ): FakeDeployment {
    this.counter += 1;
    const deploymentId = `fake-deployment-${String(this.counter).padStart(4, "0")}`;
    const normalizedSequence: Array<Exclude<CloudflareDeploymentStatus, "timeout_unknown">> =
      sequence.length > 0 ? sequence : ["success"];
    const now = new Date(Date.UTC(2026, 5, 23, 0, 0, this.counter)).toISOString();
    return {
      adapter: "fake-cloudflare",
      deploymentId,
      encodedSlug: input.encodedSlug,
      status: normalizedSequence[0] ?? "success",
      sourceCommitSha: input.commitSha,
      deploymentUrl: `https://fake-cloudflare.example.test/${input.encodedSlug}/${deploymentId}`,
      createdAt: now,
      updatedAt: now,
      skippedExternalRead: true,
      sequence: normalizedSequence,
      index: 0
    };
  }
}

export function createFakeGitHubPublicationAdapter(options: FakeGitHubPublicationAdapterOptions = {}): FakeGitHubPublicationAdapter {
  return new FakeGitHubPublicationAdapter(options);
}

export function createGitHubContentsPublicationAdapter(
  config: GitHubContentsPublicationAdapterConfig
): GitHubContentsPublicationAdapter {
  return new GitHubContentsPublicationAdapter(config);
}

export function createMissingGitHubPublicationAdapter(missingVariables: string[]): MissingGitHubPublicationAdapter {
  return new MissingGitHubPublicationAdapter(missingVariables);
}

export function createFakeCloudflareDeploymentAdapter(
  options: FakeCloudflareDeploymentAdapterOptions = {}
): FakeCloudflareDeploymentAdapter {
  return new FakeCloudflareDeploymentAdapter(options);
}

function toCloudflareDeploymentRecord(deployment: FakeDeployment): CloudflareDeploymentRecord {
  return {
    adapter: deployment.adapter,
    deploymentId: deployment.deploymentId,
    encodedSlug: deployment.encodedSlug,
    status: deployment.status,
    sourceCommitSha: deployment.sourceCommitSha,
    deploymentUrl: deployment.deploymentUrl,
    createdAt: deployment.createdAt,
    updatedAt: deployment.updatedAt,
    skippedExternalRead: deployment.skippedExternalRead
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function smallHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

type GitHubContentResponse = {
  type?: string;
  sha?: string;
  content?: string;
};

type GitHubWriteRequest = {
  message: string;
  content: string;
  branch: string;
  sha?: string;
};

type GitHubWriteResponse = {
  content?: { sha?: string };
  commit?: { sha?: string };
};

type GitHubDeleteResponse = {
  commit?: { sha?: string };
};

function encodeGitHubPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return base64EncodeBytes(bytes);
}

function decodeBase64(value: string): string {
  const bytes = base64DecodeBytes(value.replace(/\s/g, ""));
  return new TextDecoder().decode(bytes);
}

const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64EncodeBytes(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const triplet = (first << 16) | (second << 8) | third;
    output += base64Alphabet[(triplet >> 18) & 63];
    output += base64Alphabet[(triplet >> 12) & 63];
    output += index + 1 < bytes.length ? base64Alphabet[(triplet >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? base64Alphabet[triplet & 63] : "=";
  }
  return output;
}

function base64DecodeBytes(value: string): Uint8Array {
  const normalized = value.replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of normalized) {
    const next = base64Alphabet.indexOf(char);
    if (next < 0) throw new GitHubPublicationAdapterError("GITHUB_READ_INVALID", "GitHub file content was not base64.");
    buffer = (buffer << 6) | next;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 200);
  return "GitHub request failed.";
}
