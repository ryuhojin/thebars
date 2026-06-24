import type { PublicMenu } from "../../../contracts/publicMenu";
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
  isInfoExpanded,
  onInfoExpandedChange,
  state,
  visibleMenu
}: CustomerLayoutProps) {
  const menu = state.status === "success" ? state.menu : null;

  return (
    <main className="customer-page" data-slug={encodedSlug}>
      <header className="customer-hero">
        <div className="customer-hero-copy">
          <p className="eyebrow">Bar Menu</p>
          <h1>{menu ? menu.bar.name : "메뉴판"}</h1>
          <p>{menu ? menu.bar.intro ?? "현재 공개된 메뉴를 확인하세요." : "공개 메뉴 데이터를 불러오는 중입니다."}</p>
        </div>
        <div className="customer-hero-actions">
          <span className="route-chip">/{encodedSlug}</span>
          {menu ? (
            <button
              type="button"
              className="customer-info-toggle"
              aria-controls="customer-bar-info"
              aria-expanded={isInfoExpanded}
              onClick={() => onInfoExpandedChange(!isInfoExpanded)}
            >
              바 정보
            </button>
          ) : null}
        </div>
        {menu ? <BarInfoPanel expanded={isInfoExpanded} menu={menu} /> : null}
      </header>

      {state.status === "success" ? (
        <>
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
    </main>
  );
}

function BarInfoPanel({ expanded, menu }: { expanded: boolean; menu: PublicMenu }) {
  const hours = menu.bar.businessHours.map(formatBusinessHour);

  return (
    <section className={expanded ? "customer-info-panel is-expanded" : "customer-info-panel"} id="customer-bar-info" aria-label="바 공개 정보">
      {menu.bar.address ? <span>{menu.bar.address}</span> : null}
      {menu.bar.phoneNumberDisplay ? <a href={`tel:${menu.bar.phoneNumberDisplay.replace(/[^0-9+]/g, "")}`}>{menu.bar.phoneNumberDisplay}</a> : null}
      {menu.bar.mapUrl ? (
        <a href={menu.bar.mapUrl} rel="noreferrer" target="_blank">
          지도
        </a>
      ) : null}
      {menu.bar.openingNote ? <span>{menu.bar.openingNote}</span> : null}
      {hours.map((hour) => (
        <span key={hour}>{hour}</span>
      ))}
      {menu.bar.links.map((link) => (
        <a href={link.url} key={link.url} rel="noreferrer" target="_blank">
          {link.label}
        </a>
      ))}
    </section>
  );
}

function StatePanel({ state }: { state: CustomerLoadState }) {
  if (state.status === "loading") {
    return <StateBox title="불러오는 중" message="메뉴 JSON을 확인하고 있습니다." tone="info" />;
  }
  if (state.status === "not-found") {
    return <StateBox title="메뉴판을 찾을 수 없습니다" message={state.message} tone="error" />;
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
