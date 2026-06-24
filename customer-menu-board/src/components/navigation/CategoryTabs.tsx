type CategoryTabsProps = {
  categories: Array<{ id: string; name: string }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function CategoryTabs({ categories, selectedId, onSelect }: CategoryTabsProps) {
  return (
    <div className="category-tabs" role="tablist" aria-label="카테고리">
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          role="tab"
          aria-selected={category.id === selectedId}
          onClick={() => onSelect(category.id)}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}
