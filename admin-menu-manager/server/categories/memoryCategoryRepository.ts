import type {
  CategoryInput,
  CategoryMoveInput,
  CategoryRecord,
  CategoryRepository,
  CategoryUpdateInput
} from "./repository";

export class MemoryCategoryRepository implements CategoryRepository {
  private readonly categories = new Map<string, CategoryRecord>();
  private readonly nextPublicIdByBar = new Map<string, number>();
  private readonly directMenuUsage = new Map<string, number>();

  reset() {
    this.categories.clear();
    this.nextPublicIdByBar.clear();
    this.directMenuUsage.clear();
  }

  setDirectMenuUsageForTest(barId: string, categoryId: string, count: number) {
    this.directMenuUsage.set(menuUsageKey(barId, categoryId), count);
  }

  replaceDirectMenuUsageForBar(barId: string, counts: Map<string, number>) {
    for (const key of [...this.directMenuUsage.keys()]) {
      if (key.startsWith(`${barId}:`)) this.directMenuUsage.delete(key);
    }
    for (const [categoryId, count] of counts) {
      this.directMenuUsage.set(menuUsageKey(barId, categoryId), count);
    }
  }

  async listCategories(barId: string): Promise<CategoryRecord[]> {
    return this.withDerivedCounts([...this.categories.values()].filter((category) => category.barId === barId));
  }

  async findCategoryById(barId: string, categoryId: string): Promise<CategoryRecord | null> {
    const category = this.categories.get(categoryId);
    if (!category || category.barId !== barId) return null;
    return (await this.withDerivedCounts([category]))[0] ?? null;
  }

  async createCategory(input: CategoryInput): Promise<CategoryRecord> {
    assertNoDuplicate(
      [...this.categories.values()].filter((category) => category.barId === input.barId && category.parentId === input.parentId),
      input.normalizedName
    );
    const record: CategoryRecord = {
      id: input.id,
      barId: input.barId,
      publicId: this.nextPublicId(input.barId),
      parentId: input.parentId,
      name: input.name,
      normalizedName: input.normalizedName,
      description: input.description,
      showDescription: input.showDescription,
      isVisible: input.isVisible,
      sortOrder: this.nextSortOrder(input.barId, input.parentId),
      childCount: 0,
      menuCount: 0,
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.updatedByUserId,
      createdAt: input.now,
      updatedAt: input.now
    };
    this.categories.set(record.id, record);
    return (await this.withDerivedCounts([record]))[0] ?? { ...record };
  }

  async updateCategory(barId: string, categoryId: string, input: CategoryUpdateInput): Promise<CategoryRecord | null> {
    const current = this.categories.get(categoryId);
    if (!current || current.barId !== barId) return null;
    assertNoDuplicate(
      [...this.categories.values()].filter(
        (category) => category.barId === barId && category.parentId === current.parentId && category.id !== categoryId
      ),
      input.normalizedName
    );
    const record: CategoryRecord = {
      ...current,
      name: input.name,
      normalizedName: input.normalizedName,
      description: input.description,
      showDescription: input.showDescription,
      isVisible: input.isVisible,
      updatedByUserId: input.updatedByUserId,
      updatedAt: input.now
    };
    this.categories.set(categoryId, record);
    return (await this.withDerivedCounts([record]))[0] ?? { ...record };
  }

  async moveCategory(input: CategoryMoveInput): Promise<CategoryRecord | null> {
    const current = this.categories.get(input.categoryId);
    if (!current || current.barId !== input.barId) return null;
    assertNoDuplicate(
      [...this.categories.values()].filter(
        (category) => category.barId === input.barId && category.parentId === input.parentId && category.id !== input.categoryId
      ),
      current.normalizedName
    );
    const record: CategoryRecord = {
      ...current,
      parentId: input.parentId,
      sortOrder: input.sortOrder,
      updatedByUserId: input.updatedByUserId,
      updatedAt: input.now
    };
    this.categories.set(record.id, record);
    await this.compactSiblingOrder(input.barId, current.parentId, input.updatedByUserId, input.now);
    return (await this.withDerivedCounts([record]))[0] ?? { ...record };
  }

  async replaceSiblingOrder(
    barId: string,
    parentId: string | null,
    orderedIds: string[],
    updatedByUserId: string,
    now: string
  ): Promise<void> {
    orderedIds.forEach((id, index) => {
      const current = this.categories.get(id);
      if (!current || current.barId !== barId || current.parentId !== parentId) return;
      this.categories.set(id, { ...current, sortOrder: index, updatedByUserId, updatedAt: now });
    });
  }

  async deleteCategories(barId: string, categoryIds: string[]): Promise<void> {
    for (const categoryId of categoryIds) {
      const category = this.categories.get(categoryId);
      if (category?.barId === barId) this.categories.delete(categoryId);
      this.directMenuUsage.delete(menuUsageKey(barId, categoryId));
    }
  }

  async countDirectMenuItems(barId: string, categoryId: string): Promise<number> {
    return this.directMenuUsage.get(menuUsageKey(barId, categoryId)) ?? 0;
  }

  private nextPublicId(barId: string): string {
    const next = this.nextPublicIdByBar.get(barId) ?? 1;
    this.nextPublicIdByBar.set(barId, next + 1);
    return `cat_${next}`;
  }

  private nextSortOrder(barId: string, parentId: string | null): number {
    const siblings = [...this.categories.values()].filter((category) => category.barId === barId && category.parentId === parentId);
    return siblings.length ? Math.max(...siblings.map((category) => category.sortOrder)) + 1 : 0;
  }

  private async compactSiblingOrder(barId: string, parentId: string | null, updatedByUserId: string, now: string): Promise<void> {
    const siblings = [...this.categories.values()]
      .filter((category) => category.barId === barId && category.parentId === parentId)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt));
    await this.replaceSiblingOrder(
      barId,
      parentId,
      siblings.map((category) => category.id),
      updatedByUserId,
      now
    );
  }

  private async withDerivedCounts(records: CategoryRecord[]): Promise<CategoryRecord[]> {
    return Promise.all(
      records
        .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "ko"))
        .map(async (category) => ({
          ...category,
          childCount: [...this.categories.values()].filter((item) => item.parentId === category.id && item.barId === category.barId).length,
          menuCount: await this.countDirectMenuItems(category.barId, category.id)
        }))
    );
  }
}

function assertNoDuplicate(records: Array<{ normalizedName: string }>, normalizedName: string): void {
  if (records.some((record) => record.normalizedName === normalizedName)) {
    throw new Error("CATEGORY_NAME_EXISTS");
  }
}

function menuUsageKey(barId: string, categoryId: string): string {
  return `${barId}:${categoryId}`;
}
