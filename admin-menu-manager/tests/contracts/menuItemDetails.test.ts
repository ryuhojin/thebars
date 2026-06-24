import { describe, expect, it } from "vitest";
import { menuItemDetailsSchema, menuItemPriceInputSchema, normalizeMenuPriceLabel } from "../../contracts/menuItems";

describe("D11 menu item detail contract", () => {
  it("parses every fixed detail template with default empty fields", () => {
    const templates = ["general", "wine", "whisky", "spirit", "beer", "cocktail", "food", "cigar"] as const;

    for (const template of templates) {
      const parsed = menuItemDetailsSchema.parse({ template });
      expect(parsed.template).toBe(template);
    }

    expect(menuItemDetailsSchema.parse({ template: "whisky", brand: "Macallan", singleCask: true })).toMatchObject({
      template: "whisky",
      brand: "Macallan",
      country: "",
      singleCask: true,
      caskStrength: false
    });
    expect(menuItemDetailsSchema.parse({ template: "cocktail", ingredients: "gin, campari" })).toMatchObject({
      template: "cocktail",
      ingredients: "gin, campari",
      method: ""
    });
  });

  it("keeps menu price labels normalized and amounts integer-only", () => {
    expect(normalizeMenuPriceLabel(" 샷  30ml ")).toBe("샷 30ml");
    expect(menuItemPriceInputSchema.safeParse({ label: "샷", amountMinor: 18000 }).success).toBe(true);
    expect(menuItemPriceInputSchema.safeParse({ label: "샷", amountMinor: 18.5 }).success).toBe(false);
    expect(menuItemPriceInputSchema.safeParse({ label: "", amountMinor: 18000 }).success).toBe(false);
  });
});
