import { z } from "zod";

const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const publicMenuStatusSchema = z.enum(["preparing", "published"]);

export const publicBusinessHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
});

export const publicBarLinkSchema = z.object({
  label: z.string().min(1).max(40),
  url: z.string().url()
});

export const publicMenuPriceSchema = z.object({
  label: z.string().min(1).max(20),
  volumeText: z.string().max(20).optional(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/)
});

export const publicMenuBadgeSchema = z.object({
  label: z.string().min(1).max(30),
  backgroundHex: hexColorSchema,
  textColor: hexColorSchema
});

export const publicMenuFieldSchema = z.object({
  label: z.string().min(1).max(40),
  value: z.string().min(1).max(200)
});

export const publicMenuItemSchema = z
  .object({
    id: z.string().regex(/^menu_[1-9][0-9]*$/),
    name: z.string().min(1).max(50),
    description: z.string().max(200).optional(),
    soldOut: z.boolean(),
    abv: z.number().min(0).max(100).nullable(),
    prices: z.array(publicMenuPriceSchema),
    badges: z.array(publicMenuBadgeSchema).max(3),
    fields: z.array(publicMenuFieldSchema)
  })
  .superRefine((item, context) => {
    if (!item.soldOut) return;
    if (item.prices.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["prices"],
        message: "sold_out menu must not expose prices"
      });
    }
    if (item.badges.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["badges"],
        message: "sold_out menu must not expose badges"
      });
    }
  });

export type PublicMenuCategory = {
  id: string;
  name: string;
  description?: string;
  items: PublicMenuItem[];
  children: PublicMenuCategory[];
};

export const publicCategorySchema: z.ZodType<PublicMenuCategory> = z.lazy(() =>
  z.object({
    id: z.string().regex(/^cat_[1-9][0-9]*$/),
    name: z.string().min(1).max(30),
    description: z.string().max(100).optional(),
    items: z.array(publicMenuItemSchema),
    children: z.array(publicCategorySchema)
  })
);

export const publicMenuSchema = z.object({
  schemaVersion: z.literal(1),
  status: publicMenuStatusSchema,
  revision: z.number().int().nonnegative(),
  publishedAt: z.string().datetime().nullable(),
  generatedAt: z.string().datetime(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  encodedSlug: z.string().regex(/^[A-Za-z0-9_-]+$/),
  bar: z.object({
    name: z.string().min(1).max(80),
    intro: z.string().max(500).optional(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    address: z.string().max(300).optional(),
    mapUrl: z.string().url().optional(),
    phoneNumberDisplay: z.string().max(30).optional(),
    openingNote: z.string().max(300).optional(),
    businessHours: z.array(publicBusinessHourSchema),
    links: z.array(publicBarLinkSchema)
  }),
  categories: z.array(publicCategorySchema)
});

export type PublicMenu = z.infer<typeof publicMenuSchema>;
export type PublicMenuItem = z.infer<typeof publicMenuItemSchema>;
export type PublicMenuPrice = z.infer<typeof publicMenuPriceSchema>;
export type PublicMenuBadge = z.infer<typeof publicMenuBadgeSchema>;
export type PublicMenuField = z.infer<typeof publicMenuFieldSchema>;
export type PublicBusinessHour = z.infer<typeof publicBusinessHourSchema>;
export type PublicBarLink = z.infer<typeof publicBarLinkSchema>;

export type PublicCategorySection = {
  id: string;
  name: string;
  path: string;
  description?: string;
  items: PublicMenuItem[];
};

const forbiddenPublicKeys = new Set([
  "barId",
  "userId",
  "internalId",
  "internalMemo",
  "createdBy",
  "updatedBy",
  "createdByUserId",
  "updatedByUserId",
  "token",
  "password",
  "session"
]);

export function parsePublicMenu(input: unknown): PublicMenu {
  assertNoForbiddenPublicKeys(input);
  return publicMenuSchema.parse(input);
}

export function assertNoForbiddenPublicKeys(value: unknown, path: string[] = []): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenPublicKeys(item, [...path, String(index)]));
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (forbiddenPublicKeys.has(key)) {
      throw new Error(`Forbidden public menu field: ${[...path, key].join(".")}`);
    }
    assertNoForbiddenPublicKeys(nestedValue, [...path, key]);
  }
}

export function flattenPublicCategorySections(categories: PublicMenuCategory[]): PublicCategorySection[] {
  const sections: PublicCategorySection[] = [];
  const visit = (category: PublicMenuCategory, parentNames: string[]) => {
    const pathParts = [...parentNames, category.name];
    if (category.items.length > 0 || category.children.length === 0) {
      sections.push({
        id: category.id,
        name: category.name,
        path: pathParts.join(" / "),
        description: category.description,
        items: category.items
      });
    }
    category.children.forEach((child) => visit(child, pathParts));
  };
  categories.forEach((category) => visit(category, []));
  return sections;
}

export function filterPublicMenu(menu: PublicMenu, query: string): PublicMenu {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return menu;

  const filterCategory = (category: PublicMenuCategory): PublicMenuCategory | null => {
    const categoryMatches = [category.name, category.description ?? ""].join(" ").toLocaleLowerCase().includes(normalized);
    const items = category.items.filter((item) => categoryMatches || publicMenuItemSearchText(item).includes(normalized));
    const children = category.children.map(filterCategory).filter((child): child is PublicMenuCategory => child !== null);
    if (items.length === 0 && children.length === 0) return null;
    return { ...category, items, children };
  };

  return {
    ...menu,
    categories: menu.categories.map(filterCategory).filter((category): category is PublicMenuCategory => category !== null)
  };
}

export function stablePublicMenuStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

export async function calculatePublicMenuContentHash(menu: PublicMenu | Omit<PublicMenu, "contentHash">): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stablePublicMenuStringify(publicMenuContentForHash(menu))));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function publicMenuContentForHash(menu: PublicMenu | Omit<PublicMenu, "contentHash">): unknown {
  const { contentHash: _contentHash, revision: _revision, publishedAt: _publishedAt, generatedAt: _generatedAt, ...content } =
    menu as PublicMenu;
  return content;
}

function publicMenuItemSearchText(item: PublicMenuItem): string {
  return [
    item.name,
    item.description ?? "",
    item.abv === null ? "" : `${item.abv}`,
    ...item.prices.flatMap((price) => [price.label, price.volumeText ?? "", String(price.amountMinor), price.currency]),
    ...item.badges.map((badge) => badge.label),
    ...item.fields.flatMap((field) => [field.label, field.value])
  ]
    .join(" ")
    .toLocaleLowerCase();
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJsonValue(nested)])
  );
}
