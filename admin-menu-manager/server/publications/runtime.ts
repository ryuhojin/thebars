import type { CloudflareDeploymentAdapter, GitHubPublicationAdapter } from "../integrations/publicationAdapters";
import { createFakeCloudflareDeploymentAdapter, createFakeGitHubPublicationAdapter } from "../integrations/publicationAdapters";
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

export function createPublicationRuntime(
  env?: { DB?: D1Database },
  options: PublicationRuntimeOptions = {}
): PublicationRuntime {
  return {
    repository: options.publicationRepository ?? (env?.DB ? new D1PublicationRepository(env.DB) : fallbackRepository),
    githubAdapter: options.githubPublicationAdapter ?? fallbackGitHubAdapter,
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
