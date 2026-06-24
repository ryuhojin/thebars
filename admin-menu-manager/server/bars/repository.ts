export type BarStatus = "active" | "inactive";
export type PublicMenuStatus = "preparing" | "published";
export type BarLifecycleAction = "deactivate" | "activate";

export type BarRecord = {
  id: string;
  name: string;
  slug: string;
  encodedSlug: string;
  status: BarStatus;
  currency: string;
  description: string;
  address: string;
  mapUrl: string;
  phoneNumberDigits: string;
  openingNote: string;
  settingsDraftHash: string;
  publicMenuStatus: PublicMenuStatus;
  directPublishEnabled: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BarStatusSummary = {
  totalBars: number;
  activeBars: number;
  inactiveBars: number;
};

export type CreateBarRecordInput = {
  id: string;
  name: string;
  slug: string;
  encodedSlug: string;
  currency: string;
  settingsDraftHash: string;
  createdByUserId: string;
  now: string;
};

export type BarBusinessHourRecord = {
  id: string;
  barId: string;
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type BarLinkRecord = {
  id: string;
  barId: string;
  label: string;
  url: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type UpdateBarSettingsRecordInput = {
  barId: string;
  name: string;
  description: string;
  address: string;
  mapUrl: string;
  phoneNumberDigits: string;
  openingNote: string;
  currency: string;
  settingsDraftHash: string;
  businessHours: Array<{
    id: string;
    dayOfWeek: number;
    opensAt: string;
    closesAt: string;
    sortOrder: number;
  }>;
  links: Array<{
    id: string;
    label: string;
    url: string;
    sortOrder: number;
  }>;
  now: string;
};

export type BarSettingsRecord = {
  bar: BarRecord;
  businessHours: BarBusinessHourRecord[];
  links: BarLinkRecord[];
};

export type BarLifecycleEventRecord = {
  id: string;
  barId: string;
  action: BarLifecycleAction;
  beforeStatus: BarStatus;
  afterStatus: BarStatus;
  publicationId: string | null;
  result: string;
  actorUserId: string | null;
  createdAt: string;
};

export type CreateBarLifecycleEventInput = {
  id: string;
  barId: string;
  action: BarLifecycleAction;
  beforeStatus: BarStatus;
  afterStatus: BarStatus;
  publicationId: string | null;
  result: string;
  actorUserId: string;
  createdAt: string;
};

export interface BarRepository {
  listBars(): Promise<BarRecord[]>;
  findBarById(barId: string): Promise<BarRecord | null>;
  findBarBySlug(slug: string): Promise<BarRecord | null>;
  readBarSettings(barId: string): Promise<BarSettingsRecord | null>;
  readBarStatusSummary(): Promise<BarStatusSummary>;
  createBar(input: CreateBarRecordInput): Promise<BarRecord>;
  updateBarSettings(input: UpdateBarSettingsRecordInput): Promise<BarSettingsRecord | null>;
  updatePublicMenuStatus(barId: string, status: PublicMenuStatus, now: string): Promise<BarRecord | null>;
  updateBarStatus(barId: string, status: BarStatus, publicMenuStatus: PublicMenuStatus, now: string): Promise<BarRecord | null>;
  createLifecycleEvent(input: CreateBarLifecycleEventInput): Promise<BarLifecycleEventRecord>;
  listLifecycleEvents(barId: string, limit: number): Promise<BarLifecycleEventRecord[]>;
}
