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
import { defaultBadgeColors, defaultSystemBadges } from "./repository";

export class MemoryBadgeRepository implements BadgeRepository {
  private readonly colors = new Map<string, BadgeColorRecord>();
  private readonly systemBadges = new Map<string, SystemBadgeRecord>();
  private readonly barVisibility = new Map<string, BarBadgeVisibilityRecord>();
  private readonly barBadges = new Map<string, BarBadgeRecord>();
  private readonly colorUsage = new Map<string, number>();
  private readonly systemUsage = new Map<string, number>();
  private readonly barUsage = new Map<string, number>();

  constructor() {
    this.reset();
  }

  reset() {
    this.colors.clear();
    this.systemBadges.clear();
    this.barVisibility.clear();
    this.barBadges.clear();
    this.colorUsage.clear();
    this.systemUsage.clear();
    this.barUsage.clear();
    defaultBadgeColors.forEach((color) => this.colors.set(color.id, { ...color }));
    defaultSystemBadges.forEach((badge) => this.systemBadges.set(badge.id, { ...badge }));
  }

  setColorUsageForTest(id: string, usageCount: number) {
    this.colorUsage.set(id, usageCount);
  }

  setSystemBadgeUsageForTest(id: string, usageCount: number) {
    this.systemUsage.set(id, usageCount);
  }

  setBarBadgeUsageForTest(barId: string, id: string, usageCount: number) {
    this.barUsage.set(barBadgeKey(barId, id), usageCount);
  }

  replaceMenuBadgeUsage(systemUsage: Map<string, number>, barUsage: Map<string, number>) {
    this.systemUsage.clear();
    this.barUsage.clear();
    for (const [id, count] of systemUsage) this.systemUsage.set(id, count);
    for (const [key, count] of barUsage) this.barUsage.set(key, count);
  }

  async listColors(): Promise<BadgeColorRecord[]> {
    return [...this.colors.values()]
      .sort((left, right) => left.name.localeCompare(right.name, "ko"))
      .map((color) => this.withColorUsage(color));
  }

  async findColorById(id: string): Promise<BadgeColorRecord | null> {
    const color = this.colors.get(id);
    return color ? this.withColorUsage(color) : null;
  }

  async createColor(input: BadgeColorInput): Promise<BadgeColorRecord> {
    assertNoDuplicate([...this.colors.values()], input.normalizedName, "BADGE_COLOR_NAME_EXISTS");
    const record: BadgeColorRecord = { ...input, createdAt: input.now, updatedAt: input.now, usageCount: 0 };
    this.colors.set(record.id, record);
    return { ...record };
  }

  async updateColor(id: string, input: Omit<BadgeColorInput, "id">): Promise<BadgeColorRecord | null> {
    const current = this.colors.get(id);
    if (!current) return null;
    assertNoDuplicate(
      [...this.colors.values()].filter((color) => color.id !== id),
      input.normalizedName,
      "BADGE_COLOR_NAME_EXISTS"
    );
    const record: BadgeColorRecord = {
      ...current,
      name: input.name,
      normalizedName: input.normalizedName,
      backgroundHex: input.backgroundHex,
      isActive: input.isActive,
      usageCount: this.readColorUsage(id),
      updatedAt: input.now
    };
    this.colors.set(id, record);
    return { ...record };
  }

  async countColorUsage(id: string): Promise<number> {
    return this.readColorUsage(id);
  }

  async replaceBadgeColorUsage(colorId: string, replacementColorId: string, now: string): Promise<void> {
    for (const [id, badge] of this.systemBadges) {
      if (badge.colorId === colorId) {
        this.systemBadges.set(id, { ...badge, colorId: replacementColorId, updatedAt: now });
      }
    }
    for (const [id, badge] of this.barBadges) {
      if (badge.colorId === colorId) {
        this.barBadges.set(id, { ...badge, colorId: replacementColorId, updatedAt: now });
      }
    }
    this.colorUsage.delete(colorId);
  }

  async listSystemBadges(): Promise<SystemBadgeRecord[]> {
    return [...this.systemBadges.values()]
      .sort((left, right) => left.name.localeCompare(right.name, "ko"))
      .map((badge) => this.withSystemUsage(badge));
  }

  async findSystemBadgeById(id: string): Promise<SystemBadgeRecord | null> {
    const badge = this.systemBadges.get(id);
    return badge ? this.withSystemUsage(badge) : null;
  }

  async createSystemBadge(input: SystemBadgeInput): Promise<SystemBadgeRecord> {
    assertNoDuplicate([...this.systemBadges.values()], input.normalizedName, "BADGE_NAME_EXISTS");
    const record: SystemBadgeRecord = { ...input, createdAt: input.now, updatedAt: input.now, usageCount: 0 };
    this.systemBadges.set(record.id, record);
    return { ...record };
  }

  async updateSystemBadge(id: string, input: Omit<SystemBadgeInput, "id">): Promise<SystemBadgeRecord | null> {
    const current = this.systemBadges.get(id);
    if (!current) return null;
    assertNoDuplicate(
      [...this.systemBadges.values()].filter((badge) => badge.id !== id),
      input.normalizedName,
      "BADGE_NAME_EXISTS"
    );
    const record: SystemBadgeRecord = {
      ...current,
      name: input.name,
      normalizedName: input.normalizedName,
      colorId: input.colorId,
      isActive: input.isActive,
      usageCount: this.systemUsage.get(id) ?? 0,
      updatedAt: input.now
    };
    this.systemBadges.set(id, record);
    return { ...record };
  }

  async countSystemBadgeUsage(id: string): Promise<number> {
    return this.systemUsage.get(id) ?? 0;
  }

  async removeSystemBadgeAssignments(id: string): Promise<void> {
    this.systemUsage.delete(id);
  }

  async listBarBadgeVisibility(barId: string): Promise<BarBadgeVisibilityRecord[]> {
    return [...this.barVisibility.values()]
      .filter((visibility) => visibility.barId === barId)
      .map((visibility) => ({ ...visibility }));
  }

  async upsertBarBadgeVisibility(input: BarBadgeVisibilityInput): Promise<BarBadgeVisibilityRecord> {
    const key = visibilityKey(input.barId, input.systemBadgeId);
    const existing = this.barVisibility.get(key);
    const record: BarBadgeVisibilityRecord = {
      barId: input.barId,
      systemBadgeId: input.systemBadgeId,
      isHidden: input.isHidden,
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now
    };
    this.barVisibility.set(key, record);
    return { ...record };
  }

  async listBarBadges(barId: string): Promise<BarBadgeRecord[]> {
    return [...this.barBadges.values()]
      .filter((badge) => badge.barId === barId)
      .sort((left, right) => left.name.localeCompare(right.name, "ko"))
      .map((badge) => this.withBarUsage(badge));
  }

  async findBarBadgeById(barId: string, id: string): Promise<BarBadgeRecord | null> {
    const badge = this.barBadges.get(id);
    return badge && badge.barId === barId ? this.withBarUsage(badge) : null;
  }

  async createBarBadge(input: BarBadgeInput): Promise<BarBadgeRecord> {
    assertNoDuplicate(
      [...this.barBadges.values()].filter((badge) => badge.barId === input.barId),
      input.normalizedName,
      "BADGE_NAME_EXISTS"
    );
    const record: BarBadgeRecord = { ...input, createdAt: input.now, updatedAt: input.now, usageCount: 0 };
    this.barBadges.set(record.id, record);
    return { ...record };
  }

  async updateBarBadge(
    barId: string,
    id: string,
    input: Omit<BarBadgeInput, "id" | "barId">
  ): Promise<BarBadgeRecord | null> {
    const current = this.barBadges.get(id);
    if (!current || current.barId !== barId) return null;
    assertNoDuplicate(
      [...this.barBadges.values()].filter((badge) => badge.barId === barId && badge.id !== id),
      input.normalizedName,
      "BADGE_NAME_EXISTS"
    );
    const record: BarBadgeRecord = {
      ...current,
      name: input.name,
      normalizedName: input.normalizedName,
      colorId: input.colorId,
      isActive: input.isActive,
      usageCount: this.barUsage.get(barBadgeKey(barId, id)) ?? 0,
      updatedAt: input.now
    };
    this.barBadges.set(id, record);
    return { ...record };
  }

  async deleteBarBadge(barId: string, id: string): Promise<boolean> {
    const current = this.barBadges.get(id);
    if (!current || current.barId !== barId) return false;
    return this.barBadges.delete(id);
  }

  async countBarBadgeUsage(barId: string, id: string): Promise<number> {
    return this.barUsage.get(barBadgeKey(barId, id)) ?? 0;
  }

  async removeBarBadgeAssignments(barId: string, id: string): Promise<void> {
    this.barUsage.delete(barBadgeKey(barId, id));
  }

  private withColorUsage(color: BadgeColorRecord): BadgeColorRecord {
    return { ...color, usageCount: this.readColorUsage(color.id) };
  }

  private withSystemUsage(badge: SystemBadgeRecord): SystemBadgeRecord {
    return { ...badge, usageCount: this.systemUsage.get(badge.id) ?? 0 };
  }

  private withBarUsage(badge: BarBadgeRecord): BarBadgeRecord {
    return { ...badge, usageCount: this.barUsage.get(barBadgeKey(badge.barId, badge.id)) ?? 0 };
  }

  private readColorUsage(id: string): number {
    const assigned = this.colorUsage.get(id);
    if (assigned !== undefined) return assigned;
    const systemCount = [...this.systemBadges.values()].filter((badge) => badge.colorId === id).length;
    const barCount = [...this.barBadges.values()].filter((badge) => badge.colorId === id).length;
    return systemCount + barCount;
  }
}

function assertNoDuplicate(records: Array<{ normalizedName: string }>, normalizedName: string, code: string): void {
  if (records.some((record) => record.normalizedName === normalizedName)) {
    throw new Error(code);
  }
}

function visibilityKey(barId: string, systemBadgeId: string): string {
  return `${barId}:${systemBadgeId}`;
}

function barBadgeKey(barId: string, id: string): string {
  return `${barId}:${id}`;
}
