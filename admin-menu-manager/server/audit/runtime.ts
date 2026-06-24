import { D1AuditRepository } from "./d1AuditRepository";
import { MemoryAuditRepository } from "./memoryAuditRepository";
import type { AuditRepository } from "./repository";

export type AuditRuntime = {
  repository: AuditRepository;
};

export type AuditRuntimeOptions = {
  auditRepository?: AuditRepository;
};

const fallbackAuditRepository = new MemoryAuditRepository();

export function createAuditRuntime(env?: { DB?: D1Database }, options: AuditRuntimeOptions = {}): AuditRuntime {
  return {
    repository: options.auditRepository ?? (env?.DB ? new D1AuditRepository(env.DB) : fallbackAuditRepository)
  };
}

export function getFallbackMemoryAuditRepository() {
  return fallbackAuditRepository;
}
