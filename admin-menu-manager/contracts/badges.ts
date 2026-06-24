import { z } from "zod";

export const badgeHexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, "색상은 #RRGGBB 또는 #RRGGBBAA 형식이어야 합니다.")
  .transform((value) => value.toUpperCase());

export const badgeNameSchema = z.string().trim().min(1, "배지 이름을 입력하세요.").max(20, "배지 이름은 20자 이하여야 합니다.");
export const badgeColorNameSchema = z.string().trim().min(1, "색상 이름을 입력하세요.").max(30, "색상 이름은 30자 이하여야 합니다.");

export const badgeColorSchema = z.object({
  id: z.string().min(1),
  name: badgeColorNameSchema,
  normalizedName: z.string().min(1),
  backgroundHex: badgeHexColorSchema,
  textColor: z.enum(["#000000", "#FFFFFF"]),
  isActive: z.boolean(),
  usageCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const badgeColorSummarySchema = badgeColorSchema.pick({
  id: true,
  name: true,
  backgroundHex: true,
  textColor: true,
  isActive: true
});

export const systemBadgeSchema = z.object({
  id: z.string().min(1),
  name: badgeNameSchema,
  normalizedName: z.string().min(1),
  color: badgeColorSummarySchema,
  isActive: z.boolean(),
  usageCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const systemBadgeForBarSchema = systemBadgeSchema.extend({
  isHiddenForBar: z.boolean()
});

export const barBadgeSchema = systemBadgeSchema.extend({
  barId: z.string().min(1)
});

export const badgeBarOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.union([z.literal("system-admin"), z.literal("owner"), z.literal("manager"), z.literal("staff")]),
  status: z.enum(["active", "inactive"])
});

export const badgesResponseSchema = z.object({
  colors: z.array(badgeColorSchema),
  systemBadges: z.array(systemBadgeSchema),
  accessibleBars: z.array(badgeBarOptionSchema)
});

export const barBadgesResponseSchema = z.object({
  bar: z.object({
    id: z.string().min(1),
    name: z.string().min(1)
  }),
  colors: z.array(badgeColorSchema),
  systemBadges: z.array(systemBadgeForBarSchema),
  barBadges: z.array(barBadgeSchema)
});

export const createBadgeColorRequestSchema = z.object({
  name: badgeColorNameSchema,
  backgroundHex: badgeHexColorSchema
});

export const updateBadgeColorRequestSchema = createBadgeColorRequestSchema.extend({
  isActive: z.boolean(),
  replacementColorId: z.string().min(1).optional()
});

export const createSystemBadgeRequestSchema = z.object({
  name: badgeNameSchema,
  colorId: z.string().min(1)
});

export const updateSystemBadgeRequestSchema = createSystemBadgeRequestSchema.extend({
  isActive: z.boolean(),
  confirmImpact: z.boolean().optional()
});

export const updateBarSystemBadgeVisibilityRequestSchema = z.object({
  isHidden: z.boolean()
});

export const createBarBadgeRequestSchema = createSystemBadgeRequestSchema;
export const updateBarBadgeRequestSchema = updateSystemBadgeRequestSchema;

export const deleteBarBadgeRequestSchema = z.object({
  confirmImpact: z.boolean().optional()
});

export type BadgeColor = z.infer<typeof badgeColorSchema>;
export type BadgeColorSummary = z.infer<typeof badgeColorSummarySchema>;
export type SystemBadge = z.infer<typeof systemBadgeSchema>;
export type SystemBadgeForBar = z.infer<typeof systemBadgeForBarSchema>;
export type BarBadge = z.infer<typeof barBadgeSchema>;
export type BadgeBarOption = z.infer<typeof badgeBarOptionSchema>;
export type BadgesResponse = z.infer<typeof badgesResponseSchema>;
export type BarBadgesResponse = z.infer<typeof barBadgesResponseSchema>;
export type CreateBadgeColorRequest = z.infer<typeof createBadgeColorRequestSchema>;
export type UpdateBadgeColorRequest = z.infer<typeof updateBadgeColorRequestSchema>;
export type CreateSystemBadgeRequest = z.infer<typeof createSystemBadgeRequestSchema>;
export type UpdateSystemBadgeRequest = z.infer<typeof updateSystemBadgeRequestSchema>;
export type UpdateBarSystemBadgeVisibilityRequest = z.infer<typeof updateBarSystemBadgeVisibilityRequestSchema>;
export type CreateBarBadgeRequest = z.infer<typeof createBarBadgeRequestSchema>;
export type UpdateBarBadgeRequest = z.infer<typeof updateBarBadgeRequestSchema>;
export type DeleteBarBadgeRequest = z.infer<typeof deleteBarBadgeRequestSchema>;

export function normalizeBadgeName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeBadgeHex(value: string): string {
  return badgeHexColorSchema.parse(value);
}

export function readableTextColor(backgroundHex: string, surfaceHex = "#FFFFFF"): "#000000" | "#FFFFFF" {
  const background = parseHexColor(backgroundHex);
  const surface = parseHexColor(surfaceHex);
  const composited = composite(background, surface);
  const blackContrast = contrastRatio(composited, { r: 0, g: 0, b: 0, a: 1 });
  const whiteContrast = contrastRatio(composited, { r: 255, g: 255, b: 255, a: 1 });
  return blackContrast >= whiteContrast ? "#000000" : "#FFFFFF";
}

export function contrastRatio(left: RgbaColor, right: RgbaColor): number {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  const lighter = Math.max(leftLuminance, rightLuminance);
  const darker = Math.min(leftLuminance, rightLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

type RgbaColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

function parseHexColor(value: string): RgbaColor {
  const normalized = normalizeBadgeHex(value);
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  const alpha = normalized.length === 9 ? Number.parseInt(normalized.slice(7, 9), 16) / 255 : 1;
  return { r, g, b, a: alpha };
}

function composite(top: RgbaColor, bottom: RgbaColor): RgbaColor {
  const alpha = top.a + bottom.a * (1 - top.a);
  if (alpha === 0) return { r: 255, g: 255, b: 255, a: 1 };
  return {
    r: Math.round((top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / alpha),
    g: Math.round((top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / alpha),
    b: Math.round((top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / alpha),
    a: alpha
  };
}

function relativeLuminance(color: RgbaColor): number {
  const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}
