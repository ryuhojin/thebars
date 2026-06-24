export type BadgeColorRecord = {
  id: string;
  name: string;
  normalizedName: string;
  backgroundHex: string;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BadgeColorInput = {
  id: string;
  name: string;
  normalizedName: string;
  backgroundHex: string;
  isActive: boolean;
  now: string;
};

export type SystemBadgeRecord = {
  id: string;
  name: string;
  normalizedName: string;
  colorId: string;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SystemBadgeInput = {
  id: string;
  name: string;
  normalizedName: string;
  colorId: string;
  isActive: boolean;
  now: string;
};

export type BarBadgeVisibilityRecord = {
  barId: string;
  systemBadgeId: string;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BarBadgeVisibilityInput = {
  barId: string;
  systemBadgeId: string;
  isHidden: boolean;
  now: string;
};

export type BarBadgeRecord = SystemBadgeRecord & {
  barId: string;
};

export type BarBadgeInput = SystemBadgeInput & {
  barId: string;
};

export interface BadgeRepository {
  listColors(): Promise<BadgeColorRecord[]>;
  findColorById(id: string): Promise<BadgeColorRecord | null>;
  createColor(input: BadgeColorInput): Promise<BadgeColorRecord>;
  updateColor(id: string, input: Omit<BadgeColorInput, "id">): Promise<BadgeColorRecord | null>;
  countColorUsage(id: string): Promise<number>;
  replaceBadgeColorUsage(colorId: string, replacementColorId: string, now: string): Promise<void>;

  listSystemBadges(): Promise<SystemBadgeRecord[]>;
  findSystemBadgeById(id: string): Promise<SystemBadgeRecord | null>;
  createSystemBadge(input: SystemBadgeInput): Promise<SystemBadgeRecord>;
  updateSystemBadge(id: string, input: Omit<SystemBadgeInput, "id">): Promise<SystemBadgeRecord | null>;
  countSystemBadgeUsage(id: string): Promise<number>;
  removeSystemBadgeAssignments(id: string): Promise<void>;

  listBarBadgeVisibility(barId: string): Promise<BarBadgeVisibilityRecord[]>;
  upsertBarBadgeVisibility(input: BarBadgeVisibilityInput): Promise<BarBadgeVisibilityRecord>;

  listBarBadges(barId: string): Promise<BarBadgeRecord[]>;
  findBarBadgeById(barId: string, id: string): Promise<BarBadgeRecord | null>;
  createBarBadge(input: BarBadgeInput): Promise<BarBadgeRecord>;
  updateBarBadge(barId: string, id: string, input: Omit<BarBadgeInput, "id" | "barId">): Promise<BarBadgeRecord | null>;
  deleteBarBadge(barId: string, id: string): Promise<boolean>;
  countBarBadgeUsage(barId: string, id: string): Promise<number>;
  removeBarBadgeAssignments(barId: string, id: string): Promise<void>;
}

const seedTime = "2026-06-23T00:00:00.000Z";

export const defaultBadgeColors: BadgeColorRecord[] = [
  {
    id: "badge-color-warm-brown",
    name: "Warm Brown",
    normalizedName: "warm brown",
    backgroundHex: "#725A3D",
    isActive: true,
    usageCount: 0,
    createdAt: seedTime,
    updatedAt: seedTime
  },
  {
    id: "badge-color-deep-slate",
    name: "Deep Slate",
    normalizedName: "deep slate",
    backgroundHex: "#33475B",
    isActive: true,
    usageCount: 0,
    createdAt: seedTime,
    updatedAt: seedTime
  },
  {
    id: "badge-color-muted-plum",
    name: "Muted Plum",
    normalizedName: "muted plum",
    backgroundHex: "#5E3B56",
    isActive: true,
    usageCount: 0,
    createdAt: seedTime,
    updatedAt: seedTime
  },
  {
    id: "badge-color-forest",
    name: "Forest",
    normalizedName: "forest",
    backgroundHex: "#355B47",
    isActive: true,
    usageCount: 0,
    createdAt: seedTime,
    updatedAt: seedTime
  }
];

export const defaultSystemBadges: SystemBadgeRecord[] = [
  {
    id: "system-badge-recommended",
    name: "추천",
    normalizedName: "추천",
    colorId: "badge-color-warm-brown",
    isActive: true,
    usageCount: 0,
    createdAt: seedTime,
    updatedAt: seedTime
  },
  {
    id: "system-badge-signature",
    name: "시그니처",
    normalizedName: "시그니처",
    colorId: "badge-color-deep-slate",
    isActive: true,
    usageCount: 0,
    createdAt: seedTime,
    updatedAt: seedTime
  },
  {
    id: "system-badge-new",
    name: "신메뉴",
    normalizedName: "신메뉴",
    colorId: "badge-color-muted-plum",
    isActive: true,
    usageCount: 0,
    createdAt: seedTime,
    updatedAt: seedTime
  }
];
