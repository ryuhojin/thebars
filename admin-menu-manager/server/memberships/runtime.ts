import { D1MembershipRepository } from "./d1MembershipRepository";
import { MemoryMembershipRepository } from "./memoryMembershipRepository";
import type { MembershipRepository } from "./repository";

export type MembershipRuntime = {
  repository: MembershipRepository;
};

const fallbackRepository = new MemoryMembershipRepository();

export type MembershipRuntimeOptions = {
  membershipRepository?: MembershipRepository;
};

export function createMembershipRuntime(
  env?: { DB?: D1Database },
  options: MembershipRuntimeOptions = {}
): MembershipRuntime {
  return {
    repository: options.membershipRepository ?? (env?.DB ? new D1MembershipRepository(env.DB) : fallbackRepository)
  };
}

export function getFallbackMemoryMembershipRepository() {
  return fallbackRepository;
}
