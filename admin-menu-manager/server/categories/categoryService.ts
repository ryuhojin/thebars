import type {
  CategoriesResponse,
  CreateCategoryRequest,
  DeleteCategoryRequest,
  MoveCategoryRequest,
  ReorderCategoriesRequest,
  UpdateCategoryRequest
} from "../../contracts/categories";
import { categoriesResponseSchema, normalizeCategoryName } from "../../contracts/categories";
import { nowIso } from "../auth/crypto";
import { AuthServiceError } from "../auth/errors";
import type { AuthRepository, AuthUserRecord } from "../auth/repository";
import type { BarRecord, BarRepository } from "../bars/repository";
import type { MembershipRepository } from "../memberships/repository";
import type { CategoryRecord, CategoryRepository } from "./repository";

export type CategoryServiceOptions = {
  now?: () => Date;
};

export class CategoryService {
  private readonly now: () => Date;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly barRepository: BarRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly repository: CategoryRepository,
    options: CategoryServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async readCategories(actor: AuthUserRecord, barId: string): Promise<CategoriesResponse> {
    const bar = await this.requireCanEditMenu(actor, barId);
    return this.readResponse(bar);
  }

  async createCategory(actor: AuthUserRecord, barId: string, input: CreateCategoryRequest): Promise<CategoriesResponse> {
    const bar = await this.requireCanEditMenu(actor, barId);
    const parentId = input.parentId ?? null;
    await this.assertParentAllowsChild(barId, parentId);
    try {
      await this.repository.createCategory({
        id: crypto.randomUUID(),
        barId,
        parentId,
        name: input.name,
        normalizedName: normalizeCategoryName(input.name),
        description: input.description ?? "",
        showDescription: input.showDescription ?? false,
        isVisible: input.isVisible ?? true,
        createdByUserId: actor.id,
        updatedByUserId: actor.id,
        now: nowIso(this.now())
      });
      return this.readResponse(bar);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async updateCategory(
    actor: AuthUserRecord,
    barId: string,
    categoryId: string,
    input: UpdateCategoryRequest
  ): Promise<CategoriesResponse> {
    const bar = await this.requireCanEditMenu(actor, barId);
    await this.requireCategory(barId, categoryId);
    try {
      const updated = await this.repository.updateCategory(barId, categoryId, {
        name: input.name,
        normalizedName: normalizeCategoryName(input.name),
        description: input.description ?? "",
        showDescription: input.showDescription,
        isVisible: input.isVisible,
        updatedByUserId: actor.id,
        now: nowIso(this.now())
      });
      if (!updated) throw new AuthServiceError(404, "CATEGORY_NOT_FOUND", "카테고리를 찾을 수 없습니다.");
      return this.readResponse(bar);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async moveCategory(
    actor: AuthUserRecord,
    barId: string,
    categoryId: string,
    input: MoveCategoryRequest
  ): Promise<CategoriesResponse> {
    const bar = await this.requireCanEditMenu(actor, barId);
    const category = await this.requireCategory(barId, categoryId);
    const parentId = input.parentId;
    if (parentId === category.id) {
      throw new AuthServiceError(409, "CATEGORY_MOVE_INVALID", "카테고리를 자기 자신 아래로 이동할 수 없습니다.");
    }
    if (parentId !== null) {
      if (category.childCount > 0) {
        throw new AuthServiceError(409, "CATEGORY_MAX_DEPTH", "하위 카테고리가 있는 상위 카테고리는 다른 상위 아래로 이동할 수 없습니다.");
      }
      await this.assertParentAllowsChild(barId, parentId);
    }
    const siblings = (await this.repository.listCategories(barId)).filter((item) => item.parentId === parentId && item.id !== category.id);
    try {
      const moved = await this.repository.moveCategory({
        barId,
        categoryId,
        parentId,
        sortOrder: siblings.length,
        updatedByUserId: actor.id,
        now: nowIso(this.now())
      });
      if (!moved) throw new AuthServiceError(404, "CATEGORY_NOT_FOUND", "카테고리를 찾을 수 없습니다.");
      return this.readResponse(bar);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async reorderCategories(
    actor: AuthUserRecord,
    barId: string,
    input: ReorderCategoriesRequest
  ): Promise<CategoriesResponse> {
    const bar = await this.requireCanEditMenu(actor, barId);
    const categories = await this.repository.listCategories(barId);
    if (input.parentId !== null) await this.requireCategory(barId, input.parentId);
    const siblings = categories.filter((category) => category.parentId === input.parentId);
    if (!sameSet(siblings.map((category) => category.id), input.orderedIds)) {
      throw new AuthServiceError(409, "CATEGORY_REORDER_MISMATCH", "같은 단계의 모든 카테고리를 포함해 다시 정렬하세요.");
    }
    await this.repository.replaceSiblingOrder(barId, input.parentId, input.orderedIds, actor.id, nowIso(this.now()));
    return this.readResponse(bar);
  }

  async deleteCategory(
    actor: AuthUserRecord,
    barId: string,
    categoryId: string,
    input: DeleteCategoryRequest
  ): Promise<{ deleted: true }> {
    await this.requireCanEditMenu(actor, barId);
    const category = await this.requireCategory(barId, categoryId);
    if ((await this.repository.countDirectMenuItems(barId, categoryId)) > 0) {
      throw new AuthServiceError(409, "CATEGORY_IN_USE", "메뉴가 있는 카테고리는 삭제할 수 없습니다.");
    }
    const children = (await this.repository.listCategories(barId)).filter((item) => item.parentId === categoryId);
    if (children.length > 0) {
      const childMenuCounts = await Promise.all(children.map((child) => this.repository.countDirectMenuItems(barId, child.id)));
      if (childMenuCounts.some((count) => count > 0)) {
        throw new AuthServiceError(409, "CATEGORY_CHILD_IN_USE", "메뉴가 있는 하위 카테고리는 함께 삭제할 수 없습니다.");
      }
      if (!input.confirmCascade) {
        throw new AuthServiceError(
          409,
          "CATEGORY_DELETE_CONFIRM_REQUIRED",
          `비어 있는 하위 카테고리 ${children.length}개가 함께 삭제됩니다. 확인 후 다시 요청하세요.`,
          {},
          { childCount: children.length }
        );
      }
    }
    await this.repository.deleteCategories(barId, [...children.map((child) => child.id), categoryId]);
    return { deleted: true };
  }

  private async readResponse(bar: BarRecord): Promise<CategoriesResponse> {
    const categories = await this.repository.listCategories(bar.id);
    return categoriesResponseSchema.parse({
      bar: { id: bar.id, name: bar.name },
      categories: await Promise.all(categories.map((category) => this.toDto(category)))
    });
  }

  private async requireCanEditMenu(actor: AuthUserRecord, barId: string): Promise<BarRecord> {
    const bar = await this.barRepository.findBarById(barId);
    if (!bar) throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    if (actor.isSystemAdmin) return bar;
    const membership = await this.membershipRepository.findActiveMembershipForUser(barId, actor.id);
    if (!membership) throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    const rolePermissions = await this.membershipRepository.ensureDefaultRolePermissions(barId, nowIso(this.now()));
    const rolePermission = rolePermissions.find((permission) => permission.role === membership.role);
    if (!rolePermission?.canEditMenu) {
      throw new AuthServiceError(403, "BAR_PERMISSION_REQUIRED", "이 바에서 메뉴를 편집할 권한이 없습니다.");
    }
    return bar;
  }

  private async assertParentAllowsChild(barId: string, parentId: string | null): Promise<void> {
    if (parentId === null) return;
    const parent = await this.requireCategory(barId, parentId);
    if (parent.parentId !== null) {
      throw new AuthServiceError(409, "CATEGORY_MAX_DEPTH", "카테고리는 최대 2단계까지만 만들 수 있습니다.");
    }
    if ((await this.repository.countDirectMenuItems(barId, parentId)) > 0) {
      throw new AuthServiceError(409, "CATEGORY_PARENT_HAS_MENU", "메뉴가 직접 들어 있는 카테고리에는 하위 카테고리를 만들 수 없습니다.");
    }
  }

  private async requireCategory(barId: string, categoryId: string): Promise<CategoryRecord> {
    const category = await this.repository.findCategoryById(barId, categoryId);
    if (!category) throw new AuthServiceError(404, "CATEGORY_NOT_FOUND", "카테고리를 찾을 수 없습니다.");
    return category;
  }

  private async toDto(category: CategoryRecord) {
    const updatedBy = category.updatedByUserId ? await this.authRepository.findUserById(category.updatedByUserId) : null;
    return {
      id: category.id,
      barId: category.barId,
      publicId: category.publicId,
      parentId: category.parentId,
      name: category.name,
      normalizedName: category.normalizedName,
      description: category.description,
      showDescription: category.showDescription,
      isVisible: category.isVisible,
      sortOrder: category.sortOrder,
      childCount: category.childCount,
      menuCount: category.menuCount,
      updatedByUsername: updatedBy?.normalizedUsername ?? "알 수 없음",
      createdAt: category.createdAt,
      updatedAt: category.updatedAt
    };
  }
}

function sameSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && right.every((item) => leftSet.has(item));
}

function mapRepositoryError(error: unknown): AuthServiceError {
  if (error instanceof AuthServiceError) return error;
  if (error instanceof Error && error.message === "CATEGORY_NAME_EXISTS") {
    return new AuthServiceError(409, "CATEGORY_NAME_EXISTS", "같은 단계에 같은 이름의 카테고리가 이미 있습니다.");
  }
  throw error;
}
