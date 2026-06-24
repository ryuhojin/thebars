import type { PublicMenu, PublicMenuBadge, PublicMenuCategory, PublicMenuField, PublicMenuItem } from "../../../shared/publicMenu";
import {
  calculatePublicMenuContentHash,
  flattenPublicCategorySections,
  publicMenuSchema,
  stablePublicMenuStringify,
  publicMenuContentForHash
} from "../../../shared/publicMenu";
import type { PublicMenuPreviewResponse } from "../../contracts/preview";
import { publicMenuPreviewResponseSchema } from "../../contracts/preview";
import { readableTextColor } from "../../contracts/badges";
import { nowIso } from "../auth/crypto";
import { AuthServiceError } from "../auth/errors";
import type { AuthUserRecord } from "../auth/repository";
import type { BadgeColorRecord, BadgeRepository } from "../badges/repository";
import type { BarRepository, BarSettingsRecord } from "../bars/repository";
import type { CategoryRecord, CategoryRepository } from "../categories/repository";
import type { MembershipRepository } from "../memberships/repository";
import type {
  MenuItemBadgeRecord,
  MenuItemDetailsRecord,
  MenuItemPriceRecord,
  MenuItemRecord,
  MenuItemRepository
} from "../menu-items/repository";

export type PublicMenuPreviewServiceOptions = {
  now?: () => Date;
};

export class PublicMenuPreviewService {
  private readonly now: () => Date;

  constructor(
    private readonly barRepository: BarRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly menuItemRepository: MenuItemRepository,
    private readonly badgeRepository: BadgeRepository,
    options: PublicMenuPreviewServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async readPreview(actor: AuthUserRecord, barId: string): Promise<PublicMenuPreviewResponse> {
    const settings = await this.requireBarAccess(actor, barId);
    const menu = await this.buildPublicMenu(settings);
    const sections = flattenPublicCategorySections(menu.categories);
    return publicMenuPreviewResponseSchema.parse({
      bar: {
        id: settings.bar.id,
        name: settings.bar.name,
        encodedSlug: settings.bar.encodedSlug,
        customerPath: `/${settings.bar.encodedSlug}`
      },
      menu,
      scopeOptions: [
        { id: "all", label: "전체 메뉴판", type: "all" },
        ...sections.map((section) => ({ id: section.id, label: `카테고리: ${section.path}`, type: "category" as const })),
        ...sections.flatMap((section) =>
          section.items.map((item) => ({ id: item.id, label: `메뉴: ${item.name}`, type: "menu" as const, categoryId: section.id }))
        )
      ],
      schema: { valid: true, schemaVersion: 1 },
      hash: {
        contentHash: menu.contentHash,
        canonicalJson: stablePublicMenuStringify(publicMenuContentForHash(menu))
      }
    });
  }

  private async requireBarAccess(actor: AuthUserRecord, barId: string): Promise<BarSettingsRecord> {
    const settings = await this.barRepository.readBarSettings(barId);
    if (!settings || settings.bar.status !== "active") {
      throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    }
    if (actor.isSystemAdmin) return settings;
    const membership = await this.membershipRepository.findActiveMembershipForUser(barId, actor.id);
    if (!membership) {
      throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    }
    return settings;
  }

  private async buildPublicMenu(settings: BarSettingsRecord): Promise<PublicMenu> {
    const [categories, items, badgeCatalog] = await Promise.all([
      this.categoryRepository.listCategories(settings.bar.id),
      this.menuItemRepository.listMenuItems(settings.bar.id),
      this.readBadgeCatalog(settings.bar.id)
    ]);
    const visibleCategoryIds = visibleCategoryIdSet(categories);
    const visibleItems = items.filter((item) => item.isVisible && visibleCategoryIds.has(item.categoryId));
    const [pricesByItemId, badgesByItemId, detailsByItemId] = await Promise.all([
      this.readPrices(settings.bar.id, visibleItems),
      this.readBadges(settings.bar.id, visibleItems),
      this.readDetails(settings.bar.id, visibleItems)
    ]);
    const publicItemsByCategoryId = new Map<string, PublicMenuItem[]>();
    const itemOrderByPublicId = new Map<string, number>();
    for (const item of visibleItems) {
      const categoryItems = publicItemsByCategoryId.get(item.categoryId) ?? [];
      itemOrderByPublicId.set(item.publicId, item.sortOrder);
      categoryItems.push(
        toPublicMenuItem(
          item,
          pricesByItemId.get(item.id) ?? [],
          badgesByItemId.get(item.id) ?? [],
          detailsByItemId.get(item.id) ?? null,
          badgeCatalog,
          settings.bar.currency
        )
      );
      publicItemsByCategoryId.set(item.categoryId, categoryItems);
    }
    for (const categoryItems of publicItemsByCategoryId.values()) {
      categoryItems.sort(
        (left, right) =>
          Number(left.soldOut) - Number(right.soldOut) ||
          (itemOrderByPublicId.get(left.id) ?? 0) - (itemOrderByPublicId.get(right.id) ?? 0) ||
          left.name.localeCompare(right.name, "ko")
      );
    }

    const categoryTree = buildPublicCategoryTree(categories, publicItemsByCategoryId);
    const draft: Omit<PublicMenu, "contentHash"> = {
      schemaVersion: 1,
      status: settings.bar.publicMenuStatus,
      revision: 0,
      publishedAt: null,
      generatedAt: nowIso(this.now()),
      encodedSlug: settings.bar.encodedSlug,
      bar: {
        name: settings.bar.name,
        intro: emptyToUndefined(settings.bar.description),
        currency: settings.bar.currency,
        address: emptyToUndefined(settings.bar.address),
        mapUrl: emptyToUndefined(settings.bar.mapUrl),
        phoneNumberDisplay: formatPhoneNumber(settings.bar.phoneNumberDigits),
        openingNote: emptyToUndefined(settings.bar.openingNote),
        businessHours: settings.businessHours.map((range) => ({
          dayOfWeek: range.dayOfWeek,
          opensAt: range.opensAt,
          closesAt: range.closesAt
        })),
        links: settings.links.map((link) => ({ label: link.label, url: link.url }))
      },
      categories: categoryTree
    };
    const menu: PublicMenu = {
      ...draft,
      contentHash: await calculatePublicMenuContentHash(draft)
    };
    return publicMenuSchema.parse(menu);
  }

  private async readPrices(barId: string, items: MenuItemRecord[]): Promise<Map<string, MenuItemPriceRecord[]>> {
    return new Map(
      await Promise.all(items.map(async (item) => [item.id, await this.menuItemRepository.listMenuItemPrices(barId, item.id)] as const))
    );
  }

  private async readBadges(barId: string, items: MenuItemRecord[]): Promise<Map<string, MenuItemBadgeRecord[]>> {
    return new Map(
      await Promise.all(items.map(async (item) => [item.id, await this.menuItemRepository.listMenuItemBadges(barId, item.id)] as const))
    );
  }

  private async readDetails(barId: string, items: MenuItemRecord[]): Promise<Map<string, MenuItemDetailsRecord | null>> {
    return new Map(
      await Promise.all(items.map(async (item) => [item.id, await this.menuItemRepository.findMenuItemDetails(barId, item.id)] as const))
    );
  }

  private async readBadgeCatalog(barId: string): Promise<Map<string, PublicMenuBadge>> {
    const [colors, systemBadges, visibility, barBadges] = await Promise.all([
      this.badgeRepository.listColors(),
      this.badgeRepository.listSystemBadges(),
      this.badgeRepository.listBarBadgeVisibility(barId),
      this.badgeRepository.listBarBadges(barId)
    ]);
    const colorsById = new Map(colors.map((color) => [color.id, color]));
    const hiddenSystemBadgeIds = new Set(visibility.filter((entry) => entry.isHidden).map((entry) => entry.systemBadgeId));
    const catalog = new Map<string, PublicMenuBadge>();
    for (const badge of systemBadges) {
      const color = colorsById.get(badge.colorId);
      if (!badge.isActive || hiddenSystemBadgeIds.has(badge.id) || !color?.isActive) continue;
      catalog.set(`system:${badge.id}`, toPublicBadge(badge.name, color));
    }
    for (const badge of barBadges) {
      const color = colorsById.get(badge.colorId);
      if (!badge.isActive || !color?.isActive) continue;
      catalog.set(`bar:${badge.id}`, toPublicBadge(badge.name, color));
    }
    return catalog;
  }
}

function visibleCategoryIdSet(categories: CategoryRecord[]): Set<string> {
  const byParent = groupCategoriesByParent(categories.filter((category) => category.isVisible));
  const visibleIds = new Set<string>();
  const visit = (parentId: string | null) => {
    for (const category of byParent.get(parentId) ?? []) {
      visibleIds.add(category.id);
      visit(category.id);
    }
  };
  visit(null);
  return visibleIds;
}

function buildPublicCategoryTree(
  categories: CategoryRecord[],
  itemsByCategoryId: Map<string, PublicMenuItem[]>
): PublicMenuCategory[] {
  const visibleCategories = categories.filter((category) => category.isVisible);
  const byParent = groupCategoriesByParent(visibleCategories);
  const build = (parentId: string | null, parentVisible: boolean): PublicMenuCategory[] => {
    if (!parentVisible) return [];
    return (byParent.get(parentId) ?? [])
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "ko"))
      .map((category) => ({
        id: category.publicId,
        name: category.name,
        description: category.showDescription ? emptyToUndefined(category.description) : undefined,
        items: itemsByCategoryId.get(category.id) ?? [],
        children: build(category.id, true)
      }));
  };
  return build(null, true);
}

function groupCategoriesByParent(categories: CategoryRecord[]): Map<string | null, CategoryRecord[]> {
  const byParent = new Map<string | null, CategoryRecord[]>();
  for (const category of categories) {
    const siblings = byParent.get(category.parentId) ?? [];
    siblings.push(category);
    byParent.set(category.parentId, siblings);
  }
  return byParent;
}

function toPublicMenuItem(
  item: MenuItemRecord,
  prices: MenuItemPriceRecord[],
  badges: MenuItemBadgeRecord[],
  details: MenuItemDetailsRecord | null,
  badgeCatalog: Map<string, PublicMenuBadge>,
  currency: string
): PublicMenuItem {
  const soldOut = item.saleStatus === "sold_out";
  return {
    id: item.publicId,
    name: item.name,
    description: emptyToUndefined(item.description),
    soldOut,
    abv: item.abvBasisPoints === null ? null : item.abvBasisPoints / 100,
    prices: soldOut
      ? []
      : prices
          .sort((left, right) => left.displayOrder - right.displayOrder || left.label.localeCompare(right.label, "ko"))
          .map((price) => ({
            label: price.label,
            volumeText: emptyToUndefined(price.volumeText),
            amountMinor: price.amountMinor,
            currency
          })),
    badges: soldOut
      ? []
      : badges
          .sort((left, right) => left.displayOrder - right.displayOrder)
          .map((badge) => badgeCatalog.get(`${badge.source}:${badge.badgeId}`))
          .filter((badge): badge is PublicMenuBadge => badge !== undefined),
    fields: details ? detailsToPublicFields(details) : []
  };
}

function toPublicBadge(label: string, color: BadgeColorRecord): PublicMenuBadge {
  return {
    label,
    backgroundHex: color.backgroundHex,
    textColor: readableTextColor(color.backgroundHex)
  };
}

function detailsToPublicFields(record: MenuItemDetailsRecord): PublicMenuField[] {
  const labels = detailLabels[record.template] ?? {};
  return Object.entries(record.details)
    .filter(([key]) => key !== "template")
    .flatMap(([key, value]) => {
      if (value === "" || value === null || value === undefined || value === false) return [];
      const label = labels[key] ?? key;
      return [{ label, value: value === true ? "예" : String(value) }];
    });
}

const detailLabels: Record<string, Record<string, string>> = {
  wine: {
    producer: "생산자",
    country: "국가",
    region: "지역",
    grapeVariety: "품종",
    vintage: "빈티지",
    style: "스타일",
    sweetness: "당도",
    body: "바디",
    acidity: "산도",
    tannin: "탄닌"
  },
  whisky: {
    brand: "브랜드",
    country: "국가",
    region: "지역",
    classification: "분류",
    ageStatement: "숙성 연수",
    caskFinish: "캐스크",
    vintageOrDistilledYear: "빈티지·증류연도",
    singleCask: "싱글 캐스크",
    caskStrength: "캐스크 스트렝스",
    nonChillFiltered: "냉각 여과 없음"
  },
  spirit: {
    brand: "브랜드",
    country: "국가",
    region: "지역",
    subType: "세부 유형",
    baseIngredient: "원료",
    agingGrade: "숙성 등급",
    cask: "캐스크"
  },
  beer: {
    brewery: "브루어리",
    country: "국가",
    style: "스타일",
    ibu: "IBU",
    ingredientsFlavor: "풍미"
  },
  cocktail: {
    baseSpirit: "베이스",
    ingredients: "재료",
    tasteStyle: "맛",
    method: "제조",
    garnish: "가니시",
    glass: "글라스"
  },
  food: {
    mainIngredients: "주재료",
    allergens: "알레르기",
    spiceLevel: "매운 정도",
    dietary: "식단",
    servingSize: "제공량",
    pairing: "페어링"
  },
  cigar: {
    brand: "브랜드",
    line: "라인",
    origin: "원산지",
    vitola: "비톨라",
    length: "길이",
    ringGauge: "링 게이지",
    wrapper: "래퍼",
    binder: "바인더",
    filler: "필러",
    strength: "강도",
    flavor: "향미",
    smokingTime: "흡연 시간"
  }
};

function formatPhoneNumber(digits: string): string | undefined {
  if (!digits) return undefined;
  if (digits.startsWith("02")) {
    if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return digits;
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
