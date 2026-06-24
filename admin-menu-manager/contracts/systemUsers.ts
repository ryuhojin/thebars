import { z } from "zod";
import { usernameSchema } from "./auth";

export const systemUserStatusSchema = z.enum(["active", "inactive", "locked"]);
export const systemUserStatusFilterSchema = z.enum(["all", "active", "inactive", "locked", "forced_password_change"]);

export const systemUserListQuerySchema = z.object({
  q: z.string().trim().max(40).default(""),
  status: systemUserStatusFilterSchema.default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20)
});

export const createSystemUserRequestSchema = z.object({
  username: usernameSchema
});

export const systemUserSchema = z.object({
  id: z.string().min(1),
  username: usernameSchema,
  isSystemAdmin: z.boolean(),
  status: systemUserStatusSchema,
  isActive: z.boolean(),
  isLocked: z.boolean(),
  forcedPasswordChange: z.boolean(),
  lockedUntil: z.string().datetime().nullable(),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  membershipsLabel: z.string().min(1)
});

export const systemUserListResponseSchema = z.object({
  items: z.array(systemUserSchema),
  summary: z.object({
    totalUsers: z.number().int().nonnegative(),
    activeUsers: z.number().int().nonnegative(),
    inactiveUsers: z.number().int().nonnegative(),
    lockedUsers: z.number().int().nonnegative(),
    forcedPasswordUsers: z.number().int().nonnegative()
  }),
  pagination: z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().min(1)
  })
});

export const systemUserDetailSchema = systemUserSchema.extend({
  activeSessionCount: z.number().int().nonnegative()
});

export const createSystemUserResponseSchema = z.object({
  user: systemUserDetailSchema,
  temporaryPassword: z.string().min(10),
  oneTimeNotice: z.literal(true)
});

export const systemUserCommandResponseSchema = z.object({
  user: systemUserDetailSchema
});

export type SystemUserStatus = z.infer<typeof systemUserStatusSchema>;
export type SystemUserStatusFilter = z.infer<typeof systemUserStatusFilterSchema>;
export type SystemUserListQuery = z.infer<typeof systemUserListQuerySchema>;
export type CreateSystemUserRequest = z.infer<typeof createSystemUserRequestSchema>;
export type SystemUser = z.infer<typeof systemUserSchema>;
export type SystemUserDetail = z.infer<typeof systemUserDetailSchema>;
export type SystemUserListResponse = z.infer<typeof systemUserListResponseSchema>;
export type CreateSystemUserResponse = z.infer<typeof createSystemUserResponseSchema>;
export type SystemUserCommandResponse = z.infer<typeof systemUserCommandResponseSchema>;
