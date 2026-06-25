import type { CloudflareDeploymentAdapter, GitHubPublicationAdapter } from "../integrations/publicationAdapters";
import {
  createCloudflarePagesDeploymentAdapter,
  createFakeCloudflareDeploymentAdapter,
  createFakeGitHubPublicationAdapter,
  createGitHubContentsPublicationAdapter,
  createMissingCloudflareDeploymentAdapter,
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
  CUSTOMER_REPO_ROOT?: string;
  GITHUB_FINE_GRAINED_PAT?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CUSTOMER_PAGES_PROJECT_NAME?: string;
  CLOUDFLARE_PAGES_PROJECT?: string;
  CLOUDFLARE_PROJECT_NAME?: string;
  CLOUDFLARE_API_BASE_URL?: string;
};

export function createPublicationRuntime(
  env?: PublicationRuntimeEnv,
  options: PublicationRuntimeOptions = {}
): PublicationRuntime {
  return {
    repository: options.publicationRepository ?? (env?.DB ? new D1PublicationRepository(env.DB) : fallbackRepository),
    githubAdapter: options.githubPublicationAdapter ?? createGitHubAdapter(env),
    cloudflareAdapter: options.cloudflareDeploymentAdapter ?? createCloudflareAdapter(env)
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
  const rootDirectory = env.CUSTOMER_REPO_ROOT?.trim() || undefined;
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
    rootDirectory,
    token
  });
}

function createCloudflareAdapter(env?: PublicationRuntimeEnv): CloudflareDeploymentAdapter {
  if (!env?.DB) return fallbackCloudflareAdapter;

  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = env.CLOUDFLARE_API_TOKEN?.trim();
  const projectName =
    env.CUSTOMER_PAGES_PROJECT_NAME?.trim() ||
    env.CLOUDFLARE_PAGES_PROJECT?.trim() ||
    env.CLOUDFLARE_PROJECT_NAME?.trim();
  const requiredVariables: Array<[string, string | undefined]> = [
    ["CLOUDFLARE_ACCOUNT_ID", accountId],
    ["CLOUDFLARE_API_TOKEN", token],
    ["CUSTOMER_PAGES_PROJECT_NAME", projectName]
  ];
  const missing = requiredVariables
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0 || !accountId || !token || !projectName) {
    return createMissingCloudflareDeploymentAdapter(missing);
  }

  return createCloudflarePagesDeploymentAdapter({
    accountId,
    projectName,
    token,
    apiBaseUrl: env.CLOUDFLARE_API_BASE_URL?.trim() || undefined
  });
}
