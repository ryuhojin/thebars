import type {
  ApproveGrapeCandidateInput,
  BarItemTypeInput,
  BarItemTypeOverrideInput,
  BarItemTypeOverrideRecord,
  BarItemTypeRecord,
  GrapeCandidateInput,
  GrapeVarietyCandidateRecord,
  GrapeVarietyRecord,
  ItemTypeInput,
  ItemTypeRecord,
  ItemTypeRepository,
  RejectGrapeCandidateInput
} from "./repository";

type ItemTypeRow = {
  id: string;
  name: string;
  normalized_name: string;
  template: ItemTypeRecord["template"];
  default_price_labels_json: string;
  is_active: number;
  created_at: string;
  updated_at: string;
};

type BarItemTypeRow = ItemTypeRow & {
  bar_id: string;
};

type OverrideRow = {
  bar_id: string;
  system_item_type_id: string;
  is_hidden: number;
  default_price_labels_json: string;
  created_at: string;
  updated_at: string;
};

type GrapeVarietyRow = {
  id: string;
  name: string;
  normalized_name: string;
  created_at: string;
};

type GrapeCandidateRow = {
  id: string;
  bar_id: string | null;
  proposed_name: string;
  normalized_proposed_name: string;
  status: GrapeVarietyCandidateRecord["status"];
  standard_name: string | null;
  submitted_by_user_id: string;
  reviewed_by_user_id: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export class D1ItemTypeRepository implements ItemTypeRepository {
  constructor(private readonly db: D1Database) {}

  async listSystemItemTypes(): Promise<ItemTypeRecord[]> {
    const result = await this.db.prepare("SELECT * FROM system_item_types ORDER BY name ASC").all<ItemTypeRow>();
    return Promise.all((result.results ?? []).map((row) => this.withSystemUsage(toSystemItemTypeRecord(row))));
  }

  async findSystemItemTypeById(id: string): Promise<ItemTypeRecord | null> {
    const row = await this.db.prepare("SELECT * FROM system_item_types WHERE id = ?").bind(id).first<ItemTypeRow>();
    return row ? this.withSystemUsage(toSystemItemTypeRecord(row)) : null;
  }

  async createSystemItemType(input: ItemTypeInput): Promise<ItemTypeRecord> {
    try {
      await this.db
        .prepare(
          `INSERT INTO system_item_types (
            id, name, normalized_name, template, default_price_labels_json, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          input.id,
          input.name,
          input.normalizedName,
          input.template,
          JSON.stringify(input.defaultPriceLabels),
          input.isActive ? 1 : 0,
          input.now,
          input.now
        )
        .run();
    } catch (error) {
      rethrowDuplicate(error);
    }
    const created = await this.findSystemItemTypeById(input.id);
    if (!created) throw new Error("ITEM_TYPE_INSERT_FAILED");
    return created;
  }

  async updateSystemItemType(id: string, input: Omit<ItemTypeInput, "id">): Promise<ItemTypeRecord | null> {
    try {
      await this.db
        .prepare(
          `UPDATE system_item_types
           SET name = ?, normalized_name = ?, template = ?, default_price_labels_json = ?, is_active = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(
          input.name,
          input.normalizedName,
          input.template,
          JSON.stringify(input.defaultPriceLabels),
          input.isActive ? 1 : 0,
          input.now,
          id
        )
        .run();
    } catch (error) {
      rethrowDuplicate(error);
    }
    return this.findSystemItemTypeById(id);
  }

  async deleteSystemItemType(id: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM system_item_types WHERE id = ?").bind(id).run();
    return result.meta.changes > 0;
  }

  async countSystemItemTypeUsage(id: string): Promise<number> {
    if (!(await this.hasMenuItemsTable())) return 0;
    const row = await this.db
      .prepare("SELECT COUNT(*) AS usage_count FROM menu_items WHERE system_item_type_id = ?")
      .bind(id)
      .first<{ usage_count: number }>();
    return row?.usage_count ?? 0;
  }

  async listBarItemTypes(barId: string): Promise<BarItemTypeRecord[]> {
    const result = await this.db.prepare("SELECT * FROM bar_item_types WHERE bar_id = ? ORDER BY name ASC").bind(barId).all<BarItemTypeRow>();
    return Promise.all((result.results ?? []).map((row) => this.withBarUsage(toBarItemTypeRecord(row))));
  }

  async findBarItemTypeById(barId: string, id: string): Promise<BarItemTypeRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM bar_item_types WHERE bar_id = ? AND id = ?")
      .bind(barId, id)
      .first<BarItemTypeRow>();
    return row ? this.withBarUsage(toBarItemTypeRecord(row)) : null;
  }

  async createBarItemType(input: BarItemTypeInput): Promise<BarItemTypeRecord> {
    try {
      await this.db
        .prepare(
          `INSERT INTO bar_item_types (
            id, bar_id, name, normalized_name, template, default_price_labels_json, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          input.id,
          input.barId,
          input.name,
          input.normalizedName,
          input.template,
          JSON.stringify(input.defaultPriceLabels),
          input.isActive ? 1 : 0,
          input.now,
          input.now
        )
        .run();
    } catch (error) {
      rethrowDuplicate(error);
    }
    const created = await this.findBarItemTypeById(input.barId, input.id);
    if (!created) throw new Error("ITEM_TYPE_INSERT_FAILED");
    return created;
  }

  async updateBarItemType(
    barId: string,
    id: string,
    input: Omit<BarItemTypeInput, "id" | "barId">
  ): Promise<BarItemTypeRecord | null> {
    try {
      await this.db
        .prepare(
          `UPDATE bar_item_types
           SET name = ?, normalized_name = ?, template = ?, default_price_labels_json = ?, is_active = ?, updated_at = ?
           WHERE bar_id = ? AND id = ?`
        )
        .bind(
          input.name,
          input.normalizedName,
          input.template,
          JSON.stringify(input.defaultPriceLabels),
          input.isActive ? 1 : 0,
          input.now,
          barId,
          id
        )
        .run();
    } catch (error) {
      rethrowDuplicate(error);
    }
    return this.findBarItemTypeById(barId, id);
  }

  async deleteBarItemType(barId: string, id: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM bar_item_types WHERE bar_id = ? AND id = ?").bind(barId, id).run();
    return result.meta.changes > 0;
  }

  async countBarItemTypeUsage(barId: string, id: string): Promise<number> {
    if (!(await this.hasMenuItemsTable())) return 0;
    const row = await this.db
      .prepare("SELECT COUNT(*) AS usage_count FROM menu_items WHERE bar_id = ? AND bar_item_type_id = ?")
      .bind(barId, id)
      .first<{ usage_count: number }>();
    return row?.usage_count ?? 0;
  }

  async listBarItemTypeOverrides(barId: string): Promise<BarItemTypeOverrideRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM bar_item_type_overrides WHERE bar_id = ? ORDER BY updated_at DESC")
      .bind(barId)
      .all<OverrideRow>();
    return (result.results ?? []).map(toOverrideRecord);
  }

  async upsertBarItemTypeOverride(input: BarItemTypeOverrideInput): Promise<BarItemTypeOverrideRecord> {
    await this.db
      .prepare(
        `INSERT INTO bar_item_type_overrides (
          bar_id, system_item_type_id, is_hidden, default_price_labels_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(bar_id, system_item_type_id) DO UPDATE SET
          is_hidden = excluded.is_hidden,
          default_price_labels_json = excluded.default_price_labels_json,
          updated_at = excluded.updated_at`
      )
      .bind(
        input.barId,
        input.systemItemTypeId,
        input.isHidden ? 1 : 0,
        JSON.stringify(input.defaultPriceLabels),
        input.now,
        input.now
      )
      .run();
    const row = await this.db
      .prepare("SELECT * FROM bar_item_type_overrides WHERE bar_id = ? AND system_item_type_id = ?")
      .bind(input.barId, input.systemItemTypeId)
      .first<OverrideRow>();
    if (!row) throw new Error("ITEM_TYPE_OVERRIDE_FAILED");
    return toOverrideRecord(row);
  }

  async listGrapeVarieties(): Promise<GrapeVarietyRecord[]> {
    const result = await this.db.prepare("SELECT * FROM grape_varieties ORDER BY name ASC").all<GrapeVarietyRow>();
    return (result.results ?? []).map(toGrapeVarietyRecord);
  }

  async findGrapeVarietyByNormalizedName(normalizedName: string): Promise<GrapeVarietyRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM grape_varieties WHERE normalized_name = ?")
      .bind(normalizedName)
      .first<GrapeVarietyRow>();
    return row ? toGrapeVarietyRecord(row) : null;
  }

  async listGrapeCandidates(): Promise<GrapeVarietyCandidateRecord[]> {
    const result = await this.db.prepare("SELECT * FROM grape_variety_candidates ORDER BY created_at DESC").all<GrapeCandidateRow>();
    return (result.results ?? []).map(toGrapeCandidateRecord);
  }

  async findGrapeCandidateById(id: string): Promise<GrapeVarietyCandidateRecord | null> {
    const row = await this.db.prepare("SELECT * FROM grape_variety_candidates WHERE id = ?").bind(id).first<GrapeCandidateRow>();
    return row ? toGrapeCandidateRecord(row) : null;
  }

  async findPendingGrapeCandidateByNormalizedName(normalizedName: string): Promise<GrapeVarietyCandidateRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM grape_variety_candidates WHERE normalized_proposed_name = ? AND status = 'pending'")
      .bind(normalizedName)
      .first<GrapeCandidateRow>();
    return row ? toGrapeCandidateRecord(row) : null;
  }

  async createGrapeCandidate(input: GrapeCandidateInput): Promise<GrapeVarietyCandidateRecord> {
    await this.db
      .prepare(
        `INSERT INTO grape_variety_candidates (
          id, bar_id, proposed_name, normalized_proposed_name, status, submitted_by_user_id, created_at
        ) VALUES (?, ?, ?, ?, 'pending', ?, ?)`
      )
      .bind(input.id, input.barId, input.proposedName, input.normalizedProposedName, input.submittedByUserId, input.now)
      .run();
    const created = await this.findGrapeCandidateById(input.id);
    if (!created) throw new Error("GRAPE_CANDIDATE_INSERT_FAILED");
    return created;
  }

  async approveGrapeCandidate(input: ApproveGrapeCandidateInput): Promise<{
    candidate: GrapeVarietyCandidateRecord;
    variety: GrapeVarietyRecord;
  }> {
    const candidate = await this.findGrapeCandidateById(input.candidateId);
    if (!candidate || candidate.status !== "pending") throw new Error("GRAPE_CANDIDATE_NOT_PENDING");
    try {
      await this.db.batch([
        this.db
          .prepare("INSERT INTO grape_varieties (id, name, normalized_name, created_at) VALUES (?, ?, ?, ?)")
          .bind(input.varietyId, input.standardName, input.normalizedName, input.now),
        this.db
          .prepare(
            `UPDATE grape_variety_candidates
             SET status = 'approved', standard_name = ?, reviewed_by_user_id = ?, reviewed_at = ?
             WHERE id = ?`
          )
          .bind(input.standardName, input.reviewedByUserId, input.now, input.candidateId)
      ]);
    } catch (error) {
      rethrowDuplicate(error, "GRAPE_VARIETY_EXISTS");
    }
    const updatedCandidate = await this.findGrapeCandidateById(input.candidateId);
    const variety = await this.findGrapeVarietyByNormalizedName(input.normalizedName);
    if (!updatedCandidate || !variety) throw new Error("GRAPE_APPROVE_FAILED");
    return { candidate: updatedCandidate, variety };
  }

  async rejectGrapeCandidate(input: RejectGrapeCandidateInput): Promise<GrapeVarietyCandidateRecord | null> {
    await this.db
      .prepare(
        `UPDATE grape_variety_candidates
         SET status = 'rejected', reviewed_by_user_id = ?, rejection_reason = ?, reviewed_at = ?
         WHERE id = ? AND status = 'pending'`
      )
      .bind(input.reviewedByUserId, input.reason, input.now, input.candidateId)
      .run();
    return this.findGrapeCandidateById(input.candidateId);
  }

  private async withSystemUsage(record: ItemTypeRecord): Promise<ItemTypeRecord> {
    return { ...record, usageCount: await this.countSystemItemTypeUsage(record.id) };
  }

  private async withBarUsage(record: BarItemTypeRecord): Promise<BarItemTypeRecord> {
    return { ...record, usageCount: await this.countBarItemTypeUsage(record.barId, record.id) };
  }

  private async hasMenuItemsTable(): Promise<boolean> {
    const row = await this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'menu_items'")
      .first<{ name: string }>();
    return Boolean(row);
  }
}

function toSystemItemTypeRecord(row: ItemTypeRow): ItemTypeRecord {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    template: row.template,
    defaultPriceLabels: parseLabels(row.default_price_labels_json),
    isActive: row.is_active === 1,
    usageCount: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toBarItemTypeRecord(row: BarItemTypeRow): BarItemTypeRecord {
  return {
    ...toSystemItemTypeRecord(row),
    barId: row.bar_id
  };
}

function toOverrideRecord(row: OverrideRow): BarItemTypeOverrideRecord {
  return {
    barId: row.bar_id,
    systemItemTypeId: row.system_item_type_id,
    isHidden: row.is_hidden === 1,
    defaultPriceLabels: parseLabels(row.default_price_labels_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toGrapeVarietyRecord(row: GrapeVarietyRow): GrapeVarietyRecord {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    createdAt: row.created_at
  };
}

function toGrapeCandidateRecord(row: GrapeCandidateRow): GrapeVarietyCandidateRecord {
  return {
    id: row.id,
    barId: row.bar_id,
    proposedName: row.proposed_name,
    normalizedProposedName: row.normalized_proposed_name,
    status: row.status,
    standardName: row.standard_name,
    submittedByUserId: row.submitted_by_user_id,
    reviewedByUserId: row.reviewed_by_user_id,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at
  };
}

function parseLabels(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function rethrowDuplicate(error: unknown, code = "ITEM_TYPE_NAME_EXISTS"): never {
  if (error instanceof Error && /UNIQUE|constraint/i.test(error.message)) {
    throw new Error(code);
  }
  throw error;
}
