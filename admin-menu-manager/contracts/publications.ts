import { z } from "zod";
import { DEFAULT_PUBLIC_MENU_CONCEPT, publicMenuAvailableConceptSchema } from "./publicMenu";

export const publicationStatusSchema = z.enum([
  "pending",
  "building_json",
  "validating_json",
  "committing_github",
  "waiting_cloudflare",
  "success",
  "failed",
  "timeout_unknown"
]);

export const publicationOperationSchema = z.enum([
  "menu_json",
  "trigger",
  "snapshot_republish",
  "delete_menu_json",
  "restore_snapshot",
  "restore_preparing"
]);

export const publicationStepIdSchema = z.enum([
  "building_json",
  "validating_json",
  "committing_github",
  "waiting_cloudflare",
  "completed"
]);

export const publicationStepStatusSchema = z.enum(["pending", "active", "completed", "failed"]);

export const cloudflareDeploymentStatusSchema = z.enum([
  "queued",
  "building",
  "success",
  "failed",
  "timeout_unknown"
]);

export const publishCurrentMenuRequestSchema = z.object({
  confirmSavedOnly: z.literal(true),
  layoutConcept: publicMenuAvailableConceptSchema.default(DEFAULT_PUBLIC_MENU_CONCEPT),
  clientMutationId: z.string().trim().max(80).optional()
});

export const republishSnapshotRequestSchema = z.object({
  confirmCurrentEditUnchanged: z.literal(true),
  clientMutationId: z.string().trim().max(80).optional()
});

export const publicationStepSchema = z.object({
  id: publicationStepIdSchema,
  label: z.string().min(1),
  status: publicationStepStatusSchema,
  at: z.string().datetime().nullable()
});

export const publicationErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1)
  })
  .nullable();

export const cloudflareDeploymentSchema = z
  .object({
    adapter: z.enum(["fake-cloudflare", "cloudflare-pages"]),
    deploymentId: z.string().min(1).nullable(),
    status: cloudflareDeploymentStatusSchema,
    sourceCommitSha: z.string().min(1).nullable(),
    deploymentUrl: z.string().url().nullable(),
    startedAt: z.string().datetime().nullable(),
    checkedAt: z.string().datetime().nullable(),
    completedAt: z.string().datetime().nullable(),
    skippedExternalRead: z.boolean()
  })
  .nullable();

export const publicationSummarySchema = z.object({
  id: z.string().min(1),
  barId: z.string().min(1),
  status: publicationStatusSchema,
  operation: publicationOperationSchema.nullable(),
  revision: z.number().int().nonnegative(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  menuPath: z.string().regex(/^public\/menus\/[A-Za-z0-9_-]+\.json$/),
  triggerPath: z.string().regex(/^public\/publish-triggers\/[A-Za-z0-9_-]+\.json$/),
  publishedAt: z.string().datetime().nullable(),
  commitSha: z.string().min(1).nullable(),
  deployment: cloudflareDeploymentSchema,
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  error: publicationErrorSchema,
  steps: z.array(publicationStepSchema)
});

export const publicationListResponseSchema = z.object({
  bar: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    encodedSlug: z.string().regex(/^[A-Za-z0-9_-]+$/),
    customerPath: z.string().regex(/^\/[A-Za-z0-9_-]+$/),
    directPublishEnabled: z.boolean()
  }),
  canPublish: z.boolean(),
  current: z.object({
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    schemaVersion: z.literal(1),
    menuPath: z.string().regex(/^public\/menus\/[A-Za-z0-9_-]+\.json$/),
    triggerPath: z.string().regex(/^public\/publish-triggers\/[A-Za-z0-9_-]+\.json$/),
    savedOnlyNotice: z.string().min(1)
  }),
  latestSuccess: publicationSummarySchema.nullable(),
  publications: z.array(publicationSummarySchema),
  polling: z.object({
    active: z.boolean(),
    intervalMs: z.literal(30000),
    timeoutSeconds: z.literal(180)
  }),
  editDiff: z.object({
    hasUnpublishedChanges: z.boolean(),
    latestContentHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    currentContentHash: z.string().regex(/^[a-f0-9]{64}$/)
  })
});

export const publishCurrentMenuResponseSchema = z.object({
  publication: publicationSummarySchema,
  commit: z.object({
    adapter: z.enum(["fake-github", "github"]),
    operation: publicationOperationSchema,
    path: z.string().min(1),
    commitSha: z.string().min(1),
    message: z.string().min(1),
    skippedExternalWrite: z.boolean()
  }),
  deployment: cloudflareDeploymentSchema
});

export type PublicationStatus = z.infer<typeof publicationStatusSchema>;
export type PublicationOperation = z.infer<typeof publicationOperationSchema>;
export type CloudflareDeploymentStatus = z.infer<typeof cloudflareDeploymentStatusSchema>;
export type CloudflareDeployment = z.infer<typeof cloudflareDeploymentSchema>;
export type PublishCurrentMenuRequest = z.infer<typeof publishCurrentMenuRequestSchema>;
export type RepublishSnapshotRequest = z.infer<typeof republishSnapshotRequestSchema>;
export type PublicationStep = z.infer<typeof publicationStepSchema>;
export type PublicationSummary = z.infer<typeof publicationSummarySchema>;
export type PublicationListResponse = z.infer<typeof publicationListResponseSchema>;
export type PublishCurrentMenuResponse = z.infer<typeof publishCurrentMenuResponseSchema>;
export type RepublishSnapshotResponse = z.infer<typeof publishCurrentMenuResponseSchema>;
