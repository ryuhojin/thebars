import type { MembershipRole, RolePermission } from "../../contracts/memberships";
import {
  defaultRolePermissions,
  type MembershipRecord,
  type MembershipRepository,
  type RolePermissionRecord,
  type UpsertMembershipInput,
  type UserBarMembershipRecord
} from "./repository";

export class MemoryMembershipRepository implements MembershipRepository {
  private readonly memberships = new Map<string, MembershipRecord>();
  private readonly rolePermissions = new Map<string, RolePermissionRecord>();

  reset() {
    this.memberships.clear();
    this.rolePermissions.clear();
  }

  async listMemberships(barId: string): Promise<MembershipRecord[]> {
    return [...this.memberships.values()]
      .filter((membership) => membership.barId === barId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((membership) => ({ ...membership }));
  }

  async findMembershipById(barId: string, membershipId: string): Promise<MembershipRecord | null> {
    const membership = this.memberships.get(membershipId);
    return membership && membership.barId === barId ? { ...membership } : null;
  }

  async findMembershipByUser(barId: string, userId: string): Promise<MembershipRecord | null> {
    const membership = [...this.memberships.values()].find((item) => item.barId === barId && item.userId === userId);
    return membership ? { ...membership } : null;
  }

  async upsertMembership(input: UpsertMembershipInput): Promise<MembershipRecord> {
    const existing = await this.findMembershipByUser(input.barId, input.userId);
    if (existing) {
      const updated: MembershipRecord = {
        ...existing,
        role: input.role,
        isActive: true,
        updatedAt: input.now
      };
      this.memberships.set(updated.id, updated);
      return { ...updated };
    }

    const membership: MembershipRecord = {
      id: input.id,
      barId: input.barId,
      userId: input.userId,
      role: input.role,
      isActive: true,
      createdByUserId: input.createdByUserId,
      createdAt: input.now,
      updatedAt: input.now
    };
    this.memberships.set(membership.id, membership);
    return { ...membership };
  }

  async updateMembershipRole(
    barId: string,
    membershipId: string,
    role: MembershipRole,
    now: string
  ): Promise<MembershipRecord | null> {
    const membership = await this.findMembershipById(barId, membershipId);
    if (!membership) return null;
    const updated = { ...membership, role, updatedAt: now };
    this.memberships.set(updated.id, updated);
    return { ...updated };
  }

  async deactivateMembership(barId: string, membershipId: string, now: string): Promise<MembershipRecord | null> {
    const membership = await this.findMembershipById(barId, membershipId);
    if (!membership) return null;
    const updated = { ...membership, isActive: false, updatedAt: now };
    this.memberships.set(updated.id, updated);
    return { ...updated };
  }

  async readRolePermissions(barId: string): Promise<RolePermissionRecord[]> {
    return [...this.rolePermissions.values()]
      .filter((permission) => permission.barId === barId)
      .sort((left, right) => roleOrder(left.role) - roleOrder(right.role))
      .map((permission) => ({ ...permission }));
  }

  async replaceRolePermissions(barId: string, permissions: RolePermission[], now: string): Promise<RolePermissionRecord[]> {
    for (const permission of permissions) {
      const key = permissionKey(barId, permission.role);
      const existing = this.rolePermissions.get(key);
      this.rolePermissions.set(key, {
        ...permission,
        barId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
    }
    return this.readRolePermissions(barId);
  }

  async ensureDefaultRolePermissions(barId: string, now: string): Promise<RolePermissionRecord[]> {
    for (const permission of defaultRolePermissions) {
      const key = permissionKey(barId, permission.role);
      if (!this.rolePermissions.has(key)) {
        this.rolePermissions.set(key, { ...permission, barId, createdAt: now, updatedAt: now });
      }
    }
    return this.readRolePermissions(barId);
  }

  async findActiveMembershipForUser(barId: string, userId: string): Promise<MembershipRecord | null> {
    const membership = await this.findMembershipByUser(barId, userId);
    return membership?.isActive ? membership : null;
  }

  async listActiveMembershipsForUser(userId: string): Promise<UserBarMembershipRecord[]> {
    return [...this.memberships.values()]
      .filter((membership) => membership.userId === userId && membership.isActive)
      .map((membership) => ({
        barId: membership.barId,
        role: membership.role,
        isActive: membership.isActive
      }));
  }
}

function permissionKey(barId: string, role: MembershipRole): string {
  return `${barId}:${role}`;
}

function roleOrder(role: MembershipRole): number {
  return role === "owner" ? 0 : role === "manager" ? 1 : 2;
}
