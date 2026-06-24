import type { PublicCategorySection, PublicMenu, PublicMenuCategory, PublicMenuItem } from "./publicMenu";
import { DEFAULT_PUBLIC_MENU_CONCEPT, flattenPublicCategorySections, publicMenuConceptOptions } from "./publicMenu";

type PublicMenuRendererProps = {
  menu: PublicMenu;
  selectedCategoryId?: string | null;
  selectedItemId?: string | null;
  expandedItemId?: string | null;
  showHero?: boolean;
  onSelectCategory?: (categoryId: string) => void;
  onSelectItem?: (itemId: string) => void;
  onToggleItem?: (itemId: string) => void;
};

type MenuRenderProps = PublicMenuRendererProps & {
  activeItemId: string | null;
  sections: PublicCategorySection[];
};

export function PublicMenuRenderer(props: PublicMenuRendererProps) {
  const sections = flattenPublicCategorySections(props.menu.categories);
  const activeItemId = props.expandedItemId ?? props.selectedItemId ?? null;
  const requestedConcept = props.menu.layout?.concept ?? DEFAULT_PUBLIC_MENU_CONCEPT;
  const concept = publicMenuConceptOptions.some((option) => option.id === requestedConcept)
    ? requestedConcept
    : DEFAULT_PUBLIC_MENU_CONCEPT;
  const sharedProps: MenuRenderProps = { ...props, activeItemId, sections };

  if (concept === "speed_list") return <SpeedListMenu {...sharedProps} />;
  if (concept === "curation") return <CurationMenu {...sharedProps} />;
  if (concept === "menu_book") return <MenuBookMenu {...sharedProps} />;
  return <ClassicRailMenu {...sharedProps} />;
}

function ClassicRailMenu({
  menu,
  selectedCategoryId = null,
  selectedItemId = null,
  activeItemId,
  sections,
  showHero = true,
  onSelectCategory,
  onSelectItem,
  onToggleItem
}: MenuRenderProps) {
  const visibleSections = selectedCategoryId ? sections.filter((section) => section.id === selectedCategoryId) : sections;

  return (
    <div className="public-menu-renderer" data-concept="classic_rail" data-menu-status={menu.status}>
      {showHero ? <PublicMenuHero menu={menu} eyebrow="Bar Menu" /> : null}
      <PreparingNotice menu={menu} />
      <div className="public-menu-layout">
        <nav className="public-category-rail" aria-label="카테고리">
          <button
            type="button"
            className={selectedCategoryId ? "public-category-button" : "public-category-button is-active"}
            onClick={() => onSelectCategory?.("")}
          >
            전체
          </button>
          {sections.map((section) => (
            <button
              type="button"
              className={section.id === selectedCategoryId ? "public-category-button is-active" : "public-category-button"}
              key={section.id}
              onClick={() => onSelectCategory?.(section.id)}
            >
              {section.path}
            </button>
          ))}
        </nav>

        <div className="public-menu-sections">
          {visibleSections.length === 0 ? (
            <EmptyMenuSection />
          ) : (
            visibleSections.map((section) => (
              <section className="public-menu-section" key={section.id} aria-labelledby={`public-category-${section.id}`}>
                <SectionHeading section={section} />
                {section.items.length === 0 ? (
                  <p className="public-empty">등록된 메뉴가 없습니다</p>
                ) : (
                  <div className="public-menu-card-grid">
                    {section.items.map((item) => (
                      <MenuCard
                        isExpanded={item.id === activeItemId}
                        isSelected={item.id === selectedItemId || item.id === activeItemId}
                        item={item}
                        key={item.id}
                        onSelectItem={onSelectItem}
                        onToggleItem={onToggleItem}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SpeedListMenu({
  menu,
  selectedCategoryId = null,
  selectedItemId = null,
  activeItemId,
  sections,
  showHero = true,
  onSelectCategory,
  onSelectItem,
  onToggleItem
}: MenuRenderProps) {
  const visibleSections = selectedCategoryId ? sections.filter((section) => section.id === selectedCategoryId) : sections;

  return (
    <div className="public-menu-renderer" data-concept="speed_list" data-menu-status={menu.status}>
      {showHero ? <PublicMenuHero menu={menu} eyebrow="Quick Menu" /> : null}
      <PreparingNotice menu={menu} />
      <nav className="speed-category-row" aria-label="카테고리">
        <button
          type="button"
          className={selectedCategoryId ? "speed-chip" : "speed-chip is-active"}
          onClick={() => onSelectCategory?.("")}
        >
          전체
        </button>
        {sections.map((section) => (
          <button
            type="button"
            className={section.id === selectedCategoryId ? "speed-chip is-active" : "speed-chip"}
            key={section.id}
            onClick={() => onSelectCategory?.(section.id)}
          >
            {section.name}
          </button>
        ))}
      </nav>
      <div className="speed-menu-list">
        {visibleSections.length === 0 ? (
          <EmptyMenuSection />
        ) : (
          visibleSections.map((section) => (
            <section className="speed-section" key={section.id} aria-labelledby={`speed-category-${section.id}`}>
              <div className="speed-section-heading">
                <h3 id={`speed-category-${section.id}`}>{section.path}</h3>
                <span>{section.items.length}개</span>
              </div>
              {section.items.length === 0 ? (
                <p className="public-empty">등록된 메뉴가 없습니다</p>
              ) : (
                section.items.map((item) => (
                  <DenseMenuRow
                    isExpanded={item.id === activeItemId}
                    isSelected={item.id === selectedItemId || item.id === activeItemId}
                    item={item}
                    key={item.id}
                    onSelectItem={onSelectItem}
                    onToggleItem={onToggleItem}
                  />
                ))
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function CurationMenu({
  menu,
  selectedCategoryId = null,
  selectedItemId = null,
  activeItemId,
  sections,
  showHero = true,
  onSelectCategory,
  onSelectItem,
  onToggleItem
}: MenuRenderProps) {
  const visibleSections = selectedCategoryId ? sections.filter((section) => section.id === selectedCategoryId) : sections;
  const items = visibleSections.flatMap((section) => section.items.map((item) => ({ item, section })));
  const featured = items.find(({ item }) => !item.soldOut) ?? items[0] ?? null;
  const notes = items.filter(({ item }) => item.id !== featured?.item.id).slice(0, 6);

  return (
    <div className="public-menu-renderer" data-concept="curation" data-menu-status={menu.status}>
      {showHero ? <PublicMenuHero menu={menu} eyebrow="Tonight's Picks" /> : null}
      <PreparingNotice menu={menu} />
      <div className="curation-menu-grid">
        <aside className="curation-pick-panel" aria-label="추천 카테고리">
          <strong>추천 코스</strong>
          <button
            type="button"
            className={selectedCategoryId ? "" : "is-active"}
            onClick={() => onSelectCategory?.("")}
          >
            전체 추천
          </button>
          {sections.map((section) => (
            <button
              type="button"
              className={section.id === selectedCategoryId ? "is-active" : ""}
              key={section.id}
              onClick={() => onSelectCategory?.(section.id)}
            >
              {section.name}
            </button>
          ))}
        </aside>
        <section className="curation-stage" aria-label="추천 메뉴">
          {featured ? (
            <>
              <article className="curation-feature" data-sold-out={featured.item.soldOut}>
                <span>{featured.section.path}</span>
                <h3>{featured.item.name}</h3>
                {featured.item.description ? <p>{featured.item.description}</p> : null}
                <b>{primaryPriceText(featured.item)}</b>
                <button type="button" onClick={() => onToggleItem?.(featured.item.id)}>
                  {featured.item.id === activeItemId ? "상세 접기" : "상세 보기"}
                </button>
                <ItemDetails item={featured.item} isExpanded={featured.item.id === activeItemId} />
              </article>
              <div className="curation-note-list">
                {notes.map(({ item, section }) => (
                  <button
                    type="button"
                    className="curation-note"
                    data-selected={item.id === selectedItemId || item.id === activeItemId}
                    key={item.id}
                    onClick={() => {
                      onSelectItem?.(item.id);
                      onToggleItem?.(item.id);
                    }}
                  >
                    <strong>{item.name}</strong>
                    <span>{section.name} · {primaryPriceText(item)}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <EmptyMenuSection />
          )}
        </section>
      </div>
    </div>
  );
}

function MenuBookMenu({
  menu,
  selectedCategoryId = null,
  selectedItemId = null,
  activeItemId,
  showHero = true,
  onSelectCategory,
  onSelectItem,
  onToggleItem
}: MenuRenderProps) {
  const topCategories = menu.categories.filter((category) => countItems(category) > 0 || category.children.length === 0);
  const selectedCategory = selectedCategoryId ? findCategory(topCategories, selectedCategoryId) : null;
  const categoriesToRender = selectedCategory ? [selectedCategory] : topCategories;
  const totalItems = categoriesToRender.reduce((sum, category) => sum + countItems(category), 0);

  return (
    <div className="public-menu-renderer" data-concept="menu_book" data-menu-status={menu.status}>
      {showHero ? <BookMenuHero menu={menu} /> : null}
      <PreparingNotice menu={menu} />
      <nav className="book-category-select" aria-label="카테고리 선택">
        {topCategories.map((category) => (
          <button
            className={category.id === selectedCategory?.id ? "is-active" : ""}
            key={category.id}
            type="button"
            onClick={() => onSelectCategory?.(category.id)}
          >
            <span>{category.name}</span>
          </button>
        ))}
      </nav>
      <section className="book-category-page" aria-label="선택한 카테고리 메뉴">
        <div className="book-section-head">
          <div>
            <span>{selectedCategory ? "Selected Category" : "Search Result"}</span>
            <h2>{selectedCategory?.name ?? "검색 결과"}</h2>
          </div>
          <small>전체 {totalItems}개</small>
        </div>
        <div className="book-menu-grid">
          {categoriesToRender.length === 0 ? (
            <EmptyMenuSection />
          ) : (
            categoriesToRender.flatMap((category) =>
              bookGroupsForCategory(category).map((group) => (
                <BookGroup
                  activeItemId={activeItemId}
                  group={group}
                  key={group.id}
                  onSelectItem={onSelectItem}
                  onToggleItem={onToggleItem}
                  selectedItemId={selectedItemId}
                />
              ))
            )
          )}
        </div>
      </section>
    </div>
  );
}

function BookMenuHero({ menu }: { menu: PublicMenu }) {
  return (
    <header className="book-preview-hero">
      <p>THE BAR SELECTION</p>
      <h2>{menu.bar.name}</h2>
      {menu.bar.intro ? <small>{menu.bar.intro}</small> : null}
    </header>
  );
}

function BookGroup({
  group,
  selectedItemId,
  activeItemId,
  onSelectItem,
  onToggleItem
}: {
  group: { id: string; name: string; description?: string; items: PublicMenuItem[] };
  selectedItemId: string | null;
  activeItemId: string | null;
  onSelectItem?: (itemId: string) => void;
  onToggleItem?: (itemId: string) => void;
}) {
  return (
    <>
      <div className="book-subcategory">
        <span>{group.name}</span>
        {group.description ? <small>{group.description}</small> : null}
      </div>
      {group.items.length === 0 ? (
        <p className="public-empty book-empty">등록된 메뉴가 없습니다</p>
      ) : (
        group.items.map((item) => (
          <article
            className="book-menu-row"
            data-expanded={item.id === activeItemId}
            data-selected={item.id === selectedItemId || item.id === activeItemId}
            data-sold-out={item.soldOut}
            key={item.id}
          >
            <button
              aria-label={`${item.name} 상세 보기`}
              className="book-menu-row-main"
              type="button"
              onClick={() => {
                onSelectItem?.(item.id);
                onToggleItem?.(item.id);
              }}
            >
              <span>
                <strong>{item.name}</strong>
                {item.description ? <small>{item.description}</small> : null}
              </span>
              <b>{primaryPriceText(item, false)}</b>
            </button>
          </article>
        ))
      )}
    </>
  );
}

function PublicMenuHero({ menu, eyebrow }: { menu: PublicMenu; eyebrow: string }) {
  return (
    <header className="public-menu-hero">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{menu.bar.name}</h2>
        <p>{menu.bar.intro ?? "현재 공개된 메뉴를 확인하세요."}</p>
      </div>
      <div className="public-menu-meta" aria-label="바 공개 정보">
        {menu.bar.address ? <span>{menu.bar.address}</span> : null}
        {menu.bar.phoneNumberDisplay ? <span>{menu.bar.phoneNumberDisplay}</span> : null}
        {menu.bar.openingNote ? <span>{menu.bar.openingNote}</span> : null}
        {menu.bar.links.map((link) => (
          <a href={link.url} key={link.url} target="_blank" rel="noreferrer">
            {link.label}
          </a>
        ))}
      </div>
    </header>
  );
}

function PreparingNotice({ menu }: { menu: PublicMenu }) {
  if (menu.status !== "preparing") return null;
  return (
    <div className="public-menu-notice" role="status">
      첫 공개 전 준비 중인 메뉴판입니다.
    </div>
  );
}

function SectionHeading({ section }: { section: PublicCategorySection }) {
  return (
    <div className="public-section-heading">
      <div>
        <h3 id={`public-category-${section.id}`}>{section.path}</h3>
        {section.description ? <p>{section.description}</p> : null}
      </div>
      <span>{section.items.length}개</span>
    </div>
  );
}

function EmptyMenuSection() {
  return (
    <section className="public-menu-section" role="status">
      <h3>검색 결과 없음</h3>
      <p>조건에 맞는 공개 메뉴가 없습니다.</p>
    </section>
  );
}

function MenuCard({
  item,
  isExpanded,
  isSelected,
  onSelectItem,
  onToggleItem
}: {
  item: PublicMenuItem;
  isExpanded: boolean;
  isSelected: boolean;
  onSelectItem?: (itemId: string) => void;
  onToggleItem?: (itemId: string) => void;
}) {
  return (
    <article className="public-menu-card" data-sold-out={item.soldOut} data-selected={isSelected} data-expanded={isExpanded}>
      <button
        type="button"
        className="public-menu-card-main"
        aria-expanded={item.fields.length > 0 ? isExpanded : undefined}
        onClick={() => {
          onSelectItem?.(item.id);
          onToggleItem?.(item.id);
        }}
      >
        <span>
          <strong>{item.name}</strong>
          {item.description ? <small>{item.description}</small> : null}
          {item.fields.length > 0 ? <small className="public-detail-hint">{isExpanded ? "상세 접기" : "상세 보기"}</small> : null}
        </span>
        {item.soldOut ? <b>품절</b> : null}
      </button>
      <div className="public-menu-card-detail">
        <ItemMeta item={item} />
        <ItemFieldList item={item} isExpanded={isExpanded} />
      </div>
    </article>
  );
}

function DenseMenuRow({
  item,
  isExpanded,
  isSelected,
  onSelectItem,
  onToggleItem
}: {
  item: PublicMenuItem;
  isExpanded: boolean;
  isSelected: boolean;
  onSelectItem?: (itemId: string) => void;
  onToggleItem?: (itemId: string) => void;
}) {
  return (
    <article className="speed-menu-row" data-expanded={isExpanded} data-selected={isSelected} data-sold-out={item.soldOut}>
      <button
        type="button"
        onClick={() => {
          onSelectItem?.(item.id);
          onToggleItem?.(item.id);
        }}
      >
        <span>
          <strong>{item.name}</strong>
          {item.description ? <small>{item.description}</small> : null}
        </span>
        <b>{primaryPriceText(item)}</b>
      </button>
      <ItemDetails item={item} isExpanded={isExpanded} />
    </article>
  );
}

function ItemMeta({ item }: { item: PublicMenuItem }) {
  return (
    <>
      {item.abv !== null ? <span className="public-menu-pill">{formatAbv(item.abv)}% ABV</span> : null}
      {item.soldOut ? (
        <p className="public-soldout-note">품절 메뉴는 가격, 용량, 배지를 공개하지 않습니다.</p>
      ) : (
        <>
          {item.prices.length > 0 ? (
            <div className="public-price-list" aria-label={`${item.name} 가격`}>
              {item.prices.map((price) => (
                <div className="public-price-row" key={`${item.id}-${price.label}`}>
                  <span>
                    {price.label}
                    {price.volumeText ? ` · ${price.volumeText}` : ""}
                  </span>
                  <strong>{formatAmount(price.amountMinor)} {price.currency}</strong>
                </div>
              ))}
            </div>
          ) : null}
          {item.badges.length > 0 ? (
            <div className="public-badge-row" aria-label={`${item.name} 배지`}>
              {item.badges.map((badge) => (
                <span key={`${item.id}-${badge.label}`} style={{ backgroundColor: badge.backgroundHex, color: badge.textColor }}>
                  {badge.label}
                </span>
              ))}
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

function ItemDetails({ item, isExpanded }: { item: PublicMenuItem; isExpanded: boolean }) {
  if (item.fields.length === 0 && item.abv === null && item.badges.length === 0) return null;
  return (
    <div className="public-item-extra" hidden={!isExpanded}>
      <ItemMeta item={item} />
      <ItemFieldList item={item} isExpanded />
    </div>
  );
}

function ItemFieldList({ item, isExpanded }: { item: PublicMenuItem; isExpanded: boolean }) {
  if (item.fields.length === 0) return null;
  return (
    <dl className="public-field-list" hidden={!isExpanded}>
      {item.fields.map((field) => (
        <div key={`${item.id}-${field.label}`}>
          <dt>{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function bookGroupsForCategory(category: PublicMenuCategory): Array<{
  id: string;
  name: string;
  description?: string;
  items: PublicMenuItem[];
}> {
  const groups: Array<{ id: string; name: string; description?: string; items: PublicMenuItem[] }> = [];
  if (category.items.length > 0 || category.children.length === 0) {
    groups.push({
      id: category.id,
      name: category.children.length > 0 ? "추천" : category.name,
      description: category.description,
      items: category.items
    });
  }
  category.children.forEach((child) => groups.push(...bookGroupsForCategory(child)));
  return groups;
}

function findCategory(categories: PublicMenuCategory[], categoryId: string): PublicMenuCategory | null {
  for (const category of categories) {
    if (category.id === categoryId) return category;
    const child = findCategory(category.children, categoryId);
    if (child) return child;
  }
  return null;
}

function countItems(category: PublicMenuCategory): number {
  return category.items.length + category.children.reduce((sum, child) => sum + countItems(child), 0);
}

function primaryPriceText(item: PublicMenuItem, includeCurrency = true): string {
  if (item.soldOut) return "품절";
  const price = item.prices[0];
  if (!price) return "시가";
  return includeCurrency ? `${formatAmount(price.amountMinor)} ${price.currency}` : formatAmount(price.amountMinor);
}

function formatAmount(value: number): string {
  return value.toLocaleString("ko-KR");
}

function formatAbv(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
