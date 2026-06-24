import type {
  BarBusinessHourRecord,
  BarLifecycleEventRecord,
  BarLinkRecord,
  BarRecord,
  BarRepository,
  BarSettingsRecord,
  BarStatusSummary,
  CreateBarLifecycleEventInput,
  CreateBarRecordInput,
  UpdateBarSettingsRecordInput
} from "./repository";
import { defaultRolePermissions } from "../memberships/repository";

type BarRow = {
  id: string;
  name: string;
  slug: string;
  encoded_slug: string;
  status: "active" | "inactive";
  currency: string;
  description: string;
  address: string;
  map_url: string;
  phone_number_digits: string;
  opening_note: string;
  settings_draft_hash: string;
  public_menu_status: "preparing" | "published";
  direct_publish_enabled: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type BusinessHourRow = {
  id: string;
  bar_id: string;
  day_of_week: number;
  opens_at: string;
  closes_at: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type LinkRow = {
  id: string;
  bar_id: string;
  label: string;
  url: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type LifecycleEventRow = {
  id: string;
  bar_id: string;
  action: BarLifecycleEventRecord["action"];
  before_status: BarLifecycleEventRecord["beforeStatus"];
  after_status: BarLifecycleEventRecord["afterStatus"];
  publication_id: string | null;
  result: string;
  actor_user_id: string | null;
  created_at: string;
};

export class D1BarRepository implements BarRepository {
  constructor(private readonly db: D1Database) {}

  async listBars(): Promise<BarRecord[]> {
    const result = await this.db.prepare("SELECT * FROM bars ORDER BY created_at DESC, name ASC").all<BarRow>();
    return (result.results ?? []).map(toBarRecord);
  }

  async findBarById(barId: string): Promise<BarRecord | null> {
    const row = await this.db.prepare("SELECT * FROM bars WHERE id = ?").bind(barId).first<BarRow>();
    return row ? toBarRecord(row) : null;
  }

  async findBarBySlug(slug: string): Promise<BarRecord | null> {
    const row = await this.db.prepare("SELECT * FROM bars WHERE slug = ?").bind(slug).first<BarRow>();
    return row ? toBarRecord(row) : null;
  }

  async readBarSettings(barId: string): Promise<BarSettingsRecord | null> {
    const bar = await this.findBarById(barId);
    if (!bar) return null;
    const [businessHours, links] = await Promise.all([this.readBusinessHours(barId), this.readLinks(barId)]);
    return { bar, businessHours, links };
  }

  async readBarStatusSummary(): Promise<BarStatusSummary> {
    const row = await this.db
      .prepare(
        `SELECT
          COUNT(*) AS totalBars,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeBars,
          SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactiveBars
         FROM bars`
      )
      .first<BarStatusSummary>();
    return {
      totalBars: row?.totalBars ?? 0,
      activeBars: row?.activeBars ?? 0,
      inactiveBars: row?.inactiveBars ?? 0
    };
  }

  async createBar(input: CreateBarRecordInput): Promise<BarRecord> {
    try {
      await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO bars (
              id, name, slug, encoded_slug, status, currency, public_menu_status,
              description, address, map_url, phone_number_digits, opening_note, settings_draft_hash,
              direct_publish_enabled, created_by_user_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'active', ?, 'preparing', '', '', '', '', '', ?, 0, ?, ?, ?)`
          )
          .bind(
            input.id,
            input.name,
            input.slug,
            input.encodedSlug,
            input.currency,
            input.settingsDraftHash,
            input.createdByUserId,
            input.now,
            input.now
          ),
        this.db
          .prepare(
            `INSERT INTO bar_public_counters (
              bar_id, next_category_public_id, next_menu_item_public_id,
              next_publication_revision, created_at, updated_at
            ) VALUES (?, 1, 1, 1, ?, ?)`
          )
          .bind(input.id, input.now, input.now),
        ...defaultRolePermissions.map((permission) =>
          this.db
            .prepare(
              `INSERT INTO bar_role_permissions (
                bar_id, role, can_edit_menu, can_manage_orders,
                can_add_custom_order_item, can_apply_order_adjustment, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              input.id,
              permission.role,
              permission.canEditMenu ? 1 : 0,
              permission.canManageOrders ? 1 : 0,
              permission.canAddCustomOrderItem ? 1 : 0,
              permission.canApplyOrderAdjustment ? 1 : 0,
              input.now,
              input.now
            )
        )
      ]);
    } catch (error) {
      if (error instanceof Error && /UNIQUE|constraint/i.test(error.message)) {
        throw new Error("BAR_UNIQUE_CONSTRAINT");
      }
      throw error;
    }

    const created = await this.findBarById(input.id);
    if (!created) throw new Error("BAR_INSERT_FAILED");
    return created;
  }

  async updateBarSettings(input: UpdateBarSettingsRecordInput): Promise<BarSettingsRecord | null> {
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `UPDATE bars
           SET name = ?,
               description = ?,
               address = ?,
               map_url = ?,
               phone_number_digits = ?,
               opening_note = ?,
               currency = ?,
               settings_draft_hash = ?,
               updated_at = ?
           WHERE id = ?`
        )
        .bind(
          input.name,
          input.description,
          input.address,
          input.mapUrl,
          input.phoneNumberDigits,
          input.openingNote,
          input.currency,
          input.settingsDraftHash,
          input.now,
          input.barId
        ),
      this.db.prepare("DELETE FROM bar_business_hours WHERE bar_id = ?").bind(input.barId),
      this.db.prepare("DELETE FROM bar_links WHERE bar_id = ?").bind(input.barId),
      ...input.businessHours.map((range) =>
        this.db
          .prepare(
            `INSERT INTO bar_business_hours (
              id, bar_id, day_of_week, opens_at, closes_at, sort_order, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(range.id, input.barId, range.dayOfWeek, range.opensAt, range.closesAt, range.sortOrder, input.now, input.now)
      ),
      ...input.links.map((link) =>
        this.db
          .prepare(
            `INSERT INTO bar_links (
              id, bar_id, label, url, sort_order, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(link.id, input.barId, link.label, link.url, link.sortOrder, input.now, input.now)
      )
    ];
    await this.db.batch(statements);
    return this.readBarSettings(input.barId);
  }

  async updatePublicMenuStatus(barId: string, status: BarRecord["publicMenuStatus"], now: string): Promise<BarRecord | null> {
    await this.db
      .prepare("UPDATE bars SET public_menu_status = ?, updated_at = ? WHERE id = ?")
      .bind(status, now, barId)
      .run();
    return this.findBarById(barId);
  }

  async updateBarStatus(
    barId: string,
    status: BarRecord["status"],
    publicMenuStatus: BarRecord["publicMenuStatus"],
    now: string
  ): Promise<BarRecord | null> {
    await this.db
      .prepare("UPDATE bars SET status = ?, public_menu_status = ?, updated_at = ? WHERE id = ?")
      .bind(status, publicMenuStatus, now, barId)
      .run();
    return this.findBarById(barId);
  }

  async createLifecycleEvent(input: CreateBarLifecycleEventInput): Promise<BarLifecycleEventRecord> {
    await this.db
      .prepare(
        `INSERT INTO bar_lifecycle_events (
          id, bar_id, action, before_status, after_status, publication_id, result, actor_user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.barId,
        input.action,
        input.beforeStatus,
        input.afterStatus,
        input.publicationId,
        input.result,
        input.actorUserId,
        input.createdAt
      )
      .run();
    return { ...input };
  }

  async listLifecycleEvents(barId: string, limit: number): Promise<BarLifecycleEventRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM bar_lifecycle_events WHERE bar_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
      .bind(barId, limit)
      .all<LifecycleEventRow>();
    return (result.results ?? []).map((row) => ({
      id: row.id,
      barId: row.bar_id,
      action: row.action,
      beforeStatus: row.before_status,
      afterStatus: row.after_status,
      publicationId: row.publication_id,
      result: row.result,
      actorUserId: row.actor_user_id,
      createdAt: row.created_at
    }));
  }

  private async readBusinessHours(barId: string): Promise<BarBusinessHourRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM bar_business_hours WHERE bar_id = ? ORDER BY day_of_week ASC, sort_order ASC")
      .bind(barId)
      .all<BusinessHourRow>();
    return (result.results ?? []).map((row) => ({
      id: row.id,
      barId: row.bar_id,
      dayOfWeek: row.day_of_week,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  private async readLinks(barId: string): Promise<BarLinkRecord[]> {
    const result = await this.db.prepare("SELECT * FROM bar_links WHERE bar_id = ? ORDER BY sort_order ASC").bind(barId).all<LinkRow>();
    return (result.results ?? []).map((row) => ({
      id: row.id,
      barId: row.bar_id,
      label: row.label,
      url: row.url,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
}

function toBarRecord(row: BarRow): BarRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    encodedSlug: row.encoded_slug,
    status: row.status,
    currency: row.currency,
    description: row.description,
    address: row.address,
    mapUrl: row.map_url,
    phoneNumberDigits: row.phone_number_digits,
    openingNote: row.opening_note,
    settingsDraftHash: row.settings_draft_hash,
    publicMenuStatus: row.public_menu_status,
    directPublishEnabled: row.direct_publish_enabled === 1,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
