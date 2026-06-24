import { menuItemDetailsSchema } from "../../contracts/menuItems";
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

type MenuItemRow = {
  id: string;
  bar_id: string;
  public_id: string;
  category_id: string;
  system_item_type_id: string | null;
  bar_item_type_id: string | null;
  name: string;
  normalized_name: string;
  description: string;
  internal_memo: string;
  sale_status: MenuItemRecord["saleStatus"];
  is_visible: number;
  abv_basis_points: number | null;
  sort_order: number;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type MenuItemPriceRow = {
  id: string;
  bar_id: string;
  menu_item_id: string;
  label: string;
  normalized_label: string;
  volume_text: string;
  amount_minor: number;
  display_order: number;
  is_representative: number;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type MenuItemDetailsRow = {
  bar_id: string;
  menu_item_id: string;
  template: MenuItemDetailsRecord["template"];
  schema_version: 1;
  details_json: string;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type MenuItemBadgeRow = {
  id: string;
  bar_id: string;
  menu_item_id: string;
  system_badge_id: string | null;
  bar_badge_id: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export class D1MenuItemRepository implements MenuItemRepository {
  constructor(private readonly db: D1Database) {}

  async listMenuItems(barId: string): Promise<MenuItemRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM menu_items WHERE bar_id = ? ORDER BY category_id ASC, sort_order ASC, name ASC")
      .bind(barId)
      .all<MenuItemRow>();
    return (result.results ?? []).map(toRecord);
  }

  async findMenuItemById(barId: string, menuItemId: string): Promise<MenuItemRecord | null> {
    const row = await this.db.prepare("SELECT * FROM menu_items WHERE bar_id = ? AND id = ?").bind(barId, menuItemId).first<MenuItemRow>();
    return row ? toRecord(row) : null;
  }

  async createMenuItem(input: MenuItemInput): Promise<MenuItemRecord> {
    const publicId = await this.allocatePublicId(input.barId, input.now);
    try {
      await this.db.batch([
        this.db
          .prepare(
            `UPDATE menu_items
             SET sort_order = sort_order + 1, updated_by_user_id = ?, updated_at = ?
             WHERE bar_id = ? AND category_id = ?`
          )
          .bind(input.updatedByUserId, input.now, input.barId, input.categoryId),
        this.db
          .prepare(
            `INSERT INTO menu_items (
              id, bar_id, public_id, category_id, system_item_type_id, bar_item_type_id,
              name, normalized_name, description, internal_memo, sale_status, is_visible, abv_basis_points,
              sort_order, created_by_user_id, updated_by_user_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
          )
          .bind(
            input.id,
            input.barId,
            publicId,
            input.categoryId,
            input.systemItemTypeId,
            input.barItemTypeId,
            input.name,
            input.normalizedName,
            input.description,
            input.internalMemo,
            input.saleStatus,
            input.isVisible ? 1 : 0,
            input.abvBasisPoints,
            input.createdByUserId,
            input.updatedByUserId,
            input.now,
            input.now
          )
      ]);
    } catch (error) {
      rethrowDuplicate(error);
    }
    const created = await this.findMenuItemById(input.barId, input.id);
    if (!created) throw new Error("MENU_ITEM_INSERT_FAILED");
    return created;
  }

  async updateMenuItem(barId: string, menuItemId: string, input: MenuItemUpdateInput): Promise<MenuItemRecord | null> {
    const current = await this.findMenuItemById(barId, menuItemId);
    if (!current) return null;
    const categoryChanged = current.categoryId !== input.categoryId;
    try {
      if (categoryChanged) {
        await this.db.batch([
          this.db
            .prepare(
              `UPDATE menu_items
               SET sort_order = sort_order + 1, updated_by_user_id = ?, updated_at = ?
               WHERE bar_id = ? AND category_id = ?`
            )
            .bind(input.updatedByUserId, input.now, barId, input.categoryId),
          this.updateStatement(barId, menuItemId, input, 0)
        ]);
        await this.compactCategoryOrder(barId, current.categoryId, input.updatedByUserId, input.now);
      } else {
        await this.updateStatement(barId, menuItemId, input, current.sortOrder).run();
      }
    } catch (error) {
      rethrowDuplicate(error);
    }
    return this.findMenuItemById(barId, menuItemId);
  }

  async deleteMenuItem(barId: string, menuItemId: string, updatedByUserId: string, now: string): Promise<boolean> {
    const current = await this.findMenuItemById(barId, menuItemId);
    if (!current) return false;
    await this.db.batch([
      this.db.prepare("DELETE FROM menu_item_prices WHERE bar_id = ? AND menu_item_id = ?").bind(barId, menuItemId),
      this.db.prepare("DELETE FROM menu_item_details WHERE bar_id = ? AND menu_item_id = ?").bind(barId, menuItemId),
      this.db.prepare("DELETE FROM menu_item_badges WHERE bar_id = ? AND menu_item_id = ?").bind(barId, menuItemId),
      this.db.prepare("DELETE FROM menu_items WHERE bar_id = ? AND id = ?").bind(barId, menuItemId)
    ]);
    await this.compactCategoryOrder(barId, current.categoryId, updatedByUserId, now);
    return true;
  }

  async listMenuItemPrices(barId: string, menuItemId: string): Promise<MenuItemPriceRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM menu_item_prices
         WHERE bar_id = ? AND menu_item_id = ?
         ORDER BY display_order ASC, label ASC`
      )
      .bind(barId, menuItemId)
      .all<MenuItemPriceRow>();
    return (result.results ?? []).map(toPriceRecord);
  }

  async replaceMenuItemPrices(
    barId: string,
    menuItemId: string,
    prices: MenuItemPriceInput[],
    updatedByUserId: string,
    now: string
  ): Promise<MenuItemPriceRecord[]> {
    try {
      await this.db.batch([
        this.db.prepare("DELETE FROM menu_item_prices WHERE bar_id = ? AND menu_item_id = ?").bind(barId, menuItemId),
        ...prices.map((price) =>
          this.db
            .prepare(
              `INSERT INTO menu_item_prices (
                id, bar_id, menu_item_id, label, normalized_label, volume_text, amount_minor, display_order,
                is_representative, created_by_user_id, updated_by_user_id, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              price.id,
              barId,
              menuItemId,
              price.label,
              price.normalizedLabel,
              price.volumeText,
              price.amountMinor,
              price.displayOrder,
              Boolean(price.isRepresentative) ? 1 : 0,
              updatedByUserId,
              updatedByUserId,
              now,
              now
            )
        )
      ]);
    } catch (error) {
      rethrowDuplicate(error);
    }
    return this.listMenuItemPrices(barId, menuItemId);
  }

  async findMenuItemDetails(barId: string, menuItemId: string): Promise<MenuItemDetailsRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM menu_item_details WHERE bar_id = ? AND menu_item_id = ?")
      .bind(barId, menuItemId)
      .first<MenuItemDetailsRow>();
    return row ? toDetailsRecord(row) : null;
  }

  async upsertMenuItemDetails(input: MenuItemDetailsInput): Promise<MenuItemDetailsRecord> {
    await this.db
      .prepare(
        `INSERT INTO menu_item_details (
          menu_item_id, bar_id, template, schema_version, details_json,
          created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
        ON CONFLICT(menu_item_id) DO UPDATE SET
          bar_id = excluded.bar_id,
          template = excluded.template,
          schema_version = excluded.schema_version,
          details_json = excluded.details_json,
          updated_by_user_id = excluded.updated_by_user_id,
          updated_at = excluded.updated_at`
      )
      .bind(
        input.menuItemId,
        input.barId,
        input.template,
        JSON.stringify(input.details),
        input.updatedByUserId,
        input.updatedByUserId,
        input.now,
        input.now
      )
      .run();
    const record = await this.findMenuItemDetails(input.barId, input.menuItemId);
    if (!record) throw new Error("MENU_ITEM_DETAILS_UPSERT_FAILED");
    return record;
  }

  async deleteMenuItemDetails(barId: string, menuItemId: string): Promise<void> {
    await this.db.prepare("DELETE FROM menu_item_details WHERE bar_id = ? AND menu_item_id = ?").bind(barId, menuItemId).run();
  }

  async listMenuItemBadges(barId: string, menuItemId: string): Promise<MenuItemBadgeRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM menu_item_badges
         WHERE bar_id = ? AND menu_item_id = ?
         ORDER BY display_order ASC`
      )
      .bind(barId, menuItemId)
      .all<MenuItemBadgeRow>();
    return (result.results ?? []).map(toBadgeRecord);
  }

  async replaceMenuItemBadges(
    barId: string,
    menuItemId: string,
    badges: MenuItemBadgeInput[],
    updatedByUserId: string,
    now: string
  ): Promise<MenuItemBadgeRecord[]> {
    try {
      await this.db.batch([
        this.db.prepare("DELETE FROM menu_item_badges WHERE bar_id = ? AND menu_item_id = ?").bind(barId, menuItemId),
        ...badges.map((badge) =>
          this.db
            .prepare(
              `INSERT INTO menu_item_badges (
                id, bar_id, menu_item_id, system_badge_id, bar_badge_id, display_order, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              badge.assignmentId,
              barId,
              menuItemId,
              badge.source === "system" ? badge.id : null,
              badge.source === "bar" ? badge.id : null,
              badge.displayOrder,
              now,
              now
            )
        ),
        this.db.prepare("UPDATE menu_items SET updated_by_user_id = ?, updated_at = ? WHERE bar_id = ? AND id = ?").bind(
          updatedByUserId,
          now,
          barId,
          menuItemId
        )
      ]);
    } catch (error) {
      rethrowDuplicate(error);
    }
    return this.listMenuItemBadges(barId, menuItemId);
  }

  async applyMenuItemListChanges(
    barId: string,
    changes: MenuItemListChangeInput[],
    updatedByUserId: string,
    now: string
  ): Promise<void> {
    const currentItems = new Map<string, MenuItemRecord>();
    for (const change of changes) {
      const current = await this.findMenuItemById(barId, change.menuItemId);
      if (current) currentItems.set(change.menuItemId, current);
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
    const statements: D1PreparedStatement[] = [];
    for (const [categoryId, count] of moveCountsByCategory) {
      statements.push(
        this.db
          .prepare(
            `UPDATE menu_items
             SET sort_order = sort_order + ?, updated_by_user_id = ?, updated_at = ?
             WHERE bar_id = ? AND category_id = ?`
          )
          .bind(count, updatedByUserId, now, barId, categoryId)
      );
    }
    for (const change of changes) {
      const current = currentItems.get(change.menuItemId);
      if (!current) continue;
      const categoryChanged = current.categoryId !== change.categoryId;
      const shiftedSortOrder = current.sortOrder + (moveCountsByCategory.get(current.categoryId) ?? 0);
      statements.push(
        this.db
          .prepare(
            `UPDATE menu_items
             SET category_id = ?, sale_status = ?, is_visible = ?, sort_order = ?, updated_by_user_id = ?, updated_at = ?
             WHERE bar_id = ? AND id = ?`
          )
          .bind(
            change.categoryId,
            change.saleStatus,
            change.isVisible ? 1 : 0,
            categoryChanged ? moveOrderByItemId.get(change.menuItemId) ?? 0 : change.sortOrder ?? shiftedSortOrder,
            updatedByUserId,
            now,
            barId,
            change.menuItemId
          )
      );
      if (change.badges) {
        statements.push(this.db.prepare("DELETE FROM menu_item_badges WHERE bar_id = ? AND menu_item_id = ?").bind(barId, change.menuItemId));
        for (const badge of change.badges) {
          statements.push(
            this.db
              .prepare(
                `INSERT INTO menu_item_badges (
                  id, bar_id, menu_item_id, system_badge_id, bar_badge_id, display_order, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(
                badge.assignmentId,
                barId,
                change.menuItemId,
                badge.source === "system" ? badge.id : null,
                badge.source === "bar" ? badge.id : null,
                badge.displayOrder,
                now,
                now
              )
          );
        }
      }
    }
    try {
      if (statements.length) await this.db.batch(statements);
    } catch (error) {
      rethrowDuplicate(error);
    }
    for (const categoryId of sourceCategoriesToCompact) {
      await this.compactCategoryOrder(barId, categoryId, updatedByUserId, now);
    }
  }

  private updateStatement(barId: string, menuItemId: string, input: MenuItemUpdateInput, sortOrder: number): D1PreparedStatement {
    return this.db
      .prepare(
        `UPDATE menu_items
         SET category_id = ?, system_item_type_id = ?, bar_item_type_id = ?, name = ?, normalized_name = ?,
           description = ?, internal_memo = ?, sale_status = ?, is_visible = ?, abv_basis_points = ?, sort_order = ?,
           updated_by_user_id = ?, updated_at = ?
         WHERE bar_id = ? AND id = ?`
      )
      .bind(
        input.categoryId,
        input.systemItemTypeId,
        input.barItemTypeId,
        input.name,
        input.normalizedName,
        input.description,
        input.internalMemo,
        input.saleStatus,
        input.isVisible ? 1 : 0,
        input.abvBasisPoints,
        sortOrder,
        input.updatedByUserId,
        input.now,
        barId,
        menuItemId
      );
  }

  private async compactCategoryOrder(barId: string, categoryId: string, updatedByUserId: string, now: string): Promise<void> {
    const rows = await this.db
      .prepare("SELECT id FROM menu_items WHERE bar_id = ? AND category_id = ? ORDER BY sort_order ASC, created_at ASC")
      .bind(barId, categoryId)
      .all<{ id: string }>();
    await this.db.batch(
      (rows.results ?? []).map((row, index) =>
        this.db
          .prepare("UPDATE menu_items SET sort_order = ?, updated_by_user_id = ?, updated_at = ? WHERE bar_id = ? AND id = ?")
          .bind(index, updatedByUserId, now, barId, row.id)
      )
    );
  }

  private async allocatePublicId(barId: string, now: string): Promise<string> {
    const row = await this.db
      .prepare("SELECT next_menu_item_public_id FROM bar_public_counters WHERE bar_id = ?")
      .bind(barId)
      .first<{ next_menu_item_public_id: number }>();
    const next = row?.next_menu_item_public_id ?? 1;
    await this.db
      .prepare(
        `INSERT INTO bar_public_counters (
          bar_id, next_category_public_id, next_menu_item_public_id, next_publication_revision, created_at, updated_at
        ) VALUES (?, 1, ?, 1, ?, ?)
        ON CONFLICT(bar_id) DO UPDATE SET
          next_menu_item_public_id = excluded.next_menu_item_public_id,
          updated_at = excluded.updated_at`
      )
      .bind(barId, next + 1, now, now)
      .run();
    return `menu_${next}`;
  }
}

function toRecord(row: MenuItemRow): MenuItemRecord {
  return {
    id: row.id,
    barId: row.bar_id,
    publicId: row.public_id,
    categoryId: row.category_id,
    systemItemTypeId: row.system_item_type_id,
    barItemTypeId: row.bar_item_type_id,
    name: row.name,
    normalizedName: row.normalized_name,
    description: row.description,
    internalMemo: row.internal_memo,
    saleStatus: row.sale_status,
    isVisible: row.is_visible === 1,
    abvBasisPoints: row.abv_basis_points,
    sortOrder: row.sort_order,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rethrowDuplicate(error: unknown): never {
  if (error instanceof Error && /UNIQUE|constraint/i.test(error.message)) {
    if (/menu_item_prices|normalized_label/i.test(error.message)) {
      throw new Error("MENU_PRICE_LABEL_EXISTS");
    }
    if (/menu_item_badges/i.test(error.message)) {
      throw new Error("MENU_BADGE_CONFLICT");
    }
    throw new Error("MENU_NAME_EXISTS");
  }
  throw error;
}

function toPriceRecord(row: MenuItemPriceRow): MenuItemPriceRecord {
  return {
    id: row.id,
    barId: row.bar_id,
    menuItemId: row.menu_item_id,
    label: row.label,
    normalizedLabel: row.normalized_label,
    volumeText: row.volume_text,
    amountMinor: row.amount_minor,
    displayOrder: row.display_order,
    isRepresentative: Boolean(row.is_representative),
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toDetailsRecord(row: MenuItemDetailsRow): MenuItemDetailsRecord {
  return {
    barId: row.bar_id,
    menuItemId: row.menu_item_id,
    template: row.template,
    schemaVersion: 1,
    details: menuItemDetailsSchema.parse(JSON.parse(row.details_json)),
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toBadgeRecord(row: MenuItemBadgeRow): MenuItemBadgeRecord {
  const source = row.system_badge_id ? "system" : "bar";
  return {
    id: row.id,
    barId: row.bar_id,
    menuItemId: row.menu_item_id,
    source,
    badgeId: row.system_badge_id ?? row.bar_badge_id ?? "",
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
