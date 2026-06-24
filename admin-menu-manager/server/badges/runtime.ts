import { D1BadgeRepository } from "./d1BadgeRepository";
import { MemoryBadgeRepository } from "./memoryBadgeRepository";
import type { BadgeRepository } from "./repository";

export type BadgeRuntime = {
  repository: BadgeRepository;
};

export type BadgeRuntimeOptions = {
  badgeRepository?: BadgeRepository;
};

const fallbackBadgeRepository = new MemoryBadgeRepository();

export function createBadgeRuntime(env?: { DB?: D1Database }, options: BadgeRuntimeOptions = {}): BadgeRuntime {
  return {
    repository: options.badgeRepository ?? (env?.DB ? new D1BadgeRepository(env.DB) : fallbackBadgeRepository)
  };
}

export function getFallbackMemoryBadgeRepository() {
  return fallbackBadgeRepository;
}
