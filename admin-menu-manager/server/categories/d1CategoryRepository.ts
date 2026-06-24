import type {
  CategoryInput,
  CategoryMoveInput,
  CategoryRecord,
  CategoryRepository,
  CategoryUpdateInput
} from "./repository";

type CategoryRow = {
  id: string;
  bar_id: string;
  public_id: string;
  parent_id: string | null;
  name: string;
  normalized_name: string;
  description: string;
  show_description: number;
  is_visible: number;
  sort_order: number;
  child_count?: number;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export class D1CategoryRepository implements CategoryRepository {
  constructor(private readonly db: D1Database) {}

  async listCategories(barId: string): Promise<CategoryRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT categories.*,
          (SELECT COUNT(*) FROM categories child WHERE child.bar_id = categories.bar_id AND child.parent_id = categories.id) AS child_count
         FROM categories
         WHERE bar_id = ?
         ORDER BY COALESCE(parent_id, ''), sort_order ASC, name ASC`
      )
      .bind(barId)
      .all<CategoryRow>();
    return Promise.all((result.results ?? []).map((row) => this.toRecord(row)));
  }

  async findCategoryById(barId: string, categoryId: string): Promise<CategoryRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT categories.*,
          (SELECT COUNT(*) FROM categories child WHERE child.bar_id = categories.bar_id AND child.parent_id = categories.id) AS child_count
         FROM categories
         WHERE bar_id = ? AND id = ?`
      )
      .bind(barId, categoryId)
      .first<CategoryRow>();
    return row ? this.toRecord(row) : null;
  }

  async createCategory(input: CategoryInput): Promise<CategoryRecord> {
    const nextPublicId = await this.allocatePublicId(input.barId, input.now);
    const sortOrder = await this.nextSortOrder(input.barId, input.parentId);
    try {
      await this.db
        .prepare(
          `INSERT INTO categories (
            id, bar_id, public_id, parent_id, name, normalized_name, description,
            show_description, is_visible, sort_order, created_by_user_id, updated_by_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          input.id,
          input.barId,
          nextPublicId,
          input.parentId,
          input.name,
          input.normalizedName,
          input.description,
          input.showDescription ? 1 : 0,
          input.isVisible ? 1 : 0,
          sortOrder,
          input.createdByUserId,
          input.updatedByUserId,
          input.now,
          input.now
        )
        .run();
    } catch (error) {
      rethrowDuplicate(error);
    }
    const created = await this.findCategoryById(input.barId, input.id);
    if (!created) throw new Error("CATEGORY_INSERT_FAILED");
    return created;
  }

  async updateCategory(barId: string, categoryId: string, input: CategoryUpdateInput): Promise<CategoryRecord | null> {
    try {
      await this.db
        .prepare(
          `UPDATE categories
           SET name = ?, normalized_name = ?, description = ?, show_description = ?, is_visible = ?,
             updated_by_user_id = ?, updated_at = ?
           WHERE bar_id = ? AND id = ?`
        )
        .bind(
          input.name,
          input.normalizedName,
          input.description,
          input.showDescription ? 1 : 0,
          input.isVisible ? 1 : 0,
          input.updatedByUserId,
          input.now,
          barId,
          categoryId
        )
        .run();
    } catch (error) {
      rethrowDuplicate(error);
    }
    return this.findCategoryById(barId, categoryId);
  }

  async moveCategory(input: CategoryMoveInput): Promise<CategoryRecord | null> {
    try {
      await this.db
        .prepare(
          `UPDATE categories
           SET parent_id = ?, sort_order = ?, updated_by_user_id = ?, updated_at = ?
           WHERE bar_id = ? AND id = ?`
        )
        .bind(input.parentId, input.sortOrder, input.updatedByUserId, input.now, input.barId, input.categoryId)
        .run();
    } catch (error) {
      rethrowDuplicate(error);
    }
    return this.findCategoryById(input.barId, input.categoryId);
  }

  async replaceSiblingOrder(
    barId: string,
    parentId: string | null,
    orderedIds: string[],
    updatedByUserId: string,
    now: string
  ): Promise<void> {
    await this.db.batch(
      orderedIds.map((id, index) =>
        this.db
          .prepare(
            `UPDATE categories
             SET sort_order = ?, updated_by_user_id = ?, updated_at = ?
             WHERE bar_id = ? AND id = ? AND ${parentId === null ? "parent_id IS NULL" : "parent_id = ?"}`
          )
          .bind(...(parentId === null ? [index, updatedByUserId, now, barId, id] : [index, updatedByUserId, now, barId, id, parentId]))
      )
    );
  }

  async deleteCategories(barId: string, categoryIds: string[]): Promise<void> {
    if (!categoryIds.length) return;
    await this.db.batch(categoryIds.map((id) => this.db.prepare("DELETE FROM categories WHERE bar_id = ? AND id = ?").bind(barId, id)));
  }

  async countDirectMenuItems(barId: string, categoryId: string): Promise<number> {
    if (!(await this.hasMenuItemsTable())) return 0;
    const row = await this.db
      .prepare("SELECT COUNT(*) AS menu_count FROM menu_items WHERE bar_id = ? AND category_id = ?")
      .bind(barId, categoryId)
      .first<{ menu_count: number }>();
    return row?.menu_count ?? 0;
  }

  private async allocatePublicId(barId: string, now: string): Promise<string> {
    const row = await this.db
      .prepare("SELECT next_category_public_id FROM bar_public_counters WHERE bar_id = ?")
      .bind(barId)
      .first<{ next_category_public_id: number }>();
    const next = row?.next_category_public_id ?? 1;
    await this.db
      .prepare(
        `INSERT INTO bar_public_counters (
          bar_id, next_category_public_id, next_menu_item_public_id, next_publication_revision, created_at, updated_at
        ) VALUES (?, ?, 1, 1, ?, ?)
        ON CONFLICT(bar_id) DO UPDATE SET
          next_category_public_id = excluded.next_category_public_id,
          updated_at = excluded.updated_at`
      )
      .bind(barId, next + 1, now, now)
      .run();
    return `cat_${next}`;
  }

  private async nextSortOrder(barId: string, parentId: string | null): Promise<number> {
    const row = await this.db
      .prepare(`SELECT MAX(sort_order) AS max_sort_order FROM categories WHERE bar_id = ? AND ${parentId === null ? "parent_id IS NULL" : "parent_id = ?"}`)
      .bind(...(parentId === null ? [barId] : [barId, parentId]))
      .first<{ max_sort_order: number | null }>();
    return row?.max_sort_order === null || row?.max_sort_order === undefined ? 0 : row.max_sort_order + 1;
  }

  private async hasMenuItemsTable(): Promise<boolean> {
    const row = await this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'menu_items'")
      .first<{ name: string }>();
    return Boolean(row);
  }

  private async toRecord(row: CategoryRow): Promise<CategoryRecord> {
    return {
      id: row.id,
      barId: row.bar_id,
      publicId: row.public_id,
      parentId: row.parent_id,
      name: row.name,
      normalizedName: row.normalized_name,
      description: row.description,
      showDescription: row.show_description === 1,
      isVisible: row.is_visible === 1,
      sortOrder: row.sort_order,
      childCount: row.child_count ?? 0,
      menuCount: await this.countDirectMenuItems(row.bar_id, row.id),
      createdByUserId: row.created_by_user_id,
      updatedByUserId: row.updated_by_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

function rethrowDuplicate(error: unknown): never {
  if (error instanceof Error && /UNIQUE|constraint/i.test(error.message)) {
    throw new Error("CATEGORY_NAME_EXISTS");
  }
  throw error;
}
