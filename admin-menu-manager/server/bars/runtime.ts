import { D1BarRepository } from "./d1BarRepository";
import { MemoryBarRepository } from "./memoryBarRepository";
import type { BarRepository } from "./repository";
import type { BarSlugGenerator } from "./slug";

export type BarRuntime = {
  repository: BarRepository;
};

export type BarRuntimeOptions = {
  barRepository?: BarRepository;
  barSlugGenerator?: BarSlugGenerator;
};

const fallbackBarRepository = new MemoryBarRepository();

export function createBarRuntime(env?: { DB?: D1Database }, options: BarRuntimeOptions = {}): BarRuntime {
  return {
    repository: options.barRepository ?? (env?.DB ? new D1BarRepository(env.DB) : fallbackBarRepository)
  };
}

export function getFallbackMemoryBarRepository() {
  return fallbackBarRepository;
}
