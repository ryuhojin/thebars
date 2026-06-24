import type {
  MenuItemDetailsInput,
  MenuItemDetailsRecord,
  MenuItemInput,
  MenuItemBadgeInput,
  MenuItemBadgeRecord,
  MenuItemListChangeInput,
  MenuItemPriceInput,
  MenuItemPriceRecord,
  MenuItemRecord,
  MenuItemRepository,
  MenuItemUpdateInput
} from "./repository";

type CategoryUsageSink = {
  replaceDirectMenuUsageForBar?: (barId: string, counts: Map<string, number>) => void;
};

type ItemTypeUsageSink = {
  replaceMenuItemTypeUsage?: (systemUsage: Map<string, number>, barUsage: Map<string, number>) => void;
};

type BadgeUsageSink = {
  replaceMenuBadgeUsage?: (systemUsage: Map<string, number>, barUsage: Map<string, number>) => void;
};

export class MemoryMenuItemRepository implements MenuItemRepository {
  private readonly items = new Map<string, MenuItemRecord>();
  private readonly prices = new Map<string, MenuItemPriceRecord[]>();
  private readonly details = new Map<string, MenuItemDetailsRecord>();
  private readonly badges = new Map<string, MenuItemBadgeRecord[]>();
  private readonly nextPublicIdByBar = new Map<string, number>();

  constructor(
    private readonly categoryUsageSink?: CategoryUsageSink,
    private readonly itemTypeUsageSink?: ItemTypeUsageSink,
    private readonly badgeUsageSink?: BadgeUsageSink
  ) {}

  reset() {
    this.items.clear();
    this.prices.clear();
    this.details.clear();
    this.badges.clear();
    this.nextPublicIdByBar.clear();
  }

  async listMenuItems(barId: string): Promise<MenuItemRecord[]> {
    return [...this.items.values()]
      .filter((item) => item.barId === barId)
      .sort((left, right) => left.categoryId.localeCompare(right.categoryId) || left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "ko"))
      .map((item) => ({ ...item }));
  }

  async findMenuItemById(barId: string, menuItemId: string): Promise<MenuItemRecord | null> {
    const item = this.items.get(menuItemId);
    return item?.barId === barId ? { ...item } : null;
  }

  async createMenuItem(input: MenuItemInput): Promise<MenuItemRecord> {
    assertNoDuplicate(
      [...this.items.values()].filter((item) => item.barId === input.barId),
      input.normalizedName
    );
    await this.shiftCategoryDown(input.barId, input.categoryId, 1, input.updatedByUserId, input.now);
    const record: MenuItemRecord = {
      id: input.id,
      barId: input.barId,
      publicId: this.nextPublicId(input.barId),
      categoryId: input.categoryId,
      systemItemTypeId: input.systemItemTypeId,
      barItemTypeId: input.barItemTypeId,
      name: input.name,
      normalizedName: input.normalizedName,
      description: input.description,
      internalMemo: input.internalMemo,
      saleStatus: input.saleStatus,
      isVisible: input.isVisible,
      abvBasisPoints: input.abvBasisPoints,
      sortOrder: 0,
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.updatedByUserId,
      createdAt: input.now,
      updatedAt: input.now
    };
    this.items.set(record.id, record);
    this.syncUsage(input.barId);
    return { ...record };
  }

  async updateMenuItem(barId: string, menuItemId: string, input: MenuItemUpdateInput): Promise<MenuItemRecord | null> {
    const current = this.items.get(menuItemId);
    if (!current || current.barId !== barId) return null;
    assertNoDuplicate(
      [...this.items.values()].filter((item) => item.barId === barId && item.id !== menuItemId),
      input.normalizedName
    );
    const categoryChanged = current.categoryId !== input.categoryId;
    if (categoryChanged) await this.shiftCategoryDown(barId, input.categoryId, 1, input.updatedByUserId, input.now);
    const record: MenuItemRecord = {
      ...current,
      categoryId: input.categoryId,
      systemItemTypeId: input.systemItemTypeId,
      barItemTypeId: input.barItemTypeId,
      name: input.name,
      normalizedName: input.normalizedName,
      description: input.description,
      internalMemo: input.internalMemo,
      saleStatus: input.saleStatus,
      isVisible: input.isVisible,
      abvBasisPoints: input.abvBasisPoints,
      sortOrder: categoryChanged ? 0 : current.sortOrder,
      updatedByUserId: input.updatedByUserId,
      updatedAt: input.now
    };
    this.items.set(record.id, record);
    if (categoryChanged) await this.compactCategoryOrder(barId, current.categoryId, input.updatedByUserId, input.now);
    this.syncUsage(barId);
    return { ...record };
  }

  async deleteMenuItem(barId: string, menuItemId: string, updatedByUserId: string, now: string): Promise<boolean> {
    const current = this.items.get(menuItemId);
    if (!current || current.barId !== barId) return false;
    this.items.delete(menuItemId);
    this.prices.delete(menuItemId);
    this.details.delete(menuItemId);
    this.badges.delete(menuItemId);
    await this.compactCategoryOrder(barId, current.categoryId, updatedByUserId, now);
    this.syncUsage(barId);
    return true;
  }

  async listMenuItemPrices(barId: string, menuItemId: string): Promise<MenuItemPriceRecord[]> {
    const current = this.items.get(menuItemId);
    if (!current || current.barId !== barId) return [];
    return [...(this.prices.get(menuItemId) ?? [])]
      .sort((left, right) => left.displayOrder - right.displayOrder || left.label.localeCompare(right.label, "ko"))
      .map((price) => ({ ...price }));
  }

  async replaceMenuItemPrices(
    barId: string,
    menuItemId: string,
    prices: MenuItemPriceInput[],
    updatedByUserId: string,
    now: string
  ): Promise<MenuItemPriceRecord[]> {
    const current = this.items.get(menuItemId);
    if (!current || current.barId !== barId) return [];
    assertNoDuplicatePriceLabels(prices);
    const records = prices
      .map((price, index) => ({
        id: price.id,
        barId,
        menuItemId,
        label: price.label,
        normalizedLabel: price.normalizedLabel,
        volumeText: price.volumeText,
        amountMinor: price.amountMinor,
        displayOrder: price.displayOrder ?? index,
        isRepresentative: Boolean(price.isRepresentative),
        createdByUserId: updatedByUserId,
        updatedByUserId,
        createdAt: now,
        updatedAt: now
      }))
      .sort((left, right) => left.displayOrder - right.displayOrder || left.label.localeCompare(right.label, "ko"));
    this.prices.set(menuItemId, records);
    this.items.set(menuItemId, { ...current, updatedByUserId, updatedAt: now });
    return records.map((record) => ({ ...record }));
  }

  async findMenuItemDetails(barId: string, menuItemId: string): Promise<MenuItemDetailsRecord | null> {
    const current = this.items.get(menuItemId);
    if (!current || current.barId !== barId) return null;
    const record = this.details.get(menuItemId);
    return record ? cloneDetails(record) : null;
  }

  async upsertMenuItemDetails(input: MenuItemDetailsInput): Promise<MenuItemDetailsRecord> {
    const current = this.items.get(input.menuItemId);
    if (!current || current.barId !== input.barId) throw new Error("MENU_ITEM_NOT_FOUND");
    const existing = this.details.get(input.menuItemId);
    const record: MenuItemDetailsRecord = {
      barId: input.barId,
      menuItemId: input.menuItemId,
      template: input.template,
      schemaVersion: 1,
      details: input.details,
      createdByUserId: existing?.createdByUserId ?? input.updatedByUserId,
      updatedByUserId: input.updatedByUserId,
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now
    };
    this.details.set(input.menuItemId, record);
    this.items.set(input.menuItemId, { ...current, updatedByUserId: input.updatedByUserId, updatedAt: input.now });
    return cloneDetails(record);
  }

  async deleteMenuItemDetails(barId: string, menuItemId: string): Promise<void> {
    const current = this.items.get(menuItemId);
    if (!current || current.barId !== barId) return;
    this.details.delete(menuItemId);
  }

  async listMenuItemBadges(barId: string, menuItemId: string): Promise<MenuItemBadgeRecord[]> {
    const current = this.items.get(menuItemId);
    if (!current || current.barId !== barId) return [];
    return [...(this.badges.get(menuItemId) ?? [])]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((badge) => ({ ...badge }));
  }

  async replaceMenuItemBadges(
    barId: string,
    menuItemId: string,
    badges: MenuItemBadgeInput[],
    updatedByUserId: string,
    now: string
  ): Promise<MenuItemBadgeRecord[]> {
    const current = this.items.get(menuItemId);
    if (!current || current.barId !== barId) return [];
    assertValidBadges(badges);
    const records = badges
      .map((badge, index) => ({
        id: badge.assignmentId,
        barId,
        menuItemId,
        source: badge.source,
        badgeId: badge.id,
        displayOrder: badge.displayOrder ?? index,
        createdAt: now,
        updatedAt: now
      }))
      .sort((left, right) => left.displayOrder - right.displayOrder);
    this.badges.set(menuItemId, records);
    this.items.set(menuItemId, { ...current, updatedByUserId, updatedAt: now });
    this.syncUsage(barId);
    return records.map((record) => ({ ...record }));
  }

  async applyMenuItemListChanges(
    barId: string,
    changes: MenuItemListChangeInput[],
    updatedByUserId: string,
    now: string
  ): Promise<void> {
    const currentItems = new Map<string, MenuItemRecord>();
    for (const change of changes) {
      const current = this.items.get(change.menuItemId);
      if (current && current.barId === barId) currentItems.set(change.menuItemId, current);
    }
    const sourceCategoriesToCompact = new Set<string>();
    const moveCountsByCategory = new Map<string, number>();
    const moveOrderByItemId = new Map<string, number>();
    for (const change of changes) {
      const current = currentItems.get(change.menuItemId);
      if (!current || current.categoryId === change.categoryId) continue;
      sourceCategoriesToCompact.add(current.categoryId);
      const nextOrder = moveCountsByCategory.get(change.categoryId) ?? 0;
      moveCountsByCategory.set(change.categoryId, nextOrder + 1);
      moveOrderByItemId.set(change.menuItemId, nextOrder);
    }
    for (const [categoryId, count] of moveCountsByCategory) {
      await this.shiftCategoryDown(barId, categoryId, count, updatedByUserId, now);
    }
    for (const change of changes) {
      const original = currentItems.get(change.menuItemId);
      const current = this.items.get(change.menuItemId);
      if (!current || current.barId !== barId) continue;
      const categoryChanged = Boolean(original && original.categoryId !== change.categoryId);
      this.items.set(current.id, {
        ...current,
        categoryId: change.categoryId,
        saleStatus: change.saleStatus,
        isVisible: change.isVisible,
        sortOrder: categoryChanged ? moveOrderByItemId.get(change.menuItemId) ?? 0 : change.sortOrder ?? current.sortOrder,
        updatedByUserId,
        updatedAt: now
      });
      if (change.badges) {
        await this.replaceMenuItemBadges(barId, change.menuItemId, change.badges, updatedByUserId, now);
      }
    }
    for (const categoryId of sourceCategoriesToCompact) {
      await this.compactCategoryOrder(barId, categoryId, updatedByUserId, now);
    }
    this.syncUsage(barId);
  }

  private nextPublicId(barId: string): string {
    const next = this.nextPublicIdByBar.get(barId) ?? 1;
    this.nextPublicIdByBar.set(barId, next + 1);
    return `menu_${next}`;
  }

  private async shiftCategoryDown(
    barId: string,
    categoryId: string,
    count: number,
    updatedByUserId: string,
    now: string
  ): Promise<void> {
    for (const item of this.items.values()) {
      if (item.barId === barId && item.categoryId === categoryId) {
        this.items.set(item.id, { ...item, sortOrder: item.sortOrder + count, updatedByUserId, updatedAt: now });
      }
    }
  }

  private async compactCategoryOrder(barId: string, categoryId: string, updatedByUserId: string, now: string): Promise<void> {
    const siblings = [...this.items.values()]
      .filter((item) => item.barId === barId && item.categoryId === categoryId)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt));
    siblings.forEach((item, index) => {
      this.items.set(item.id, { ...item, sortOrder: index, updatedByUserId, updatedAt: now });
    });
  }

  private syncUsage(barId: string): void {
    const counts = new Map<string, number>();
    const systemTypeCounts = new Map<string, number>();
    const barTypeCounts = new Map<string, number>();
    const systemBadgeCounts = new Map<string, number>();
    const barBadgeCounts = new Map<string, number>();
    for (const item of this.items.values()) {
      if (item.barId === barId) counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
      if (item.systemItemTypeId) {
        systemTypeCounts.set(item.systemItemTypeId, (systemTypeCounts.get(item.systemItemTypeId) ?? 0) + 1);
      }
      if (item.barItemTypeId) {
        const key = `${item.barId}:${item.barItemTypeId}`;
        barTypeCounts.set(key, (barTypeCounts.get(key) ?? 0) + 1);
      }
    }
    for (const badgeList of this.badges.values()) {
      for (const badge of badgeList) {
        if (badge.source === "system") {
          systemBadgeCounts.set(badge.badgeId, (systemBadgeCounts.get(badge.badgeId) ?? 0) + 1);
        } else {
          const key = `${badge.barId}:${badge.badgeId}`;
          barBadgeCounts.set(key, (barBadgeCounts.get(key) ?? 0) + 1);
        }
      }
    }
    this.categoryUsageSink?.replaceDirectMenuUsageForBar?.(barId, counts);
    this.itemTypeUsageSink?.replaceMenuItemTypeUsage?.(systemTypeCounts, barTypeCounts);
    this.badgeUsageSink?.replaceMenuBadgeUsage?.(systemBadgeCounts, barBadgeCounts);
  }
}

function assertNoDuplicate(records: Array<{ normalizedName: string }>, normalizedName: string): void {
  if (records.some((record) => record.normalizedName === normalizedName)) {
    throw new Error("MENU_NAME_EXISTS");
  }
}

function assertNoDuplicatePriceLabels(records: Array<{ normalizedLabel: string }>): void {
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.normalizedLabel)) throw new Error("MENU_PRICE_LABEL_EXISTS");
    seen.add(record.normalizedLabel);
  }
}

function cloneDetails(record: MenuItemDetailsRecord): MenuItemDetailsRecord {
  return {
    ...record,
    details: JSON.parse(JSON.stringify(record.details)) as MenuItemDetailsRecord["details"]
  };
}

function assertValidBadges(records: MenuItemBadgeInput[]): void {
  if (records.length > 3) throw new Error("MENU_BADGE_LIMIT_EXCEEDED");
  const seenBadges = new Set<string>();
  const seenOrders = new Set<number>();
  for (const record of records) {
    const key = `${record.source}:${record.id}`;
    if (seenBadges.has(key)) throw new Error("MENU_BADGE_DUPLICATE");
    if (seenOrders.has(record.displayOrder)) throw new Error("MENU_BADGE_ORDER_DUPLICATE");
    seenBadges.add(key);
    seenOrders.add(record.displayOrder);
  }
}
