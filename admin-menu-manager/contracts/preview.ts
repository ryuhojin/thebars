import { z } from "zod";
import { publicMenuSchema } from "./publicMenu";

export const previewScopeOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["all", "category", "menu"]),
  categoryId: z.string().min(1).optional()
});

export const publicMenuPreviewResponseSchema = z.object({
  bar: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    encodedSlug: z.string().min(1),
    customerPath: z.string().min(1)
  }),
  menu: publicMenuSchema,
  scopeOptions: z.array(previewScopeOptionSchema),
  schema: z.object({
    valid: z.literal(true),
    schemaVersion: z.literal(1)
  }),
  hash: z.object({
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    canonicalJson: z.string().min(1)
  })
});

export type PreviewScopeOption = z.infer<typeof previewScopeOptionSchema>;
export type PublicMenuPreviewResponse = z.infer<typeof publicMenuPreviewResponseSchema>;
