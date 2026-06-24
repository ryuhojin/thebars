import type { MembershipRole, RolePermission } from "../../contracts/memberships";
import {
  defaultRolePermissions,
  type MembershipRecord,
  type MembershipRepository,
  type RolePermissionRecord,
  type UpsertMembershipInput,
  type UserBarMembershipRecord
} from "./repository";

type MembershipRow = {
  id: string;
  bar_id: string;
  user_id: string;
  role: MembershipRole;
  is_active: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type RolePermissionRow = {
  bar_id: string;
  role: MembershipRole;
  can_edit_menu: number;
  can_manage_orders: number;
  can_add_custom_order_item: number;
  can_apply_order_adjustment: number;
  created_at: string;
  updated_at: string;
};

type UserMembershipRow = {
  bar_id: string;
  role: MembershipRole;
  is_active: number;
};

export class D1MembershipRepository implements MembershipRepository {
  constructor(private readonly db: D1Database) {}

  async listMemberships(barId: string): Promise<MembershipRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM bar_memberships WHERE bar_id = ? ORDER BY created_at ASC")
      .bind(barId)
      .all<MembershipRow>();
    return (result.results ?? []).map(toMembershipRecord);
  }

  async findMembershipById(barId: string, membershipId: string): Promise<MembershipRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM bar_memberships WHERE bar_id = ? AND id = ?")
      .bind(barId, membershipId)
      .first<MembershipRow>();
    return row ? toMembershipRecord(row) : null;
  }

  async findMembershipByUser(barId: string, userId: string): Promise<MembershipRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM bar_memberships WHERE bar_id = ? AND user_id = ?")
      .bind(barId, userId)
      .first<MembershipRow>();
    return row ? toMembershipRecord(row) : null;
  }

  async upsertMembership(input: UpsertMembershipInput): Promise<MembershipRecord> {
    const existing = await this.findMembershipByUser(input.barId, input.userId);
    if (existing) {
      await this.db
        .prepare("UPDATE bar_memberships SET role = ?, is_active = 1, updated_at = ? WHERE id = ?")
        .bind(input.role, input.now, existing.id)
        .run();
      const updated = await this.findMembershipById(input.barId, existing.id);
      if (!updated) throw new Error("MEMBERSHIP_UPDATE_FAILED");
      return updated;
    }

    await this.db
      .prepare(
        `INSERT INTO bar_memberships (
          id, bar_id, user_id, role, is_active, created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
      )
      .bind(input.id, input.barId, input.userId, input.role, input.createdByUserId, input.now, input.now)
      .run();
    const created = await this.findMembershipById(input.barId, input.id);
    if (!created) throw new Error("MEMBERSHIP_INSERT_FAILED");
    return created;
  }

  async updateMembershipRole(
    barId: string,
    membershipId: string,
    role: MembershipRole,
    now: string
  ): Promise<MembershipRecord | null> {
    await this.db
      .prepare("UPDATE bar_memberships SET role = ?, updated_at = ? WHERE bar_id = ? AND id = ?")
      .bind(role, now, barId, membershipId)
      .run();
    return this.findMembershipById(barId, membershipId);
  }

  async deactivateMembership(barId: string, membershipId: string, now: string): Promise<MembershipRecord | null> {
    await this.db
      .prepare("UPDATE bar_memberships SET is_active = 0, updated_at = ? WHERE bar_id = ? AND id = ?")
      .bind(now, barId, membershipId)
      .run();
    return this.findMembershipById(barId, membershipId);
  }

  async readRolePermissions(barId: string): Promise<RolePermissionRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM bar_role_permissions
         WHERE bar_id = ?
         ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END`
      )
      .bind(barId)
      .all<RolePermissionRow>();
    return (result.results ?? []).map(toRolePermissionRecord);
  }

  async replaceRolePermissions(barId: string, permissions: RolePermission[], now: string): Promise<RolePermissionRecord[]> {
    await this.db.batch(
      permissions.map((permission) =>
        this.db
          .prepare(
            `INSERT INTO bar_role_permissions (
              bar_id, role, can_edit_menu, can_manage_orders,
              can_add_custom_order_item, can_apply_order_adjustment, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(bar_id, role) DO UPDATE SET
              can_edit_menu = excluded.can_edit_menu,
              can_manage_orders = excluded.can_manage_orders,
              can_add_custom_order_item = excluded.can_add_custom_order_item,
              can_apply_order_adjustment = excluded.can_apply_order_adjustment,
              updated_at = excluded.updated_at`
          )
          .bind(
            barId,
            permission.role,
            permission.canEditMenu ? 1 : 0,
            permission.canManageOrders ? 1 : 0,
            permission.canAddCustomOrderItem ? 1 : 0,
            permission.canApplyOrderAdjustment ? 1 : 0,
            now,
            now
          )
      )
    );
    return this.readRolePermissions(barId);
  }

  async ensureDefaultRolePermissions(barId: string, now: string): Promise<RolePermissionRecord[]> {
    await this.db.batch(
      defaultRolePermissions.map((permission) =>
        this.db
          .prepare(
            `INSERT OR IGNORE INTO bar_role_permissions (
              bar_id, role, can_edit_menu, can_manage_orders,
              can_add_custom_order_item, can_apply_order_adjustment, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            barId,
            permission.role,
            permission.canEditMenu ? 1 : 0,
            permission.canManageOrders ? 1 : 0,
            permission.canAddCustomOrderItem ? 1 : 0,
            permission.canApplyOrderAdjustment ? 1 : 0,
            now,
            now
          )
      )
    );
    return this.readRolePermissions(barId);
  }

  async findActiveMembershipForUser(barId: string, userId: string): Promise<MembershipRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM bar_memberships WHERE bar_id = ? AND user_id = ? AND is_active = 1")
      .bind(barId, userId)
      .first<MembershipRow>();
    return row ? toMembershipRecord(row) : null;
  }

  async listActiveMembershipsForUser(userId: string): Promise<UserBarMembershipRecord[]> {
    const result = await this.db
      .prepare("SELECT bar_id, role, is_active FROM bar_memberships WHERE user_id = ? AND is_active = 1")
      .bind(userId)
      .all<UserMembershipRow>();
    return (result.results ?? []).map((row) => ({
      barId: row.bar_id,
      role: row.role,
      isActive: row.is_active === 1
    }));
  }
}

function toMembershipRecord(row: MembershipRow): MembershipRecord {
  return {
    id: row.id,
    barId: row.bar_id,
    userId: row.user_id,
    role: row.role,
    isActive: row.is_active === 1,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toRolePermissionRecord(row: RolePermissionRow): RolePermissionRecord {
  return {
    barId: row.bar_id,
    role: row.role,
    canEditMenu: row.can_edit_menu === 1,
    canManageOrders: row.can_manage_orders === 1,
    canAddCustomOrderItem: row.can_add_custom_order_item === 1,
    canApplyOrderAdjustment: row.can_apply_order_adjustment === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
