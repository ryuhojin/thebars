import type {
  BulkUpdateMenuItemsRequest,
  BulkUpdateMenuItemsResponse,
  CreateMenuItemRequest,
  MenuBadgeOption,
  MenuBadgeSelection,
  MenuCategoryOption,
  MenuItem,
  MenuItemBadge,
  MenuItemDetail,
  MenuItemDetails,
  MenuItemListQuery,
  MenuItemPriceInput as MenuItemPriceRequest,
  MenuItemDetailResponse,
  MenuItemTypeOption,
  MenuItemsResponse,
  MenuItemTypeSelection,
  UpdateMenuItemRequest
} from "../../contracts/menuItems";
import {
  menuItemDetailResponseSchema,
  menuItemDetailsSchema,
  menuItemsResponseSchema,
  bulkUpdateMenuItemsResponseSchema,
  normalizeMenuName,
  normalizeMenuPriceLabel
} from "../../contracts/menuItems";
import type { ItemTemplate } from "../../contracts/itemTypes";
import type { BadgeColorSummary } from "../../contracts/badges";
import { readableTextColor } from "../../contracts/badges";
import { nowIso } from "../auth/crypto";
import { AuthServiceError } from "../auth/errors";
import type { AuthRepository, AuthUserRecord } from "../auth/repository";
import type { BarRecord, BarRepository } from "../bars/repository";
import type { BadgeColorRecord, BadgeRepository, BarBadgeRecord, BarBadgeVisibilityRecord, SystemBadgeRecord } from "../badges/repository";
import type { CategoryRecord, CategoryRepository } from "../categories/repository";
import type {
  BarItemTypeOverrideRecord,
  BarItemTypeRecord,
  ItemTypeRecord,
  ItemTypeRepository
} from "../item-types/repository";
import type { MembershipRepository } from "../memberships/repository";
import type {
  MenuItemBadgeInput,
  MenuItemBadgeRecord,
  MenuItemListChangeInput,
  MenuItemPriceInput,
  MenuItemPriceRecord,
  MenuItemRecord,
  MenuItemRepository
} from "./repository";

export type MenuItemServiceOptions = {
  now?: () => Date;
  badgeRepository?: BadgeRepository;
};

type BarAccess = {
  bar: BarRecord;
  canEdit: boolean;
  canEditInternalMemo: boolean;
};

type ItemTypeIds = {
  systemItemTypeId: string | null;
  barItemTypeId: string | null;
};

type ItemTypeResolution = ItemTypeIds & {
  template: ItemTemplate;
};

export class MenuItemService {
  private readonly now: () => Date;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly barRepository: BarRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly itemTypeRepository: ItemTypeRepository,
    private readonly repository: MenuItemRepository,
    options: MenuItemServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.badgeRepository = options.badgeRepository;
  }

  private readonly badgeRepository?: BadgeRepository;

  async readMenuItems(actor: AuthUserRecord, barId: string, query: MenuItemListQuery = {}): Promise<MenuItemsResponse> {
    const access = await this.requireBarAccess(actor, barId);
    return this.readResponse(access, undefined, query);
  }

  async readMenuItem(actor: AuthUserRecord, barId: string, menuItemId: string): Promise<MenuItemDetailResponse> {
    const access = await this.requireBarAccess(actor, barId);
    await this.requireMenuItem(barId, menuItemId);
    return this.readResponse(access, menuItemId);
  }

  async createMenuItem(actor: AuthUserRecord, barId: string, input: CreateMenuItemRequest): Promise<MenuItemDetailResponse> {
    const access = await this.requireCanEditMenu(actor, barId);
    await this.requireLeafCategory(barId, input.categoryId);
    const itemType = await this.resolveItemType(barId, input.itemType ?? null);
    const internalMemo = input.internalMemo ?? "";
    if (internalMemo && !access.canEditInternalMemo) {
      throw new AuthServiceError(403, "INTERNAL_MEMO_OWNER_REQUIRED", "내부 메모는 owner 또는 시스템 관리자만 수정할 수 있습니다.");
    }
    try {
      const created = await this.repository.createMenuItem({
        id: crypto.randomUUID(),
        barId,
        categoryId: input.categoryId,
        systemItemTypeId: itemType.systemItemTypeId,
        barItemTypeId: itemType.barItemTypeId,
        name: input.name,
        normalizedName: normalizeMenuName(input.name),
        description: input.description ?? "",
        internalMemo,
        saleStatus: input.saleStatus ?? "available",
        isVisible: input.isVisible ?? true,
        abvBasisPoints: toAbvBasisPoints(input.abv ?? null),
        createdByUserId: actor.id,
        updatedByUserId: actor.id,
        now: nowIso(this.now())
      });
      const now = nowIso(this.now());
      if (input.prices !== undefined) {
        await this.repository.replaceMenuItemPrices(barId, created.id, this.toPriceInputs(input.prices), actor.id, now);
      }
      if (input.details) {
        const details = parseDetailsForTemplate(input.details, itemType.template);
        await this.repository.upsertMenuItemDetails({
          barId,
          menuItemId: created.id,
          template: itemType.template,
          details,
          updatedByUserId: actor.id,
          now
        });
      }
      return this.readResponse(access, created.id);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async updateMenuItem(
    actor: AuthUserRecord,
    barId: string,
    menuItemId: string,
    input: UpdateMenuItemRequest
  ): Promise<MenuItemDetailResponse> {
    const access = await this.requireCanEditMenu(actor, barId);
    const current = await this.requireMenuItem(barId, menuItemId);
    await this.requireLeafCategory(barId, input.categoryId);
    const itemType = await this.resolveItemType(barId, input.itemType ?? null);
    const internalMemo = input.internalMemo ?? current.internalMemo;
    if (input.internalMemo !== undefined && input.internalMemo !== current.internalMemo && !access.canEditInternalMemo) {
      throw new AuthServiceError(403, "INTERNAL_MEMO_OWNER_REQUIRED", "내부 메모는 owner 또는 시스템 관리자만 수정할 수 있습니다.");
    }
    const existingDetails = await this.repository.findMenuItemDetails(barId, menuItemId);
    const templateChanged = existingDetails !== null && existingDetails.template !== itemType.template;
    if (templateChanged && detailsHasContent(existingDetails.details) && !input.confirmDetailReset) {
      throw new AuthServiceError(409, "DETAIL_TEMPLATE_RESET_REQUIRED", "유형 변경으로 기존 상세 정보가 삭제됩니다.", {}, {
        fromTemplate: existingDetails.template,
        toTemplate: itemType.template
      });
    }
    const nextDetails =
      input.details === undefined || input.details === null ? input.details : parseDetailsForTemplate(input.details, itemType.template);
    try {
      const updated = await this.repository.updateMenuItem(barId, menuItemId, {
        categoryId: input.categoryId,
        systemItemTypeId: itemType.systemItemTypeId,
        barItemTypeId: itemType.barItemTypeId,
        name: input.name,
        normalizedName: normalizeMenuName(input.name),
        description: input.description ?? "",
        internalMemo,
        saleStatus: input.saleStatus,
        isVisible: input.isVisible,
        abvBasisPoints: toAbvBasisPoints(input.abv),
        updatedByUserId: actor.id,
        now: nowIso(this.now())
      });
      if (!updated) throw new AuthServiceError(404, "MENU_ITEM_NOT_FOUND", "메뉴를 찾을 수 없습니다.");
      const now = nowIso(this.now());
      if (input.prices !== undefined) {
        await this.repository.replaceMenuItemPrices(barId, menuItemId, this.toPriceInputs(input.prices), actor.id, now);
      }
      if (nextDetails) {
        await this.repository.upsertMenuItemDetails({
          barId,
          menuItemId,
          template: itemType.template,
          details: nextDetails,
          updatedByUserId: actor.id,
          now
        });
      } else if (input.details === null || templateChanged) {
        await this.repository.deleteMenuItemDetails(barId, menuItemId);
      }
      return this.readResponse(access, updated.id);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async deleteMenuItem(actor: AuthUserRecord, barId: string, menuItemId: string): Promise<{ deleted: true }> {
    await this.requireCanEditMenu(actor, barId);
    await this.requireMenuItem(barId, menuItemId);
    const deleted = await this.repository.deleteMenuItem(barId, menuItemId, actor.id, nowIso(this.now()));
    if (!deleted) throw new AuthServiceError(404, "MENU_ITEM_NOT_FOUND", "메뉴를 찾을 수 없습니다.");
    return { deleted: true };
  }

  async bulkUpdateMenuItems(
    actor: AuthUserRecord,
    barId: string,
    input: BulkUpdateMenuItemsRequest
  ): Promise<BulkUpdateMenuItemsResponse> {
    const access = await this.requireCanEditMenu(actor, barId);
    const uniqueIds = new Set(input.changes.map((change) => change.menuItemId));
    if (uniqueIds.size !== input.expectedCount) {
      throw new AuthServiceError(409, "BULK_IMPACT_MISMATCH", "선택된 메뉴 수와 영향 건수가 일치하지 않습니다.", {}, {
        expectedCount: input.expectedCount,
        actualCount: uniqueIds.size
      });
    }
    const badgeCatalog = await this.readBadgeCatalog(barId);
    const repositoryChanges: MenuItemListChangeInput[] = [];
    for (const change of input.changes) {
      const current = await this.requireMenuItem(barId, change.menuItemId);
      const categoryId = change.categoryId ?? current.categoryId;
      if (change.categoryId) await this.requireLeafCategory(barId, change.categoryId);
      repositoryChanges.push({
        menuItemId: current.id,
        categoryId,
        saleStatus: change.saleStatus ?? current.saleStatus,
        isVisible: change.isVisible ?? current.isVisible,
        sortOrder: change.sortOrder,
        badges: change.badges ? this.toBadgeInputs(change.badges, badgeCatalog.options) : undefined
      });
    }
    try {
      await this.repository.applyMenuItemListChanges(barId, repositoryChanges, actor.id, nowIso(this.now()));
    } catch (error) {
      throw mapRepositoryError(error);
    }
    const data = await this.readResponse(access);
    return bulkUpdateMenuItemsResponseSchema.parse({
      ...data,
      bulk: { impactCount: repositoryChanges.length }
    });
  }

  private async readResponse(access: BarAccess): Promise<MenuItemsResponse>;
  private async readResponse(access: BarAccess, selectedItemId: undefined, query: MenuItemListQuery): Promise<MenuItemsResponse>;
  private async readResponse(access: BarAccess, selectedItemId: string): Promise<MenuItemDetailResponse>;
  private async readResponse(
    access: BarAccess,
    selectedItemId?: string,
    query: MenuItemListQuery = {}
  ): Promise<MenuItemsResponse | MenuItemDetailResponse> {
    const [categories, itemTypes, items, badgeCatalog] = await Promise.all([
      this.categoryRepository.listCategories(access.bar.id),
      this.readItemTypeOptions(access.bar.id),
      this.repository.listMenuItems(access.bar.id),
      this.readBadgeCatalog(access.bar.id)
    ]);
    const categoryOptions = toCategoryOptions(categories);
    const categoryPathById = new Map(categoryOptions.map((category) => [category.id, category.path]));
    const sortedItems = items.sort(
      (left, right) =>
        (categoryPathById.get(left.categoryId) ?? "").localeCompare(categoryPathById.get(right.categoryId) ?? "", "ko") ||
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name, "ko")
    );
    const priceEntries = await Promise.all(
      sortedItems.map(async (item) => [item.id, await this.repository.listMenuItemPrices(access.bar.id, item.id)] as const)
    );
    const badgeEntries = await Promise.all(
      sortedItems.map(async (item) => [item.id, await this.repository.listMenuItemBadges(access.bar.id, item.id)] as const)
    );
    const pricesByItemId = new Map(priceEntries);
    const badgesByItemId = new Map(badgeEntries);
    const itemDtos = await Promise.all(
      sortedItems.map((item) =>
        this.toDto(
          item,
          categoryPathById,
          itemTypes,
          pricesByItemId.get(item.id) ?? [],
          badgesByItemId.get(item.id) ?? [],
          badgeCatalog.byKey
        )
      )
    );
    const filteredItemDtos = filterMenuItems(itemDtos, query);
    const base = {
      bar: { id: access.bar.id, name: access.bar.name },
      canEdit: access.canEdit,
      canEditInternalMemo: access.canEditInternalMemo,
      categories: categoryOptions,
      itemTypes,
      badgeOptions: badgeCatalog.options,
      items: filteredItemDtos
    };
    if (selectedItemId === undefined) return menuItemsResponseSchema.parse(base);
    const selectedRecord = sortedItems.find((item) => item.id === selectedItemId) ?? null;
    const selectedSummary = itemDtos.find((item) => item.id === selectedItemId) ?? null;
    const selectedDetails = selectedRecord ? await this.repository.findMenuItemDetails(access.bar.id, selectedRecord.id) : null;
    return menuItemDetailResponseSchema.parse({
      ...base,
      item:
        selectedRecord && selectedSummary
          ? ({
              ...selectedSummary,
              details: selectedDetails?.details ?? null,
              internalMemo: selectedRecord.internalMemo,
              canEditInternalMemo: access.canEditInternalMemo
            } satisfies MenuItemDetail)
          : null
    });
  }

  private async requireBarAccess(actor: AuthUserRecord, barId: string): Promise<BarAccess> {
    const bar = await this.barRepository.findBarById(barId);
    if (!bar) throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    if (actor.isSystemAdmin) return { bar, canEdit: true, canEditInternalMemo: true };
    const membership = await this.membershipRepository.findActiveMembershipForUser(barId, actor.id);
    if (!membership) throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    const rolePermissions = await this.membershipRepository.ensureDefaultRolePermissions(barId, nowIso(this.now()));
    const rolePermission = rolePermissions.find((permission) => permission.role === membership.role);
    return { bar, canEdit: Boolean(rolePermission?.canEditMenu), canEditInternalMemo: membership.role === "owner" };
  }

  private async requireCanEditMenu(actor: AuthUserRecord, barId: string): Promise<BarAccess> {
    const access = await this.requireBarAccess(actor, barId);
    if (!access.canEdit) {
      throw new AuthServiceError(403, "BAR_PERMISSION_REQUIRED", "이 바에서 메뉴를 편집할 권한이 없습니다.");
    }
    return access;
  }

  private async requireMenuItem(barId: string, menuItemId: string): Promise<MenuItemRecord> {
    const item = await this.repository.findMenuItemById(barId, menuItemId);
    if (!item) throw new AuthServiceError(404, "MENU_ITEM_NOT_FOUND", "메뉴를 찾을 수 없습니다.");
    return item;
  }

  private async requireLeafCategory(barId: string, categoryId: string): Promise<CategoryRecord> {
    const category = await this.categoryRepository.findCategoryById(barId, categoryId);
    if (!category) throw new AuthServiceError(404, "CATEGORY_NOT_FOUND", "카테고리를 찾을 수 없습니다.");
    if (category.childCount > 0) {
      throw new AuthServiceError(409, "MENU_CATEGORY_NOT_LEAF", "하위 카테고리가 있는 카테고리에는 메뉴를 직접 넣을 수 없습니다.");
    }
    return category;
  }

  private async resolveItemType(barId: string, selection: MenuItemTypeSelection | null): Promise<ItemTypeResolution> {
    if (!selection) return { systemItemTypeId: null, barItemTypeId: null, template: "general" };
    if (selection.source === "system") {
      const type = await this.itemTypeRepository.findSystemItemTypeById(selection.id);
      const override = (await this.itemTypeRepository.listBarItemTypeOverrides(barId)).find(
        (item) => item.systemItemTypeId === selection.id
      );
      if (!type || !type.isActive || override?.isHidden) {
        throw new AuthServiceError(409, "MENU_ITEM_TYPE_UNAVAILABLE", "사용할 수 없는 품목 유형입니다.");
      }
      return { systemItemTypeId: type.id, barItemTypeId: null, template: type.template };
    }
    const type = await this.itemTypeRepository.findBarItemTypeById(barId, selection.id);
    if (!type) throw new AuthServiceError(404, "ITEM_TYPE_NOT_FOUND", "품목 유형을 찾을 수 없습니다.");
    if (!type.isActive) throw new AuthServiceError(409, "MENU_ITEM_TYPE_UNAVAILABLE", "사용할 수 없는 품목 유형입니다.");
    return { systemItemTypeId: null, barItemTypeId: type.id, template: type.template };
  }

  private async readItemTypeOptions(barId: string): Promise<MenuItemTypeOption[]> {
    const [systemTypes, overrides, barTypes] = await Promise.all([
      this.itemTypeRepository.listSystemItemTypes(),
      this.itemTypeRepository.listBarItemTypeOverrides(barId),
      this.itemTypeRepository.listBarItemTypes(barId)
    ]);
    const overridesByTypeId = new Map(overrides.map((override) => [override.systemItemTypeId, override]));
    return [
      ...systemTypes
        .filter((type) => type.isActive && !overridesByTypeId.get(type.id)?.isHidden)
        .map((type) => toSystemTypeOption(type, overridesByTypeId.get(type.id))),
      ...barTypes.filter((type) => type.isActive).map(toBarTypeOption)
    ].sort((left, right) => left.name.localeCompare(right.name, "ko") || left.source.localeCompare(right.source));
  }

  private async toDto(
    item: MenuItemRecord,
    categoryPathById: Map<string, string>,
    itemTypeOptions: MenuItemTypeOption[],
    prices: MenuItemPriceRecord[],
    badges: MenuItemBadgeRecord[],
    badgeByKey: Map<string, MenuBadgeOption>
  ): Promise<MenuItem> {
    const updatedBy = item.updatedByUserId ? await this.authRepository.findUserById(item.updatedByUserId) : null;
    return {
      id: item.id,
      barId: item.barId,
      publicId: item.publicId,
      categoryId: item.categoryId,
      categoryPath: categoryPathById.get(item.categoryId) ?? "삭제된 카테고리",
      name: item.name,
      normalizedName: item.normalizedName,
      description: item.description,
      saleStatus: item.saleStatus,
      isVisible: item.isVisible,
      abv: item.abvBasisPoints === null ? null : item.abvBasisPoints / 100,
      itemType: await this.resolveStoredItemType(item, itemTypeOptions),
      prices: prices
        .sort((left, right) => left.displayOrder - right.displayOrder || left.label.localeCompare(right.label, "ko"))
        .map((price) => ({
          id: price.id,
          label: price.label,
          normalizedLabel: price.normalizedLabel,
          volumeText: price.volumeText,
          amountMinor: price.amountMinor,
          displayOrder: price.displayOrder
        })),
      badges: badges
        .sort((left, right) => left.displayOrder - right.displayOrder)
        .map((badge) => toAssignedBadgeDto(badge, badgeByKey)),
      sortOrder: item.sortOrder,
      updatedByUsername: updatedBy?.normalizedUsername ?? "알 수 없음",
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
  }

  private async resolveStoredItemType(
    item: MenuItemRecord,
    itemTypeOptions: MenuItemTypeOption[]
  ): Promise<MenuItemTypeOption | null> {
    if (item.systemItemTypeId) {
      const activeOption = itemTypeOptions.find((type) => type.source === "system" && type.id === item.systemItemTypeId);
      if (activeOption) return activeOption;
      const type = await this.itemTypeRepository.findSystemItemTypeById(item.systemItemTypeId);
      return type ? toSystemTypeOption(type) : null;
    }
    if (item.barItemTypeId) {
      const activeOption = itemTypeOptions.find((type) => type.source === "bar" && type.id === item.barItemTypeId);
      if (activeOption) return activeOption;
      const type = await this.itemTypeRepository.findBarItemTypeById(item.barId, item.barItemTypeId);
      return type ? toBarTypeOption(type) : null;
    }
    return null;
  }

  private toPriceInputs(prices: MenuItemPriceRequest[]): MenuItemPriceInput[] {
    const seen = new Set<string>();
    const ordered = prices
      .map((price, index) => ({
        ...price,
        inputIndex: index,
        requestedOrder: price.displayOrder ?? index
      }))
      .sort((left, right) => left.requestedOrder - right.requestedOrder || left.inputIndex - right.inputIndex);
    return ordered.map((price, index) => {
      const normalizedLabel = normalizeMenuPriceLabel(price.label);
      if (seen.has(normalizedLabel)) {
        throw new AuthServiceError(409, "MENU_PRICE_LABEL_EXISTS", "같은 메뉴 안에 같은 가격 라벨이 이미 있습니다.");
      }
      seen.add(normalizedLabel);
      return {
        id: price.id ?? crypto.randomUUID(),
        label: price.label,
        normalizedLabel,
        volumeText: price.volumeText ?? "",
        amountMinor: price.amountMinor,
        displayOrder: index
      };
    });
  }

  private toBadgeInputs(badges: MenuBadgeSelection[], options: MenuBadgeOption[]): MenuItemBadgeInput[] {
    const optionKeys = new Set(options.map((option) => `${option.source}:${option.id}`));
    return badges.map((badge, index) => {
      const key = `${badge.source}:${badge.id}`;
      if (!optionKeys.has(key)) {
        throw new AuthServiceError(409, "MENU_BADGE_UNAVAILABLE", "사용할 수 없는 배지입니다.");
      }
      return {
        assignmentId: crypto.randomUUID(),
        source: badge.source,
        id: badge.id,
        displayOrder: index
      };
    });
  }

  private async readBadgeCatalog(barId: string): Promise<{ options: MenuBadgeOption[]; byKey: Map<string, MenuBadgeOption> }> {
    if (!this.badgeRepository) return { options: [], byKey: new Map() };
    const [colors, systemBadges, visibility, barBadges] = await Promise.all([
      this.badgeRepository.listColors(),
      this.badgeRepository.listSystemBadges(),
      this.badgeRepository.listBarBadgeVisibility(barId),
      this.badgeRepository.listBarBadges(barId)
    ]);
    const byKey = new Map<string, MenuBadgeOption>();
    const options: MenuBadgeOption[] = [];
    for (const badge of systemBadges.filter((item) => item.isActive)) {
      const option = toSystemBadgeOption(badge, colors);
      byKey.set(`system:${badge.id}`, option);
      if (!isSystemBadgeHidden(visibility, badge.id) && option.color.isActive) options.push(option);
    }
    for (const badge of barBadges.filter((item) => item.isActive)) {
      const option = toBarBadgeOption(badge, colors);
      byKey.set(`bar:${badge.id}`, option);
      if (option.color.isActive) options.push(option);
    }
    return {
      options: options.sort((left, right) => left.name.localeCompare(right.name, "ko") || left.source.localeCompare(right.source)),
      byKey
    };
  }
}

function toCategoryOptions(categories: CategoryRecord[]): MenuCategoryOption[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  return categories
    .map((category) => ({
      id: category.id,
      parentId: category.parentId,
      name: category.name,
      path: categoryPath(category, byId),
      isLeaf: category.childCount === 0,
      isVisible: category.isVisible
    }))
    .sort((left, right) => left.path.localeCompare(right.path, "ko"));
}

function categoryPath(category: CategoryRecord, byId: Map<string, CategoryRecord>): string {
  if (!category.parentId) return category.name;
  const parent = byId.get(category.parentId);
  return parent ? `${parent.name} / ${category.name}` : category.name;
}

function toSystemTypeOption(type: ItemTypeRecord, override?: BarItemTypeOverrideRecord): MenuItemTypeOption {
  return {
    source: "system",
    id: type.id,
    name: type.name,
    template: type.template,
    defaultPriceLabels: [...(override?.defaultPriceLabels ?? type.defaultPriceLabels)]
  };
}

function toBarTypeOption(type: BarItemTypeRecord): MenuItemTypeOption {
  return {
    source: "bar",
    id: type.id,
    name: type.name,
    template: type.template,
    defaultPriceLabels: [...type.defaultPriceLabels]
  };
}

function toAbvBasisPoints(abv: number | null): number | null {
  return abv === null ? null : Math.round(abv * 100);
}

function parseDetailsForTemplate(details: MenuItemDetails, template: ItemTemplate): MenuItemDetails {
  const parsed = menuItemDetailsSchema.parse(details);
  if (parsed.template !== template) {
    throw new AuthServiceError(400, "DETAIL_TEMPLATE_MISMATCH", "선택한 품목 유형과 상세 템플릿이 일치하지 않습니다.");
  }
  return parsed;
}

function detailsHasContent(details: MenuItemDetails): boolean {
  return Object.entries(details).some(([key, value]) => {
    if (key === "template") return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "boolean") return value;
    return value !== null && value !== undefined;
  });
}

function filterMenuItems(items: MenuItem[], query: MenuItemListQuery): MenuItem[] {
  const normalizedQuery = query.q?.trim().toLowerCase() ?? "";
  return items.filter((item) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.description.toLowerCase().includes(normalizedQuery) ||
      item.categoryPath.toLowerCase().includes(normalizedQuery) ||
      item.itemType?.name.toLowerCase().includes(normalizedQuery) ||
      item.prices.some((price) => price.label.toLowerCase().includes(normalizedQuery) || price.volumeText.toLowerCase().includes(normalizedQuery)) ||
      item.badges.some((badge) => badge.name.toLowerCase().includes(normalizedQuery));
    const matchesCategory = !query.categoryId || item.categoryId === query.categoryId;
    const matchesItemType =
      !query.itemTypeId ||
      (item.itemType?.id === query.itemTypeId && (!query.itemTypeSource || item.itemType.source === query.itemTypeSource));
    const matchesSaleStatus = !query.saleStatus || query.saleStatus === "all" || item.saleStatus === query.saleStatus;
    const matchesVisibility =
      !query.visibility || query.visibility === "all" || (query.visibility === "visible" ? item.isVisible : !item.isVisible);
    const matchesBadge =
      (!query.badgeId && !query.badgeSource) ||
      item.badges.some(
        (badge) =>
          (!query.badgeId || badge.id === query.badgeId) &&
          (!query.badgeSource || badge.source === query.badgeSource)
      );
    return matchesQuery && matchesCategory && matchesItemType && matchesSaleStatus && matchesVisibility && matchesBadge;
  });
}

function toAssignedBadgeDto(badge: MenuItemBadgeRecord, badgeByKey: Map<string, MenuBadgeOption>): MenuItemBadge {
  const option = badgeByKey.get(`${badge.source}:${badge.badgeId}`) ?? missingBadgeOption(badge.source, badge.badgeId);
  return {
    ...option,
    displayOrder: badge.displayOrder
  };
}

function toSystemBadgeOption(badge: SystemBadgeRecord, colors: BadgeColorRecord[]): MenuBadgeOption {
  return {
    source: "system",
    id: badge.id,
    name: badge.name,
    color: toBadgeColorSummary(colors.find((color) => color.id === badge.colorId))
  };
}

function toBarBadgeOption(badge: BarBadgeRecord, colors: BadgeColorRecord[]): MenuBadgeOption {
  return {
    source: "bar",
    id: badge.id,
    name: badge.name,
    color: toBadgeColorSummary(colors.find((color) => color.id === badge.colorId))
  };
}

function isSystemBadgeHidden(visibility: BarBadgeVisibilityRecord[], systemBadgeId: string): boolean {
  return visibility.some((item) => item.systemBadgeId === systemBadgeId && item.isHidden);
}

function toBadgeColorSummary(color?: BadgeColorRecord): BadgeColorSummary {
  if (!color) {
    return {
      id: "badge-color-missing",
      name: "Unknown",
      backgroundHex: "#666666",
      textColor: "#FFFFFF",
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

function missingBadgeOption(source: MenuBadgeSelection["source"], id: string): MenuBadgeOption {
  return {
    source,
    id,
    name: "사용할 수 없는 배지",
    color: toBadgeColorSummary()
  };
}

function mapRepositoryError(error: unknown): AuthServiceError {
  if (error instanceof AuthServiceError) return error;
  if (error instanceof Error && error.message === "MENU_NAME_EXISTS") {
    return new AuthServiceError(409, "MENU_NAME_EXISTS", "같은 바에 같은 이름의 메뉴가 이미 있습니다.");
  }
  if (error instanceof Error && error.message === "MENU_PRICE_LABEL_EXISTS") {
    return new AuthServiceError(409, "MENU_PRICE_LABEL_EXISTS", "같은 메뉴 안에 같은 가격 라벨이 이미 있습니다.");
  }
  if (error instanceof Error && error.message === "MENU_BADGE_CONFLICT") {
    return new AuthServiceError(409, "MENU_BADGE_CONFLICT", "배지 지정 수 또는 순서가 올바르지 않습니다.");
  }
  throw error;
}
