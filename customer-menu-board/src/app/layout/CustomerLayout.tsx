import { useEffect } from "react";
import {
  DEFAULT_PUBLIC_MENU_CONCEPT,
  publicMenuConceptOptions,
  type PublicMenu,
  type PublicMenuConcept,
  type PublicMenuItem
} from "../../../contracts/publicMenu";
import { PublicMenuRenderer } from "../../../../shared/PublicMenuRenderer";
import type { CustomerLoadState } from "../router/CustomerApp";

type CustomerLayoutProps = {
  encodedSlug: string;
  query: string;
  onQueryChange: (query: string) => void;
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string) => void;
  expandedItemId: string | null;
  onToggleItem: (itemId: string) => void;
  onCloseItemDetail: () => void;
  isInfoExpanded: boolean;
  onInfoExpandedChange: (isExpanded: boolean) => void;
  state: CustomerLoadState;
  visibleMenu: PublicMenu | null;
};

export function CustomerLayout({
  encodedSlug,
  query,
  onQueryChange,
  selectedCategory,
  onSelectCategory,
  expandedItemId,
  onToggleItem,
  onCloseItemDetail,
  isInfoExpanded,
  onInfoExpandedChange,
  state,
  visibleMenu
}: CustomerLayoutProps) {
  const menu = state.status === "success" ? state.menu : null;
  const concept = resolveAvailableConcept(menu?.layout.concept);
  const isMenuBook = concept === "menu_book";
  const selectedDetailItem = menu && expandedItemId ? findMenuItem(menu, expandedItemId) : null;

  return (
    <main className="customer-page" data-concept={concept} data-slug={encodedSlug}>
      <header className="customer-hero">
        <div className="customer-hero-copy">
          <p className="eyebrow">{isMenuBook ? "THE BAR SELECTION" : "THE BAR MENU"}</p>
          <h1>{menu ? menu.bar.name : "메뉴판"}</h1>
          <div className="customer-hero-subline">
            <p>{menu ? menu.bar.intro ?? "현재 공개된 메뉴를 확인하세요." : "공개 메뉴 데이터를 불러오는 중입니다."}</p>
            {menu && isMenuBook ? (
              <HeroActions
                encodedSlug={encodedSlug}
                isInfoExpanded={isInfoExpanded}
                isMenuBook={isMenuBook}
                onInfoExpandedChange={onInfoExpandedChange}
                onQueryChange={onQueryChange}
                query={query}
              />
            ) : null}
          </div>
        </div>
        {menu && !isMenuBook ? (
          <HeroActions
            encodedSlug={encodedSlug}
            isInfoExpanded={isInfoExpanded}
            isMenuBook={isMenuBook}
            onInfoExpandedChange={onInfoExpandedChange}
            onQueryChange={onQueryChange}
            query={query}
          />
        ) : null}
      </header>

      {state.status === "success" ? (
        <>
          {!isMenuBook ? (
            <section className="menu-toolbar" aria-label="메뉴 도구">
              <label className="search-field">
                <span>메뉴 검색</span>
                <input
                  aria-label="메뉴 검색"
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder="위스키, 칵테일, 배지, 상세"
                />
              </label>
            </section>
          ) : null}

          {visibleMenu ? (
            <PublicMenuRenderer
              expandedItemId={expandedItemId}
              menu={visibleMenu}
              onSelectCategory={onSelectCategory}
              onToggleItem={onToggleItem}
              selectedCategoryId={selectedCategory}
              showHero={false}
            />
          ) : null}
        </>
      ) : (
        <StatePanel state={state} />
      )}
      {menu && isInfoExpanded ? (
        <StoreInfoDialog menu={menu} onClose={() => onInfoExpandedChange(false)} />
      ) : null}
      {selectedDetailItem ? (
        <MenuItemDetailDialog item={selectedDetailItem} onClose={onCloseItemDetail} />
      ) : null}
    </main>
  );
}

function HeroActions({
  encodedSlug,
  isInfoExpanded,
  isMenuBook,
  onInfoExpandedChange,
  query,
  onQueryChange
}: {
  encodedSlug: string;
  isInfoExpanded: boolean;
  isMenuBook: boolean;
  onInfoExpandedChange: (isExpanded: boolean) => void;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  return (
    <div className="customer-hero-actions">
      {!isMenuBook ? <span className="route-chip">/{encodedSlug}</span> : null}
      {isMenuBook ? (
        <details className="customer-search-menu">
          <summary role="button"><span>검색</span></summary>
          <div className="customer-search-popover" role="dialog" aria-label="검색 팝업">
            <label className="search-field">
              <span>메뉴 검색</span>
              <input
                aria-label="메뉴 검색"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="메뉴 이름, 향, 배지"
              />
            </label>
          </div>
        </details>
      ) : null}
      <button
        type="button"
        className="customer-info-toggle"
        aria-controls="customer-store-info-dialog"
        aria-expanded={isInfoExpanded}
        aria-haspopup="dialog"
        onClick={() => onInfoExpandedChange(!isInfoExpanded)}
      >
        <span>{isMenuBook ? "매장 정보" : "바 정보"}</span>
      </button>
    </div>
  );
}

function StoreInfoDialog({ menu, onClose }: { menu: PublicMenu; onClose: () => void }) {
  const hours = menu.bar.businessHours.map(formatBusinessHour);

  useEscapeClose(onClose);

  return (
    <div className="customer-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        aria-labelledby="customer-store-info-title"
        aria-modal="true"
        className="customer-dialog customer-store-dialog"
        id="customer-store-info-dialog"
        role="dialog"
      >
        <header>
          <div>
            <p className="eyebrow">Store Information</p>
            <h2 id="customer-store-info-title">{menu.bar.name}</h2>
          </div>
          <button className="customer-dialog-close" type="button" onClick={onClose}>
            닫기
          </button>
        </header>
        {menu.bar.intro ? <p className="customer-dialog-lead">{menu.bar.intro}</p> : null}
        <dl className="customer-info-list">
          {menu.bar.address ? (
            <div>
              <dt>주소</dt>
              <dd>{menu.bar.address}</dd>
            </div>
          ) : null}
          {menu.bar.phoneNumberDisplay ? (
            <div>
              <dt>전화</dt>
              <dd><a href={`tel:${menu.bar.phoneNumberDisplay.replace(/[^0-9+]/g, "")}`}>{menu.bar.phoneNumberDisplay}</a></dd>
            </div>
          ) : null}
          {menu.bar.openingNote ? (
            <div>
              <dt>운영 안내</dt>
              <dd>{menu.bar.openingNote}</dd>
            </div>
          ) : null}
          {hours.length > 0 ? (
            <div>
              <dt>영업 시간</dt>
              <dd>{hours.join(" · ")}</dd>
            </div>
          ) : null}
        </dl>
        <div className="customer-dialog-actions">
          {menu.bar.mapUrl ? (
            <a className="customer-dialog-link" href={menu.bar.mapUrl} rel="noreferrer" target="_blank">
              지도 보기
            </a>
          ) : null}
          {menu.bar.links.map((link) => (
            <a className="customer-dialog-link" href={link.url} key={link.url} rel="noreferrer" target="_blank">
              {link.label}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

function MenuItemDetailDialog({ item, onClose }: { item: PublicMenuItem; onClose: () => void }) {
  const hasFields = item.fields.length > 0;

  useEscapeClose(onClose);

  return (
    <div className="customer-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        aria-labelledby={`customer-menu-detail-${item.id}`}
        aria-modal="true"
        className="customer-dialog customer-menu-detail-dialog"
        role="dialog"
      >
        <header>
          <div>
            <p className="eyebrow">Menu Detail</p>
            <h2 id={`customer-menu-detail-${item.id}`}>{item.name}</h2>
          </div>
          <button className="customer-dialog-close" type="button" onClick={onClose}>
            닫기
          </button>
        </header>
        {item.description ? <p className="customer-dialog-lead">{item.description}</p> : null}
        {item.soldOut ? (
          <p className="customer-soldout-detail">현재 품절된 메뉴입니다.</p>
        ) : (
          <>
            {item.prices.length > 0 ? (
              <div className="customer-detail-price-list" aria-label={`${item.name} 가격`}>
                {item.prices.map((price) => (
                  <div key={`${item.id}-${price.label}`}>
                    <span>{price.label}{price.volumeText ? ` · ${price.volumeText}` : ""}</span>
                    <strong>{formatAmount(price.amountMinor)} {price.currency}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="customer-soldout-detail">매장에서 가격을 확인해 주세요.</p>
            )}
            {item.badges.length > 0 ? (
              <div className="customer-detail-badges" aria-label={`${item.name} 배지`}>
                {item.badges.map((badge) => (
                  <span key={`${item.id}-${badge.label}`} style={{ backgroundColor: badge.backgroundHex, color: badge.textColor }}>
                    {badge.label}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        )}
        {item.abv !== null || hasFields ? (
          <dl className="customer-info-list customer-menu-detail-list">
            {item.abv !== null ? (
              <div>
                <dt>ABV</dt>
                <dd>{formatAbv(item.abv)}%</dd>
              </div>
            ) : null}
            {item.fields.map((field) => (
              <div key={`${item.id}-${field.label}`}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>
    </div>
  );
}

function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
}

function StatePanel({ state }: { state: CustomerLoadState }) {
  if (state.status === "loading") {
    return <StateBox title="불러오는 중" message="메뉴 JSON을 확인하고 있습니다." tone="info" />;
  }
  if (state.status === "lookup-required") {
    return <StateBox title="바를 조회해 주세요" message={state.message} tone="info" />;
  }
  if (state.status === "not-found") {
    return <StateBox title="해당 바는 없습니다" message={state.message} tone="error" />;
  }
  if (state.status === "schema-error") {
    return <StateBox title="메뉴 데이터를 표시할 수 없습니다" message={state.message} tone="error" />;
  }
  if (state.status === "error") {
    return <StateBox title="메뉴판 오류" message={state.message} tone="error" />;
  }
  return null;
}

function StateBox({ title, message, tone }: { title: string; message: string; tone: "info" | "error" }) {
  return (
    <section className={`state-panel ${tone}`} role={tone === "error" ? "alert" : "status"}>
      <h2>{title}</h2>
      <p>{message}</p>
    </section>
  );
}

function formatBusinessHour(hour: PublicMenu["bar"]["businessHours"][number]): string {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${days[hour.dayOfWeek]} ${hour.opensAt}-${hour.closesAt}`;
}

function resolveAvailableConcept(concept?: PublicMenuConcept): PublicMenuConcept {
  if (!concept) return DEFAULT_PUBLIC_MENU_CONCEPT;
  return publicMenuConceptOptions.some((option) => option.id === concept) ? concept : DEFAULT_PUBLIC_MENU_CONCEPT;
}

function findMenuItem(menu: PublicMenu, itemId: string): PublicMenuItem | null {
  const stack = [...menu.categories];
  while (stack.length > 0) {
    const category = stack.shift();
    if (!category) continue;
    const item = category.items.find((candidate) => candidate.id === itemId);
    if (item) return item;
    stack.push(...category.children);
  }
  return null;
}

function formatAmount(value: number): string {
  return value.toLocaleString("ko-KR");
}

function formatAbv(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
