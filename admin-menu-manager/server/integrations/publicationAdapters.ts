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
  adapter: "fake-github";
  operation: PublicationCommitOperation;
  path: string;
  commitSha: string;
  fileSha: string;
  message: string;
  skippedExternalWrite: true;
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
