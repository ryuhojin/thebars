import type { CloudflareDeploymentAdapter, GitHubPublicationAdapter } from "../integrations/publicationAdapters";
import {
  createFakeCloudflareDeploymentAdapter,
  createFakeGitHubPublicationAdapter,
  createGitHubContentsPublicationAdapter,
  createMissingGitHubPublicationAdapter
} from "../integrations/publicationAdapters";
import { D1PublicationRepository } from "./d1PublicationRepository";
import { MemoryPublicationRepository } from "./memoryPublicationRepository";
import type { PublicationRepository } from "./repository";

export type PublicationRuntime = {
  repository: PublicationRepository;
  githubAdapter: GitHubPublicationAdapter;
  cloudflareAdapter: CloudflareDeploymentAdapter;
};

export type PublicationRuntimeOptions = {
  publicationRepository?: PublicationRepository;
  githubPublicationAdapter?: GitHubPublicationAdapter;
  cloudflareDeploymentAdapter?: CloudflareDeploymentAdapter;
};

const fallbackRepository = new MemoryPublicationRepository();
const fallbackGitHubAdapter = createFakeGitHubPublicationAdapter();
const fallbackCloudflareAdapter = createFakeCloudflareDeploymentAdapter();

type PublicationRuntimeEnv = {
  DB?: D1Database;
  CUSTOMER_REPO_OWNER?: string;
  CUSTOMER_REPO_NAME?: string;
  CUSTOMER_REPO_BRANCH?: string;
  GITHUB_FINE_GRAINED_PAT?: string;
};

export function createPublicationRuntime(
  env?: PublicationRuntimeEnv,
  options: PublicationRuntimeOptions = {}
): PublicationRuntime {
  return {
    repository: options.publicationRepository ?? (env?.DB ? new D1PublicationRepository(env.DB) : fallbackRepository),
    githubAdapter: options.githubPublicationAdapter ?? createGitHubAdapter(env),
    cloudflareAdapter: options.cloudflareDeploymentAdapter ?? fallbackCloudflareAdapter
  };
}

export function getFallbackMemoryPublicationRepository() {
  return fallbackRepository;
}

export function getFallbackFakeGitHubPublicationAdapter() {
  return fallbackGitHubAdapter;
}

export function getFallbackFakeCloudflareDeploymentAdapter() {
  return fallbackCloudflareAdapter;
}

function createGitHubAdapter(env?: PublicationRuntimeEnv): GitHubPublicationAdapter {
  if (!env?.DB) return fallbackGitHubAdapter;

  const owner = env.CUSTOMER_REPO_OWNER?.trim();
  const repo = env.CUSTOMER_REPO_NAME?.trim();
  const token = env.GITHUB_FINE_GRAINED_PAT?.trim();
  const branch = env.CUSTOMER_REPO_BRANCH?.trim() || "main";
  const requiredVariables: Array<[string, string | undefined]> = [
    ["CUSTOMER_REPO_OWNER", owner],
    ["CUSTOMER_REPO_NAME", repo],
    ["GITHUB_FINE_GRAINED_PAT", token]
  ];
  const missing = requiredVariables
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0 || !owner || !repo || !token) {
    return createMissingGitHubPublicationAdapter(missing);
  }

  return createGitHubContentsPublicationAdapter({
    owner,
    repo,
    branch,
    token
  });
}
