import { z } from "zod";
import { publicationSummarySchema } from "./publications";

export const barStatusSchema = z.enum(["active", "inactive"]);
export const publicMenuStatusSchema = z.enum(["preparing", "published"]);
export const barLifecycleActionSchema = z.enum(["deactivate", "activate"]);

export const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, "통화는 ISO 4217 대문자 3자리여야 합니다.");

export const barNameSchema = z.string().trim().min(1, "바 이름을 입력하세요.").max(80, "바 이름은 80자 이하여야 합니다.");

export const createBarRequestSchema = z.object({
  name: barNameSchema,
  currency: currencySchema
});

export const updateBarLifecycleRequestSchema = z.object({
  action: barLifecycleActionSchema,
  confirmImpact: z.literal(true)
});

export const barSummarySchema = z.object({
  id: z.string().min(1),
  name: barNameSchema,
  slug: z.string().regex(/^bar-[a-z0-9]{6}$/),
  encodedSlug: z.string().regex(/^[A-Za-z0-9_-]+$/),
  customerPath: z.string().regex(/^\/[A-Za-z0-9_-]+$/),
  status: barStatusSchema,
  currency: currencySchema,
  publicMenuStatus: publicMenuStatusSchema,
  directPublishEnabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const barOverviewCardSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1),
  description: z.string().min(1),
  status: z.enum(["available", "unavailable"]),
  href: z.string().min(1).optional(),
  unavailableReason: z.string().min(1).optional()
});

export const barLifecycleEventSchema = z.object({
  id: z.string().min(1),
  barId: z.string().min(1),
  action: barLifecycleActionSchema,
  beforeStatus: barStatusSchema,
  afterStatus: barStatusSchema,
  publicationId: z.string().min(1).nullable(),
  result: z.string().min(1),
  createdAt: z.string().datetime()
});

export const barDetailSchema = barSummarySchema.extend({
  overviewCards: z.array(barOverviewCardSchema),
  recentPublication: z
    .object({
      status: z.enum(["preparing", "success", "failed", "timeout_unknown"]),
      label: z.string().min(1),
      description: z.string().min(1)
    })
    .nullable(),
  lifecycle: z.object({
    canChangeStatus: z.boolean(),
    nextAction: barLifecycleActionSchema,
    impactLabel: z.string().min(1),
    customerJsonState: z.string().min(1)
  }),
  lifecycleEvents: z.array(barLifecycleEventSchema)
});

export const updateBarLifecycleResponseSchema = z.object({
  bar: barDetailSchema,
  publication: publicationSummarySchema.nullable(),
  event: barLifecycleEventSchema
});

export const barListResponseSchema = z.object({
  items: z.array(barSummarySchema),
  summary: z.object({
    totalBars: z.number().int().nonnegative(),
    activeBars: z.number().int().nonnegative(),
    inactiveBars: z.number().int().nonnegative()
  })
});

export type CreateBarRequest = z.infer<typeof createBarRequestSchema>;
export type BarLifecycleAction = z.infer<typeof barLifecycleActionSchema>;
export type UpdateBarLifecycleRequest = z.infer<typeof updateBarLifecycleRequestSchema>;
export type BarLifecycleEvent = z.infer<typeof barLifecycleEventSchema>;
export type BarSummary = z.infer<typeof barSummarySchema>;
export type BarDetail = z.infer<typeof barDetailSchema>;
export type BarListResponse = z.infer<typeof barListResponseSchema>;
export type UpdateBarLifecycleResponse = z.infer<typeof updateBarLifecycleResponseSchema>;
