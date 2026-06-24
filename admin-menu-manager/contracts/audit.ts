import { z } from "zod";

export const auditOperations = [
  "auth.login_failed",
  "auth.login_succeeded",
  "user.created",
  "user.updated",
  "user.unlocked",
  "membership.changed",
  "permission.changed",
  "bar.created",
  "bar.lifecycle_changed",
  "bar.settings_updated",
  "publication.requested",
  "publication.republished",
  "order_tab.item_voided",
  "order_tab.adjusted",
  "order_tab.settled",
  "order_tab.cancelled",
  "category.changed",
  "menu_item.changed",
  "badge.changed",
  "item_type.changed",
  "maintenance.retention"
] as const;

export const auditOperationSchema = z.enum(auditOperations);
export const auditResultSchema = z.enum(["success", "failure"]);
export const maintenanceStatusSchema = z.enum(["dry_run", "completed", "failed"]);

const metadataValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const auditLogSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.string().datetime(),
  requestId: z.string().min(1),
  actorUserId: z.string().nullable(),
  actorUsername: z.string(),
  barId: z.string().nullable(),
  barName: z.string(),
  operation: auditOperationSchema,
  result: auditResultSchema,
  targetType: z.string(),
  targetId: z.string(),
  targetLabel: z.string(),
  errorCode: z.string().nullable(),
  externalRef: z.string().nullable(),
  metadata: z.record(z.string(), metadataValueSchema)
});

export const auditLogQuerySchema = z.object({
  q: z.string().trim().default(""),
  actorUserId: z.string().trim().default("all"),
  barId: z.string().trim().default("all"),
  operation: z.union([auditOperationSchema, z.literal("all")]).default("all"),
  result: z.union([auditResultSchema, z.literal("all")]).default("all"),
  dateFrom: z.string().trim().default(""),
  dateTo: z.string().trim().default(""),
  pageSize: z.coerce.number().int().min(1).max(200).default(100)
});

const filterOptionSchema = z.object({
  value: z.string(),
  label: z.string()
});

export const retentionPreviewSchema = z.object({
  orderTerminalCutoff: z.string().datetime(),
  dailySummaryCutoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  closedCancelledOrderTabs: z.number().int().nonnegative(),
  dailyOrderSummaries: z.number().int().nonnegative(),
  publicationHistoryOverflow: z.number().int().nonnegative()
});

export const maintenanceRunSchema = z.object({
  id: z.string().min(1),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  actorUserId: z.string().nullable(),
  actorUsername: z.string(),
  requestId: z.string().min(1),
  status: maintenanceStatusSchema,
  operation: z.literal("retention_cleanup"),
  dryRun: z.boolean(),
  result: retentionPreviewSchema,
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable()
});

export const auditListResponseSchema = z.object({
  items: z.array(auditLogSchema),
  summary: z.object({
    total: z.number().int().nonnegative(),
    success: z.number().int().nonnegative(),
    failure: z.number().int().nonnegative()
  }),
  filters: z.object({
    actors: z.array(filterOptionSchema),
    bars: z.array(filterOptionSchema),
    operations: z.array(filterOptionSchema),
    results: z.array(filterOptionSchema)
  }),
  maintenance: z.object({
    policy: z.object({
      closedCancelledOrderDays: z.literal(365),
      dailySummaryYears: z.literal(3),
      publicationSuccessLimit: z.literal(100),
      publicationFailureLimit: z.literal(100)
    }),
    lastRun: maintenanceRunSchema.nullable(),
    preview: retentionPreviewSchema
  })
});

export const maintenanceRunRequestSchema = z.object({
  dryRun: z.boolean().default(true)
});

export const maintenanceRunResponseSchema = z.object({
  run: maintenanceRunSchema,
  deleted: retentionPreviewSchema
});

export type AuditOperation = z.infer<typeof auditOperationSchema>;
export type AuditResult = z.infer<typeof auditResultSchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
export type AuditListResponse = z.infer<typeof auditListResponseSchema>;
export type MaintenanceRunRequest = z.infer<typeof maintenanceRunRequestSchema>;
export type MaintenanceRunResponse = z.infer<typeof maintenanceRunResponseSchema>;
export type MaintenanceRun = z.infer<typeof maintenanceRunSchema>;
export type RetentionPreview = z.infer<typeof retentionPreviewSchema>;
