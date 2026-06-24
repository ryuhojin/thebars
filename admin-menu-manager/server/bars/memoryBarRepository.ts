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

export class MemoryBarRepository implements BarRepository {
  private readonly bars = new Map<string, BarRecord>();
  private readonly businessHours = new Map<string, BarBusinessHourRecord[]>();
  private readonly links = new Map<string, BarLinkRecord[]>();
  private readonly lifecycleEvents = new Map<string, BarLifecycleEventRecord>();

  reset() {
    this.bars.clear();
    this.businessHours.clear();
    this.links.clear();
    this.lifecycleEvents.clear();
  }

  async listBars(): Promise<BarRecord[]> {
    return [...this.bars.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((bar) => ({ ...bar }));
  }

  async findBarById(barId: string): Promise<BarRecord | null> {
    const bar = this.bars.get(barId);
    return bar ? { ...bar } : null;
  }

  async findBarBySlug(slug: string): Promise<BarRecord | null> {
    const bar = [...this.bars.values()].find((item) => item.slug === slug);
    return bar ? { ...bar } : null;
  }

  async readBarSettings(barId: string): Promise<BarSettingsRecord | null> {
    const bar = await this.findBarById(barId);
    if (!bar) return null;
    return {
      bar,
      businessHours: (this.businessHours.get(barId) ?? []).map((record) => ({ ...record })),
      links: (this.links.get(barId) ?? []).map((record) => ({ ...record }))
    };
  }

  async readBarStatusSummary(): Promise<BarStatusSummary> {
    const bars = [...this.bars.values()];
    return {
      totalBars: bars.length,
      activeBars: bars.filter((bar) => bar.status === "active").length,
      inactiveBars: bars.filter((bar) => bar.status === "inactive").length
    };
  }

  async createBar(input: CreateBarRecordInput): Promise<BarRecord> {
    if ([...this.bars.values()].some((bar) => bar.slug === input.slug || bar.encodedSlug === input.encodedSlug)) {
      throw new Error("BAR_UNIQUE_CONSTRAINT");
    }
    const bar: BarRecord = {
      id: input.id,
      name: input.name,
      slug: input.slug,
      encodedSlug: input.encodedSlug,
      status: "active",
      currency: input.currency,
      description: "",
      address: "",
      mapUrl: "",
      phoneNumberDigits: "",
      openingNote: "",
      settingsDraftHash: input.settingsDraftHash,
      publicMenuStatus: "preparing",
      directPublishEnabled: false,
      createdByUserId: input.createdByUserId,
      createdAt: input.now,
      updatedAt: input.now
    };
    this.bars.set(bar.id, bar);
    return { ...bar };
  }

  async updateBarSettings(input: UpdateBarSettingsRecordInput): Promise<BarSettingsRecord | null> {
    const current = this.bars.get(input.barId);
    if (!current) return null;
    const updated: BarRecord = {
      ...current,
      name: input.name,
      description: input.description,
      address: input.address,
      mapUrl: input.mapUrl,
      phoneNumberDigits: input.phoneNumberDigits,
      openingNote: input.openingNote,
      currency: input.currency,
      settingsDraftHash: input.settingsDraftHash,
      updatedAt: input.now
    };
    this.bars.set(input.barId, updated);
    this.businessHours.set(
      input.barId,
      input.businessHours.map((range) => ({
        ...range,
        barId: input.barId,
        createdAt: input.now,
        updatedAt: input.now
      }))
    );
    this.links.set(
      input.barId,
      input.links.map((link) => ({
        ...link,
        barId: input.barId,
        createdAt: input.now,
        updatedAt: input.now
      }))
    );
    return this.readBarSettings(input.barId);
  }

  async updatePublicMenuStatus(barId: string, status: BarRecord["publicMenuStatus"], now: string): Promise<BarRecord | null> {
    const current = this.bars.get(barId);
    if (!current) return null;
    const updated = { ...current, publicMenuStatus: status, updatedAt: now };
    this.bars.set(barId, updated);
    return { ...updated };
  }

  async updateBarStatus(
    barId: string,
    status: BarRecord["status"],
    publicMenuStatus: BarRecord["publicMenuStatus"],
    now: string
  ): Promise<BarRecord | null> {
    const current = this.bars.get(barId);
    if (!current) return null;
    const updated = { ...current, status, publicMenuStatus, updatedAt: now };
    this.bars.set(barId, updated);
    return { ...updated };
  }

  async createLifecycleEvent(input: CreateBarLifecycleEventInput): Promise<BarLifecycleEventRecord> {
    const event: BarLifecycleEventRecord = { ...input };
    this.lifecycleEvents.set(event.id, event);
    return { ...event };
  }

  async listLifecycleEvents(barId: string, limit: number): Promise<BarLifecycleEventRecord[]> {
    return [...this.lifecycleEvents.values()]
      .filter((event) => event.barId === barId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
      .slice(0, limit)
      .map((event) => ({ ...event }));
  }
}
