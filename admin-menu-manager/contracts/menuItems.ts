import { z } from "zod";
import { badgeColorSummarySchema } from "./badges";
import { itemTemplateSchema } from "./itemTypes";

export const menuSaleStatusSchema = z.enum(["available", "sold_out"]);
export const menuItemTypeSourceSchema = z.enum(["system", "bar"]);
export const menuBadgeSourceSchema = z.enum(["system", "bar"]);

export const menuNameSchema = z
  .string()
  .trim()
  .min(1, "메뉴 이름을 입력하세요.")
  .max(50, "메뉴 이름은 50자 이하여야 합니다.");

export const menuDescriptionSchema = z
  .string()
  .trim()
  .max(200, "메뉴 설명은 200자 이하여야 합니다.")
  .default("");

export const menuAbvSchema = z
  .number()
  .min(0, "ABV는 0 이상이어야 합니다.")
  .max(100, "ABV는 100 이하여야 합니다.")
  .refine((value) => Number.isInteger(value * 100), "ABV는 소수점 둘째 자리까지 입력하세요.");

export const menuInternalMemoSchema = z.string().trim().max(2000, "내부 메모는 2000자 이하여야 합니다.");

export const menuPriceLabelSchema = z.string().trim().min(1, "가격 라벨을 입력하세요.").max(20, "가격 라벨은 20자 이하여야 합니다.");

export const menuPriceVolumeTextSchema = z.string().trim().max(20, "용량 표기는 20자 이하여야 합니다.").default("");

export const menuItemPriceSchema = z.object({
  id: z.string().min(1),
  label: menuPriceLabelSchema,
  normalizedLabel: z.string().min(1),
  volumeText: menuPriceVolumeTextSchema,
  amountMinor: z.number().int("금액은 정수여야 합니다.").nonnegative("금액은 0 이상이어야 합니다."),
  displayOrder: z.number().int().nonnegative(),
  isRepresentative: z.boolean()
});

export const menuItemPriceInputSchema = z.object({
  id: z.string().min(1).optional(),
  label: menuPriceLabelSchema,
  volumeText: menuPriceVolumeTextSchema.optional(),
  amountMinor: z.number().int("금액은 정수여야 합니다.").nonnegative("금액은 0 이상이어야 합니다."),
  displayOrder: z.number().int().nonnegative().optional(),
  isRepresentative: z.boolean().optional()
});

const menuItemPriceInputsSchema = z.array(menuItemPriceInputSchema).max(10, "가격은 최대 10개까지 등록할 수 있습니다.").superRefine((prices, context) => {
  const seen = new Set<string>();
  let representativeCount = 0;
  prices.forEach((price, index) => {
    const normalized = normalizeMenuPriceLabel(price.label);
    if (price.isRepresentative) representativeCount += 1;
    if (seen.has(normalized)) {
      context.addIssue({
        code: "custom",
        path: [index, "label"],
        message: "가격 라벨이 중복됩니다."
      });
    }
    seen.add(normalized);
  });
  if (representativeCount > 1) {
    context.addIssue({
      code: "custom",
      path: ["prices"],
      message: "대표 가격은 하나만 지정할 수 있습니다."
    });
  }
});

const detailShortTextSchema = z.string().trim().max(80, "상세 정보는 80자 이하여야 합니다.").default("");
const detailLongTextSchema = z.string().trim().max(200, "상세 정보는 200자 이하여야 합니다.").default("");

export const generalMenuItemDetailsSchema = z.object({
  template: z.literal("general")
});

export const wineMenuItemDetailsSchema = z.object({
  template: z.literal("wine"),
  producer: detailShortTextSchema,
  country: detailShortTextSchema,
  region: detailShortTextSchema,
  grapeVariety: detailShortTextSchema,
  vintage: detailShortTextSchema,
  style: detailShortTextSchema,
  sweetness: detailShortTextSchema,
  body: detailShortTextSchema,
  acidity: detailShortTextSchema,
  tannin: detailShortTextSchema
});

export const whiskyMenuItemDetailsSchema = z.object({
  template: z.literal("whisky"),
  brand: detailShortTextSchema,
  country: detailShortTextSchema,
  region: detailShortTextSchema,
  classification: detailShortTextSchema,
  ageStatement: detailShortTextSchema,
  caskFinish: detailShortTextSchema,
  vintageOrDistilledYear: detailShortTextSchema,
  singleCask: z.boolean().default(false),
  caskStrength: z.boolean().default(false),
  nonChillFiltered: z.boolean().default(false)
});

export const spiritMenuItemDetailsSchema = z.object({
  template: z.literal("spirit"),
  brand: detailShortTextSchema,
  country: detailShortTextSchema,
  region: detailShortTextSchema,
  subType: detailShortTextSchema,
  baseIngredient: detailShortTextSchema,
  agingGrade: detailShortTextSchema,
  cask: detailShortTextSchema
});

export const beerMenuItemDetailsSchema = z.object({
  template: z.literal("beer"),
  brewery: detailShortTextSchema,
  country: detailShortTextSchema,
  style: detailShortTextSchema,
  ibu: detailShortTextSchema,
  ingredientsFlavor: detailLongTextSchema
});

export const cocktailMenuItemDetailsSchema = z.object({
  template: z.literal("cocktail"),
  baseSpirit: detailShortTextSchema,
  ingredients: detailLongTextSchema,
  tasteStyle: detailShortTextSchema,
  method: detailShortTextSchema,
  garnish: detailShortTextSchema,
  glass: detailShortTextSchema
});

export const foodMenuItemDetailsSchema = z.object({
  template: z.literal("food"),
  mainIngredients: detailLongTextSchema,
  allergens: detailLongTextSchema,
  spiceLevel: detailShortTextSchema,
  dietary: detailShortTextSchema,
  servingSize: detailShortTextSchema,
  pairing: detailShortTextSchema
});

export const cigarMenuItemDetailsSchema = z.object({
  template: z.literal("cigar"),
  brand: detailShortTextSchema,
  line: detailShortTextSchema,
  origin: detailShortTextSchema,
  vitola: detailShortTextSchema,
  length: detailShortTextSchema,
  ringGauge: detailShortTextSchema,
  wrapper: detailShortTextSchema,
  binder: detailShortTextSchema,
  filler: detailShortTextSchema,
  strength: detailShortTextSchema,
  flavor: detailLongTextSchema,
  smokingTime: detailShortTextSchema
});

export const menuItemDetailsSchema = z.discriminatedUnion("template", [
  generalMenuItemDetailsSchema,
  wineMenuItemDetailsSchema,
  whiskyMenuItemDetailsSchema,
  spiritMenuItemDetailsSchema,
  beerMenuItemDetailsSchema,
  cocktailMenuItemDetailsSchema,
  foodMenuItemDetailsSchema,
  cigarMenuItemDetailsSchema
]);

export const menuItemTypeSelectionSchema = z.object({
  source: menuItemTypeSourceSchema,
  id: z.string().min(1)
});

export const menuCategoryOptionSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().min(1).nullable(),
  name: z.string().min(1),
  path: z.string().min(1),
  isLeaf: z.boolean(),
  isVisible: z.boolean()
});

export const menuItemTypeOptionSchema = z.object({
  source: menuItemTypeSourceSchema,
  id: z.string().min(1),
  name: z.string().min(1),
  template: itemTemplateSchema,
  defaultPriceLabels: z.array(z.string().min(1))
});

export const menuBadgeSelectionSchema = z.object({
  source: menuBadgeSourceSchema,
  id: z.string().min(1)
});

export const menuItemBadgeSchema = menuBadgeSelectionSchema.extend({
  name: z.string().min(1),
  color: badgeColorSummarySchema,
  displayOrder: z.number().int().min(0).max(2)
});

export const menuBadgeOptionSchema = menuItemBadgeSchema.omit({ displayOrder: true });

export const menuItemSchema = z.object({
  id: z.string().min(1),
  barId: z.string().min(1),
  publicId: z.string().regex(/^menu_[1-9][0-9]*$/),
  categoryId: z.string().min(1),
  categoryPath: z.string().min(1),
  name: menuNameSchema,
  normalizedName: z.string().min(1),
  description: menuDescriptionSchema,
  saleStatus: menuSaleStatusSchema,
  isVisible: z.boolean(),
  abv: menuAbvSchema.nullable(),
  itemType: menuItemTypeOptionSchema.nullable(),
  prices: z.array(menuItemPriceSchema),
  badges: z.array(menuItemBadgeSchema).max(3),
  sortOrder: z.number().int().nonnegative(),
  updatedByUsername: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const menuItemDetailSchema = menuItemSchema.extend({
  details: menuItemDetailsSchema.nullable(),
  internalMemo: menuInternalMemoSchema,
  canEditInternalMemo: z.boolean()
});

export const menuItemsResponseSchema = z.object({
  bar: z.object({
    id: z.string().min(1),
    name: z.string().min(1)
  }),
  canEdit: z.boolean(),
  canEditInternalMemo: z.boolean(),
  categories: z.array(menuCategoryOptionSchema),
  itemTypes: z.array(menuItemTypeOptionSchema),
  badgeOptions: z.array(menuBadgeOptionSchema),
  items: z.array(menuItemSchema)
});

export const menuItemDetailResponseSchema = menuItemsResponseSchema.extend({
  item: menuItemDetailSchema.nullable()
});

export const menuItemListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  categoryId: z.string().min(1).optional(),
  itemTypeSource: menuItemTypeSourceSchema.optional(),
  itemTypeId: z.string().min(1).optional(),
  saleStatus: z.union([menuSaleStatusSchema, z.literal("all")]).optional(),
  visibility: z.enum(["all", "visible", "hidden"]).optional(),
  badgeSource: menuBadgeSourceSchema.optional(),
  badgeId: z.string().min(1).optional()
});

export const bulkMenuItemChangeSchema = z.object({
  menuItemId: z.string().min(1),
  saleStatus: menuSaleStatusSchema.optional(),
  isVisible: z.boolean().optional(),
  categoryId: z.string().min(1).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  badges: z.array(menuBadgeSelectionSchema).max(3, "배지는 메뉴당 최대 3개까지 지정할 수 있습니다.").optional()
}).superRefine((change, context) => {
  if (
    change.saleStatus === undefined &&
    change.isVisible === undefined &&
    change.categoryId === undefined &&
    change.sortOrder === undefined &&
    change.badges === undefined
  ) {
    context.addIssue({ code: "custom", message: "변경할 항목이 없습니다." });
  }
  const seen = new Set<string>();
  change.badges?.forEach((badge, index) => {
    const key = `${badge.source}:${badge.id}`;
    if (seen.has(key)) {
      context.addIssue({ code: "custom", path: ["badges", index], message: "같은 배지를 중복 지정할 수 없습니다." });
    }
    seen.add(key);
  });
});

export const bulkUpdateMenuItemsRequestSchema = z.object({
  expectedCount: z.number().int().positive(),
  changes: z.array(bulkMenuItemChangeSchema).min(1, "변경할 메뉴를 선택하세요.").max(100)
}).superRefine((input, context) => {
  const uniqueIds = new Set(input.changes.map((change) => change.menuItemId));
  if (uniqueIds.size !== input.changes.length) {
    context.addIssue({ code: "custom", path: ["changes"], message: "같은 메뉴가 중복 포함되었습니다." });
  }
});

export const bulkUpdateMenuItemsResponseSchema = menuItemsResponseSchema.extend({
  bulk: z.object({
    impactCount: z.number().int().nonnegative()
  })
});

export const createMenuItemRequestSchema = z.object({
  categoryId: z.string().min(1, "카테고리를 선택하세요."),
  name: menuNameSchema,
  description: menuDescriptionSchema.optional(),
  saleStatus: menuSaleStatusSchema.optional(),
  isVisible: z.boolean().optional(),
  abv: menuAbvSchema.nullable().optional(),
  itemType: menuItemTypeSelectionSchema.nullable().optional(),
  prices: menuItemPriceInputsSchema.optional(),
  details: menuItemDetailsSchema.nullable().optional(),
  internalMemo: menuInternalMemoSchema.optional()
});

export const updateMenuItemRequestSchema = z.object({
  categoryId: z.string().min(1, "카테고리를 선택하세요."),
  name: menuNameSchema,
  description: menuDescriptionSchema.optional(),
  saleStatus: menuSaleStatusSchema,
  isVisible: z.boolean(),
  abv: menuAbvSchema.nullable(),
  itemType: menuItemTypeSelectionSchema.nullable().optional(),
  prices: menuItemPriceInputsSchema.optional(),
  details: menuItemDetailsSchema.nullable().optional(),
  internalMemo: menuInternalMemoSchema.optional(),
  confirmDetailReset: z.boolean().optional()
});

export type MenuSaleStatus = z.infer<typeof menuSaleStatusSchema>;
export type MenuItemTypeSource = z.infer<typeof menuItemTypeSourceSchema>;
export type MenuItemTypeSelection = z.infer<typeof menuItemTypeSelectionSchema>;
export type MenuCategoryOption = z.infer<typeof menuCategoryOptionSchema>;
export type MenuItemTypeOption = z.infer<typeof menuItemTypeOptionSchema>;
export type MenuBadgeSource = z.infer<typeof menuBadgeSourceSchema>;
export type MenuBadgeSelection = z.infer<typeof menuBadgeSelectionSchema>;
export type MenuItemBadge = z.infer<typeof menuItemBadgeSchema>;
export type MenuBadgeOption = z.infer<typeof menuBadgeOptionSchema>;
export type MenuItemPrice = z.infer<typeof menuItemPriceSchema>;
export type MenuItemPriceInput = z.infer<typeof menuItemPriceInputSchema>;
export type MenuItemDetails = z.infer<typeof menuItemDetailsSchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;
export type MenuItemDetail = z.infer<typeof menuItemDetailSchema>;
export type MenuItemsResponse = z.infer<typeof menuItemsResponseSchema>;
export type MenuItemDetailResponse = z.infer<typeof menuItemDetailResponseSchema>;
export type MenuItemListQuery = z.infer<typeof menuItemListQuerySchema>;
export type BulkMenuItemChange = z.infer<typeof bulkMenuItemChangeSchema>;
export type BulkUpdateMenuItemsRequest = z.infer<typeof bulkUpdateMenuItemsRequestSchema>;
export type BulkUpdateMenuItemsResponse = z.infer<typeof bulkUpdateMenuItemsResponseSchema>;
export type CreateMenuItemRequest = z.infer<typeof createMenuItemRequestSchema>;
export type UpdateMenuItemRequest = z.infer<typeof updateMenuItemRequestSchema>;

export function normalizeMenuName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeMenuPriceLabel(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
