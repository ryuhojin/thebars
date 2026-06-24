import { D1OrderTabRepository } from "./d1OrderTabRepository";
import { MemoryOrderTabRepository } from "./memoryOrderTabRepository";
import type { OrderTabRepository } from "./repository";

export type OrderTabRuntime = {
  repository: OrderTabRepository;
};

export type OrderTabRuntimeOptions = {
  orderTabRepository?: OrderTabRepository;
};

const fallbackOrderTabRepository = new MemoryOrderTabRepository();

export function createOrderTabRuntime(env?: { DB?: D1Database }, options: OrderTabRuntimeOptions = {}): OrderTabRuntime {
  return {
    repository: options.orderTabRepository ?? (env?.DB ? new D1OrderTabRepository(env.DB) : fallbackOrderTabRepository)
  };
}

export function getFallbackMemoryOrderTabRepository() {
  return fallbackOrderTabRepository;
}
