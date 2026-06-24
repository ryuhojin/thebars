import type {
  ApproveGrapeCandidateRequest,
  BarItemTypesResponse,
  CreateBarItemTypeRequest,
  CreateSystemItemTypeRequest,
  GrapeVarietyCandidate,
  GrapeVarietyCandidatesResponse,
  GrapeVarietiesResponse,
  ItemTypesResponse,
  RejectGrapeCandidateRequest,
  SubmitGrapeCandidateRequest,
  SystemItemType,
  UpdateBarItemTypeOverrideRequest,
  UpdateBarItemTypeRequest,
  UpdateSystemItemTypeRequest
} from "../../contracts/itemTypes";
import {
  barItemTypesResponseSchema,
  grapeVarietyCandidatesResponseSchema,
  grapeVarietiesResponseSchema,
  itemTypesResponseSchema,
  normalizeName
} from "../../contracts/itemTypes";
import { nowIso } from "../auth/crypto";
import { AuthServiceError } from "../auth/errors";
import type { AuthRepository, AuthUserRecord } from "../auth/repository";
import type { BarRepository } from "../bars/repository";
import type { MembershipRepository, RolePermissionRecord } from "../memberships/repository";
import type {
  BarItemTypeRecord,
  GrapeVarietyCandidateRecord,
  GrapeVarietyRecord,
  ItemTypeRecord,
  ItemTypeRepository
} from "./repository";
import { itemTemplateOptions } from "./repository";

export type ItemTypeServiceOptions = {
  now?: () => Date;
};

export class ItemTypeService {
  private readonly now: () => Date;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly barRepository: BarRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly repository: ItemTypeRepository,
    options: ItemTypeServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async readItemTypes(actor: AuthUserRecord): Promise<ItemTypesResponse> {
    const [systemTypes, accessibleBars] = await Promise.all([
      this.repository.listSystemItemTypes(),
      this.readAccessibleOwnerBars(actor)
    ]);
    return itemTypesResponseSchema.parse({
      templates: itemTemplateOptions,
      systemTypes: systemTypes.map(toSystemItemTypeDto),
      accessibleBars
    });
  }

  async createSystemItemType(actor: AuthUserRecord, input: CreateSystemItemTypeRequest): Promise<SystemItemType> {
    assertSystemAdmin(actor);
    try {
      return toSystemItemTypeDto(
        await this.repository.createSystemItemType({
          id: crypto.randomUUID(),
          name: input.name,
          normalizedName: normalizeName(input.name),
          template: input.template,
          defaultPriceLabels: input.defaultPriceLabels,
          isActive: true,
          now: nowIso(this.now())
        })
      );
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async updateSystemItemType(
    actor: AuthUserRecord,
    itemTypeId: string,
    input: UpdateSystemItemTypeRequest
  ): Promise<SystemItemType> {
    assertSystemAdmin(actor);
    const current = await this.requireSystemItemType(itemTypeId);
    if (current.isActive && !input.isActive) await this.assertSystemItemTypeUnused(itemTypeId);
    try {
      const updated = await this.repository.updateSystemItemType(itemTypeId, {
        name: input.name,
        normalizedName: normalizeName(input.name),
        template: input.template,
        defaultPriceLabels: input.defaultPriceLabels,
        isActive: input.isActive,
        now: nowIso(this.now())
      });
      if (!updated) throw new AuthServiceError(404, "ITEM_TYPE_NOT_FOUND", "품목 유형을 찾을 수 없습니다.");
      return toSystemItemTypeDto(updated);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async deleteSystemItemType(actor: AuthUserRecord, itemTypeId: string): Promise<{ deleted: true }> {
    assertSystemAdmin(actor);
    await this.requireSystemItemType(itemTypeId);
    await this.assertSystemItemTypeUnused(itemTypeId);
    const deleted = await this.repository.deleteSystemItemType(itemTypeId);
    if (!deleted) throw new AuthServiceError(404, "ITEM_TYPE_NOT_FOUND", "품목 유형을 찾을 수 없습니다.");
    return { deleted: true };
  }

  async readBarItemTypes(actor: AuthUserRecord, barId: string): Promise<BarItemTypesResponse> {
    const bar = await this.requireOwnerBar(actor, barId);
    const [systemTypes, overrides, barTypes] = await Promise.all([
      this.repository.listSystemItemTypes(),
      this.repository.listBarItemTypeOverrides(barId),
      this.repository.listBarItemTypes(barId)
    ]);
    return barItemTypesResponseSchema.parse({
      bar: { id: bar.id, name: bar.name },
      templates: itemTemplateOptions,
      systemTypes: systemTypes.map(toSystemItemTypeDto),
      overrides,
      barTypes: barTypes.map(toBarItemTypeDto)
    });
  }

  async createBarItemType(
    actor: AuthUserRecord,
    barId: string,
    input: CreateBarItemTypeRequest
  ): Promise<BarItemTypesResponse> {
    await this.requireOwnerBar(actor, barId);
    try {
      await this.repository.createBarItemType({
        id: crypto.randomUUID(),
        barId,
        name: input.name,
        normalizedName: normalizeName(input.name),
        template: input.template,
        defaultPriceLabels: input.defaultPriceLabels,
        isActive: true,
        now: nowIso(this.now())
      });
      return this.readBarItemTypes(actor, barId);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async updateBarItemType(
    actor: AuthUserRecord,
    barId: string,
    itemTypeId: string,
    input: UpdateBarItemTypeRequest
  ): Promise<BarItemTypesResponse> {
    await this.requireOwnerBar(actor, barId);
    const current = await this.requireBarItemType(barId, itemTypeId);
    if (current.isActive && !input.isActive) await this.assertBarItemTypeUnused(barId, itemTypeId);
    try {
      const updated = await this.repository.updateBarItemType(barId, itemTypeId, {
        name: input.name,
        normalizedName: normalizeName(input.name),
        template: input.template,
        defaultPriceLabels: input.defaultPriceLabels,
        isActive: input.isActive,
        now: nowIso(this.now())
      });
      if (!updated) throw new AuthServiceError(404, "ITEM_TYPE_NOT_FOUND", "품목 유형을 찾을 수 없습니다.");
      return this.readBarItemTypes(actor, barId);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async deleteBarItemType(actor: AuthUserRecord, barId: string, itemTypeId: string): Promise<{ deleted: true }> {
    await this.requireOwnerBar(actor, barId);
    await this.requireBarItemType(barId, itemTypeId);
    await this.assertBarItemTypeUnused(barId, itemTypeId);
    const deleted = await this.repository.deleteBarItemType(barId, itemTypeId);
    if (!deleted) throw new AuthServiceError(404, "ITEM_TYPE_NOT_FOUND", "품목 유형을 찾을 수 없습니다.");
    return { deleted: true };
  }

  async updateBarOverride(
    actor: AuthUserRecord,
    barId: string,
    systemItemTypeId: string,
    input: UpdateBarItemTypeOverrideRequest
  ): Promise<BarItemTypesResponse> {
    await this.requireOwnerBar(actor, barId);
    await this.requireSystemItemType(systemItemTypeId);
    await this.repository.upsertBarItemTypeOverride({
      barId,
      systemItemTypeId,
      isHidden: input.isHidden,
      defaultPriceLabels: input.defaultPriceLabels,
      now: nowIso(this.now())
    });
    return this.readBarItemTypes(actor, barId);
  }

  async readGrapeVarieties(_actor: AuthUserRecord): Promise<GrapeVarietiesResponse> {
    return grapeVarietiesResponseSchema.parse({ varieties: await this.repository.listGrapeVarieties() });
  }

  async readGrapeCandidates(actor: AuthUserRecord): Promise<GrapeVarietyCandidatesResponse> {
    assertSystemAdmin(actor);
    return grapeVarietyCandidatesResponseSchema.parse({
      candidates: await Promise.all((await this.repository.listGrapeCandidates()).map((candidate) => this.toCandidateDto(candidate)))
    });
  }

  async submitGrapeCandidate(
    actor: AuthUserRecord,
    input: SubmitGrapeCandidateRequest
  ): Promise<GrapeVarietyCandidatesResponse> {
    await this.requireCanEditMenu(actor, input.barId);
    const normalized = normalizeName(input.proposedName);
    if (await this.repository.findGrapeVarietyByNormalizedName(normalized)) {
      throw new AuthServiceError(409, "GRAPE_VARIETY_ALREADY_APPROVED", "이미 승인된 포도 품종입니다.");
    }
    if (await this.repository.findPendingGrapeCandidateByNormalizedName(normalized)) {
      throw new AuthServiceError(409, "GRAPE_CANDIDATE_ALREADY_PENDING", "이미 승인 대기 중인 품종 후보입니다.");
    }
    const candidate = await this.repository.createGrapeCandidate({
      id: crypto.randomUUID(),
      barId: input.barId,
      proposedName: input.proposedName,
      normalizedProposedName: normalized,
      submittedByUserId: actor.id,
      now: nowIso(this.now())
    });
    return grapeVarietyCandidatesResponseSchema.parse({ candidates: [await this.toCandidateDto(candidate)] });
  }

  async approveGrapeCandidate(
    actor: AuthUserRecord,
    candidateId: string,
    input: ApproveGrapeCandidateRequest
  ): Promise<GrapeVarietyCandidatesResponse> {
    assertSystemAdmin(actor);
    const candidate = await this.requirePendingCandidate(candidateId);
    const normalized = normalizeName(input.standardName);
    if (await this.repository.findGrapeVarietyByNormalizedName(normalized)) {
      throw new AuthServiceError(409, "GRAPE_VARIETY_ALREADY_APPROVED", "이미 승인된 포도 품종입니다.");
    }
    try {
      await this.repository.approveGrapeCandidate({
        candidateId: candidate.id,
        varietyId: crypto.randomUUID(),
        standardName: input.standardName,
        normalizedName: normalized,
        reviewedByUserId: actor.id,
        now: nowIso(this.now())
      });
      return this.readGrapeCandidates(actor);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async rejectGrapeCandidate(
    actor: AuthUserRecord,
    candidateId: string,
    input: RejectGrapeCandidateRequest
  ): Promise<GrapeVarietyCandidatesResponse> {
    assertSystemAdmin(actor);
    await this.requirePendingCandidate(candidateId);
    const updated = await this.repository.rejectGrapeCandidate({
      candidateId,
      reviewedByUserId: actor.id,
      reason: input.reason ?? "",
      now: nowIso(this.now())
    });
    if (!updated) throw new AuthServiceError(409, "GRAPE_CANDIDATE_NOT_PENDING", "승인 대기 상태의 후보만 처리할 수 있습니다.");
    return this.readGrapeCandidates(actor);
  }

  private async readAccessibleOwnerBars(actor: AuthUserRecord) {
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
      memberships.filter((membership) => membership.role === "owner").map((membership) => this.barRepository.findBarById(membership.barId))
    );
    return bars
      .filter((bar): bar is NonNullable<typeof bar> => Boolean(bar))
      .map((bar) => ({ id: bar.id, name: bar.name, role: "owner" as const, status: bar.status }));
  }

  private async requireOwnerBar(actor: AuthUserRecord, barId: string) {
    const bar = await this.barRepository.findBarById(barId);
    if (!bar) throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    if (actor.isSystemAdmin) return bar;
    const membership = await this.membershipRepository.findActiveMembershipForUser(barId, actor.id);
    if (!membership) throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    if (membership.role !== "owner") {
      throw new AuthServiceError(403, "BAR_OWNER_REQUIRED", "바 오너만 전용 품목 유형을 관리할 수 있습니다.");
    }
    return bar;
  }

  private async requireCanEditMenu(actor: AuthUserRecord, barId: string): Promise<void> {
    const bar = await this.barRepository.findBarById(barId);
    if (!bar) throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    if (actor.isSystemAdmin) return;
    const membership = await this.membershipRepository.findActiveMembershipForUser(barId, actor.id);
    if (!membership) throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    const rolePermissions = await this.membershipRepository.ensureDefaultRolePermissions(barId, nowIso(this.now()));
    const rolePermission = rolePermissions.find((permission) => permission.role === membership.role);
    if (!rolePermission?.canEditMenu) {
      throw new AuthServiceError(403, "BAR_PERMISSION_REQUIRED", "이 바에서 필요한 권한이 없습니다.");
    }
  }

  private async requireSystemItemType(id: string): Promise<ItemTypeRecord> {
    const type = await this.repository.findSystemItemTypeById(id);
    if (!type) throw new AuthServiceError(404, "ITEM_TYPE_NOT_FOUND", "품목 유형을 찾을 수 없습니다.");
    return type;
  }

  private async requireBarItemType(barId: string, id: string): Promise<BarItemTypeRecord> {
    const type = await this.repository.findBarItemTypeById(barId, id);
    if (!type) throw new AuthServiceError(404, "ITEM_TYPE_NOT_FOUND", "품목 유형을 찾을 수 없습니다.");
    return type;
  }

  private async requirePendingCandidate(id: string): Promise<GrapeVarietyCandidateRecord> {
    const candidate = await this.repository.findGrapeCandidateById(id);
    if (!candidate) throw new AuthServiceError(404, "GRAPE_CANDIDATE_NOT_FOUND", "품종 후보를 찾을 수 없습니다.");
    if (candidate.status !== "pending") {
      throw new AuthServiceError(409, "GRAPE_CANDIDATE_NOT_PENDING", "승인 대기 상태의 후보만 처리할 수 있습니다.");
    }
    return candidate;
  }

  private async assertSystemItemTypeUnused(id: string): Promise<void> {
    const usageCount = await this.repository.countSystemItemTypeUsage(id);
    if (usageCount > 0) {
      throw new AuthServiceError(409, "ITEM_TYPE_IN_USE", "사용 중인 품목 유형은 비활성화하거나 삭제할 수 없습니다.");
    }
  }

  private async assertBarItemTypeUnused(barId: string, id: string): Promise<void> {
    const usageCount = await this.repository.countBarItemTypeUsage(barId, id);
    if (usageCount > 0) {
      throw new AuthServiceError(409, "ITEM_TYPE_IN_USE", "사용 중인 품목 유형은 비활성화하거나 삭제할 수 없습니다.");
    }
  }

  private async toCandidateDto(candidate: GrapeVarietyCandidateRecord): Promise<GrapeVarietyCandidate> {
    const [submittedBy, reviewedBy] = await Promise.all([
      this.authRepository.findUserById(candidate.submittedByUserId),
      candidate.reviewedByUserId ? this.authRepository.findUserById(candidate.reviewedByUserId) : Promise.resolve(null)
    ]);
    return {
      ...candidate,
      submittedByUsername: submittedBy?.normalizedUsername ?? "알 수 없음",
      reviewedByUsername: reviewedBy?.normalizedUsername ?? null
    };
  }
}

function assertSystemAdmin(actor: AuthUserRecord): void {
  if (!actor.isSystemAdmin) {
    throw new AuthServiceError(403, "SYSTEM_ADMIN_REQUIRED", "시스템 관리자만 사용할 수 있습니다.");
  }
}

function toSystemItemTypeDto(record: ItemTypeRecord): SystemItemType {
  return {
    id: record.id,
    name: record.name,
    normalizedName: record.normalizedName,
    template: record.template,
    defaultPriceLabels: record.defaultPriceLabels,
    isActive: record.isActive,
    usageCount: record.usageCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function toBarItemTypeDto(record: BarItemTypeRecord) {
  return {
    ...toSystemItemTypeDto(record),
    barId: record.barId
  };
}

function mapRepositoryError(error: unknown): AuthServiceError {
  if (error instanceof AuthServiceError) return error;
  if (error instanceof Error && error.message === "ITEM_TYPE_NAME_EXISTS") {
    return new AuthServiceError(409, "ITEM_TYPE_NAME_EXISTS", "같은 이름의 품목 유형이 이미 있습니다.");
  }
  if (error instanceof Error && error.message === "GRAPE_VARIETY_EXISTS") {
    return new AuthServiceError(409, "GRAPE_VARIETY_ALREADY_APPROVED", "이미 승인된 포도 품종입니다.");
  }
  if (error instanceof Error && error.message === "GRAPE_CANDIDATE_NOT_PENDING") {
    return new AuthServiceError(409, "GRAPE_CANDIDATE_NOT_PENDING", "승인 대기 상태의 후보만 처리할 수 있습니다.");
  }
  throw error;
}
