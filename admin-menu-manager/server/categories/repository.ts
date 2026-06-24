export type CategoryRecord = {
  id: string;
  barId: string;
  publicId: string;
  parentId: string | null;
  name: string;
  normalizedName: string;
  description: string;
  showDescription: boolean;
  isVisible: boolean;
  sortOrder: number;
  childCount: number;
  menuCount: number;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CategoryInput = {
  id: string;
  barId: string;
  parentId: string | null;
  name: string;
  normalizedName: string;
  description: string;
  showDescription: boolean;
  isVisible: boolean;
  createdByUserId: string;
  updatedByUserId: string;
  now: string;
};

export type CategoryUpdateInput = {
  name: string;
  normalizedName: string;
  description: string;
  showDescription: boolean;
  isVisible: boolean;
  updatedByUserId: string;
  now: string;
};

export type CategoryMoveInput = {
  barId: string;
  categoryId: string;
  parentId: string | null;
  sortOrder: number;
  updatedByUserId: string;
  now: string;
};

export interface CategoryRepository {
  listCategories(barId: string): Promise<CategoryRecord[]>;
  findCategoryById(barId: string, categoryId: string): Promise<CategoryRecord | null>;
  createCategory(input: CategoryInput): Promise<CategoryRecord>;
  updateCategory(barId: string, categoryId: string, input: CategoryUpdateInput): Promise<CategoryRecord | null>;
  moveCategory(input: CategoryMoveInput): Promise<CategoryRecord | null>;
  replaceSiblingOrder(barId: string, parentId: string | null, orderedIds: string[], updatedByUserId: string, now: string): Promise<void>;
  deleteCategories(barId: string, categoryIds: string[]): Promise<void>;
  countDirectMenuItems(barId: string, categoryId: string): Promise<number>;
}
