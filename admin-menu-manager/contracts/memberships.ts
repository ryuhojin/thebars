import { z } from "zod";
import { barStatusSchema } from "./bars";
import { systemUserStatusSchema } from "./systemUsers";

export const membershipRoleSchema = z.enum(["owner", "manager", "staff"]);
export const barPermissionKeySchema = z.enum([
  "canEditMenu",
  "canManageOrders",
  "canAddCustomOrderItem",
  "canApplyOrderAdjustment"
]);

export const rolePermissionSchema = z.object({
  role: membershipRoleSchema,
  canEditMenu: z.boolean(),
  canManageOrders: z.boolean(),
  canAddCustomOrderItem: z.boolean(),
  canApplyOrderAdjustment: z.boolean()
});

export const membershipUserOptionSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  status: systemUserStatusSchema,
  isActive: z.boolean(),
  alreadyMember: z.boolean()
});

export const barMembershipSchema = z.object({
  id: z.string().min(1),
  barId: z.string().min(1),
  userId: z.string().min(1),
  username: z.string().min(1),
  role: membershipRoleSchema,
  isActive: z.boolean(),
  userIsActive: z.boolean(),
  joinedAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const barMembersResponseSchema = z.object({
  bar: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    status: barStatusSchema
  }),
  members: z.array(barMembershipSchema),
  rolePermissions: z.array(rolePermissionSchema),
  availableUsers: z.array(membershipUserOptionSchema)
});

export const addBarMembershipRequestSchema = z.object({
  userId: z.string().min(1, "사용자를 선택하세요."),
  role: membershipRoleSchema
});

export const updateBarMembershipRequestSchema = z.object({
  role: membershipRoleSchema
});

export const updateRolePermissionsRequestSchema = z.object({
  permissions: z.array(rolePermissionSchema).length(3)
});

export const currentBarPermissionsQuerySchema = z.object({
  require: barPermissionKeySchema.optional()
});

export const currentBarPermissionsResponseSchema = z.object({
  barId: z.string().min(1),
  role: z.union([membershipRoleSchema, z.literal("system-admin")]),
  permissions: rolePermissionSchema.omit({ role: true }),
  required: barPermissionKeySchema.optional(),
  allowed: z.boolean()
});

export const barMembershipCommandResponseSchema = z.object({
  membership: barMembershipSchema,
  rolePermissions: z.array(rolePermissionSchema)
});

export const rolePermissionsResponseSchema = z.object({
  barId: z.string().min(1),
  permissions: z.array(rolePermissionSchema)
});

export type MembershipRole = z.infer<typeof membershipRoleSchema>;
export type BarPermissionKey = z.infer<typeof barPermissionKeySchema>;
export type RolePermission = z.infer<typeof rolePermissionSchema>;
export type MembershipUserOption = z.infer<typeof membershipUserOptionSchema>;
export type BarMembership = z.infer<typeof barMembershipSchema>;
export type BarMembersResponse = z.infer<typeof barMembersResponseSchema>;
export type AddBarMembershipRequest = z.infer<typeof addBarMembershipRequestSchema>;
export type UpdateBarMembershipRequest = z.infer<typeof updateBarMembershipRequestSchema>;
export type UpdateRolePermissionsRequest = z.infer<typeof updateRolePermissionsRequestSchema>;
export type CurrentBarPermissionsQuery = z.infer<typeof currentBarPermissionsQuerySchema>;
export type CurrentBarPermissionsResponse = z.infer<typeof currentBarPermissionsResponseSchema>;
export type BarMembershipCommandResponse = z.infer<typeof barMembershipCommandResponseSchema>;
export type RolePermissionsResponse = z.infer<typeof rolePermissionsResponseSchema>;
