import type {
  BadgeColor,
  BadgesResponse,
  BarBadge,
  BarBadgesResponse,
  CreateBadgeColorRequest,
  CreateBarBadgeRequest,
  CreateSystemBadgeRequest,
  SystemBadge,
  SystemBadgeForBar,
  UpdateBadgeColorRequest,
  UpdateBarBadgeRequest,
  UpdateBarSystemBadgeVisibilityRequest,
  UpdateSystemBadgeRequest
} from "../../contracts/badges";
import { badgesResponseSchema, barBadgesResponseSchema, normalizeBadgeName, readableTextColor } from "../../contracts/badges";
import { nowIso } from "../auth/crypto";
import { AuthServiceError } from "../auth/errors";
import type { AuthRepository, AuthUserRecord } from "../auth/repository";
import type { BarRecord, BarRepository } from "../bars/repository";
import type { MembershipRepository, RolePermissionRecord } from "../memberships/repository";
import type { BadgeColorRecord, BadgeRepository, BarBadgeRecord, BarBadgeVisibilityRecord, SystemBadgeRecord } from "./repository";

export type BadgeServiceOptions = {
  now?: () => Date;
};

export class BadgeService {
  private readonly now: () => Date;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly barRepository: BarRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly repository: BadgeRepository,
    options: BadgeServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async readBadges(actor: AuthUserRecord): Promise<BadgesResponse> {
    const [colors, systemBadges, accessibleBars] = await Promise.all([
      this.repository.listColors(),
      this.repository.listSystemBadges(),
      this.readAccessibleEditBars(actor)
    ]);
    return badgesResponseSchema.parse({
      colors: colors.map(toColorDto),
      systemBadges: systemBadges.map((badge) => toSystemBadgeDto(badge, colors)),
      accessibleBars
    });
  }

  async createColor(actor: AuthUserRecord, input: CreateBadgeColorRequest): Promise<BadgesResponse> {
    assertSystemAdmin(actor);
    try {
      await this.repository.createColor({
        id: crypto.randomUUID(),
        name: input.name,
        normalizedName: normalizeBadgeName(input.name),
        backgroundHex: input.backgroundHex,
        isActive: true,
        now: nowIso(this.now())
      });
      return this.readBadges(actor);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async updateColor(actor: AuthUserRecord, colorId: string, input: UpdateBadgeColorRequest): Promise<BadgesResponse> {
    assertSystemAdmin(actor);
    await this.requireColor(colorId);
    const timestamp = nowIso(this.now());
    const usageCount = await this.repository.countColorUsage(colorId);
    if (!input.isActive && usageCount > 0) {
      if (!input.replacementColorId) {
        throw new AuthServiceError(409, "BADGE_COLOR_REPLACEMENT_REQUIRED", "사용 중인 색상은 대체 색상을 선택해야 비활성화할 수 있습니다.");
      }
      if (input.replacementColorId === colorId) {
        throw new AuthServiceError(409, "BADGE_COLOR_REPLACEMENT_REQUIRED", "비활성화할 색상과 다른 대체 색상을 선택하세요.");
      }
      const replacement = await this.requireColor(input.replacementColorId);
      if (!replacement.isActive) {
        throw new AuthServiceError(409, "BADGE_COLOR_REPLACEMENT_REQUIRED", "활성 색상만 대체 색상으로 사용할 수 있습니다.");
      }
      await this.repository.replaceBadgeColorUsage(colorId, replacement.id, timestamp);
    }
    try {
      const updated = await this.repository.updateColor(colorId, {
        name: input.name,
        normalizedName: normalizeBadgeName(input.name),
        backgroundHex: input.backgroundHex,
        isActive: input.isActive,
        now: timestamp
      });
      if (!updated) throw new AuthServiceError(404, "BADGE_COLOR_NOT_FOUND", "배지 색상을 찾을 수 없습니다.");
      return this.readBadges(actor);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async createSystemBadge(actor: AuthUserRecord, input: CreateSystemBadgeRequest): Promise<BadgesResponse> {
    assertSystemAdmin(actor);
    await this.requireActiveColor(input.colorId);
    try {
      await this.repository.createSystemBadge({
        id: crypto.randomUUID(),
        name: input.name,
        normalizedName: normalizeBadgeName(input.name),
        colorId: input.colorId,
        isActive: true,
        now: nowIso(this.now())
      });
      return this.readBadges(actor);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async updateSystemBadge(actor: AuthUserRecord, badgeId: string, input: UpdateSystemBadgeRequest): Promise<BadgesResponse> {
    assertSystemAdmin(actor);
    await this.requireSystemBadge(badgeId);
    await this.requireActiveColor(input.colorId);
    const usageCount = await this.repository.countSystemBadgeUsage(badgeId);
    if (!input.isActive && usageCount > 0) {
      if (!input.confirmImpact) {
        throw new AuthServiceError(
          409,
          "BADGE_IN_USE_CONFIRM_REQUIRED",
          `사용 중인 메뉴 ${usageCount}개에서 배지가 제거됩니다. 확인 후 다시 요청하세요.`,
          {},
          { usageCount }
        );
      }
      await this.repository.removeSystemBadgeAssignments(badgeId);
    }
    try {
      const updated = await this.repository.updateSystemBadge(badgeId, {
        name: input.name,
        normalizedName: normalizeBadgeName(input.name),
        colorId: input.colorId,
        isActive: input.isActive,
        now: nowIso(this.now())
      });
      if (!updated) throw new AuthServiceError(404, "BADGE_NOT_FOUND", "배지를 찾을 수 없습니다.");
      return this.readBadges(actor);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async readBarBadges(actor: AuthUserRecord, barId: string): Promise<BarBadgesResponse> {
    const bar = await this.requireCanEditMenu(actor, barId);
    const [colors, systemBadges, visibility, barBadges] = await Promise.all([
      this.repository.listColors(),
      this.repository.listSystemBadges(),
      this.repository.listBarBadgeVisibility(barId),
      this.repository.listBarBadges(barId)
    ]);
    return barBadgesResponseSchema.parse({
      bar: { id: bar.id, name: bar.name },
      colors: colors.map(toColorDto),
      systemBadges: systemBadges.map((badge) => toSystemBadgeForBarDto(badge, colors, visibility)),
      barBadges: barBadges.map((badge) => toBarBadgeDto(badge, colors))
    });
  }

  async updateBarSystemBadgeVisibility(
    actor: AuthUserRecord,
    barId: string,
    systemBadgeId: string,
    input: UpdateBarSystemBadgeVisibilityRequest
  ): Promise<BarBadgesResponse> {
    await this.requireCanEditMenu(actor, barId);
    await this.requireSystemBadge(systemBadgeId);
    await this.repository.upsertBarBadgeVisibility({
      barId,
      systemBadgeId,
      isHidden: input.isHidden,
      now: nowIso(this.now())
    });
    return this.readBarBadges(actor, barId);
  }

  async createBarBadge(actor: AuthUserRecord, barId: string, input: CreateBarBadgeRequest): Promise<BarBadgesResponse> {
    await this.requireCanEditMenu(actor, barId);
    await this.requireActiveColor(input.colorId);
    try {
      await this.repository.createBarBadge({
        id: crypto.randomUUID(),
        barId,
        name: input.name,
        normalizedName: normalizeBadgeName(input.name),
        colorId: input.colorId,
        isActive: true,
        now: nowIso(this.now())
      });
      return this.readBarBadges(actor, barId);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async updateBarBadge(actor: AuthUserRecord, barId: string, badgeId: string, input: UpdateBarBadgeRequest): Promise<BarBadgesResponse> {
    await this.requireCanEditMenu(actor, barId);
    await this.requireBarBadge(barId, badgeId);
    await this.requireActiveColor(input.colorId);
    const usageCount = await this.repository.countBarBadgeUsage(barId, badgeId);
    if (!input.isActive && usageCount > 0) {
      if (!input.confirmImpact) {
        throw new AuthServiceError(
          409,
          "BADGE_IN_USE_CONFIRM_REQUIRED",
          `사용 중인 메뉴 ${usageCount}개에서 배지가 제거됩니다. 확인 후 다시 요청하세요.`,
          {},
          { usageCount }
        );
      }
      await this.repository.removeBarBadgeAssignments(barId, badgeId);
    }
    try {
      const updated = await this.repository.updateBarBadge(barId, badgeId, {
        name: input.name,
        normalizedName: normalizeBadgeName(input.name),
        colorId: input.colorId,
        isActive: input.isActive,
        now: nowIso(this.now())
      });
      if (!updated) throw new AuthServiceError(404, "BADGE_NOT_FOUND", "배지를 찾을 수 없습니다.");
      return this.readBarBadges(actor, barId);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async deleteBarBadge(
    actor: AuthUserRecord,
    barId: string,
    badgeId: string,
    input: { confirmImpact?: boolean }
  ): Promise<{ deleted: true }> {
    await this.requireCanEditMenu(actor, barId);
    await this.requireBarBadge(barId, badgeId);
    const usageCount = await this.repository.countBarBadgeUsage(barId, badgeId);
    if (usageCount > 0) {
      if (!input.confirmImpact) {
        throw new AuthServiceError(
          409,
          "BADGE_IN_USE_CONFIRM_REQUIRED",
          `사용 중인 메뉴 ${usageCount}개에서 배지가 제거됩니다. 확인 후 다시 요청하세요.`,
          {},
          { usageCount }
        );
      }
      await this.repository.removeBarBadgeAssignments(barId, badgeId);
    }
    const deleted = await this.repository.deleteBarBadge(barId, badgeId);
    if (!deleted) throw new AuthServiceError(404, "BADGE_NOT_FOUND", "배지를 찾을 수 없습니다.");
    return { deleted: true };
  }

  private async readAccessibleEditBars(actor: AuthUserRecord) {
    if (actor.isSystemAdmin) {
      return (await this.barRepository.listBars()).map((bar) => ({
        id: bar.id,
        name: bar.name,
        role: "system-admin" as const,
        status: bar.status
      }));
    }
    const memberships = await this.membershipRepository.listActiveMembershipsForUser(actor.id);
    const bars = await Promise.all(
      memberships.map(async (membership) => {
        const bar = await this.barRepository.findBarById(membership.barId);
        if (!bar) return null;
        const permissions = await this.membershipRepository.ensureDefaultRolePermissions(bar.id, nowIso(this.now()));
        const permission = permissions.find((item) => item.role === membership.role);
        return permission?.canEditMenu ? { bar, role: membership.role } : null;
      })
    );
    return bars
      .filter((item): item is { bar: BarRecord; role: RolePermissionRecord["role"] } => Boolean(item))
      .map((item) => ({
        id: item.bar.id,
        name: item.bar.name,
        role: item.role,
        status: item.bar.status
      }));
  }

  private async requireCanEditMenu(actor: AuthUserRecord, barId: string): Promise<BarRecord> {
    const bar = await this.barRepository.findBarById(barId);
    if (!bar) throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    if (actor.isSystemAdmin) return bar;
    const membership = await this.membershipRepository.findActiveMembershipForUser(barId, actor.id);
    if (!membership) throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    const permissions = await this.membershipRepository.ensureDefaultRolePermissions(barId, nowIso(this.now()));
    const permission = permissions.find((item) => item.role === membership.role);
    if (!permission?.canEditMenu) {
      throw new AuthServiceError(403, "BAR_PERMISSION_REQUIRED", "이 바에서 메뉴를 편집할 권한이 없습니다.");
    }
    return bar;
  }

  private async requireColor(colorId: string): Promise<BadgeColorRecord> {
    const color = await this.repository.findColorById(colorId);
    if (!color) throw new AuthServiceError(404, "BADGE_COLOR_NOT_FOUND", "배지 색상을 찾을 수 없습니다.");
    return color;
  }

  private async requireActiveColor(colorId: string): Promise<BadgeColorRecord> {
    const color = await this.requireColor(colorId);
    if (!color.isActive) throw new AuthServiceError(409, "BADGE_COLOR_INACTIVE", "활성 색상만 배지에 사용할 수 있습니다.");
    return color;
  }

  private async requireSystemBadge(id: string): Promise<SystemBadgeRecord> {
    const badge = await this.repository.findSystemBadgeById(id);
    if (!badge) throw new AuthServiceError(404, "BADGE_NOT_FOUND", "배지를 찾을 수 없습니다.");
    return badge;
  }

  private async requireBarBadge(barId: string, id: string): Promise<BarBadgeRecord> {
    const badge = await this.repository.findBarBadgeById(barId, id);
    if (!badge) throw new AuthServiceError(404, "BADGE_NOT_FOUND", "배지를 찾을 수 없습니다.");
    return badge;
  }
}

function assertSystemAdmin(actor: AuthUserRecord): void {
  if (!actor.isSystemAdmin) {
    throw new AuthServiceError(403, "SYSTEM_ADMIN_REQUIRED", "시스템 관리자만 사용할 수 있습니다.");
  }
}

function toColorDto(record: BadgeColorRecord): BadgeColor {
  return {
    id: record.id,
    name: record.name,
    normalizedName: record.normalizedName,
    backgroundHex: record.backgroundHex,
    textColor: readableTextColor(record.backgroundHex),
    isActive: record.isActive,
    usageCount: record.usageCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function toSystemBadgeDto(record: SystemBadgeRecord, colors: BadgeColorRecord[]): SystemBadge {
  return {
    id: record.id,
    name: record.name,
    normalizedName: record.normalizedName,
    color: toColorSummary(record.colorId, colors),
    isActive: record.isActive,
    usageCount: record.usageCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function toSystemBadgeForBarDto(
  record: SystemBadgeRecord,
  colors: BadgeColorRecord[],
  visibility: BarBadgeVisibilityRecord[]
): SystemBadgeForBar {
  const override = visibility.find((item) => item.systemBadgeId === record.id);
  return {
    ...toSystemBadgeDto(record, colors),
    isHiddenForBar: override?.isHidden ?? true
  };
}

function toBarBadgeDto(record: BarBadgeRecord, colors: BadgeColorRecord[]): BarBadge {
  return {
    ...toSystemBadgeDto(record, colors),
    barId: record.barId
  };
}

function toColorSummary(colorId: string, colors: BadgeColorRecord[]) {
  const color = colors.find((item) => item.id === colorId);
  if (!color) {
    return {
      id: colorId,
      name: "Unknown",
      backgroundHex: "#333333",
      textColor: "#FFFFFF" as const,
      isActive: false
    };
  }
  return {
    id: color.id,
    name: color.name,
    backgroundHex: color.backgroundHex,
    textColor: readableTextColor(color.backgroundHex),
    isActive: color.isActive
  };
}

function mapRepositoryError(error: unknown): AuthServiceError {
  if (error instanceof AuthServiceError) return error;
  if (error instanceof Error && error.message === "BADGE_COLOR_NAME_EXISTS") {
    return new AuthServiceError(409, "BADGE_COLOR_NAME_EXISTS", "같은 이름의 배지 색상이 이미 있습니다.");
  }
  if (error instanceof Error && error.message === "BADGE_NAME_EXISTS") {
    return new AuthServiceError(409, "BADGE_NAME_EXISTS", "같은 이름의 배지가 이미 있습니다.");
  }
  throw error;
}
