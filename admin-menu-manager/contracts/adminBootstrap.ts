import { z } from "zod";
import { dashboardResponseSchema } from "./dashboard";
import { currentBarPermissionsResponseSchema } from "./memberships";
import { sessionResponseSchema } from "./auth";

export const adminBootstrapQuerySchema = z.object({
  barId: z.string().min(1).optional()
});

export const adminBootstrapResponseSchema = z.object({
  session: sessionResponseSchema,
  dashboard: dashboardResponseSchema,
  currentPermissions: currentBarPermissionsResponseSchema.nullable()
});

export type AdminBootstrapQuery = z.infer<typeof adminBootstrapQuerySchema>;
export type AdminBootstrapResponse = z.infer<typeof adminBootstrapResponseSchema>;
