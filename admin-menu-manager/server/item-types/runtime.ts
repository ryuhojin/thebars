import { D1ItemTypeRepository } from "./d1ItemTypeRepository";
import { MemoryItemTypeRepository } from "./memoryItemTypeRepository";
import type { ItemTypeRepository } from "./repository";

export type ItemTypeRuntime = {
  repository: ItemTypeRepository;
};

export type ItemTypeRuntimeOptions = {
  itemTypeRepository?: ItemTypeRepository;
};

const fallbackItemTypeRepository = new MemoryItemTypeRepository();

export function createItemTypeRuntime(env?: { DB?: D1Database }, options: ItemTypeRuntimeOptions = {}): ItemTypeRuntime {
  return {
    repository: options.itemTypeRepository ?? (env?.DB ? new D1ItemTypeRepository(env.DB) : fallbackItemTypeRepository)
  };
}

export function getFallbackMemoryItemTypeRepository() {
  return fallbackItemTypeRepository;
}
