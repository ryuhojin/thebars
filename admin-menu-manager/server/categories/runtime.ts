import { D1CategoryRepository } from "./d1CategoryRepository";
import { MemoryCategoryRepository } from "./memoryCategoryRepository";
import type { CategoryRepository } from "./repository";

export type CategoryRuntime = {
  repository: CategoryRepository;
};

export type CategoryRuntimeOptions = {
  categoryRepository?: CategoryRepository;
};

const fallbackCategoryRepository = new MemoryCategoryRepository();

export function createCategoryRuntime(env?: { DB?: D1Database }, options: CategoryRuntimeOptions = {}): CategoryRuntime {
  return {
    repository: options.categoryRepository ?? (env?.DB ? new D1CategoryRepository(env.DB) : fallbackCategoryRepository)
  };
}

export function getFallbackMemoryCategoryRepository() {
  return fallbackCategoryRepository;
}
