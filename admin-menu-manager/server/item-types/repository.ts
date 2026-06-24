import type { ItemTemplate } from "../../contracts/itemTypes";

export type ItemTypeRecord = {
  id: string;
  name: string;
  normalizedName: string;
  template: ItemTemplate;
  defaultPriceLabels: string[];
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BarItemTypeRecord = ItemTypeRecord & {
  barId: string;
};

export type BarItemTypeOverrideRecord = {
  barId: string;
  systemItemTypeId: string;
  isHidden: boolean;
  defaultPriceLabels: string[];
  createdAt: string;
  updatedAt: string;
};

export type GrapeVarietyRecord = {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: string;
};

export type GrapeVarietyCandidateStatus = "pending" | "approved" | "rejected";

export type GrapeVarietyCandidateRecord = {
  id: string;
  barId: string | null;
  proposedName: string;
  normalizedProposedName: string;
  status: GrapeVarietyCandidateStatus;
  standardName: string | null;
  submittedByUserId: string;
  reviewedByUserId: string | null;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type ItemTypeInput = {
  id: string;
  name: string;
  normalizedName: string;
  template: ItemTemplate;
  defaultPriceLabels: string[];
  isActive: boolean;
  now: string;
};

export type BarItemTypeInput = ItemTypeInput & {
  barId: string;
};

export type BarItemTypeOverrideInput = {
  barId: string;
  systemItemTypeId: string;
  isHidden: boolean;
  defaultPriceLabels: string[];
  now: string;
};

export type GrapeCandidateInput = {
  id: string;
  barId: string;
  proposedName: string;
  normalizedProposedName: string;
  submittedByUserId: string;
  now: string;
};

export type ApproveGrapeCandidateInput = {
  candidateId: string;
  varietyId: string;
  standardName: string;
  normalizedName: string;
  reviewedByUserId: string;
  now: string;
};

export type RejectGrapeCandidateInput = {
  candidateId: string;
  reviewedByUserId: string;
  reason: string;
  now: string;
};

export interface ItemTypeRepository {
  listSystemItemTypes(): Promise<ItemTypeRecord[]>;
  findSystemItemTypeById(id: string): Promise<ItemTypeRecord | null>;
  createSystemItemType(input: ItemTypeInput): Promise<ItemTypeRecord>;
  updateSystemItemType(id: string, input: Omit<ItemTypeInput, "id">): Promise<ItemTypeRecord | null>;
  deleteSystemItemType(id: string): Promise<boolean>;
  countSystemItemTypeUsage(id: string): Promise<number>;

  listBarItemTypes(barId: string): Promise<BarItemTypeRecord[]>;
  findBarItemTypeById(barId: string, id: string): Promise<BarItemTypeRecord | null>;
  createBarItemType(input: BarItemTypeInput): Promise<BarItemTypeRecord>;
  updateBarItemType(barId: string, id: string, input: Omit<BarItemTypeInput, "id" | "barId">): Promise<BarItemTypeRecord | null>;
  deleteBarItemType(barId: string, id: string): Promise<boolean>;
  countBarItemTypeUsage(barId: string, id: string): Promise<number>;

  listBarItemTypeOverrides(barId: string): Promise<BarItemTypeOverrideRecord[]>;
  upsertBarItemTypeOverride(input: BarItemTypeOverrideInput): Promise<BarItemTypeOverrideRecord>;

  listGrapeVarieties(): Promise<GrapeVarietyRecord[]>;
  findGrapeVarietyByNormalizedName(normalizedName: string): Promise<GrapeVarietyRecord | null>;
  listGrapeCandidates(): Promise<GrapeVarietyCandidateRecord[]>;
  findGrapeCandidateById(id: string): Promise<GrapeVarietyCandidateRecord | null>;
  findPendingGrapeCandidateByNormalizedName(normalizedName: string): Promise<GrapeVarietyCandidateRecord | null>;
  createGrapeCandidate(input: GrapeCandidateInput): Promise<GrapeVarietyCandidateRecord>;
  approveGrapeCandidate(input: ApproveGrapeCandidateInput): Promise<{
    candidate: GrapeVarietyCandidateRecord;
    variety: GrapeVarietyRecord;
  }>;
  rejectGrapeCandidate(input: RejectGrapeCandidateInput): Promise<GrapeVarietyCandidateRecord | null>;
}

export const itemTemplateOptions: Array<{ value: ItemTemplate; label: string; fields: string[] }> = [
  { value: "general", label: "일반", fields: [] },
  { value: "wine", label: "와인", fields: ["생산자", "국가", "지역/아펠라시옹", "포도 품종", "빈티지"] },
  { value: "whisky", label: "위스키", fields: ["브랜드/증류소", "국가", "지역", "분류", "숙성/NAS"] },
  { value: "spirit", label: "일반 증류주", fields: ["브랜드/생산자", "국가", "지역/원산지", "세부 유형"] },
  { value: "beer", label: "맥주", fields: ["브루어리", "국가", "스타일", "IBU"] },
  { value: "cocktail", label: "칵테일", fields: ["베이스 주종", "주요 재료", "맛/스타일", "제조 방식"] },
  { value: "food", label: "푸드·디저트", fields: ["주요 재료", "알레르기", "맵기", "식이 표시"] },
  { value: "cigar", label: "시가", fields: ["브랜드", "라인", "원산지", "비톨라", "강도"] }
];

export const defaultSystemItemTypes: ItemTypeRecord[] = [
  {
    id: "system-type-general",
    name: "일반",
    normalizedName: "일반",
    template: "general",
    defaultPriceLabels: [],
    isActive: true,
    usageCount: 0,
    createdAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z"
  },
  {
    id: "system-type-wine",
    name: "와인",
    normalizedName: "와인",
    template: "wine",
    defaultPriceLabels: ["글라스", "보틀"],
    isActive: true,
    usageCount: 0,
    createdAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z"
  },
  {
    id: "system-type-whisky",
    name: "위스키",
    normalizedName: "위스키",
    template: "whisky",
    defaultPriceLabels: ["샷", "보틀"],
    isActive: true,
    usageCount: 0,
    createdAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z"
  },
  {
    id: "system-type-cocktail",
    name: "칵테일",
    normalizedName: "칵테일",
    template: "cocktail",
    defaultPriceLabels: ["잔"],
    isActive: true,
    usageCount: 0,
    createdAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z"
  },
  {
    id: "system-type-cigar",
    name: "시가",
    normalizedName: "시가",
    template: "cigar",
    defaultPriceLabels: [],
    isActive: true,
    usageCount: 0,
    createdAt: "2026-06-23T00:00:00.000Z",
    updatedAt: "2026-06-23T00:00:00.000Z"
  }
];
