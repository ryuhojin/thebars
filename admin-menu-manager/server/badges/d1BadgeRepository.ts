import type {
  BadgeColorInput,
  BadgeColorRecord,
  BadgeRepository,
  BarBadgeInput,
  BarBadgeRecord,
  BarBadgeVisibilityInput,
  BarBadgeVisibilityRecord,
  SystemBadgeInput,
  SystemBadgeRecord
} from "./repository";

type BadgeColorRow = {
  id: string;
  name: string;
  normalized_name: string;
  background_hex: string;
  is_active: number;
  usage_count?: number;
  created_at: string;
  updated_at: string;
};

type SystemBadgeRow = {
  id: string;
  name: string;
  normalized_name: string;
  color_id: string;
  is_active: number;
  usage_count?: number;
  created_at: string;
  updated_at: string;
};

type BarBadgeRow = SystemBadgeRow & {
  bar_id: string;
};

type BarBadgeVisibilityRow = {
  bar_id: string;
  system_badge_id: string;
  is_hidden: number;
  created_at: string;
  updated_at: string;
};

export class D1BadgeRepository implements BadgeRepository {
  constructor(private readonly db: D1Database) {}

  async listColors(): Promise<BadgeColorRecord[]> {
    const result = await this.db.prepare(`${colorSelectSql()} ORDER BY badge_colors.name ASC`).all<BadgeColorRow>();
    return (result.results ?? []).map(toColorRecord);
  }

  async findColorById(id: string): Promise<BadgeColorRecord | null> {
    const row = await this.db.prepare(`${colorSelectSql()} WHERE badge_colors.id = ?`).bind(id).first<BadgeColorRow>();
    return row ? toColorRecord(row) : null;
  }

  async createColor(input: BadgeColorInput): Promise<BadgeColorRecord> {
    try {
      await this.db
        .prepare(
          `INSERT INTO badge_colors (
            id, name, normalized_name, background_hex, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          input.id,
          input.name,
          input.normalizedName,
          input.backgroundHex,
          input.isActive ? 1 : 0,
          input.now,
          input.now
        )
        .run();
    } catch (error) {
      rethrowDuplicate(error, "BADGE_COLOR_NAME_EXISTS");
    }
    const created = await this.findColorById(input.id);
    if (!created) throw new Error("BADGE_COLOR_INSERT_FAILED");
    return created;
  }

  async updateColor(id: string, input: Omit<BadgeColorInput, "id">): Promise<BadgeColorRecord | null> {
    try {
      await this.db
        .prepare(
          `UPDATE badge_colors
           SET name = ?, normalized_name = ?, background_hex = ?, is_active = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(input.name, input.normalizedName, input.backgroundHex, input.isActive ? 1 : 0, input.now, id)
        .run();
    } catch (error) {
      rethrowDuplicate(error, "BADGE_COLOR_NAME_EXISTS");
    }
    return this.findColorById(id);
  }

  async countColorUsage(id: string): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM system_badges WHERE color_id = ?) +
          (SELECT COUNT(*) FROM bar_badges WHERE color_id = ?) AS usage_count`
      )
      .bind(id, id)
      .first<{ usage_count: number }>();
    return row?.usage_count ?? 0;
  }

  async replaceBadgeColorUsage(colorId: string, replacementColorId: string, now: string): Promise<void> {
    await this.db.batch([
      this.db
        .prepare("UPDATE system_badges SET color_id = ?, updated_at = ? WHERE color_id = ?")
        .bind(replacementColorId, now, colorId),
      this.db.prepare("UPDATE bar_badges SET color_id = ?, updated_at = ? WHERE color_id = ?").bind(replacementColorId, now, colorId)
    ]);
  }

  async listSystemBadges(): Promise<SystemBadgeRecord[]> {
    const result = await this.db.prepare(`${systemBadgeSelectSql()} ORDER BY system_badges.name ASC`).all<SystemBadgeRow>();
    return (result.results ?? []).map(toSystemBadgeRecord);
  }

  async findSystemBadgeById(id: string): Promise<SystemBadgeRecord | null> {
    const row = await this.db.prepare(`${systemBadgeSelectSql()} WHERE system_badges.id = ?`).bind(id).first<SystemBadgeRow>();
    return row ? toSystemBadgeRecord(row) : null;
  }

  async createSystemBadge(input: SystemBadgeInput): Promise<SystemBadgeRecord> {
    try {
      await this.db
        .prepare(
          `INSERT INTO system_badges (
            id, name, normalized_name, color_id, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(input.id, input.name, input.normalizedName, input.colorId, input.isActive ? 1 : 0, input.now, input.now)
        .run();
    } catch (error) {
      rethrowDuplicate(error, "BADGE_NAME_EXISTS");
    }
    const created = await this.findSystemBadgeById(input.id);
    if (!created) throw new Error("SYSTEM_BADGE_INSERT_FAILED");
    return created;
  }

  async updateSystemBadge(id: string, input: Omit<SystemBadgeInput, "id">): Promise<SystemBadgeRecord | null> {
    try {
      await this.db
        .prepare(
          `UPDATE system_badges
           SET name = ?, normalized_name = ?, color_id = ?, is_active = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(input.name, input.normalizedName, input.colorId, input.isActive ? 1 : 0, input.now, id)
        .run();
    } catch (error) {
      rethrowDuplicate(error, "BADGE_NAME_EXISTS");
    }
    return this.findSystemBadgeById(id);
  }

  async countSystemBadgeUsage(id: string): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) AS usage_count FROM menu_item_badges WHERE system_badge_id = ?")
      .bind(id)
      .first<{ usage_count: number }>();
    return row?.usage_count ?? 0;
  }

  async removeSystemBadgeAssignments(id: string): Promise<void> {
    await this.db.prepare("DELETE FROM menu_item_badges WHERE system_badge_id = ?").bind(id).run();
  }

  async listBarBadgeVisibility(barId: string): Promise<BarBadgeVisibilityRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM bar_badge_visibility WHERE bar_id = ? ORDER BY updated_at DESC")
      .bind(barId)
      .all<BarBadgeVisibilityRow>();
    return (result.results ?? []).map(toVisibilityRecord);
  }

  async upsertBarBadgeVisibility(input: BarBadgeVisibilityInput): Promise<BarBadgeVisibilityRecord> {
    await this.db
      .prepare(
        `INSERT INTO bar_badge_visibility (
          bar_id, system_badge_id, is_hidden, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(bar_id, system_badge_id) DO UPDATE SET
          is_hidden = excluded.is_hidden,
          updated_at = excluded.updated_at`
      )
      .bind(input.barId, input.systemBadgeId, input.isHidden ? 1 : 0, input.now, input.now)
      .run();
    const row = await this.db
      .prepare("SELECT * FROM bar_badge_visibility WHERE bar_id = ? AND system_badge_id = ?")
      .bind(input.barId, input.systemBadgeId)
      .first<BarBadgeVisibilityRow>();
    if (!row) throw new Error("BADGE_VISIBILITY_UPSERT_FAILED");
    return toVisibilityRecord(row);
  }

  async listBarBadges(barId: string): Promise<BarBadgeRecord[]> {
    const result = await this.db.prepare(`${barBadgeSelectSql()} WHERE bar_badges.bar_id = ? ORDER BY bar_badges.name ASC`).bind(barId).all<BarBadgeRow>();
    return (result.results ?? []).map(toBarBadgeRecord);
  }

  async findBarBadgeById(barId: string, id: string): Promise<BarBadgeRecord | null> {
    const row = await this.db
      .prepare(`${barBadgeSelectSql()} WHERE bar_badges.bar_id = ? AND bar_badges.id = ?`)
      .bind(barId, id)
      .first<BarBadgeRow>();
    return row ? toBarBadgeRecord(row) : null;
  }

  async createBarBadge(input: BarBadgeInput): Promise<BarBadgeRecord> {
    try {
      await this.db
        .prepare(
          `INSERT INTO bar_badges (
            id, bar_id, name, normalized_name, color_id, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          input.id,
          input.barId,
          input.name,
          input.normalizedName,
          input.colorId,
          input.isActive ? 1 : 0,
          input.now,
          input.now
        )
        .run();
    } catch (error) {
      rethrowDuplicate(error, "BADGE_NAME_EXISTS");
    }
    const created = await this.findBarBadgeById(input.barId, input.id);
    if (!created) throw new Error("BAR_BADGE_INSERT_FAILED");
    return created;
  }

  async updateBarBadge(
    barId: string,
    id: string,
    input: Omit<BarBadgeInput, "id" | "barId">
  ): Promise<BarBadgeRecord | null> {
    try {
      await this.db
        .prepare(
          `UPDATE bar_badges
           SET name = ?, normalized_name = ?, color_id = ?, is_active = ?, updated_at = ?
           WHERE bar_id = ? AND id = ?`
        )
        .bind(input.name, input.normalizedName, input.colorId, input.isActive ? 1 : 0, input.now, barId, id)
        .run();
    } catch (error) {
      rethrowDuplicate(error, "BADGE_NAME_EXISTS");
    }
    return this.findBarBadgeById(barId, id);
  }

  async deleteBarBadge(barId: string, id: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM bar_badges WHERE bar_id = ? AND id = ?").bind(barId, id).run();
    return result.meta.changes > 0;
  }

  async countBarBadgeUsage(barId: string, id: string): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) AS usage_count FROM menu_item_badges WHERE bar_id = ? AND bar_badge_id = ?")
      .bind(barId, id)
      .first<{ usage_count: number }>();
    return row?.usage_count ?? 0;
  }

  async removeBarBadgeAssignments(barId: string, id: string): Promise<void> {
    await this.db.prepare("DELETE FROM menu_item_badges WHERE bar_id = ? AND bar_badge_id = ?").bind(barId, id).run();
  }
}

function colorSelectSql(): string {
  return `SELECT badge_colors.*,
    (SELECT COUNT(*) FROM system_badges WHERE color_id = badge_colors.id) +
    (SELECT COUNT(*) FROM bar_badges WHERE color_id = badge_colors.id) AS usage_count
    FROM badge_colors`;
}

function systemBadgeSelectSql(): string {
  return `SELECT system_badges.*,
    (SELECT COUNT(*) FROM menu_item_badges WHERE system_badge_id = system_badges.id) AS usage_count
    FROM system_badges`;
}

function barBadgeSelectSql(): string {
  return `SELECT bar_badges.*,
    (SELECT COUNT(*) FROM menu_item_badges WHERE bar_id = bar_badges.bar_id AND bar_badge_id = bar_badges.id) AS usage_count
    FROM bar_badges`;
}

function toColorRecord(row: BadgeColorRow): BadgeColorRecord {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    backgroundHex: row.background_hex,
    isActive: row.is_active === 1,
    usageCount: row.usage_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toSystemBadgeRecord(row: SystemBadgeRow): SystemBadgeRecord {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    colorId: row.color_id,
    isActive: row.is_active === 1,
    usageCount: row.usage_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toBarBadgeRecord(row: BarBadgeRow): BarBadgeRecord {
  return {
    ...toSystemBadgeRecord(row),
    barId: row.bar_id
  };
}

function toVisibilityRecord(row: BarBadgeVisibilityRow): BarBadgeVisibilityRecord {
  return {
    barId: row.bar_id,
    systemBadgeId: row.system_badge_id,
    isHidden: row.is_hidden === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rethrowDuplicate(error: unknown, code: string): never {
  if (error instanceof Error && /UNIQUE|constraint/i.test(error.message)) {
    throw new Error(code);
  }
  throw error;
}
