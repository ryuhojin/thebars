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
import { defaultSystemItemTypes } from "./repository";

export class MemoryItemTypeRepository implements ItemTypeRepository {
  private readonly systemTypes = new Map<string, ItemTypeRecord>();
  private readonly barTypes = new Map<string, BarItemTypeRecord>();
  private readonly overrides = new Map<string, BarItemTypeOverrideRecord>();
  private readonly varieties = new Map<string, GrapeVarietyRecord>();
  private readonly candidates = new Map<string, GrapeVarietyCandidateRecord>();
  private readonly systemUsage = new Map<string, number>();
  private readonly barUsage = new Map<string, number>();

  constructor() {
    this.reset();
  }

  reset() {
    this.systemTypes.clear();
    this.barTypes.clear();
    this.overrides.clear();
    this.varieties.clear();
    this.candidates.clear();
    this.systemUsage.clear();
    this.barUsage.clear();
    defaultSystemItemTypes.forEach((type) => this.systemTypes.set(type.id, { ...type, defaultPriceLabels: [...type.defaultPriceLabels] }));
  }

  setSystemUsageForTest(id: string, usageCount: number) {
    this.systemUsage.set(id, usageCount);
  }

  setBarUsageForTest(barId: string, id: string, usageCount: number) {
    this.barUsage.set(`${barId}:${id}`, usageCount);
  }

  replaceMenuItemTypeUsage(systemUsage: Map<string, number>, barUsage: Map<string, number>) {
    this.systemUsage.clear();
    this.barUsage.clear();
    for (const [id, count] of systemUsage) this.systemUsage.set(id, count);
    for (const [key, count] of barUsage) this.barUsage.set(key, count);
  }

  async listSystemItemTypes(): Promise<ItemTypeRecord[]> {
    return [...this.systemTypes.values()]
      .sort((left, right) => left.name.localeCompare(right.name, "ko"))
      .map((type) => ({ ...type, defaultPriceLabels: [...type.defaultPriceLabels], usageCount: this.systemUsage.get(type.id) ?? 0 }));
  }

  async findSystemItemTypeById(id: string): Promise<ItemTypeRecord | null> {
    const type = this.systemTypes.get(id);
    return type ? { ...type, defaultPriceLabels: [...type.defaultPriceLabels], usageCount: this.systemUsage.get(id) ?? 0 } : null;
  }

  async createSystemItemType(input: ItemTypeInput): Promise<ItemTypeRecord> {
    assertNoDuplicate([...this.systemTypes.values()], input.normalizedName);
    const record: ItemTypeRecord = { ...input, createdAt: input.now, updatedAt: input.now, usageCount: 0 };
    this.systemTypes.set(record.id, record);
    return { ...record, defaultPriceLabels: [...record.defaultPriceLabels] };
  }

  async updateSystemItemType(id: string, input: Omit<ItemTypeInput, "id">): Promise<ItemTypeRecord | null> {
    const current = this.systemTypes.get(id);
    if (!current) return null;
    assertNoDuplicate([...this.systemTypes.values()].filter((type) => type.id !== id), input.normalizedName);
    const record: ItemTypeRecord = {
      ...current,
      name: input.name,
      normalizedName: input.normalizedName,
      template: input.template,
      defaultPriceLabels: [...input.defaultPriceLabels],
      isActive: input.isActive,
      updatedAt: input.now,
      usageCount: this.systemUsage.get(id) ?? 0
    };
    this.systemTypes.set(id, record);
    return { ...record, defaultPriceLabels: [...record.defaultPriceLabels] };
  }

  async deleteSystemItemType(id: string): Promise<boolean> {
    return this.systemTypes.delete(id);
  }

  async countSystemItemTypeUsage(id: string): Promise<number> {
    return this.systemUsage.get(id) ?? 0;
  }

  async listBarItemTypes(barId: string): Promise<BarItemTypeRecord[]> {
    return [...this.barTypes.values()]
      .filter((type) => type.barId === barId)
      .sort((left, right) => left.name.localeCompare(right.name, "ko"))
      .map((type) => ({
        ...type,
        defaultPriceLabels: [...type.defaultPriceLabels],
        usageCount: this.barUsage.get(`${barId}:${type.id}`) ?? 0
      }));
  }

  async findBarItemTypeById(barId: string, id: string): Promise<BarItemTypeRecord | null> {
    const type = this.barTypes.get(id);
    if (!type || type.barId !== barId) return null;
    return { ...type, defaultPriceLabels: [...type.defaultPriceLabels], usageCount: this.barUsage.get(`${barId}:${id}`) ?? 0 };
  }

  async createBarItemType(input: BarItemTypeInput): Promise<BarItemTypeRecord> {
    assertNoDuplicate(
      [...this.barTypes.values()].filter((type) => type.barId === input.barId),
      input.normalizedName
    );
    const record: BarItemTypeRecord = { ...input, createdAt: input.now, updatedAt: input.now, usageCount: 0 };
    this.barTypes.set(record.id, record);
    return { ...record, defaultPriceLabels: [...record.defaultPriceLabels] };
  }

  async updateBarItemType(
    barId: string,
    id: string,
    input: Omit<BarItemTypeInput, "id" | "barId">
  ): Promise<BarItemTypeRecord | null> {
    const current = this.barTypes.get(id);
    if (!current || current.barId !== barId) return null;
    assertNoDuplicate(
      [...this.barTypes.values()].filter((type) => type.barId === barId && type.id !== id),
      input.normalizedName
    );
    const record: BarItemTypeRecord = {
      ...current,
      name: input.name,
      normalizedName: input.normalizedName,
      template: input.template,
      defaultPriceLabels: [...input.defaultPriceLabels],
      isActive: input.isActive,
      updatedAt: input.now,
      usageCount: this.barUsage.get(`${barId}:${id}`) ?? 0
    };
    this.barTypes.set(id, record);
    return { ...record, defaultPriceLabels: [...record.defaultPriceLabels] };
  }

  async deleteBarItemType(barId: string, id: string): Promise<boolean> {
    const current = this.barTypes.get(id);
    if (!current || current.barId !== barId) return false;
    return this.barTypes.delete(id);
  }

  async countBarItemTypeUsage(barId: string, id: string): Promise<number> {
    return this.barUsage.get(`${barId}:${id}`) ?? 0;
  }

  async listBarItemTypeOverrides(barId: string): Promise<BarItemTypeOverrideRecord[]> {
    return [...this.overrides.values()]
      .filter((override) => override.barId === barId)
      .map((override) => ({ ...override, defaultPriceLabels: [...override.defaultPriceLabels] }));
  }

  async upsertBarItemTypeOverride(input: BarItemTypeOverrideInput): Promise<BarItemTypeOverrideRecord> {
    const key = `${input.barId}:${input.systemItemTypeId}`;
    const existing = this.overrides.get(key);
    const record: BarItemTypeOverrideRecord = {
      barId: input.barId,
      systemItemTypeId: input.systemItemTypeId,
      isHidden: input.isHidden,
      defaultPriceLabels: [...input.defaultPriceLabels],
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now
    };
    this.overrides.set(key, record);
    return { ...record, defaultPriceLabels: [...record.defaultPriceLabels] };
  }

  async listGrapeVarieties(): Promise<GrapeVarietyRecord[]> {
    return [...this.varieties.values()].sort((left, right) => left.name.localeCompare(right.name, "ko")).map((item) => ({ ...item }));
  }

  async findGrapeVarietyByNormalizedName(normalizedName: string): Promise<GrapeVarietyRecord | null> {
    const variety = [...this.varieties.values()].find((item) => item.normalizedName === normalizedName);
    return variety ? { ...variety } : null;
  }

  async listGrapeCandidates(): Promise<GrapeVarietyCandidateRecord[]> {
    return [...this.candidates.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((candidate) => ({ ...candidate }));
  }

  async findGrapeCandidateById(id: string): Promise<GrapeVarietyCandidateRecord | null> {
    const candidate = this.candidates.get(id);
    return candidate ? { ...candidate } : null;
  }

  async findPendingGrapeCandidateByNormalizedName(normalizedName: string): Promise<GrapeVarietyCandidateRecord | null> {
    const candidate = [...this.candidates.values()].find(
      (item) => item.normalizedProposedName === normalizedName && item.status === "pending"
    );
    return candidate ? { ...candidate } : null;
  }

  async createGrapeCandidate(input: GrapeCandidateInput): Promise<GrapeVarietyCandidateRecord> {
    const record: GrapeVarietyCandidateRecord = {
      id: input.id,
      barId: input.barId,
      proposedName: input.proposedName,
      normalizedProposedName: input.normalizedProposedName,
      status: "pending",
      standardName: null,
      submittedByUserId: input.submittedByUserId,
      reviewedByUserId: null,
      rejectionReason: null,
      createdAt: input.now,
      reviewedAt: null
    };
    this.candidates.set(record.id, record);
    return { ...record };
  }

  async approveGrapeCandidate(input: ApproveGrapeCandidateInput): Promise<{
    candidate: GrapeVarietyCandidateRecord;
    variety: GrapeVarietyRecord;
  }> {
    assertNoDuplicate([...this.varieties.values()], input.normalizedName);
    const candidate = this.candidates.get(input.candidateId);
    if (!candidate || candidate.status !== "pending") throw new Error("GRAPE_CANDIDATE_NOT_PENDING");
    const variety: GrapeVarietyRecord = {
      id: input.varietyId,
      name: input.standardName,
      normalizedName: input.normalizedName,
      createdAt: input.now
    };
    const updatedCandidate: GrapeVarietyCandidateRecord = {
      ...candidate,
      status: "approved",
      standardName: input.standardName,
      reviewedByUserId: input.reviewedByUserId,
      reviewedAt: input.now
    };
    this.varieties.set(variety.id, variety);
    this.candidates.set(candidate.id, updatedCandidate);
    return { candidate: { ...updatedCandidate }, variety: { ...variety } };
  }

  async rejectGrapeCandidate(input: RejectGrapeCandidateInput): Promise<GrapeVarietyCandidateRecord | null> {
    const candidate = this.candidates.get(input.candidateId);
    if (!candidate || candidate.status !== "pending") return null;
    const updated: GrapeVarietyCandidateRecord = {
      ...candidate,
      status: "rejected",
      reviewedByUserId: input.reviewedByUserId,
      rejectionReason: input.reason,
      reviewedAt: input.now
    };
    this.candidates.set(candidate.id, updated);
    return { ...updated };
  }
}

function assertNoDuplicate(records: Array<{ normalizedName: string }>, normalizedName: string): void {
  if (records.some((record) => record.normalizedName === normalizedName)) {
    throw new Error("ITEM_TYPE_NAME_EXISTS");
  }
}
