import { D1RateLimitRepository } from "./d1RateLimitRepository";
import { MemoryRateLimitRepository } from "./memoryRateLimitRepository";
import { RateLimitService, type RateLimitConfig } from "./rateLimitService";
import type { RateLimitRepository } from "./repository";

export type RateLimitRuntime = {
  repository: RateLimitRepository;
  service: RateLimitService;
};

export type RateLimitRuntimeOptions = {
  rateLimitRepository?: RateLimitRepository;
  rateLimitConfig?: RateLimitConfig;
  now?: () => Date;
};

const fallbackRateLimitRepository = new MemoryRateLimitRepository();

export function createRateLimitRuntime(env?: { DB?: D1Database }, options: RateLimitRuntimeOptions = {}): RateLimitRuntime {
  const repository = options.rateLimitRepository ?? (env?.DB ? new D1RateLimitRepository(env.DB) : fallbackRateLimitRepository);
  return {
    repository,
    service: new RateLimitService(repository, options.rateLimitConfig, options.now)
  };
}

export function getFallbackMemoryRateLimitRepository() {
  return fallbackRateLimitRepository;
}
