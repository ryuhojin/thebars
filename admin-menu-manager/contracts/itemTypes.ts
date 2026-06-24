import { z } from "zod";

export const itemTemplateSchema = z.enum([
  "general",
  "wine",
  "whisky",
  "spirit",
  "beer",
  "cocktail",
  "food",
  "cigar"
]);

export const grapeCandidateStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const priceLabelSchema = z.string().trim().min(1, "가격 라벨을 입력하세요.").max(20, "가격 라벨은 20자 이하여야 합니다.");

export const priceLabelsSchema = z.array(priceLabelSchema).max(10, "기본 가격 라벨은 최대 10개까지 등록할 수 있습니다.").superRefine((labels, context) => {
  const seen = new Set<string>();
  labels.forEach((label, index) => {
    const normalized = normalizeName(label);
    if (seen.has(normalized)) {
      context.addIssue({
        code: "custom",
        path: [index],
        message: "가격 라벨이 중복됩니다."
      });
    }
    seen.add(normalized);
  });
});

export const itemTypeNameSchema = z.string().trim().min(1, "유형 이름을 입력하세요.").max(30, "유형 이름은 30자 이하여야 합니다.");

export const systemItemTypeSchema = z.object({
  id: z.string().min(1),
  name: itemTypeNameSchema,
  normalizedName: z.string().min(1),
  template: itemTemplateSchema,
  defaultPriceLabels: priceLabelsSchema,
  isActive: z.boolean(),
  usageCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const barItemTypeSchema = systemItemTypeSchema.extend({
  barId: z.string().min(1)
});

export const barItemTypeOverrideSchema = z.object({
  barId: z.string().min(1),
  systemItemTypeId: z.string().min(1),
  isHidden: z.boolean(),
  defaultPriceLabels: priceLabelsSchema,
  updatedAt: z.string().datetime()
});

export const itemTypeBarOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.union([z.literal("system-admin"), z.literal("owner"), z.literal("manager"), z.literal("staff")]),
  status: z.enum(["active", "inactive"])
});

export const itemTypeTemplateOptionSchema = z.object({
  value: itemTemplateSchema,
  label: z.string().min(1),
  fields: z.array(z.string().min(1))
});

export const itemTypesResponseSchema = z.object({
  isSystemAdmin: z.boolean(),
  templates: z.array(itemTypeTemplateOptionSchema),
  systemTypes: z.array(systemItemTypeSchema),
  accessibleBars: z.array(itemTypeBarOptionSchema)
});

export const barItemTypesResponseSchema = z.object({
  bar: z.object({
    id: z.string().min(1),
    name: z.string().min(1)
  }),
  templates: z.array(itemTypeTemplateOptionSchema),
  systemTypes: z.array(systemItemTypeSchema),
  overrides: z.array(barItemTypeOverrideSchema),
  barTypes: z.array(barItemTypeSchema)
});

export const createSystemItemTypeRequestSchema = z.object({
  name: itemTypeNameSchema,
  template: itemTemplateSchema,
  defaultPriceLabels: priceLabelsSchema
});

export const updateSystemItemTypeRequestSchema = createSystemItemTypeRequestSchema.extend({
  isActive: z.boolean()
});

export const createBarItemTypeRequestSchema = createSystemItemTypeRequestSchema;
export const updateBarItemTypeRequestSchema = updateSystemItemTypeRequestSchema;

export const updateBarItemTypeOverrideRequestSchema = z.object({
  isHidden: z.boolean(),
  defaultPriceLabels: priceLabelsSchema
});

export const grapeVarietySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  normalizedName: z.string().min(1),
  createdAt: z.string().datetime()
});

export const grapeVarietyCandidateSchema = z.object({
  id: z.string().min(1),
  barId: z.string().min(1).nullable(),
  proposedName: z.string().min(1).max(60),
  normalizedProposedName: z.string().min(1),
  status: grapeCandidateStatusSchema,
  standardName: z.string().min(1).max(60).nullable(),
  submittedByUsername: z.string().min(1),
  reviewedByUsername: z.string().min(1).nullable(),
  rejectionReason: z.string().max(200).nullable(),
  createdAt: z.string().datetime(),
  reviewedAt: z.string().datetime().nullable()
});

export const grapeVarietiesResponseSchema = z.object({
  varieties: z.array(grapeVarietySchema)
});

export const grapeVarietyCandidatesResponseSchema = z.object({
  candidates: z.array(grapeVarietyCandidateSchema)
});

export const submitGrapeCandidateRequestSchema = z.object({
  barId: z.string().min(1),
  proposedName: z.string().trim().min(1, "후보 이름을 입력하세요.").max(60, "후보 이름은 60자 이하여야 합니다.")
});

export const approveGrapeCandidateRequestSchema = z.object({
  standardName: z.string().trim().min(1, "표준명을 입력하세요.").max(60, "표준명은 60자 이하여야 합니다.")
});

export const rejectGrapeCandidateRequestSchema = z.object({
  reason: z.string().trim().max(200, "반려 사유는 200자 이하여야 합니다.").optional()
});

export type ItemTemplate = z.infer<typeof itemTemplateSchema>;
export type SystemItemType = z.infer<typeof systemItemTypeSchema>;
export type BarItemType = z.infer<typeof barItemTypeSchema>;
export type BarItemTypeOverride = z.infer<typeof barItemTypeOverrideSchema>;
export type ItemTypeBarOption = z.infer<typeof itemTypeBarOptionSchema>;
export type ItemTypesResponse = z.infer<typeof itemTypesResponseSchema>;
export type BarItemTypesResponse = z.infer<typeof barItemTypesResponseSchema>;
export type CreateSystemItemTypeRequest = z.infer<typeof createSystemItemTypeRequestSchema>;
export type UpdateSystemItemTypeRequest = z.infer<typeof updateSystemItemTypeRequestSchema>;
export type CreateBarItemTypeRequest = z.infer<typeof createBarItemTypeRequestSchema>;
export type UpdateBarItemTypeRequest = z.infer<typeof updateBarItemTypeRequestSchema>;
export type UpdateBarItemTypeOverrideRequest = z.infer<typeof updateBarItemTypeOverrideRequestSchema>;
export type GrapeVariety = z.infer<typeof grapeVarietySchema>;
export type GrapeVarietyCandidate = z.infer<typeof grapeVarietyCandidateSchema>;
export type GrapeVarietiesResponse = z.infer<typeof grapeVarietiesResponseSchema>;
export type GrapeVarietyCandidatesResponse = z.infer<typeof grapeVarietyCandidatesResponseSchema>;
export type SubmitGrapeCandidateRequest = z.infer<typeof submitGrapeCandidateRequestSchema>;
export type ApproveGrapeCandidateRequest = z.infer<typeof approveGrapeCandidateRequestSchema>;
export type RejectGrapeCandidateRequest = z.infer<typeof rejectGrapeCandidateRequestSchema>;

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
