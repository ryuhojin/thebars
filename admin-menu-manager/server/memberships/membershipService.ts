import type {
  AddBarMembershipRequest,
  BarMembership,
  BarMembershipCommandResponse,
  BarMembersResponse,
  BarPermissionKey,
  CurrentBarPermissionsQuery,
  CurrentBarPermissionsResponse,
  MembershipUserOption,
  RolePermission,
  RolePermissionsResponse,
  UpdateBarMembershipRequest,
  UpdateRolePermissionsRequest
} from "../../contracts/memberships";
import {
  barMembersResponseSchema,
  barMembershipCommandResponseSchema,
  currentBarPermissionsResponseSchema,
  rolePermissionsResponseSchema
} from "../../contracts/memberships";
import { nowIso } from "../auth/crypto";
import { AuthServiceError } from "../auth/errors";
import type { AuthRepository, AuthUserRecord, ManagedUserRecord } from "../auth/repository";
import type { BarRecord, BarRepository } from "../bars/repository";
import type { MembershipRecord, MembershipRepository, RolePermissionRecord } from "./repository";

export type MembershipServiceOptions = {
  now?: () => Date;
};

export class MembershipService {
  private readonly now: () => Date;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly barRepository: BarRepository,
    private readonly membershipRepository: MembershipRepository,
    options: MembershipServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async readMembers(actor: AuthUserRecord, barId: string): Promise<BarMembersResponse> {
    assertSystemAdmin(actor);
    const { bar, rolePermissions } = await this.prepareBar(barId);
    return barMembersResponseSchema.parse({
      bar: toBarInfo(bar),
      members: await this.readMembershipDtos(barId),
      rolePermissions: toRolePermissions(rolePermissions),
      availableUsers: await this.readAvailableUsers(barId)
    });
  }

  async addMember(
    actor: AuthUserRecord,
    barId: string,
    input: AddBarMembershipRequest
  ): Promise<BarMembershipCommandResponse> {
    assertSystemAdmin(actor);
    await this.prepareBar(barId);
    const targetUser = await this.authRepository.findUserById(input.userId);
    if (!targetUser) {
      throw new AuthServiceError(404, "USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
    }
    if (targetUser.isSystemAdmin) {
      throw new AuthServiceError(409, "SYSTEM_ADMIN_MEMBERSHIP_NOT_ALLOWED", "시스템 관리자는 바 소속으로 추가하지 않습니다.");
    }
    if (!targetUser.isActive) {
      throw new AuthServiceError(409, "USER_INACTIVE", "비활성 사용자는 바 소속으로 추가할 수 없습니다.");
    }
    const existing = await this.membershipRepository.findMembershipByUser(barId, targetUser.id);
    if (existing?.isActive) {
      throw new AuthServiceError(409, "MEMBERSHIP_ALREADY_ACTIVE", "이미 활성 소속으로 등록된 사용자입니다.");
    }

    const now = nowIso(this.now());
    const membership = await this.membershipRepository.upsertMembership({
      id: crypto.randomUUID(),
      barId,
      userId: targetUser.id,
      role: input.role,
      createdByUserId: actor.id,
      now
    });
    return barMembershipCommandResponseSchema.parse({
      membership: await this.toMembershipDto(membership),
      rolePermissions: toRolePermissions(await this.membershipRepository.ensureDefaultRolePermissions(barId, now))
    });
  }

  async updateMember(
    actor: AuthUserRecord,
    barId: string,
    membershipId: string,
    input: UpdateBarMembershipRequest
  ): Promise<BarMembershipCommandResponse> {
    assertSystemAdmin(actor);
    await this.prepareBar(barId);
    const current = await this.requireMembership(barId, membershipId);
    if (!current.isActive) {
      throw new AuthServiceError(409, "MEMBERSHIP_INACTIVE", "비활성 소속은 먼저 다시 추가해야 합니다.");
    }
    const updated = await this.membershipRepository.updateMembershipRole(barId, membershipId, input.role, nowIso(this.now()));
    if (!updated) throw new AuthServiceError(404, "MEMBERSHIP_NOT_FOUND", "바 소속을 찾을 수 없습니다.");
    return barMembershipCommandResponseSchema.parse({
      membership: await this.toMembershipDto(updated),
      rolePermissions: toRolePermissions(await this.membershipRepository.readRolePermissions(barId))
    });
  }

  async deactivateMember(
    actor: AuthUserRecord,
    barId: string,
    membershipId: string
  ): Promise<BarMembershipCommandResponse> {
    assertSystemAdmin(actor);
    await this.prepareBar(barId);
    const current = await this.requireMembership(barId, membershipId);
    if (!current.isActive) {
      throw new AuthServiceError(409, "MEMBERSHIP_ALREADY_INACTIVE", "이미 비활성화된 소속입니다.");
    }
    const updated = await this.membershipRepository.deactivateMembership(barId, membershipId, nowIso(this.now()));
    if (!updated) throw new AuthServiceError(404, "MEMBERSHIP_NOT_FOUND", "바 소속을 찾을 수 없습니다.");
    return barMembershipCommandResponseSchema.parse({
      membership: await this.toMembershipDto(updated),
      rolePermissions: toRolePermissions(await this.membershipRepository.readRolePermissions(barId))
    });
  }

  async readRolePermissions(actor: AuthUserRecord, barId: string): Promise<RolePermissionsResponse> {
    assertSystemAdmin(actor);
    const { rolePermissions } = await this.prepareBar(barId);
    return rolePermissionsResponseSchema.parse({ barId, permissions: toRolePermissions(rolePermissions) });
  }

  async updateRolePermissions(
    actor: AuthUserRecord,
    barId: string,
    input: UpdateRolePermissionsRequest
  ): Promise<RolePermissionsResponse> {
    assertSystemAdmin(actor);
    await this.prepareBar(barId);
    assertCompleteRolePermissionSet(input.permissions);
    const permissions = await this.membershipRepository.replaceRolePermissions(barId, input.permissions, nowIso(this.now()));
    return rolePermissionsResponseSchema.parse({ barId, permissions: toRolePermissions(permissions) });
  }

  async readCurrentPermissions(
    actor: AuthUserRecord,
    barId: string,
    query: CurrentBarPermissionsQuery
  ): Promise<CurrentBarPermissionsResponse> {
    const effective = await this.readEffectivePermissions(actor, barId);
    const allowed = query.require ? effective.permissions[query.require] : true;
    if (query.require && !allowed) {
      throw new AuthServiceError(403, "BAR_PERMISSION_REQUIRED", "이 바에서 필요한 권한이 없습니다.");
    }
    return currentBarPermissionsResponseSchema.parse({
      barId,
      role: effective.role,
      permissions: effective.permissions,
      required: query.require,
      allowed
    });
  }

  async readAccessibleMemberships(actor: AuthUserRecord): Promise<Array<{ barId: string; role: "owner" | "manager" | "staff" }>> {
    if (actor.isSystemAdmin) return [];
    const memberships = await this.membershipRepository.listActiveMembershipsForUser(actor.id);
    return memberships.map((membership) => ({ barId: membership.barId, role: membership.role }));
  }

  private async readEffectivePermissions(
    actor: AuthUserRecord,
    barId: string
  ): Promise<{
    role: "system-admin" | "owner" | "manager" | "staff";
    permissions: Omit<RolePermission, "role">;
  }> {
    const { rolePermissions } = await this.prepareBar(barId);
    if (actor.isSystemAdmin) {
      return {
        role: "system-admin",
        permissions: {
          canEditMenu: true,
          canManageOrders: true,
          canAddCustomOrderItem: true,
          canApplyOrderAdjustment: true
        }
      };
    }

    const membership = await this.membershipRepository.findActiveMembershipForUser(barId, actor.id);
    if (!membership) {
      throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    }
    const rolePermission = rolePermissions.find((permission) => permission.role === membership.role);
    if (!rolePermission) {
      throw new AuthServiceError(409, "ROLE_PERMISSION_MISSING", "역할 권한 설정이 없습니다.");
    }
    return {
      role: membership.role,
      permissions: {
        canEditMenu: rolePermission.canEditMenu,
        canManageOrders: rolePermission.canManageOrders,
        canAddCustomOrderItem: rolePermission.canAddCustomOrderItem,
        canApplyOrderAdjustment: rolePermission.canApplyOrderAdjustment
      }
    };
  }

  private async prepareBar(barId: string): Promise<{ bar: BarRecord; rolePermissions: RolePermissionRecord[] }> {
    const bar = await this.barRepository.findBarById(barId);
    if (!bar) {
      throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    }
    const rolePermissions = await this.membershipRepository.ensureDefaultRolePermissions(barId, nowIso(this.now()));
    return { bar, rolePermissions };
  }

  private async requireMembership(barId: string, membershipId: string): Promise<MembershipRecord> {
    const membership = await this.membershipRepository.findMembershipById(barId, membershipId);
    if (!membership) {
      throw new AuthServiceError(404, "MEMBERSHIP_NOT_FOUND", "바 소속을 찾을 수 없습니다.");
    }
    return membership;
  }

  private async readMembershipDtos(barId: string): Promise<BarMembership[]> {
    const memberships = await this.membershipRepository.listMemberships(barId);
    return Promise.all(memberships.map((membership) => this.toMembershipDto(membership)));
  }

  private async toMembershipDto(membership: MembershipRecord): Promise<BarMembership> {
    const user = await this.authRepository.findUserById(membership.userId);
    return {
      id: membership.id,
      barId: membership.barId,
      userId: membership.userId,
      username: user?.normalizedUsername ?? "알 수 없음",
      role: membership.role,
      isActive: membership.isActive,
      userIsActive: user?.isActive ?? false,
      joinedAt: membership.createdAt,
      updatedAt: membership.updatedAt
    };
  }

  private async readAvailableUsers(barId: string): Promise<MembershipUserOption[]> {
    const now = nowIso(this.now());
    const [users, memberships] = await Promise.all([
      this.authRepository.listManagedUsers(now),
      this.membershipRepository.listMemberships(barId)
    ]);
    const activeMemberUserIds = new Set(memberships.filter((membership) => membership.isActive).map((membership) => membership.userId));
    return users
      .filter((user) => !user.isSystemAdmin)
      .map((user) => ({
        id: user.id,
        username: user.normalizedUsername,
        status: userStatus(user, now),
        isActive: user.isActive,
        alreadyMember: activeMemberUserIds.has(user.id)
      }));
  }
}

export function toRolePermissions(permissions: RolePermissionRecord[]): RolePermission[] {
  return permissions.map((permission) => ({
    role: permission.role,
    canEditMenu: permission.canEditMenu,
    canManageOrders: permission.canManageOrders,
    canAddCustomOrderItem: permission.canAddCustomOrderItem,
    canApplyOrderAdjustment: permission.canApplyOrderAdjustment
  }));
}

function toBarInfo(bar: BarRecord) {
  return {
    id: bar.id,
    name: bar.name,
    status: bar.status
  };
}

function assertSystemAdmin(actor: AuthUserRecord): void {
  if (!actor.isSystemAdmin) {
    throw new AuthServiceError(403, "SYSTEM_ADMIN_REQUIRED", "시스템 관리자만 사용할 수 있습니다.");
  }
}

function assertCompleteRolePermissionSet(permissions: RolePermission[]): void {
  const roles = new Set(permissions.map((permission) => permission.role));
  for (const role of ["owner", "manager", "staff"]) {
    if (!roles.has(role as RolePermission["role"])) {
      throw new AuthServiceError(400, "ROLE_PERMISSION_SET_INVALID", "owner, manager, staff 권한을 모두 포함해야 합니다.");
    }
  }
}

function userStatus(user: ManagedUserRecord, now: string): "active" | "inactive" | "locked" {
  if (!user.isActive) return "inactive";
  if (user.lockedUntil && user.lockedUntil > now) return "locked";
  return "active";
}

export function permissionField(permission: BarPermissionKey): keyof Omit<RolePermission, "role"> {
  return permission;
}
