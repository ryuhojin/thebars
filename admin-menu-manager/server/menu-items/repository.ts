import type { ItemTemplate } from "../../contracts/itemTypes";
import type { MenuBadgeSelection, MenuItemDetails, MenuSaleStatus } from "../../contracts/menuItems";

export type MenuItemRecord = {
  id: string;
  barId: string;
  publicId: string;
  categoryId: string;
  systemItemTypeId: string | null;
  barItemTypeId: string | null;
  name: string;
  normalizedName: string;
  description: string;
  internalMemo: string;
  saleStatus: MenuSaleStatus;
  isVisible: boolean;
  abvBasisPoints: number | null;
  sortOrder: number;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MenuItemInput = {
  id: string;
  barId: string;
  categoryId: string;
  systemItemTypeId: string | null;
  barItemTypeId: string | null;
  name: string;
  normalizedName: string;
  description: string;
  internalMemo: string;
  saleStatus: MenuSaleStatus;
  isVisible: boolean;
  abvBasisPoints: number | null;
  createdByUserId: string;
  updatedByUserId: string;
  now: string;
};

export type MenuItemUpdateInput = {
  categoryId: string;
  systemItemTypeId: string | null;
  barItemTypeId: string | null;
  name: string;
  normalizedName: string;
  description: string;
  internalMemo: string;
  saleStatus: MenuSaleStatus;
  isVisible: boolean;
  abvBasisPoints: number | null;
  updatedByUserId: string;
  now: string;
};

export type MenuItemPriceRecord = {
  id: string;
  barId: string;
  menuItemId: string;
  label: string;
  normalizedLabel: string;
  volumeText: string;
  amountMinor: number;
  displayOrder: number;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MenuItemPriceInput = {
  id: string;
  label: string;
  normalizedLabel: string;
  volumeText: string;
  amountMinor: number;
  displayOrder: number;
};

export type MenuItemDetailsRecord = {
  barId: string;
  menuItemId: string;
  template: ItemTemplate;
  schemaVersion: 1;
  details: MenuItemDetails;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MenuItemDetailsInput = {
  barId: string;
  menuItemId: string;
  template: ItemTemplate;
  details: MenuItemDetails;
  updatedByUserId: string;
  now: string;
};

export type MenuItemBadgeRecord = {
  id: string;
  barId: string;
  menuItemId: string;
  source: MenuBadgeSelection["source"];
  badgeId: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MenuItemBadgeInput = MenuBadgeSelection & {
  assignmentId: string;
  displayOrder: number;
};

export type MenuItemListChangeInput = {
  menuItemId: string;
  categoryId: string;
  saleStatus: MenuSaleStatus;
  isVisible: boolean;
  sortOrder?: number;
  badges?: MenuItemBadgeInput[];
};

export interface MenuItemRepository {
  listMenuItems(barId: string): Promise<MenuItemRecord[]>;
  findMenuItemById(barId: string, menuItemId: string): Promise<MenuItemRecord | null>;
  createMenuItem(input: MenuItemInput): Promise<MenuItemRecord>;
  updateMenuItem(barId: string, menuItemId: string, input: MenuItemUpdateInput): Promise<MenuItemRecord | null>;
  deleteMenuItem(barId: string, menuItemId: string, updatedByUserId: string, now: string): Promise<boolean>;
  listMenuItemPrices(barId: string, menuItemId: string): Promise<MenuItemPriceRecord[]>;
  replaceMenuItemPrices(
    barId: string,
    menuItemId: string,
    prices: MenuItemPriceInput[],
    updatedByUserId: string,
    now: string
  ): Promise<MenuItemPriceRecord[]>;
  findMenuItemDetails(barId: string, menuItemId: string): Promise<MenuItemDetailsRecord | null>;
  upsertMenuItemDetails(input: MenuItemDetailsInput): Promise<MenuItemDetailsRecord>;
  deleteMenuItemDetails(barId: string, menuItemId: string): Promise<void>;
  listMenuItemBadges(barId: string, menuItemId: string): Promise<MenuItemBadgeRecord[]>;
  replaceMenuItemBadges(
    barId: string,
    menuItemId: string,
    badges: MenuItemBadgeInput[],
    updatedByUserId: string,
    now: string
  ): Promise<MenuItemBadgeRecord[]>;
  applyMenuItemListChanges(
    barId: string,
    changes: MenuItemListChangeInput[],
    updatedByUserId: string,
    now: string
  ): Promise<void>;
}
