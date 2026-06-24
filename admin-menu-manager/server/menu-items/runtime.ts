import { D1MenuItemRepository } from "./d1MenuItemRepository";
import { MemoryMenuItemRepository } from "./memoryMenuItemRepository";
import type { MenuItemRepository } from "./repository";

export type MenuItemRuntime = {
  repository: MenuItemRepository;
};

export type MenuItemRuntimeOptions = {
  menuItemRepository?: MenuItemRepository;
};

const fallbackMenuItemRepository = new MemoryMenuItemRepository();

export function createMenuItemRuntime(env?: { DB?: D1Database }, options: MenuItemRuntimeOptions = {}): MenuItemRuntime {
  return {
    repository: options.menuItemRepository ?? (env?.DB ? new D1MenuItemRepository(env.DB) : fallbackMenuItemRepository)
  };
}

export function getFallbackMemoryMenuItemRepository() {
  return fallbackMenuItemRepository;
}
