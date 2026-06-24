import { z } from "zod";
import { itemTemplateSchema } from "./itemTypes";
import { orderTabSummarySchema } from "./orderTabs";

export const pilotReadinessStatusSchema = z.enum(["pass", "manual_required", "action_required"]);

export const pilotReadinessCheckSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: pilotReadinessStatusSchema,
  owner: z.string().min(1),
  evidence: z.string().min(1),
  runbookHref: z.string().min(1).optional()
});

export const pilotReadinessSectionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: pilotReadinessStatusSchema,
  checks: z.array(pilotReadinessCheckSchema).min(1)
});

export const pilotBarReadinessSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["active", "inactive"]),
  encodedSlug: z.string().min(1),
  roleCoverage: z.object({
    owner: z.boolean(),
    manager: z.boolean(),
    staff: z.boolean()
  }),
  categoryCount: z.number().int().nonnegative(),
  menuItemCount: z.number().int().nonnegative(),
  visibleMenuItemCount: z.number().int().nonnegative(),
  representativeTemplates: z.array(itemTemplateSchema),
  orderSummary: orderTabSummarySchema,
  latestSuccessfulPublicationAt: z.string().datetime().nullable(),
  lastPublicationStatus: z.string().nullable()
});

export const pilotRunbookSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  href: z.string().min(1)
});

export const pilotReadinessResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  overallStatus: z.enum(["ready_for_pilot", "action_required"]),
  humanApprovalRequired: z.literal(true),
  pilotBars: z.array(pilotBarReadinessSchema),
  sections: z.array(pilotReadinessSectionSchema).min(1),
  runbooks: z.array(pilotRunbookSchema).min(1)
});

export type PilotReadinessStatus = z.infer<typeof pilotReadinessStatusSchema>;
export type PilotReadinessCheck = z.infer<typeof pilotReadinessCheckSchema>;
export type PilotReadinessSection = z.infer<typeof pilotReadinessSectionSchema>;
export type PilotBarReadiness = z.infer<typeof pilotBarReadinessSchema>;
export type PilotReadinessResponse = z.infer<typeof pilotReadinessResponseSchema>;
