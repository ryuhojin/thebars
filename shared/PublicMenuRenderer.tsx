import type { PublicMenu, PublicMenuItem } from "./publicMenu";
import { flattenPublicCategorySections } from "./publicMenu";

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

export function PublicMenuRenderer({
  menu,
  selectedCategoryId = null,
  selectedItemId = null,
  expandedItemId,
  showHero = true,
  onSelectCategory,
  onSelectItem,
  onToggleItem
}: PublicMenuRendererProps) {
  const sections = flattenPublicCategorySections(menu.categories);
  const visibleSections = selectedCategoryId ? sections.filter((section) => section.id === selectedCategoryId) : sections;
  const activeItemId = expandedItemId ?? selectedItemId;

  return (
    <div className="public-menu-renderer" data-menu-status={menu.status}>
      {showHero ? (
        <header className="public-menu-hero">
          <div>
            <p className="eyebrow">Bar Menu</p>
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
      ) : null}

      {menu.status === "preparing" ? (
        <div className="public-menu-notice" role="status">
          첫 공개 전 준비 중인 메뉴판입니다.
        </div>
      ) : null}

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
            <section className="public-menu-section" role="status">
              <h3>검색 결과 없음</h3>
              <p>조건에 맞는 공개 메뉴가 없습니다.</p>
            </section>
          ) : (
            visibleSections.map((section) => (
              <section className="public-menu-section" key={section.id} aria-labelledby={`public-category-${section.id}`}>
                <div className="public-section-heading">
                  <div>
                    <h3 id={`public-category-${section.id}`}>{section.path}</h3>
                    {section.description ? <p>{section.description}</p> : null}
                  </div>
                  <span>{section.items.length}개</span>
                </div>
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
  const hasExpandableDetail = item.fields.length > 0;
  const handleClick = () => {
    onSelectItem?.(item.id);
    onToggleItem?.(item.id);
  };

  return (
    <article className="public-menu-card" data-sold-out={item.soldOut} data-selected={isSelected} data-expanded={isExpanded}>
      <button
        type="button"
        className="public-menu-card-main"
        aria-expanded={hasExpandableDetail ? isExpanded : undefined}
        onClick={handleClick}
      >
        <span>
          <strong>{item.name}</strong>
          {item.description ? <small>{item.description}</small> : null}
          {hasExpandableDetail ? <small className="public-detail-hint">{isExpanded ? "상세 접기" : "상세 보기"}</small> : null}
        </span>
        {item.soldOut ? <b>품절</b> : null}
      </button>
      <div className="public-menu-card-detail">
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
                    <strong>{price.amountMinor.toLocaleString("ko-KR")} {price.currency}</strong>
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
        {item.fields.length > 0 ? (
          <dl className="public-field-list" hidden={!isExpanded}>
            {item.fields.map((field) => (
              <div key={`${item.id}-${field.label}`}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </article>
  );
}

function formatAbv(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
