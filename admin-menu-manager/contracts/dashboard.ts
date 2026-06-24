import { z } from "zod";
import { authUserSchema } from "./auth";

export const dashboardMetricSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1),
  status: z.enum(["available", "unavailable"]),
  tone: z.enum(["neutral", "good", "warning", "danger"]),
  description: z.string().min(1),
  href: z.string().optional(),
  unavailableReason: z.string().optional()
});

export const dashboardBarSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(["owner", "manager", "staff", "system-admin"]),
  status: z.enum(["active", "inactive"]),
  directPublishEnabled: z.boolean(),
  href: z.string().min(1)
});

export const dashboardQuickActionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  href: z.string().min(1),
  priority: z.enum(["primary", "secondary"]),
  status: z.enum(["available", "unavailable"]),
  unavailableReason: z.string().optional()
});

export const dashboardActivitySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  tone: z.enum(["neutral", "warning", "danger"])
});

export const dashboardResponseSchema = z.object({
  actor: authUserSchema,
  mode: z.enum(["system-admin", "bar-user"]),
  selectedBarId: z.string().nullable(),
  accessibleBars: z.array(dashboardBarSchema),
  metrics: z.array(dashboardMetricSchema),
  quickActions: z.array(dashboardQuickActionSchema),
  activities: z.array(dashboardActivitySchema),
  emptyState: z
    .object({
      title: z.string().min(1),
      message: z.string().min(1)
    })
    .nullable()
});

export type DashboardMetric = z.infer<typeof dashboardMetricSchema>;
export type DashboardBar = z.infer<typeof dashboardBarSchema>;
export type DashboardQuickAction = z.infer<typeof dashboardQuickActionSchema>;
export type DashboardActivity = z.infer<typeof dashboardActivitySchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
