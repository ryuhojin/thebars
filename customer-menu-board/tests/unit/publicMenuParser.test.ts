import { describe, expect, it } from "vitest";
import { parsePublicMenu } from "../../src/menu/parser";
import { searchMenu } from "../../src/menu/search/searchMenu";

const fixture = {
  schemaVersion: 1,
  status: "published",
  layout: { concept: "menu_book" },
  revision: 12,
  publishedAt: "2026-06-23T00:00:00.000Z",
  generatedAt: "2026-06-23T00:00:00.000Z",
  contentHash: "0000000000000000000000000000000000000000000000000000000000000000",
  encodedSlug: "YmFyLWE3azJtOQ",
  bar: {
    name: "Sample Bar",
    intro: "공개 메뉴",
    currency: "KRW",
    businessHours: [],
    links: []
  },
  categories: [
    {
      id: "cat_1",
      name: "Wine",
      children: [],
      items: [
        {
          id: "menu_1",
          name: "House Red",
          description: "Berry",
          soldOut: false,
          abv: null,
          prices: [{ label: "Glass", amountMinor: 12000, currency: "KRW" }],
          badges: [{ label: "추천", backgroundHex: "#725A3D", textColor: "#FFFFFF" }],
          fields: []
        }
      ]
    }
  ]
};

describe("public menu parser", () => {
  it("parses the public JSON contract", () => {
    const menu = parsePublicMenu(fixture);

    expect(menu.bar.name).toBe("Sample Bar");
    expect(menu.layout.concept).toBe("menu_book");
    expect(menu.categories[0]?.items[0]?.prices[0]?.amountMinor).toBe(12000);
  });

  it("defaults older public JSON to the menu book concept", () => {
    const legacyFixture: Record<string, unknown> = { ...fixture };
    delete legacyFixture.layout;
    const menu = parsePublicMenu(legacyFixture);

    expect(menu.layout.concept).toBe("menu_book");
  });

  it("rejects unsupported menu board concepts", () => {
    expect(() => parsePublicMenu({ ...fixture, layout: { concept: "admin_console" } })).toThrow();
  });

  it("parses preparing menus and empty public categories", () => {
    const menu = parsePublicMenu({
      ...fixture,
      status: "preparing",
      categories: [{ id: "cat_2", name: "Coming Soon", children: [], items: [] }]
    });

    expect(menu.status).toBe("preparing");
    expect(menu.categories[0]?.items).toEqual([]);
  });

  it("rejects unsupported schemaVersion", () => {
    expect(() => parsePublicMenu({ ...fixture, schemaVersion: 2 })).toThrow();
  });

  it("rejects private data before rendering", () => {
    const category = fixture.categories[0];
    if (!category) throw new Error("fixture category missing");
    const item = category.items[0];
    if (!item) throw new Error("fixture item missing");

    expect(() =>
      parsePublicMenu({
        ...fixture,
        categories: [
          {
            ...category,
            items: [{ ...item, internalMemo: "do not publish" }]
          }
        ]
      })
    ).toThrow(/Forbidden public menu field/);
  });

  it("rejects sold out menus that expose prices or badges", () => {
    const category = fixture.categories[0];
    const item = category?.items[0];
    if (!category || !item) throw new Error("fixture item missing");

    expect(() =>
      parsePublicMenu({
        ...fixture,
        categories: [
          {
            ...category,
            items: [{ ...item, soldOut: true }]
          }
        ]
      })
    ).toThrow(/sold_out menu must not expose prices/);
  });

  it("filters menu categories without changing the source menu", () => {
    const menu = parsePublicMenu(fixture);
    const filtered = searchMenu(menu, "house");

    expect(filtered.categories).toHaveLength(1);
    expect(filtered.categories[0]?.items).toHaveLength(1);
    expect(searchMenu(menu, "missing").categories).toHaveLength(0);
    expect(menu.categories[0]?.items).toHaveLength(1);
  });
});
