import type { MembershipRole, RolePermission } from "../../contracts/memberships";

export type MembershipRecord = {
  id: string;
  barId: string;
  userId: string;
  role: MembershipRole;
  isActive: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RolePermissionRecord = RolePermission & {
  barId: string;
  createdAt: string;
  updatedAt: string;
};

export type UserBarMembershipRecord = {
  barId: string;
  role: MembershipRole;
  isActive: boolean;
};

export type UpsertMembershipInput = {
  id: string;
  barId: string;
  userId: string;
  role: MembershipRole;
  createdByUserId: string;
  now: string;
};

export const membershipRoles: MembershipRole[] = ["owner", "manager", "staff"];

export const defaultRolePermissions: RolePermission[] = [
  {
    role: "owner",
    canEditMenu: true,
    canManageOrders: true,
    canAddCustomOrderItem: true,
    canApplyOrderAdjustment: true
  },
  {
    role: "manager",
    canEditMenu: true,
    canManageOrders: true,
    canAddCustomOrderItem: true,
    canApplyOrderAdjustment: true
  },
  {
    role: "staff",
    canEditMenu: false,
    canManageOrders: true,
    canAddCustomOrderItem: false,
    canApplyOrderAdjustment: false
  }
];

export interface MembershipRepository {
  listMemberships(barId: string): Promise<MembershipRecord[]>;
  findMembershipById(barId: string, membershipId: string): Promise<MembershipRecord | null>;
  findMembershipByUser(barId: string, userId: string): Promise<MembershipRecord | null>;
  upsertMembership(input: UpsertMembershipInput): Promise<MembershipRecord>;
  updateMembershipRole(barId: string, membershipId: string, role: MembershipRole, now: string): Promise<MembershipRecord | null>;
  deactivateMembership(barId: string, membershipId: string, now: string): Promise<MembershipRecord | null>;
  readRolePermissions(barId: string): Promise<RolePermissionRecord[]>;
  replaceRolePermissions(barId: string, permissions: RolePermission[], now: string): Promise<RolePermissionRecord[]>;
  ensureDefaultRolePermissions(barId: string, now: string): Promise<RolePermissionRecord[]>;
  findActiveMembershipForUser(barId: string, userId: string): Promise<MembershipRecord | null>;
  listActiveMembershipsForUser(userId: string): Promise<UserBarMembershipRecord[]>;
}
