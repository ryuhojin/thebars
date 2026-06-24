import type { BarDetail, BarListResponse, BarSummary, CreateBarRequest } from "../../contracts/bars";
import { barDetailSchema, barListResponseSchema, barSummarySchema } from "../../contracts/bars";
import type { BarSettingsResponse, UpdateBarSettingsRequest } from "../../contracts/barSettings";
import { barSettingsResponseSchema } from "../../contracts/barSettings";
import { nowIso, sha256Hex } from "../auth/crypto";
import { AuthServiceError } from "../auth/errors";
import type { AuthUserRecord } from "../auth/repository";
import type { MembershipRepository, RolePermissionRecord } from "../memberships/repository";
import type {
  BarLifecycleEventRecord,
  BarRecord,
  BarRepository,
  BarSettingsRecord,
  UpdateBarSettingsRecordInput
} from "./repository";
import { createRandomBarSlug, encodeBarSlug, type BarSlugGenerator } from "./slug";

const MAX_SLUG_ATTEMPTS = 8;

export type BarServiceOptions = {
  now?: () => Date;
  slugGenerator?: BarSlugGenerator;
  membershipRepository?: MembershipRepository;
};

export class BarService {
  private readonly now: () => Date;
  private readonly slugGenerator: BarSlugGenerator;

  constructor(
    private readonly repository: BarRepository,
    options: BarServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.slugGenerator = options.slugGenerator ?? createRandomBarSlug;
    this.membershipRepository = options.membershipRepository;
  }

  private readonly membershipRepository?: MembershipRepository;

  async listBars(actor: AuthUserRecord): Promise<BarListResponse> {
    assertSystemAdmin(actor);
    const [items, summary] = await Promise.all([this.repository.listBars(), this.repository.readBarStatusSummary()]);
    return barListResponseSchema.parse({
      items: items.map(toBarSummary),
      summary
    });
  }

  async readBar(actor: AuthUserRecord, barId: string): Promise<BarDetail> {
    await this.assertCanReadBar(actor, barId);
    const bar = await this.repository.findBarById(barId);
    if (!bar) throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    const lifecycleEvents = await this.repository.listLifecycleEvents(barId, 5);
    return toBarDetail(bar, { canChangeStatus: actor.isSystemAdmin, lifecycleEvents });
  }

  async createBar(actor: AuthUserRecord, input: CreateBarRequest): Promise<BarDetail> {
    assertSystemAdmin(actor);
    const now = this.now().toISOString();

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const slug = this.slugGenerator();
      const existing = await this.repository.findBarBySlug(slug);
      if (existing) continue;

      try {
        const bar = await this.repository.createBar({
          id: crypto.randomUUID(),
          name: input.name,
          slug,
          encodedSlug: encodeBarSlug(slug),
          currency: input.currency,
          settingsDraftHash: await createSettingsDraftHash({
            name: input.name,
            description: "",
            address: "",
            mapUrl: "",
            phoneNumberDigits: "",
            openingNote: "",
            currency: input.currency,
            businessHours: [],
            links: []
          }),
          createdByUserId: actor.id,
          now
        });
        return toBarDetail(bar, { canChangeStatus: actor.isSystemAdmin, lifecycleEvents: [] });
      } catch (error) {
        if (error instanceof Error && error.message === "BAR_UNIQUE_CONSTRAINT") continue;
        throw error;
      }
    }

    throw new AuthServiceError(409, "BAR_SLUG_COLLISION", "바 식별자를 생성하지 못했습니다. 다시 시도하세요.");
  }

  async readSettings(actor: AuthUserRecord, barId: string): Promise<BarSettingsResponse> {
    await this.assertCanReadBar(actor, barId);
    const settings = await this.repository.readBarSettings(barId);
    if (!settings) throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    return toBarSettingsResponse(settings);
  }

  async updateSettings(
    actor: AuthUserRecord,
    barId: string,
    input: UpdateBarSettingsRequest
  ): Promise<BarSettingsResponse> {
    const current = await this.requireEditableSettings(actor, barId);
    if (current.bar.currency !== input.currency && !actor.isSystemAdmin) {
      throw new AuthServiceError(403, "CURRENCY_SYSTEM_ADMIN_REQUIRED", "통화 변경은 시스템 관리자만 수행할 수 있습니다.");
    }
    const now = nowIso(this.now());
    const updateInput: UpdateBarSettingsRecordInput = {
      barId,
      name: input.name,
      description: input.description,
      address: input.address,
      mapUrl: input.mapUrl,
      phoneNumberDigits: input.phoneNumberDigits,
      openingNote: input.openingNote,
      currency: input.currency,
      settingsDraftHash: await createSettingsDraftHash(input),
      businessHours: input.businessHours.map((range, index) => ({
        id: range.id ?? crypto.randomUUID(),
        dayOfWeek: range.dayOfWeek,
        opensAt: range.opensAt,
        closesAt: range.closesAt,
        sortOrder: index
      })),
      links: input.links.map((link, index) => ({
        id: link.id ?? crypto.randomUUID(),
        label: link.label,
        url: link.url,
        sortOrder: index
      })),
      now
    };
    const updated = await this.repository.updateBarSettings(updateInput);
    if (!updated) throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    return toBarSettingsResponse(updated);
  }

  private async assertCanReadBar(actor: AuthUserRecord, barId: string): Promise<void> {
    if (actor.isSystemAdmin) return;
    if (!this.membershipRepository) {
      throw new AuthServiceError(403, "SYSTEM_ADMIN_REQUIRED", "시스템 관리자만 사용할 수 있습니다.");
    }
    const membership = await this.membershipRepository.findActiveMembershipForUser(barId, actor.id);
    if (!membership) {
      throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    }
  }

  private async requireEditableSettings(actor: AuthUserRecord, barId: string): Promise<BarSettingsRecord> {
    const settings = await this.repository.readBarSettings(barId);
    if (!settings) throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    if (actor.isSystemAdmin) return settings;
    const rolePermission = await this.readActorRolePermission(actor, barId);
    if (!rolePermission.canEditMenu) {
      throw new AuthServiceError(403, "BAR_PERMISSION_REQUIRED", "이 바에서 필요한 권한이 없습니다.");
    }
    return settings;
  }

  private async readActorRolePermission(actor: AuthUserRecord, barId: string): Promise<RolePermissionRecord> {
    if (!this.membershipRepository) {
      throw new AuthServiceError(403, "SYSTEM_ADMIN_REQUIRED", "시스템 관리자만 사용할 수 있습니다.");
    }
    const membership = await this.membershipRepository.findActiveMembershipForUser(barId, actor.id);
    if (!membership) {
      throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    }
    const rolePermissions = await this.membershipRepository.ensureDefaultRolePermissions(barId, nowIso(this.now()));
    const rolePermission = rolePermissions.find((permission) => permission.role === membership.role);
    if (!rolePermission) {
      throw new AuthServiceError(409, "ROLE_PERMISSION_MISSING", "역할 권한 설정이 없습니다.");
    }
    return rolePermission;
  }
}

function assertSystemAdmin(actor: AuthUserRecord): void {
  if (!actor.isSystemAdmin) {
    throw new AuthServiceError(403, "SYSTEM_ADMIN_REQUIRED", "시스템 관리자만 사용할 수 있습니다.");
  }
}

export function toBarSummary(bar: BarRecord): BarSummary {
  return barSummarySchema.parse({
    id: bar.id,
    name: bar.name,
    slug: bar.slug,
    encodedSlug: bar.encodedSlug,
    customerPath: `/${bar.encodedSlug}`,
    status: bar.status,
    currency: bar.currency,
    publicMenuStatus: bar.publicMenuStatus,
    directPublishEnabled: bar.directPublishEnabled,
    createdAt: bar.createdAt,
    updatedAt: bar.updatedAt
  });
}

export function toBarDetail(
  bar: BarRecord,
  options: { canChangeStatus?: boolean; lifecycleEvents?: BarLifecycleEventRecord[] } = {}
): BarDetail {
  const summary = toBarSummary(bar);
  return barDetailSchema.parse({
    ...summary,
    overviewCards: [
      {
        id: "public-menu",
        label: "공개 메뉴",
        value: "0",
        description: "메뉴와 공개 데이터가 연결되면 실제 메뉴 수를 표시합니다.",
        status: "unavailable",
        href: `/bars/${bar.id}/menus`,
        unavailableReason: "표시할 메뉴 데이터 없음"
      },
      {
        id: "open-orders",
        label: "열린 주문",
        value: "-",
        description: "주문 운영이 시작되면 열린 주문과 계산 요청을 표시합니다.",
        status: "unavailable",
        href: `/bars/${bar.id}/orders`,
        unavailableReason: "열린 주문 없음"
      },
      {
        id: "publication",
        label: "현재 공개 상태",
        value: bar.publicMenuStatus === "published" ? "공개 중" : "준비 중",
        description: "첫 발행 전 고객 메뉴판은 준비 중 상태입니다.",
        status: "available",
        href: `/bars/${bar.id}/publications`
      },
      {
        id: "unpublished",
        label: "미발행 변경",
        value: "없음",
        description: "공개 정보와 메뉴 변경을 발행 기준으로 추적합니다.",
        status: "unavailable",
        unavailableReason: "비교할 발행본 없음"
      }
    ],
    recentPublication: {
      status: "preparing",
      label: bar.status === "inactive" ? "비활성" : bar.publicMenuStatus === "published" ? "공개 중" : "첫 발행 전",
      description:
        bar.status === "inactive"
          ? "고객 메뉴판 데이터가 내려가 고객 경로가 비공개 상태입니다."
          : bar.publicMenuStatus === "published"
            ? "최근 성공한 발행본이 고객 메뉴판에 노출됩니다."
            : "고객 메뉴판은 준비 중 상태로 시작합니다."
    },
    lifecycle: lifecycleStateFor(bar, Boolean(options.canChangeStatus)),
    lifecycleEvents: (options.lifecycleEvents ?? []).map((event) => ({
      id: event.id,
      barId: event.barId,
      action: event.action,
      beforeStatus: event.beforeStatus,
      afterStatus: event.afterStatus,
      publicationId: event.publicationId,
      result: event.result,
      createdAt: event.createdAt
    }))
  });
}

function lifecycleStateFor(bar: BarRecord, canChangeStatus: boolean): BarDetail["lifecycle"] {
  const nextAction = bar.status === "active" ? "deactivate" : "activate";
  return {
    canChangeStatus,
    nextAction,
    impactLabel:
      nextAction === "deactivate"
        ? "비활성화하면 고객 메뉴판 데이터를 내리고 고객 경로가 비공개 상태가 됩니다. 바·메뉴·발행 이력은 유지됩니다."
        : "재활성화하면 마지막 성공 공개본을 복원합니다. 성공 공개본이 없으면 준비 중 상태로 복원합니다.",
    customerJsonState:
      bar.status === "inactive"
        ? "비공개 상태"
        : bar.publicMenuStatus === "published"
          ? "공개 중"
          : "준비 중 또는 첫 발행 전"
  };
}

async function toBarSettingsResponse(record: BarSettingsRecord): Promise<BarSettingsResponse> {
  const settingsDraftHash =
    record.bar.settingsDraftHash ||
    (await createSettingsDraftHash({
      name: record.bar.name,
      description: record.bar.description,
      address: record.bar.address,
      mapUrl: record.bar.mapUrl,
      phoneNumberDigits: record.bar.phoneNumberDigits,
      openingNote: record.bar.openingNote,
      currency: record.bar.currency,
      businessHours: record.businessHours,
      links: record.links
    }));
  return barSettingsResponseSchema.parse({
    bar: {
      id: record.bar.id,
      slug: record.bar.slug,
      encodedSlug: record.bar.encodedSlug,
      customerPath: `/${record.bar.encodedSlug}`,
      status: record.bar.status,
      publicMenuStatus: record.bar.publicMenuStatus,
      directPublishEnabled: record.bar.directPublishEnabled
    },
    settings: {
      name: record.bar.name,
      description: record.bar.description,
      address: record.bar.address,
      mapUrl: record.bar.mapUrl,
      phoneNumberDigits: record.bar.phoneNumberDigits,
      phoneNumberDisplay: formatKoreanPhoneNumber(record.bar.phoneNumberDigits),
      openingNote: record.bar.openingNote,
      currency: record.bar.currency,
      businessHours: record.businessHours,
      links: record.links,
      settingsDraftHash,
      updatedAt: record.bar.updatedAt
    }
  });
}

async function createSettingsDraftHash(input: {
  name: string;
  description: string;
  address: string;
  mapUrl: string;
  phoneNumberDigits: string;
  openingNote: string;
  currency: string;
  businessHours: Array<{ dayOfWeek: number; opensAt: string; closesAt: string; sortOrder?: number }>;
  links: Array<{ label: string; url: string; sortOrder?: number }>;
}): Promise<string> {
  return sha256Hex(
    JSON.stringify({
      name: input.name,
      description: input.description,
      address: input.address,
      mapUrl: input.mapUrl,
      phoneNumberDigits: input.phoneNumberDigits,
      openingNote: input.openingNote,
      currency: input.currency,
      businessHours: input.businessHours.map((range, index) => ({
        dayOfWeek: range.dayOfWeek,
        opensAt: range.opensAt,
        closesAt: range.closesAt,
        sortOrder: range.sortOrder ?? index
      })),
      links: input.links.map((link, index) => ({
        label: link.label,
        url: link.url,
        sortOrder: link.sortOrder ?? index
      }))
    })
  );
}

function formatKoreanPhoneNumber(digits: string): string {
  if (!digits) return "";
  if (digits.startsWith("02")) {
    if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return digits;
}
