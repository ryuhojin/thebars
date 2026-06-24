import { z } from "zod";

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "카테고리 이름을 입력하세요.")
  .max(30, "카테고리 이름은 30자 이하여야 합니다.");

export const categoryDescriptionSchema = z
  .string()
  .trim()
  .max(100, "카테고리 설명은 100자 이하여야 합니다.")
  .default("");

export const categorySchema = z.object({
  id: z.string().min(1),
  barId: z.string().min(1),
  publicId: z.string().regex(/^cat_[1-9][0-9]*$/),
  parentId: z.string().min(1).nullable(),
  name: categoryNameSchema,
  normalizedName: z.string().min(1),
  description: categoryDescriptionSchema,
  showDescription: z.boolean(),
  isVisible: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  childCount: z.number().int().nonnegative(),
  menuCount: z.number().int().nonnegative(),
  updatedByUsername: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const categoryBarSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1)
});

export const categoriesResponseSchema = z.object({
  bar: categoryBarSchema,
  categories: z.array(categorySchema)
});

export const createCategoryRequestSchema = z.object({
  parentId: z.string().min(1).nullable().optional(),
  name: categoryNameSchema,
  description: categoryDescriptionSchema.optional(),
  showDescription: z.boolean().optional(),
  isVisible: z.boolean().optional()
});

export const updateCategoryRequestSchema = z.object({
  name: categoryNameSchema,
  description: categoryDescriptionSchema.optional(),
  showDescription: z.boolean(),
  isVisible: z.boolean()
});

export const moveCategoryRequestSchema = z.object({
  parentId: z.string().min(1).nullable()
});

export const reorderCategoriesRequestSchema = z.object({
  parentId: z.string().min(1).nullable(),
  orderedIds: z.array(z.string().min(1)).min(1, "정렬할 카테고리를 선택하세요.")
});

export const deleteCategoryRequestSchema = z.object({
  confirmCascade: z.boolean().optional()
});

export type Category = z.infer<typeof categorySchema>;
export type CategoriesResponse = z.infer<typeof categoriesResponseSchema>;
export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;
export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;
export type MoveCategoryRequest = z.infer<typeof moveCategoryRequestSchema>;
export type ReorderCategoriesRequest = z.infer<typeof reorderCategoriesRequestSchema>;
export type DeleteCategoryRequest = z.infer<typeof deleteCategoryRequestSchema>;

export function normalizeCategoryName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
