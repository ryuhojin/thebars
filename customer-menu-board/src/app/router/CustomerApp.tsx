import { useEffect, useMemo, useState } from "react";
import { fetchPublicMenu, PublicMenuFetchError } from "../../lib/menuFetch";
import { searchMenu } from "../../menu/search/searchMenu";
import { CustomerLayout } from "../layout/CustomerLayout";
import { useEncodedSlug } from "./useEncodedSlug";
import { DEFAULT_PUBLIC_MENU_CONCEPT, publicMenuConceptOptions, type PublicMenu } from "../../../contracts/publicMenu";

const IDLE_RESET_MS = 5 * 60 * 1000;

export type CustomerLoadState =
  | { status: "loading" }
  | { status: "not-found"; message: string }
  | { status: "schema-error"; message: string }
  | { status: "error"; message: string }
  | { status: "success"; menu: PublicMenu };

export function CustomerApp() {
  const encodedSlug = useEncodedSlug();
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  const [state, setState] = useState<CustomerLoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    setQuery("");
    setSelectedCategory(null);
    setExpandedItemId(null);
    setIsInfoExpanded(false);
    fetchPublicMenu(encodedSlug)
      .then((menu) => {
        if (!cancelled) {
          setSelectedCategory(getInitialCategoryId(menu));
          setState({ status: "success", menu });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setState(loadErrorState(error));
      });
    return () => {
      cancelled = true;
    };
  }, [encodedSlug]);

  const firstSectionId = state.status === "success" ? getInitialCategoryId(state.menu) : null;

  useEffect(() => {
    if (state.status !== "success") return undefined;

    const resetUiState = () => {
      setQuery("");
      setSelectedCategory(firstSectionId);
      setExpandedItemId(null);
      setIsInfoExpanded(false);
    };

    let timer = window.setTimeout(resetUiState, IDLE_RESET_MS);
    const refreshTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(resetUiState, IDLE_RESET_MS);
    };

    window.addEventListener("pointerdown", refreshTimer);
    window.addEventListener("keydown", refreshTimer);
    window.addEventListener("scroll", refreshTimer, { passive: true });
    window.addEventListener("touchstart", refreshTimer, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", refreshTimer);
      window.removeEventListener("keydown", refreshTimer);
      window.removeEventListener("scroll", refreshTimer);
      window.removeEventListener("touchstart", refreshTimer);
    };
  }, [firstSectionId, state.status]);

  const visibleMenu = useMemo(() => {
    if (state.status !== "success") return null;
    return searchMenu(state.menu, query);
  }, [query, state]);

  const selectedCategoryForRender = query.trim() ? null : selectedCategory;

  return (
    <CustomerLayout
      encodedSlug={encodedSlug}
      expandedItemId={expandedItemId}
      isInfoExpanded={isInfoExpanded}
      onInfoExpandedChange={setIsInfoExpanded}
      onCloseItemDetail={() => setExpandedItemId(null)}
      onQueryChange={(nextQuery) => {
        setQuery(nextQuery);
        setExpandedItemId(null);
      }}
      onSelectCategory={(categoryId) => {
        setSelectedCategory(categoryId);
        setExpandedItemId(null);
      }}
      onToggleItem={(itemId) => setExpandedItemId((current) => (current === itemId ? null : itemId))}
      query={query}
      selectedCategory={selectedCategoryForRender}
      state={state}
      visibleMenu={visibleMenu}
    />
  );
}

function getInitialCategoryId(menu: PublicMenu): string | null {
  const activeConcept = publicMenuConceptOptions.some((option) => option.id === menu.layout.concept)
    ? menu.layout.concept
    : DEFAULT_PUBLIC_MENU_CONCEPT;
  if (activeConcept === "menu_book") return menu.categories[0]?.id ?? null;
  return menu.categories[0]?.id ?? null;
}

function loadErrorState(error: unknown): CustomerLoadState {
  if (error instanceof PublicMenuFetchError && error.code === "MENU_NOT_FOUND") {
    return { status: "not-found", message: "메뉴판을 찾을 수 없습니다." };
  }
  if (
    error instanceof PublicMenuFetchError &&
    ["MENU_SCHEMA_INCOMPATIBLE", "MENU_SCHEMA_INVALID", "MENU_UNSAFE_SOURCE"].includes(error.code)
  ) {
    return { status: "schema-error", message: "메뉴 데이터를 표시할 수 없습니다." };
  }
  return { status: "error", message: "메뉴판을 불러오지 못했습니다." };
}
