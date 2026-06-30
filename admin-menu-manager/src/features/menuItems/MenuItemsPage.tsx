import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  BulkCreateMenuItemsRequest,
  BulkMenuItemChange,
  BulkUpdateMenuItemsRequest,
  CreateMenuItemRequest,
  MenuBadgeOption,
  MenuBadgeSelection,
  MenuItem,
  MenuItemBadge,
  MenuItemDetail,
  MenuItemDetails,
  MenuItemPriceInput,
  MenuItemsResponse,
  MenuItemTypeOption,
  MenuItemTypeSelection,
  UpdateMenuItemRequest
} from "../../../contracts/menuItems";
import { AdaptiveDialog } from "../../components/adaptive/AdaptiveDialog";
import { LoadingSkeleton } from "../../components/feedback/LoadingSkeleton";
import { AuthApiError } from "../auth/authApi";
import { useDirtyWarning } from "../auth/useDirtyWarning";
import { bulkCreateMenuItems, bulkUpdateMenuItems, deleteMenuItem, readMenuItem, readMenuItems, updateMenuItem } from "./menuItemsApi";

type Navigate = (path: string) => void;
type FieldErrors = Record<string, string[]>;
type SaveState = "idle" | "saving" | "error";
type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "unauthenticated"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "error"; message: string };

type MenuForm = {
  categoryId: string;
  name: string;
  description: string;
  saleStatus: "available" | "sold_out";
  isVisible: boolean;
  abv: string;
  itemTypeKey: string;
  prices: PriceForm[];
  details: MenuItemDetails;
  internalMemo: string;
  confirmDetailReset: boolean;
};

type PriceForm = {
  localId: string;
  label: string;
  volumeText: string;
  amountMinor: string;
  isRepresentative: boolean;
};

type EditorMode = "creating" | "editing";
type BulkSaveState = "idle" | "saving" | "error" | "success";
type MenuListDraft = Omit<BulkMenuItemChange, "menuItemId">;
type MenuCreateDraft = {
  clientDraftId: string;
  form: MenuForm;
  savedAt: string;
};

export function MenuItemsPage({ barId, navigate }: { barId: string; navigate: Navigate }) {
  const [state, setState] = useState<LoadState<MenuItemsResponse>>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [itemTypeFilter, setItemTypeFilter] = useState("all");
  const [saleFilter, setSaleFilter] = useState<"all" | "available" | "sold_out">("all");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "visible" | "hidden">("all");
  const [badgeFilter, setBadgeFilter] = useState("all");
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [selectionDialogOpen, setSelectionDialogOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, MenuListDraft>>({});
  const [bulkMessage, setBulkMessage] = useState("");
  const [saveState, setSaveState] = useState<BulkSaveState>("idle");
  const useSelectionDialog = useSelectionDialogMode();
  const draftCount = Object.keys(drafts).length;
  useDirtyWarning(draftCount > 0 && saveState !== "saving");

  useEffect(() => {
    if (!useSelectionDialog) setSelectionDialogOpen(false);
  }, [useSelectionDialog]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    readMenuItems(barId)
      .then((data) => {
        if (cancelled) return;
        const itemIds = new Set(data.items.map((item) => item.id));
        setDrafts((current) => {
          const next: Record<string, MenuListDraft> = {};
          for (const [id, draft] of Object.entries(current)) {
            if (itemIds.has(id)) next[id] = draft;
          }
          return next;
        });
        setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [barId, reloadKey]);

  if (state.status !== "ready") return <MenuStatusState state={state} navigate={navigate} />;

  const canEdit = state.data.canEdit;
  const leafCategories = state.data.categories.filter((category) => category.isLeaf);
  const effectiveItems = state.data.items.map((item) => applyMenuDraft(item, drafts[item.id], state.data.categories, state.data.badgeOptions));
  const filteredItems = effectiveItems.filter((item) =>
    menuMatchesFilters(item, { query, categoryFilter, itemTypeFilter, saleFilter, visibilityFilter, badgeFilter })
  );
  const categoryCounts = countMenusByCategory(effectiveItems);
  const explicitlySelectedItem = selectedMenuId ? filteredItems.find((item) => item.id === selectedMenuId) ?? null : null;
  const selectedItem = explicitlySelectedItem ?? filteredItems[0] ?? null;
  const selectedSiblingIndex = selectedItem
    ? effectiveItems
        .filter((entry) => entry.categoryId === selectedItem.categoryId)
        .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "ko"))
        .findIndex((entry) => entry.id === selectedItem.id)
    : -1;
  const selectedSiblingCount = selectedItem ? effectiveItems.filter((entry) => entry.categoryId === selectedItem.categoryId).length : 0;
  const saveDisabled = !canEdit || draftCount === 0 || saveState === "saving";
  const visibleCount = effectiveItems.filter((item) => item.isVisible).length;
  const soldOutCount = effectiveItems.filter((item) => item.saleStatus === "sold_out").length;
  const hiddenCount = effectiveItems.length - visibleCount;

  const updateDraft = (menuItemId: string, patch: MenuListDraft) => {
    const source = state.data.items.find((item) => item.id === menuItemId);
    if (!source) return;
    setDrafts((current) => withMenuDraft(current, source, patch));
    setSaveState("idle");
    setBulkMessage("미저장 변경사항이 있습니다. 최종 저장을 눌러 반영하세요.");
  };

  const moveItem = (menuItemId: string, direction: -1 | 1) => {
    const item = effectiveItems.find((entry) => entry.id === menuItemId);
    if (!item) return;
    const siblings = effectiveItems
      .filter((entry) => entry.categoryId === item.categoryId)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "ko"));
    const index = siblings.findIndex((entry) => entry.id === menuItemId);
    const target = siblings[index + direction];
    if (index < 0 || !target) return;
    updateDraft(item.id, { sortOrder: target.sortOrder });
    updateDraft(target.id, { sortOrder: item.sortOrder });
  };

  const revertDrafts = () => {
    setDrafts({});
    setBulkMessage("");
    setSaveState("idle");
  };

  const saveDrafts = () => {
    const changes = toBulkChanges(drafts);
    if (!changes.length) return;
    const payload: BulkUpdateMenuItemsRequest = {
      expectedCount: changes.length,
      changes
    };
    setSaveState("saving");
    setBulkMessage("");
    bulkUpdateMenuItems(barId, payload)
      .then((data) => {
        setState({ status: "ready", data });
        setDrafts({});
        setSaveState("success");
        setBulkMessage(`${data.bulk.impactCount}개 메뉴를 저장했습니다.`);
      })
      .catch((error: unknown) => {
        setSaveState("error");
        setBulkMessage(error instanceof AuthApiError || error instanceof Error ? error.message : "일괄 변경을 저장하지 못했습니다.");
      });
  };

  const clearFilters = () => {
    setQuery("");
    setCategoryFilter("all");
    setItemTypeFilter("all");
    setSaleFilter("all");
    setVisibilityFilter("all");
    setBadgeFilter("all");
  };

  const selectMenu = (id: string) => {
    setSelectedMenuId(id);
    if (useSelectionDialog) setSelectionDialogOpen(true);
  };

  return (
    <div className="menus-page">
      <section className="hero-panel" aria-labelledby="menus-title">
        <div>
          <p className="eyebrow">메뉴 운영</p>
          <h1 id="menus-title">메뉴 관리</h1>
          <p>{state.data.bar.name}의 메뉴 목록, 배지, 판매 상태, 노출, 순서를 같은 URL에서 관리합니다.</p>
        </div>
        <div className="status-box" role="status">
          <span>등록 메뉴</span>
          <strong>{state.data.items.length}개</strong>
          <small>필터 결과 {filteredItems.length}개 · 미저장 {draftCount}개</small>
          <button className="button secondary compact" type="button" onClick={() => setReloadKey((value) => value + 1)}>
            새로고침
          </button>
        </div>
      </section>

      <section className="panel" aria-labelledby="menu-list-title">
        <div className="section-heading menus-toolbar">
          <div>
            <p className="eyebrow">메뉴 목록</p>
            <h2 id="menu-list-title">메뉴 목록</h2>
          </div>
          <div className="table-actions">
            <button className="button secondary" type="button" onClick={clearFilters}>
              필터 초기화
            </button>
            <button className="button secondary" type="button" onClick={() => navigate(`/bars/${barId}/publications`)}>
              발행
            </button>
            <span className={draftCount ? "status-badge locked" : "status-badge active"}>
              {draftCount ? `미저장 ${draftCount}개` : "변경 없음"}
            </span>
            <button className="button primary" type="button" disabled={saveDisabled} onClick={saveDrafts}>
              {saveState === "saving" ? "저장 중" : "목록 변경 저장"}
            </button>
            <button className="button primary" type="button" disabled={!canEdit} onClick={() => navigate(`/bars/${barId}/menus/new`)}>
              메뉴 등록
            </button>
          </div>
        </div>

        <div className="menu-workbench">
          <MenuCategoryRail
            categories={leafCategories}
            counts={categoryCounts}
            selectedCategoryId={categoryFilter}
            totalCount={effectiveItems.length}
            onSelect={setCategoryFilter}
          />

          <div className="menu-workbench-main">
            <div className="menu-list-metrics" aria-label="메뉴 목록 요약">
              <span>
                전체 <strong>{effectiveItems.length}개</strong>
              </span>
              <span>
                노출 <strong>{visibleCount}개</strong>
              </span>
              <span>
                품절 <strong>{soldOutCount}개</strong>
              </span>
              <span>
                숨김 <strong>{hiddenCount}개</strong>
              </span>
            </div>

            <div className="menu-filter-grid">
              <label className="field">
                <span>메뉴 검색</span>
                <input
                  aria-label="메뉴 검색"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="이름, 설명, 카테고리"
                />
              </label>
              <label className="field">
                <span>품목 유형 필터</span>
                <select aria-label="품목 유형 필터" value={itemTypeFilter} onChange={(event) => setItemTypeFilter(event.target.value)}>
                  <option value="all">전체 유형</option>
                  {state.data.itemTypes.map((type) => (
                    <option key={`${type.source}:${type.id}`} value={`${type.source}:${type.id}`}>
                      {type.name} · {type.source === "system" ? "공통" : "바 전용"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>판매 상태 필터</span>
                <select
                  aria-label="판매 상태 필터"
                  value={saleFilter}
                  onChange={(event) => setSaleFilter(event.target.value as "all" | "available" | "sold_out")}
                >
                  <option value="all">전체 상태</option>
                  <option value="available">판매 중</option>
                  <option value="sold_out">품절</option>
                </select>
              </label>
              <label className="field">
                <span>노출 필터</span>
                <select
                  aria-label="노출 필터"
                  value={visibilityFilter}
                  onChange={(event) => setVisibilityFilter(event.target.value as "all" | "visible" | "hidden")}
                >
                  <option value="all">전체 노출</option>
                  <option value="visible">노출</option>
                  <option value="hidden">숨김</option>
                </select>
              </label>
              <label className="field">
                <span>배지 필터</span>
                <select aria-label="배지 필터" value={badgeFilter} onChange={(event) => setBadgeFilter(event.target.value)}>
                  <option value="all">전체 배지</option>
                  {state.data.badgeOptions.map((badge) => (
                    <option key={`${badge.source}:${badge.id}`} value={`${badge.source}:${badge.id}`}>
                      {badge.name} · {badge.source === "system" ? "공통" : "바 전용"}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {state.data.items.length === 0 ? (
              <div className="dashboard-empty" role="status">
                <strong>등록된 메뉴가 없습니다.</strong>
                <p>leaf 카테고리를 만든 뒤 첫 메뉴를 등록하세요.</p>
                <div className="table-actions">
                  <button className="button secondary" type="button" onClick={() => navigate(`/bars/${barId}/categories`)}>
                    카테고리 관리
                  </button>
                  <button
                    className="button primary"
                    type="button"
                    disabled={!state.data.canEdit}
                    onClick={() => navigate(`/bars/${barId}/menus/new`)}
                  >
                    메뉴 등록
                  </button>
                </div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="dashboard-empty" role="status">
                <strong>조건에 맞는 메뉴가 없습니다.</strong>
                <p>검색어 또는 필터를 조정하세요.</p>
              </div>
            ) : (
              <>
                {bulkMessage ? <div className={`form-status ${saveState === "success" ? "success" : ""}`} role="alert">{bulkMessage}</div> : null}
                <MenuItemsDataView
                  items={filteredItems}
                  selectedId={(useSelectionDialog ? explicitlySelectedItem?.id : selectedItem?.id) ?? ""}
                  onSelect={selectMenu}
                  onOpen={(menuItemId) => navigate(`/bars/${barId}/menus/${menuItemId}`)}
                />
              </>
            )}
          </div>

          {!useSelectionDialog ? (
            <MenuSelectionPanel
              item={selectedItem}
              canEdit={canEdit}
              categories={leafCategories}
              badgeOptions={state.data.badgeOptions}
              canMoveUp={selectedSiblingIndex > 0}
              canMoveDown={selectedSiblingIndex >= 0 && selectedSiblingIndex < selectedSiblingCount - 1}
              onDraft={updateDraft}
              onMove={moveItem}
              onOpen={(menuItemId) => navigate(`/bars/${barId}/menus/${menuItemId}`)}
            />
          ) : null}
        </div>
        <AdaptiveDialog
          title="선택 메뉴"
          open={useSelectionDialog && selectionDialogOpen && explicitlySelectedItem !== null}
          onClose={() => setSelectionDialogOpen(false)}
          panelClassName="menu-selection-adaptive-dialog"
        >
          <MenuSelectionPanel
            item={explicitlySelectedItem}
            canEdit={canEdit}
            categories={leafCategories}
            badgeOptions={state.data.badgeOptions}
            canMoveUp={selectedSiblingIndex > 0}
            canMoveDown={selectedSiblingIndex >= 0 && selectedSiblingIndex < selectedSiblingCount - 1}
            onDraft={updateDraft}
            onMove={moveItem}
            onOpen={(menuItemId) => navigate(`/bars/${barId}/menus/${menuItemId}`)}
          />
        </AdaptiveDialog>
      </section>
    </div>
  );
}

function useSelectionDialogMode(): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? false
      : window.matchMedia("(max-width: 1399px)").matches
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(max-width: 1399px)");
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return matches;
}

export function MenuItemEditorPage({
  barId,
  menuItemId,
  navigate
}: {
  barId: string;
  menuItemId?: string;
  navigate: Navigate;
}) {
  const mode: EditorMode = menuItemId ? "editing" : "creating";
  const [state, setState] = useState<LoadState<MenuItemsResponse & { item?: MenuItemDetail | null }>>({ status: "loading" });
  const [form, setForm] = useState<MenuForm>(emptyMenuForm());
  const [original, setOriginal] = useState<MenuForm>(emptyMenuForm());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<SaveState>("idle");
  const [draggingPriceIndex, setDraggingPriceIndex] = useState<number | null>(null);
  const [createDrafts, setCreateDrafts] = useState<MenuCreateDraft[]>(() => (mode === "creating" ? readCreateDrafts(barId) : []));
  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  const hasPendingCreateDrafts = mode === "creating" && createDrafts.length > 0;
  useDirtyWarning((dirty || hasPendingCreateDrafts) && status !== "saving");

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    const request = menuItemId ? readMenuItem(barId, menuItemId) : readMenuItems(barId);
    request
      .then((data) => {
        if (cancelled) return;
        const nextForm = menuItemId
          ? menuToForm((data as MenuItemsResponse & { item: MenuItemDetail | null }).item)
          : emptyMenuForm(data.categories.find((category) => category.isLeaf)?.id ?? "");
        setForm(nextForm);
        setOriginal(nextForm);
        setErrors({});
        setMessage("");
        setStatus("idle");
        setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [barId, menuItemId]);

  useEffect(() => {
    if (mode === "creating") setCreateDrafts(readCreateDrafts(barId));
  }, [barId, mode]);

  if (state.status !== "ready") return <MenuStatusState state={state} navigate={navigate} />;

  const leafCategories = state.data.categories.filter((category) => category.isLeaf);
  const canEdit = state.data.canEdit;
  const canEditInternalMemo = state.data.canEditInternalMemo ?? state.data.canEdit;
  const heading = mode === "creating" ? "새 메뉴 등록" : "메뉴 기본 정보";
  const selectedItem = "item" in state.data ? state.data.item ?? null : null;
  const selectedType = state.data.itemTypes.find((type) => `${type.source}:${type.id}` === form.itemTypeKey) ?? null;
  const selectedTemplate = selectedType?.template ?? "general";
  const templateResetRequired = original.details.template !== selectedTemplate && detailsHasContent(original.details);
  const hasFieldErrors = Object.keys(errors).length > 0;
  const errorSummaryMessage = hasFieldErrors ? (message && message !== "입력값을 확인하세요." ? message : "입력값을 확인하세요.") : "";
  const statusMessage = hasFieldErrors ? "" : message;
  const setStoredCreateDrafts = (updater: (current: MenuCreateDraft[]) => MenuCreateDraft[]) => {
    const next = updater(createDrafts);
    writeCreateDrafts(barId, next);
    setCreateDrafts(next);
  };
  const clearStoredCreateDrafts = () => {
    writeCreateDrafts(barId, []);
    setCreateDrafts([]);
  };

  if (mode === "creating" && !canEdit) {
    return <MenuStatus title="접근할 수 없습니다" message="이 바에서 메뉴를 편집할 권한이 없습니다." tone="error" />;
  }

  const save = (event: FormEvent) => {
    event.preventDefault();
    const payload = formToPayload(form, canEditInternalMemo);
    if ("errors" in payload) {
      setErrors(payload.errors);
      setMessage("입력값을 확인하세요.");
      setStatus("error");
      return;
    }
    if (mode === "creating") {
      const nextForm = { ...form, prices: ensureRepresentativePrices(form.prices, form.details.template) };
      setStoredCreateDrafts((current) => [
        ...current,
        {
          clientDraftId: nextLocalId(),
          form: nextForm,
          savedAt: new Date().toISOString()
        }
      ]);
      const nextEmptyForm = emptyMenuForm(leafCategories[0]?.id ?? "");
      setForm(nextEmptyForm);
      setOriginal(nextEmptyForm);
      setErrors({});
      setMessage("신규 메뉴 초안을 저장했습니다. 최종 저장을 눌러 D1에 반영하세요.");
      setStatus("idle");
      return;
    }
    setStatus("saving");
    setErrors({});
    setMessage("");
    updateMenuItem(barId, menuItemId ?? "", payload.value as UpdateMenuItemRequest)
      .then((data) => {
        const nextItem = data.item;
        if (!nextItem) throw new Error("저장한 메뉴를 찾을 수 없습니다.");
        const nextForm = menuToForm(nextItem);
        setForm(nextForm);
        setOriginal(nextForm);
        setState({ status: "ready", data });
        setStatus("idle");
        setMessage("메뉴를 저장했습니다.");
      })
      .catch((error: unknown) => handleFormError(error, setErrors, setMessage, setStatus));
  };

  const saveCreateDrafts = () => {
    if (dirty) {
      setStatus("error");
      setMessage("작성 중인 메뉴를 먼저 초안 저장하세요.");
      return;
    }
    if (createDrafts.length === 0) {
      setStatus("error");
      setMessage("최종 저장할 신규 메뉴 초안이 없습니다.");
      return;
    }
    const draftPayloads: BulkCreateMenuItemsRequest["drafts"] = [];
    for (const draft of createDrafts) {
      const payload = formToPayload(draft.form, canEditInternalMemo);
      if ("errors" in payload) {
        setForm(draft.form);
        setOriginal(emptyMenuForm(leafCategories[0]?.id ?? ""));
        setErrors(payload.errors);
        setStatus("error");
        setMessage(`초안 "${draft.form.name || "이름 없음"}"의 입력값을 확인하세요.`);
        return;
      }
      draftPayloads.push({
        clientDraftId: draft.clientDraftId,
        menuItem: payload.value as CreateMenuItemRequest
      });
    }
    const requestPayload: BulkCreateMenuItemsRequest = {
      expectedCount: draftPayloads.length,
      drafts: draftPayloads
    };
    setStatus("saving");
    setErrors({});
    setMessage("");
    bulkCreateMenuItems(barId, requestPayload)
      .then((data) => {
        clearStoredCreateDrafts();
        setState({ status: "ready", data });
        setStatus("idle");
        setMessage(`${data.bulk.impactCount}개 신규 메뉴를 최종 저장했습니다.`);
        navigate(`/bars/${barId}/menus`);
      })
      .catch((error: unknown) => handleFormError(error, setErrors, setMessage, setStatus));
  };

  const remove = () => {
    if (!menuItemId || !window.confirm("이 메뉴를 영구 삭제할까요?")) return;
    setStatus("saving");
    setErrors({});
    setMessage("");
    deleteMenuItem(barId, menuItemId)
      .then(() => navigate(`/bars/${barId}/menus`))
      .catch((error: unknown) => handleFormError(error, setErrors, setMessage, setStatus));
  };

  const revert = () => {
    setForm(original);
    setErrors({});
    setMessage("");
    setStatus("idle");
  };

  const loadCreateDraft = (draft: MenuCreateDraft) => {
    setStoredCreateDrafts((current) => current.filter((item) => item.clientDraftId !== draft.clientDraftId));
    setForm(draft.form);
    setOriginal(emptyMenuForm(leafCategories[0]?.id ?? ""));
    setErrors({});
    setMessage("초안을 다시 편집합니다. 수정 후 초안 저장을 눌러 대기 목록에 반영하세요.");
    setStatus("idle");
  };

  const removeCreateDraft = (clientDraftId: string) => {
    setStoredCreateDrafts((current) => current.filter((draft) => draft.clientDraftId !== clientDraftId));
    setMessage("신규 메뉴 초안을 삭제했습니다.");
    setStatus("idle");
  };

  const clearCreateDrafts = () => {
    if (createDrafts.length === 0 || window.confirm("최종 저장 전 신규 메뉴 초안을 모두 비울까요?")) {
      clearStoredCreateDrafts();
      setMessage("신규 메뉴 초안을 모두 비웠습니다.");
      setStatus("idle");
    }
  };

  const changeItemType = (value: string) => {
    const nextType = state.data.itemTypes.find((type) => `${type.source}:${type.id}` === value) ?? null;
    const nextTemplate = nextType?.template ?? "general";
    setForm((current) => ({
      ...current,
      itemTypeKey: value,
      prices:
        current.prices.length === 0 && nextType?.defaultPriceLabels.length
          ? defaultPricesForType(nextType)
          : ensureRepresentativePrices(current.prices, nextTemplate),
      details: current.details.template === nextTemplate ? current.details : defaultDetails(nextTemplate),
      confirmDetailReset: false
    }));
  };

  const updatePrice = (index: number, patch: Partial<PriceForm>) => {
    setForm((current) => ({
      ...current,
      prices: current.prices.map((price, itemIndex) => (itemIndex === index ? { ...price, ...patch } : price))
    }));
  };

  const setRepresentativePrice = (index: number) => {
    setForm((current) => ({
      ...current,
      prices: current.prices.map((price, itemIndex) => ({ ...price, isRepresentative: itemIndex === index }))
    }));
  };

  const movePrice = (from: number, to: number) => {
    setForm((current) => ({ ...current, prices: moveArrayItem(current.prices, from, to) }));
  };

  const updateDetailValue = (field: string, value: string | boolean) => {
    setForm((current) => ({ ...current, details: { ...current.details, [field]: value } as MenuItemDetails }));
  };

  return (
    <form className="menu-editor-page" onSubmit={save} noValidate>
      <div className="page-return-row">
        <button className="button secondary" type="button" onClick={() => confirmDiscard(dirty, () => navigate(`/bars/${barId}/menus`))}>
          목록으로 가기
        </button>
      </div>
      <section className="hero-panel" aria-labelledby="menu-editor-title">
        <div>
          <p className="eyebrow">메뉴 편집</p>
          <h1 id="menu-editor-title">{heading}</h1>
          <p>{state.data.bar.name}의 기본 정보, 가격, 상세 템플릿, 내부 메모를 같은 화면에서 저장합니다.</p>
        </div>
        <div className="status-box" role="status">
          <span>저장 상태</span>
          <strong>{mode === "creating" ? `초안 ${createDrafts.length}개` : "기존 메뉴 편집"}</strong>
          <small>{selectedItem?.publicId ? "공개 메뉴 식별자 연결됨" : mode === "creating" ? "최종 저장 전 D1 미반영" : "저장 전"}</small>
        </div>
      </section>

      {!leafCategories.length ? (
        <section className="panel" aria-labelledby="menu-no-category-title">
          <div className="dashboard-empty" role="status">
            <strong id="menu-no-category-title">메뉴를 담을 leaf 카테고리가 없습니다.</strong>
            <p>하위 카테고리가 없는 카테고리를 먼저 생성하세요.</p>
            <button className="button primary" type="button" onClick={() => navigate(`/bars/${barId}/categories`)}>
              카테고리 관리
            </button>
          </div>
        </section>
      ) : (
        <>
        {mode === "creating" ? (
          <CreateDraftPanel
            drafts={createDrafts}
            saving={status === "saving"}
            dirty={dirty}
            onSaveAll={saveCreateDrafts}
            onLoad={loadCreateDraft}
            onRemove={removeCreateDraft}
            onClear={clearCreateDrafts}
          />
        ) : null}
        <section className="panel menu-editor-panel" aria-labelledby="menu-basic-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">기본 정보</p>
              <h2 id="menu-basic-title">기본 정보</h2>
            </div>
            <span className={dirty ? "status-badge locked" : "status-badge active"}>
              {dirty ? "작성 중" : mode === "creating" ? "초안 대기" : "저장됨"}
            </span>
          </div>

          {errorSummaryMessage ? (
            <div className="form-summary" role="alert">
              {errorSummaryMessage}
            </div>
          ) : null}
          {statusMessage ? <div className={`form-status ${status === "idle" ? "success" : ""}`} role="alert">{statusMessage}</div> : null}

          <div className="menu-editor-grid">
            <label className="field">
              <span>메뉴 이름</span>
              <input
                aria-label="메뉴 이름"
                value={form.name}
                disabled={!canEdit}
                aria-invalid={errors.name?.length ? "true" : undefined}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="예: 맥캘란 12"
              />
              {errors.name?.length ? <strong className="field-error">{errors.name[0]}</strong> : null}
            </label>
            <label className="field">
              <span>카테고리</span>
              <select
                aria-label="메뉴 카테고리"
                value={form.categoryId}
                disabled={!canEdit}
                aria-invalid={errors.categoryId?.length ? "true" : undefined}
                onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
              >
                {state.data.categories.map((category) => (
                  <option key={category.id} value={category.id} disabled={!category.isLeaf}>
                    {category.path}{category.isLeaf ? "" : " (상위 카테고리)"}
                  </option>
                ))}
              </select>
              {errors.categoryId?.length ? <strong className="field-error">{errors.categoryId[0]}</strong> : null}
            </label>
            <label className="field full">
              <span>메뉴 설명</span>
              <textarea
                aria-label="메뉴 설명"
                value={form.description}
                disabled={!canEdit}
                maxLength={200}
                aria-invalid={errors.description?.length ? "true" : undefined}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="최대 200자"
              />
              {errors.description?.length ? <strong className="field-error">{errors.description[0]}</strong> : null}
            </label>
            <label className="field">
              <span>품목 유형</span>
              <select
                aria-label="품목 유형"
                value={form.itemTypeKey}
                disabled={!canEdit}
                onChange={(event) => changeItemType(event.target.value)}
              >
                <option value="none">선택 안 함</option>
                {state.data.itemTypes.map((type) => (
                  <option key={`${type.source}:${type.id}`} value={`${type.source}:${type.id}`}>
                    {type.name} · {type.source === "system" ? "공통" : "바 전용"}
                  </option>
                ))}
              </select>
              {errors.itemType?.length ? <strong className="field-error">{errors.itemType[0]}</strong> : null}
            </label>
            <label className="field">
              <span>ABV</span>
              <input
                aria-label="ABV"
                inputMode="decimal"
                value={form.abv}
                disabled={!canEdit}
                aria-invalid={errors.abv?.length ? "true" : undefined}
                onChange={(event) => setForm((current) => ({ ...current, abv: event.target.value }))}
                placeholder="예: 40.5"
              />
              {errors.abv?.length ? <strong className="field-error">{errors.abv[0]}</strong> : null}
            </label>
          </div>

          <div className="menu-status-grid" aria-label="판매와 노출 상태">
            <fieldset className="segmented-field" disabled={!canEdit}>
              <legend>판매 상태</legend>
              <label>
                <input
                  type="radio"
                  name="saleStatus"
                  value="available"
                  checked={form.saleStatus === "available"}
                  onChange={() => setForm((current) => ({ ...current, saleStatus: "available" }))}
                />
                판매 중
              </label>
              <label>
                <input
                  type="radio"
                  name="saleStatus"
                  value="sold_out"
                  checked={form.saleStatus === "sold_out"}
                  onChange={() => setForm((current) => ({ ...current, saleStatus: "sold_out" }))}
                />
                품절
              </label>
            </fieldset>
            <label className="check-row menu-visible-toggle">
              <input
                aria-label="메뉴 노출"
                type="checkbox"
                checked={form.isVisible}
                disabled={!canEdit}
                onChange={(event) => setForm((current) => ({ ...current, isVisible: event.target.checked }))}
              />
              고객 메뉴판에 노출
            </label>
          </div>
        </section>
        <section className="panel menu-editor-panel" aria-labelledby="menu-prices-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">가격 옵션</p>
              <h2 id="menu-prices-title">가격</h2>
            </div>
            <button
              className="button secondary compact"
              type="button"
              disabled={!canEdit || form.prices.length >= 10}
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  prices: [
                    ...current.prices,
                    { localId: nextLocalId(), label: "", volumeText: "", amountMinor: "", isRepresentative: current.prices.length === 0 }
                  ]
                }))
              }
            >
              가격 추가
            </button>
          </div>
          {errors.prices?.length ? <div className="form-summary" role="alert">{errors.prices[0]}</div> : null}
          {form.prices.length === 0 ? (
            <div className="dashboard-empty" role="status">
              <strong>등록된 가격이 없습니다.</strong>
              <p>가격이 없는 메뉴는 고객 메뉴판에서 가격 영역이 숨겨집니다.</p>
            </div>
          ) : (
            <div className="menu-price-list" aria-label="가격 목록">
              {form.prices.map((price, index) => (
                <div
                  className="menu-price-row"
                  key={price.localId}
                  draggable={canEdit}
                  onDragStart={() => setDraggingPriceIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggingPriceIndex !== null) movePrice(draggingPriceIndex, index);
                    setDraggingPriceIndex(null);
                  }}
                >
                  <span className="price-row-handle" aria-hidden="true">↕</span>
                  <label className="field">
                    <span>가격 라벨</span>
                    <input
                      aria-label={`가격 라벨 ${index + 1}`}
                      value={price.label}
                      disabled={!canEdit}
                      onChange={(event) => updatePrice(index, { label: event.target.value })}
                      placeholder="샷"
                    />
                  </label>
                  <label className="field">
                    <span>용량</span>
                    <input
                      aria-label={`가격 용량 ${index + 1}`}
                      value={price.volumeText}
                      disabled={!canEdit}
                      onChange={(event) => updatePrice(index, { volumeText: event.target.value })}
                      placeholder="30ml"
                    />
                  </label>
                  <label className="field">
                    <span>금액</span>
                    <input
                      aria-label={`가격 금액 ${index + 1}`}
                      inputMode="numeric"
                      value={price.amountMinor}
                      disabled={!canEdit}
                      onChange={(event) => updatePrice(index, { amountMinor: event.target.value })}
                      placeholder="18000"
                    />
                  </label>
                  <label className="check-row price-representative-toggle">
                    <input
                      aria-label={`대표 가격 ${index + 1}`}
                      type="radio"
                      name="representativePrice"
                      checked={price.isRepresentative}
                      disabled={!canEdit}
                      onChange={() => setRepresentativePrice(index)}
                    />
                    고객 메뉴판 대표
                  </label>
                  <div className="price-row-actions">
                    <button className="icon-button" type="button" disabled={!canEdit || index === 0} onClick={() => movePrice(index, index - 1)} aria-label={`가격 ${index + 1} 위로`}>
                      ↑
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      disabled={!canEdit || index === form.prices.length - 1}
                      onClick={() => movePrice(index, index + 1)}
                      aria-label={`가격 ${index + 1} 아래로`}
                    >
                      ↓
                    </button>
                    <button
                      className="icon-button danger"
                      type="button"
                      disabled={!canEdit}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          prices: ensureRepresentativePrices(
                            current.prices.filter((_, itemIndex) => itemIndex !== index),
                            selectedTemplate
                          )
                        }))
                      }
                      aria-label={`가격 ${index + 1} 삭제`}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel menu-editor-panel" aria-labelledby="menu-details-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">상세 정보</p>
              <h2 id="menu-details-title">상세 정보</h2>
            </div>
            <span className="status-badge">{templateLabel(selectedTemplate)}</span>
          </div>
          {templateResetRequired ? (
            <label className="check-row detail-reset-warning">
              <input
                type="checkbox"
                checked={form.confirmDetailReset}
                disabled={!canEdit}
                onChange={(event) => setForm((current) => ({ ...current, confirmDetailReset: event.target.checked }))}
              />
              유형 변경으로 기존 상세 정보를 삭제하고 저장
            </label>
          ) : null}
          {selectedTemplate === "general" ? (
            <div className="dashboard-empty" role="status">
              <strong>선택된 상세 템플릿이 없습니다.</strong>
              <p>품목 유형을 선택하면 해당 유형의 상세 입력 항목이 표시됩니다.</p>
            </div>
          ) : (
            <DetailFields details={form.details} disabled={!canEdit} onChange={updateDetailValue} />
          )}
        </section>

        <section className="panel menu-editor-panel" aria-labelledby="menu-memo-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">관리자 메모</p>
              <h2 id="menu-memo-title">내부 메모</h2>
            </div>
            <span className={canEditInternalMemo ? "status-badge active" : "status-badge locked"}>
              {canEditInternalMemo ? "수정 가능" : "읽기 전용"}
            </span>
          </div>
          <label className="field full">
            <span>메모 내용</span>
            <textarea
              aria-label="내부 메모 입력"
              value={form.internalMemo}
              disabled={!canEditInternalMemo}
              maxLength={2000}
              onChange={(event) => setForm((current) => ({ ...current, internalMemo: event.target.value }))}
              placeholder="고객 메뉴판에 공개되지 않는 운영 메모"
            />
            {errors.internalMemo?.length ? <strong className="field-error">{errors.internalMemo[0]}</strong> : null}
          </label>
        </section>
        </>
      )}

      <div className="sticky-action-bar">
        <button className="button secondary" type="button" onClick={() => confirmDiscard(dirty, () => navigate(`/bars/${barId}/menus`))}>
          목록
        </button>
        <div className="menu-sticky-actions">
          {mode === "editing" ? (
            <button className="button secondary" type="button" disabled={!canEdit || status === "saving"} onClick={remove}>
              메뉴 삭제
            </button>
          ) : null}
          <button className="button secondary" type="button" disabled={!dirty || status === "saving"} onClick={revert}>
            되돌리기
          </button>
          <button className="button primary" type="submit" disabled={!canEdit || !dirty || status === "saving" || !leafCategories.length}>
            {status === "saving" ? "저장 중" : mode === "creating" ? "초안 저장" : "저장"}
          </button>
        </div>
      </div>
    </form>
  );
}

function CreateDraftPanel({
  drafts,
  saving,
  dirty,
  onSaveAll,
  onLoad,
  onRemove,
  onClear
}: {
  drafts: MenuCreateDraft[];
  saving: boolean;
  dirty: boolean;
  onSaveAll: () => void;
  onLoad: (draft: MenuCreateDraft) => void;
  onRemove: (clientDraftId: string) => void;
  onClear: () => void;
}) {
  return (
    <section className="panel menu-editor-panel menu-create-drafts-panel" aria-labelledby="menu-create-drafts-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">최종 저장 대기</p>
          <h2 id="menu-create-drafts-title">신규 메뉴 초안</h2>
        </div>
        <span className={drafts.length ? "status-badge locked" : "status-badge active"}>{drafts.length}개 대기</span>
      </div>
      {drafts.length === 0 ? (
        <div className="dashboard-empty" role="status">
          <strong>대기 중인 신규 메뉴 초안이 없습니다.</strong>
          <p>아래 입력을 완료한 뒤 초안 저장을 누르면 이 목록에 쌓이고, 최종 저장 때 한 번에 반영됩니다.</p>
        </div>
      ) : (
        <div className="menu-create-draft-list" aria-label="신규 메뉴 초안 목록">
          {drafts.map((draft, index) => (
            <article className="menu-create-draft-card" key={draft.clientDraftId}>
              <div>
                <strong>{index + 1}. {draft.form.name || "이름 없는 메뉴"}</strong>
                <span>{draft.form.categoryId ? "카테고리 선택됨" : "카테고리 미선택"} · 가격 {draft.form.prices.length}개</span>
              </div>
              <div className="card-row">
                <span>상태</span>
                <strong>{draft.form.saleStatus === "available" ? "판매 중" : "품절"} · {draft.form.isVisible ? "노출" : "숨김"}</strong>
              </div>
              <div className="card-actions">
                <button className="button secondary compact" type="button" disabled={saving} onClick={() => onLoad(draft)}>
                  불러오기
                </button>
                <button className="button secondary compact" type="button" disabled={saving} onClick={() => onRemove(draft.clientDraftId)}>
                  삭제
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="menu-create-draft-actions">
        <button className="button secondary" type="button" disabled={saving || drafts.length === 0} onClick={onClear}>
          초안 비우기
        </button>
        <button className="button primary" type="button" disabled={saving || drafts.length === 0 || dirty} onClick={onSaveAll}>
          {saving ? "최종 저장 중" : `최종 저장 ${drafts.length ? `${drafts.length}개` : ""}`}
        </button>
      </div>
      {dirty && drafts.length > 0 ? (
        <p className="muted">작성 중인 메뉴를 먼저 초안 저장해야 최종 저장할 수 있습니다.</p>
      ) : null}
    </section>
  );
}

function MenuCategoryRail({
  categories,
  counts,
  selectedCategoryId,
  totalCount,
  onSelect
}: {
  categories: Array<{ id: string; path: string }>;
  counts: Map<string, number>;
  selectedCategoryId: string;
  totalCount: number;
  onSelect: (categoryId: string) => void;
}) {
  return (
    <aside className="menu-category-rail" aria-label="카테고리 선택">
      <div className="menu-category-rail-heading">
        <p className="eyebrow">카테고리</p>
        <strong>{categories.length}개</strong>
      </div>
      <div className="menu-category-rail-list" role="list">
        <button
          className="menu-category-rail-item"
          type="button"
          data-selected={selectedCategoryId === "all"}
          onClick={() => onSelect("all")}
        >
          <span>전체 메뉴</span>
          <strong>{totalCount}</strong>
        </button>
        {categories.map((category) => (
          <button
            className="menu-category-rail-item"
            type="button"
            key={category.id}
            data-selected={category.id === selectedCategoryId}
            onClick={() => onSelect(category.id)}
            title={category.path}
          >
            <span>
              <strong>{categoryLeafLabel(category.path)}</strong>
              {categoryParentLabel(category.path) ? <small>{categoryParentLabel(category.path)}</small> : null}
            </span>
            <strong>{counts.get(category.id) ?? 0}</strong>
          </button>
        ))}
      </div>
    </aside>
  );
}

function MenuSelectionPanel({
  item,
  canEdit,
  categories,
  badgeOptions,
  canMoveUp,
  canMoveDown,
  onDraft,
  onMove,
  onOpen
}: {
  item: MenuItem | null;
  canEdit: boolean;
  categories: Array<{ id: string; path: string }>;
  badgeOptions: MenuBadgeOption[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDraft: (id: string, patch: MenuListDraft) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onOpen: (id: string) => void;
}) {
  if (!item) {
    return (
      <aside className="menu-selection-panel" aria-label="선택 메뉴">
        <div className="dashboard-empty" role="status">
          <strong>선택된 메뉴가 없습니다.</strong>
          <p>목록에서 메뉴를 선택하면 빠른 수정 항목이 표시됩니다.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="menu-selection-panel" aria-label="선택 메뉴">
      <div className="menu-selection-heading">
        <div>
          <p className="eyebrow">선택 메뉴</p>
          <h3>{item.name}</h3>
        </div>
        <span className={hasMenuDraftMarker(item) ? "status-badge locked" : "status-badge active"}>
          {hasMenuDraftMarker(item) ? "미저장" : "저장됨"}
        </span>
      </div>

      <div className="menu-selection-summary">
        <div>
          <span>카테고리</span>
          <strong>{item.categoryPath}</strong>
        </div>
        <div>
          <span>가격</span>
          <strong>{formatPrices(item)}</strong>
        </div>
        <div>
          <span>수정</span>
          <strong>{item.updatedByUsername} · {formatDateTime(item.updatedAt)}</strong>
        </div>
      </div>

      <div className="menu-selection-controls">
        <label className="field">
          <span>카테고리</span>
          <select
            aria-label={`${item.name} 카테고리 빠른 변경`}
            value={item.categoryId}
            disabled={!canEdit}
            onChange={(event) => onDraft(item.id, { categoryId: event.target.value })}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.path}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>판매 상태</span>
          <select
            aria-label={`${item.name} 판매 상태 빠른 변경`}
            value={item.saleStatus}
            disabled={!canEdit}
            onChange={(event) => onDraft(item.id, { saleStatus: event.target.value as "available" | "sold_out" })}
          >
            <option value="available">판매 중</option>
            <option value="sold_out">품절</option>
          </select>
        </label>
        <label className="check-row">
          <input
            aria-label={`${item.name} 노출 빠른 변경`}
            type="checkbox"
            checked={item.isVisible}
            disabled={!canEdit}
            onChange={(event) => onDraft(item.id, { isVisible: event.target.checked })}
          />
          {item.isVisible ? "고객 메뉴판에 노출" : "고객 메뉴판에서 숨김"}
        </label>
        <BadgeSelectionEditor
          label={`${item.name} 배지`}
          selected={item.badges}
          options={badgeOptions}
          disabled={!canEdit}
          onChange={(badges) => onDraft(item.id, { badges })}
        />
      </div>

      <div className="menu-selection-actions">
        <button className="icon-button" type="button" disabled={!canEdit || !canMoveUp} onClick={() => onMove(item.id, -1)} aria-label={`${item.name} 위로 이동`}>
          ↑
        </button>
        <button
          className="icon-button"
          type="button"
          disabled={!canEdit || !canMoveDown}
          onClick={() => onMove(item.id, 1)}
          aria-label={`${item.name} 아래로 이동`}
        >
          ↓
        </button>
        <button className="button secondary" type="button" onClick={() => onOpen(item.id)}>
          편집 열기
        </button>
      </div>
    </aside>
  );
}

function MenuItemsDataView({
  items,
  selectedId,
  onSelect,
  onOpen
}: {
  items: MenuItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="menus-data-view" aria-label="메뉴 목록">
      <table className="data-table menus-table">
        <colgroup>
          <col className="menus-col-order" />
          <col className="menus-col-category" />
          <col className="menus-col-name" />
          <col className="menus-col-price" />
          <col className="menus-col-badges" />
          <col className="menus-col-status" />
          <col className="menus-col-visibility" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">노출순서</th>
            <th scope="col">카테고리</th>
            <th scope="col">메뉴명</th>
            <th scope="col">가격</th>
            <th scope="col">배지</th>
            <th scope="col">상태</th>
            <th scope="col">노출</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              data-dirty={hasMenuDraftMarker(item)}
              data-selected={item.id === selectedId}
              tabIndex={0}
              onClick={() => onSelect(item.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(item.id);
                }
              }}
            >
              <td className="menu-order-cell">
                <div className="menu-order-stack">
                  <span className="status-badge">{item.sortOrder + 1}</span>
                </div>
              </td>
              <td className="menu-category-cell">
                <span title={item.categoryPath}>
                  <strong>{categoryLeafLabel(item.categoryPath)}</strong>
                  {categoryParentLabel(item.categoryPath) ? <small>{categoryParentLabel(item.categoryPath)}</small> : null}
                </span>
              </td>
              <td className="menu-name-cell">
                <strong>{item.name}</strong>
                <span className="menu-type-label">{item.itemType ? `${item.itemType.name} · ${item.itemType.source === "system" ? "공통" : "바 전용"}` : "품목 유형 없음"}</span>
                <small>{item.description || "설명 없음"}</small>
              </td>
              <td className="menu-price-cell">
                <span>{formatRepresentativePrice(item)}</span>
              </td>
              <td className="menu-badges-cell">
                <MenuBadgeChips badges={item.badges} />
                {item.saleStatus === "sold_out" && item.badges.length ? <small>품절 공개 JSON에서는 배지 숨김</small> : null}
              </td>
              <td className="menu-status-cell">
                <span className={item.saleStatus === "available" ? "status-badge active" : "status-badge locked"}>
                  {item.saleStatus === "available" ? "판매 중" : "품절"}
                </span>
              </td>
              <td className="menu-visibility-cell">
                <span className={item.isVisible ? "status-badge active" : "status-badge"}>
                  {item.isVisible ? "노출" : "숨김"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="data-cards">
        {items.map((item) => (
          <article className="data-card menu-card-summary" key={item.id} data-dirty={hasMenuDraftMarker(item)} data-selected={item.id === selectedId}>
            <div className="menu-card-header">
              <div>
                <strong>{item.name}</strong>
              </div>
              <span>{item.categoryPath}</span>
              <small>{item.itemType ? `${item.itemType.name} · ${item.itemType.source === "system" ? "공통" : "바 전용"}` : "품목 유형 없음"}</small>
            </div>
            <div className="card-row">
              <span>노출순서</span>
              <strong>{item.sortOrder + 1}</strong>
            </div>
            <div className="card-row">
              <span>가격</span>
              <strong>{formatRepresentativePrice(item)}</strong>
            </div>
            <div className="pill-row" aria-label={`${item.name} 상태 요약`}>
              <span className={item.saleStatus === "available" ? "status-badge active" : "status-badge locked"}>
                {item.saleStatus === "available" ? "판매 중" : "품절"}
              </span>
              <span className={item.isVisible ? "status-badge active" : "status-badge"}>
                {item.isVisible ? "노출" : "숨김"}
              </span>
            </div>
            <MenuBadgeChips badges={item.badges} />
            {item.saleStatus === "sold_out" && item.badges.length ? <p className="muted">품절 공개 JSON에서는 배지가 숨겨집니다.</p> : null}
            <div className="card-actions">
              <button className="button secondary" type="button" onClick={() => onSelect(item.id)}>
                선택
              </button>
              <button className="button primary" type="button" onClick={() => onOpen(item.id)}>
                상세
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function MenuBadgeChips({ badges }: { badges: MenuItemBadge[] }) {
  if (!badges.length) return <span className="muted">배지 없음</span>;
  return (
    <div className="menu-badge-inline-list">
      {badges.map((badge) => (
        <span
          className="menu-badge-chip"
          key={badgeKey(badge)}
          style={{ backgroundColor: badge.color.backgroundHex, color: badge.color.textColor }}
        >
          {badge.name}
        </span>
      ))}
    </div>
  );
}

function BadgeSelectionEditor({
  label,
  selected,
  options,
  disabled,
  onChange
}: {
  label: string;
  selected: MenuBadgeSelection[];
  options: MenuBadgeOption[];
  disabled: boolean;
  onChange: (badges: MenuBadgeSelection[]) => void;
}) {
  const [pendingKey, setPendingKey] = useState("");
  const selectedKeys = new Set(selected.map(badgeKey));
  const optionByKey = new Map(options.map((option) => [badgeKey(option), option]));
  const available = options.filter((option) => !selectedKeys.has(badgeKey(option)));
  const pendingOption = available.find((option) => badgeKey(option) === pendingKey) ?? available[0] ?? null;
  const addBadge = () => {
    if (!pendingOption || selected.length >= 3) return;
    onChange([...selected, { source: pendingOption.source, id: pendingOption.id }]);
    setPendingKey("");
  };
  return (
    <div className="badge-selection-editor" aria-label={label}>
      <div className="menu-badge-inline-list">
        {selected.length ? (
          selected.map((badge, index) => {
            const option = optionByKey.get(badgeKey(badge));
            return (
              <span className="menu-badge-edit-chip" key={badgeKey(badge)}>
                <span
                  className="menu-badge-chip"
                  style={{ backgroundColor: option?.color.backgroundHex ?? "#666666", color: option?.color.textColor ?? "#FFFFFF" }}
                >
                  {option?.name ?? "사용할 수 없는 배지"}
                </span>
                <button
                  className="icon-button"
                  type="button"
                  disabled={disabled || index === 0}
                  onClick={() => onChange(moveArrayItem(selected, index, index - 1))}
                  aria-label={`${option?.name ?? "배지"} 앞으로 이동`}
                >
                  ↑
                </button>
                <button
                  className="icon-button"
                  type="button"
                  disabled={disabled || index === selected.length - 1}
                  onClick={() => onChange(moveArrayItem(selected, index, index + 1))}
                  aria-label={`${option?.name ?? "배지"} 뒤로 이동`}
                >
                  ↓
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(selected.filter((_, itemIndex) => itemIndex !== index))}
                  aria-label={`${option?.name ?? "배지"} 제거`}
                >
                  ×
                </button>
              </span>
            );
          })
        ) : (
          <span className="muted">배지 없음</span>
        )}
      </div>
      <div className="badge-add-row">
        <select
          aria-label={`${label} 추가 선택`}
          value={pendingOption ? badgeKey(pendingOption) : ""}
          disabled={disabled || !available.length || selected.length >= 3}
          onChange={(event) => setPendingKey(event.target.value)}
        >
          {available.length ? (
            available.map((option) => (
              <option key={badgeKey(option)} value={badgeKey(option)}>
                {option.name} · {option.source === "system" ? "공통" : "바 전용"}
              </option>
            ))
          ) : (
            <option value="">추가 가능 배지 없음</option>
          )}
        </select>
        <button className="button compact secondary" type="button" disabled={disabled || !pendingOption || selected.length >= 3} onClick={addBadge}>
          배지 추가
        </button>
      </div>
    </div>
  );
}

type MenuFilterInput = {
  query: string;
  categoryFilter: string;
  itemTypeFilter: string;
  saleFilter: "all" | "available" | "sold_out";
  visibilityFilter: "all" | "visible" | "hidden";
  badgeFilter: string;
};

type MenuItemWithDraft = MenuItem & {
  __hasDraft?: boolean;
};

function applyMenuDraft(
  item: MenuItem,
  draft: MenuListDraft | undefined,
  categories: MenuItemsResponse["categories"],
  badgeOptions: MenuBadgeOption[]
): MenuItemWithDraft {
  if (!draft) return item;
  const category = draft.categoryId ? categories.find((entry) => entry.id === draft.categoryId) : null;
  return {
    ...item,
    categoryId: draft.categoryId ?? item.categoryId,
    categoryPath: category?.path ?? item.categoryPath,
    saleStatus: draft.saleStatus ?? item.saleStatus,
    isVisible: draft.isVisible ?? item.isVisible,
    sortOrder: draft.sortOrder ?? item.sortOrder,
    badges: draft.badges ? draft.badges.map((badge, index) => toMenuItemBadge(badge, index, badgeOptions)) : item.badges,
    __hasDraft: true
  };
}

function withMenuDraft(current: Record<string, MenuListDraft>, item: MenuItem, patch: MenuListDraft): Record<string, MenuListDraft> {
  const merged = normalizeDraft(item, { ...(current[item.id] ?? {}), ...patch });
  const next = { ...current };
  if (Object.keys(merged).length === 0) delete next[item.id];
  else next[item.id] = merged;
  return next;
}

function normalizeDraft(item: MenuItem, draft: MenuListDraft): MenuListDraft {
  const next: MenuListDraft = {};
  if (draft.saleStatus !== undefined && draft.saleStatus !== item.saleStatus) next.saleStatus = draft.saleStatus;
  if (draft.isVisible !== undefined && draft.isVisible !== item.isVisible) next.isVisible = draft.isVisible;
  if (draft.categoryId !== undefined && draft.categoryId !== item.categoryId) next.categoryId = draft.categoryId;
  if (draft.sortOrder !== undefined && draft.sortOrder !== item.sortOrder) next.sortOrder = draft.sortOrder;
  if (draft.badges !== undefined && !sameBadgeSelections(draft.badges, item.badges)) next.badges = draft.badges;
  return next;
}

function menuMatchesFilters(item: MenuItem, filters: MenuFilterInput): boolean {
  const normalizedQuery = filters.query.trim().toLowerCase();
  const itemTypeKey = item.itemType ? `${item.itemType.source}:${item.itemType.id}` : "none";
  const badgeKeys = item.badges.map(badgeKey);
  const matchesQuery =
    normalizedQuery.length === 0 ||
    item.name.toLowerCase().includes(normalizedQuery) ||
    item.description.toLowerCase().includes(normalizedQuery) ||
    item.categoryPath.toLowerCase().includes(normalizedQuery) ||
    item.itemType?.name.toLowerCase().includes(normalizedQuery) ||
    item.prices.some((price) => price.label.toLowerCase().includes(normalizedQuery) || price.volumeText.toLowerCase().includes(normalizedQuery)) ||
    item.badges.some((badge) => badge.name.toLowerCase().includes(normalizedQuery));
  const matchesCategory = filters.categoryFilter === "all" || item.categoryId === filters.categoryFilter;
  const matchesItemType = filters.itemTypeFilter === "all" || itemTypeKey === filters.itemTypeFilter;
  const matchesSale = filters.saleFilter === "all" || item.saleStatus === filters.saleFilter;
  const matchesVisibility =
    filters.visibilityFilter === "all" || (filters.visibilityFilter === "visible" ? item.isVisible : !item.isVisible);
  const matchesBadge = filters.badgeFilter === "all" || badgeKeys.includes(filters.badgeFilter);
  return matchesQuery && matchesCategory && matchesItemType && matchesSale && matchesVisibility && matchesBadge;
}

function countMenusByCategory(items: MenuItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
  }
  return counts;
}

function toBulkChanges(drafts: Record<string, MenuListDraft>): BulkMenuItemChange[] {
  return Object.entries(drafts).map(([menuItemId, draft]) => ({
    menuItemId,
    ...draft
  }));
}

function toMenuItemBadge(selection: MenuBadgeSelection, displayOrder: number, options: MenuBadgeOption[]): MenuItemBadge {
  const option = options.find((badge) => badge.source === selection.source && badge.id === selection.id);
  return {
    source: selection.source,
    id: selection.id,
    name: option?.name ?? "사용할 수 없는 배지",
    color: option?.color ?? {
      id: "badge-color-missing",
      name: "Unknown",
      backgroundHex: "#666666",
      textColor: "#FFFFFF",
      isActive: false
    },
    displayOrder
  };
}

function sameBadgeSelections(left: MenuBadgeSelection[], right: MenuBadgeSelection[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((badge, index) => badgeKey(badge) === badgeKey(right[index] ?? { source: "system", id: "" }));
}

function badgeKey(badge: MenuBadgeSelection): string {
  return `${badge.source}:${badge.id}`;
}

function hasMenuDraftMarker(item: MenuItem): boolean {
  return Boolean((item as MenuItemWithDraft).__hasDraft);
}

function formatPrices(item: MenuItem): string {
  if (!item.prices.length) return "가격 없음";
  return item.prices.map((price) => `${price.label} ${price.amountMinor.toLocaleString("ko-KR")}원`).join(" · ");
}

function formatRepresentativePrice(item: MenuItem): string {
  const price = item.prices.find((entry) => entry.isRepresentative) ?? item.prices[0];
  if (!price) return "가격 없음";
  return `${price.label} ${price.amountMinor.toLocaleString("ko-KR")}원`;
}

function categoryLeafLabel(path: string): string {
  return path.split(" / ").at(-1) ?? path;
}

function categoryParentLabel(path: string): string {
  const parts = path.split(" / ");
  return parts.length > 1 ? parts.slice(0, -1).join(" / ") : "";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

type DetailTemplate = MenuItemTypeOption["template"];
type DetailField = {
  key: string;
  label: string;
  kind?: "text" | "textarea" | "boolean";
};

const detailFields: Record<Exclude<DetailTemplate, "general">, DetailField[]> = {
  wine: [
    { key: "producer", label: "생산자" },
    { key: "country", label: "국가" },
    { key: "region", label: "지역·아펠라시옹" },
    { key: "grapeVariety", label: "품종" },
    { key: "vintage", label: "빈티지" },
    { key: "style", label: "타입" },
    { key: "sweetness", label: "당도" },
    { key: "body", label: "바디" },
    { key: "acidity", label: "산도" },
    { key: "tannin", label: "탄닌" }
  ],
  whisky: [
    { key: "brand", label: "브랜드·증류소" },
    { key: "country", label: "국가" },
    { key: "region", label: "지역" },
    { key: "classification", label: "분류" },
    { key: "ageStatement", label: "숙성 연수·NAS" },
    { key: "caskFinish", label: "캐스크·피니시" },
    { key: "vintageOrDistilledYear", label: "빈티지·증류연도" },
    { key: "singleCask", label: "싱글 캐스크", kind: "boolean" },
    { key: "caskStrength", label: "캐스크 스트렝스", kind: "boolean" },
    { key: "nonChillFiltered", label: "논 칠 필터드", kind: "boolean" }
  ],
  spirit: [
    { key: "brand", label: "브랜드·생산자" },
    { key: "country", label: "국가" },
    { key: "region", label: "지역·원산지" },
    { key: "subType", label: "하위 유형" },
    { key: "baseIngredient", label: "주원료" },
    { key: "agingGrade", label: "숙성·등급" },
    { key: "cask", label: "캐스크" }
  ],
  beer: [
    { key: "brewery", label: "브루어리" },
    { key: "country", label: "국가" },
    { key: "style", label: "스타일" },
    { key: "ibu", label: "IBU" },
    { key: "ingredientsFlavor", label: "재료·풍미", kind: "textarea" }
  ],
  cocktail: [
    { key: "baseSpirit", label: "베이스 스피릿" },
    { key: "ingredients", label: "주요 재료", kind: "textarea" },
    { key: "tasteStyle", label: "맛·스타일" },
    { key: "method", label: "제조법" },
    { key: "garnish", label: "가니시" },
    { key: "glass", label: "글라스" }
  ],
  food: [
    { key: "mainIngredients", label: "주요 재료", kind: "textarea" },
    { key: "allergens", label: "알레르겐", kind: "textarea" },
    { key: "spiceLevel", label: "매운 정도" },
    { key: "dietary", label: "식이 라벨" },
    { key: "servingSize", label: "제공량" },
    { key: "pairing", label: "페어링" }
  ],
  cigar: [
    { key: "brand", label: "브랜드" },
    { key: "line", label: "라인" },
    { key: "origin", label: "원산지" },
    { key: "vitola", label: "비톨라" },
    { key: "length", label: "길이" },
    { key: "ringGauge", label: "링 게이지" },
    { key: "wrapper", label: "래퍼" },
    { key: "binder", label: "바인더" },
    { key: "filler", label: "필러" },
    { key: "strength", label: "강도" },
    { key: "flavor", label: "풍미", kind: "textarea" },
    { key: "smokingTime", label: "예상 흡연 시간" }
  ]
};

function DetailFields({
  details,
  disabled,
  onChange
}: {
  details: MenuItemDetails;
  disabled: boolean;
  onChange: (field: string, value: string | boolean) => void;
}) {
  if (details.template === "general") return null;
  const fields = detailFields[details.template];
  return (
    <div className="menu-detail-grid">
      {fields.map((field) => {
        const value = (details as Record<string, string | boolean>)[field.key];
        if (field.kind === "boolean") {
          return (
            <label className="check-row detail-check" key={field.key}>
              <input
                type="checkbox"
                checked={Boolean(value)}
                disabled={disabled}
                onChange={(event) => onChange(field.key, event.target.checked)}
              />
              {field.label}
            </label>
          );
        }
        const textarea = field.kind === "textarea";
        return (
          <label className={`field ${textarea ? "full" : ""}`} key={field.key}>
            <span>{field.label}</span>
            {textarea ? (
              <textarea
                aria-label={field.label}
                value={String(value ?? "")}
                disabled={disabled}
                maxLength={200}
                onChange={(event) => onChange(field.key, event.target.value)}
              />
            ) : (
              <input
                aria-label={field.label}
                value={String(value ?? "")}
                disabled={disabled}
                maxLength={80}
                onChange={(event) => onChange(field.key, event.target.value)}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

function emptyMenuForm(categoryId = ""): MenuForm {
  return {
    categoryId,
    name: "",
    description: "",
    saleStatus: "available",
    isVisible: true,
    abv: "",
    itemTypeKey: "none",
    prices: [],
    details: defaultDetails("general"),
    internalMemo: "",
    confirmDetailReset: false
  };
}

function defaultPricesForType(type: MenuItemTypeOption): PriceForm[] {
  const representativeIndex = defaultRepresentativePriceIndex(type.defaultPriceLabels, type.template);
  return type.defaultPriceLabels.map((label, index) => ({
    localId: nextLocalId(),
    label,
    volumeText: "",
    amountMinor: "",
    isRepresentative: index === representativeIndex
  }));
}

function ensureRepresentativePrices(prices: PriceForm[], template: DetailTemplate): PriceForm[] {
  if (prices.length === 0) return prices;
  const firstRepresentative = prices.findIndex((price) => price.isRepresentative);
  if (firstRepresentative >= 0) {
    return prices.map((price, index) => ({ ...price, isRepresentative: index === firstRepresentative }));
  }
  const representativeIndex = defaultRepresentativePriceIndex(prices.map((price) => price.label), template);
  return prices.map((price, index) => ({ ...price, isRepresentative: index === representativeIndex }));
}

function defaultRepresentativePriceIndex(labels: string[], template: DetailTemplate): number {
  const preferredLabels: Partial<Record<DetailTemplate, string[]>> = {
    whisky: ["샷", "1샷", "shot", "1 shot", "one shot"],
    wine: ["바틀", "보틀", "병", "bottle", "btl"]
  };
  const preferred = labels.findIndex((label) => (preferredLabels[template] ?? []).includes(normalizePriceLabel(label)));
  return preferred >= 0 ? preferred : 0;
}

function normalizePriceLabel(label: string): string {
  return label.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function menuToForm(item: MenuItemDetail | null | undefined): MenuForm {
  if (!item) return emptyMenuForm();
  const template = item.details?.template ?? item.itemType?.template ?? "general";
  return {
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
    saleStatus: item.saleStatus,
    isVisible: item.isVisible,
    abv: item.abv === null ? "" : String(item.abv),
    itemTypeKey: item.itemType ? `${item.itemType.source}:${item.itemType.id}` : "none",
    prices: (item.prices ?? []).map((price) => ({
      localId: price.id,
      label: price.label,
      volumeText: price.volumeText,
      amountMinor: String(price.amountMinor),
      isRepresentative: price.isRepresentative
    })),
    details: item.details ?? defaultDetails(template),
    internalMemo: item.internalMemo ?? "",
    confirmDetailReset: false
  };
}

function formToPayload(
  form: MenuForm,
  canEditInternalMemo: boolean
): { value: CreateMenuItemRequest | UpdateMenuItemRequest } | { errors: FieldErrors } {
  const errors: FieldErrors = {};
  const abvText = form.abv.trim();
  let abv: number | null = null;
  if (abvText.length > 0) {
    const value = Number(abvText);
    if (!Number.isFinite(value)) {
      errors.abv = ["ABV는 숫자로 입력하세요."];
    } else {
      abv = value;
    }
  }
  const normalizedPriceLabels = new Set<string>();
  const prices: MenuItemPriceInput[] = [];
  const priceForms = ensureRepresentativePrices(form.prices, form.details.template);
  priceForms.forEach((price, index) => {
    const label = price.label.trim();
    const amountText = price.amountMinor.trim();
    const amountMinor = Number(amountText);
    const normalizedLabel = label.replace(/\s+/g, " ").toLowerCase();
    if (!label) errors.prices = ["가격 라벨을 입력하세요."];
    if (!amountText || !Number.isInteger(amountMinor) || amountMinor < 0) errors.prices = ["가격 금액은 0 이상의 정수로 입력하세요."];
    if (normalizedPriceLabels.has(normalizedLabel)) errors.prices = ["가격 라벨이 중복됩니다."];
    normalizedPriceLabels.add(normalizedLabel);
    prices.push({
      label,
      volumeText: price.volumeText.trim(),
      amountMinor,
      displayOrder: index,
      isRepresentative: price.isRepresentative
    });
  });
  if (!form.categoryId) errors.categoryId = ["카테고리를 선택하세요."];
  if (Object.keys(errors).length > 0) return { errors };
  const value: CreateMenuItemRequest | UpdateMenuItemRequest = {
    categoryId: form.categoryId,
    name: form.name,
    description: form.description,
    saleStatus: form.saleStatus,
    isVisible: form.isVisible,
    abv,
    itemType: parseItemType(form.itemTypeKey),
    prices,
    details: form.details,
    confirmDetailReset: form.confirmDetailReset
  };
  if (canEditInternalMemo) value.internalMemo = form.internalMemo;
  return {
    value
  };
}

function defaultDetails(template: DetailTemplate): MenuItemDetails {
  switch (template) {
    case "wine":
      return {
        template,
        producer: "",
        country: "",
        region: "",
        grapeVariety: "",
        vintage: "",
        style: "",
        sweetness: "",
        body: "",
        acidity: "",
        tannin: ""
      };
    case "whisky":
      return {
        template,
        brand: "",
        country: "",
        region: "",
        classification: "",
        ageStatement: "",
        caskFinish: "",
        vintageOrDistilledYear: "",
        singleCask: false,
        caskStrength: false,
        nonChillFiltered: false
      };
    case "spirit":
      return {
        template,
        brand: "",
        country: "",
        region: "",
        subType: "",
        baseIngredient: "",
        agingGrade: "",
        cask: ""
      };
    case "beer":
      return {
        template,
        brewery: "",
        country: "",
        style: "",
        ibu: "",
        ingredientsFlavor: ""
      };
    case "cocktail":
      return {
        template,
        baseSpirit: "",
        ingredients: "",
        tasteStyle: "",
        method: "",
        garnish: "",
        glass: ""
      };
    case "food":
      return {
        template,
        mainIngredients: "",
        allergens: "",
        spiceLevel: "",
        dietary: "",
        servingSize: "",
        pairing: ""
      };
    case "cigar":
      return {
        template,
        brand: "",
        line: "",
        origin: "",
        vitola: "",
        length: "",
        ringGauge: "",
        wrapper: "",
        binder: "",
        filler: "",
        strength: "",
        flavor: "",
        smokingTime: ""
      };
    case "general":
      return { template };
  }
}

function templateLabel(template: DetailTemplate): string {
  const labels: Record<DetailTemplate, string> = {
    general: "일반",
    wine: "와인",
    whisky: "위스키",
    spirit: "스피릿",
    beer: "맥주",
    cocktail: "칵테일",
    food: "푸드",
    cigar: "시가"
  };
  return labels[template];
}

function detailsHasContent(details: MenuItemDetails): boolean {
  return Object.entries(details).some(([key, value]) => {
    if (key === "template") return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "boolean") return value;
    return value !== null && value !== undefined;
  });
}

function moveArrayItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

function nextLocalId(): string {
  return `draft-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function createDraftStorageKey(barId: string): string {
  return `thebar:menu-create-drafts:v1:${barId}`;
}

function readCreateDrafts(barId: string): MenuCreateDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(createDraftStorageKey(barId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMenuCreateDraft);
  } catch {
    return [];
  }
}

function writeCreateDrafts(barId: string, drafts: MenuCreateDraft[]): void {
  if (typeof window === "undefined") return;
  if (drafts.length === 0) {
    window.sessionStorage.removeItem(createDraftStorageKey(barId));
    return;
  }
  window.sessionStorage.setItem(createDraftStorageKey(barId), JSON.stringify(drafts));
}

function isMenuCreateDraft(value: unknown): value is MenuCreateDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<MenuCreateDraft>;
  return typeof draft.clientDraftId === "string" && typeof draft.savedAt === "string" && isMenuForm(draft.form);
}

function isMenuForm(value: unknown): value is MenuForm {
  if (!value || typeof value !== "object") return false;
  const form = value as Partial<MenuForm>;
  return (
    typeof form.categoryId === "string" &&
    typeof form.name === "string" &&
    typeof form.description === "string" &&
    (form.saleStatus === "available" || form.saleStatus === "sold_out") &&
    typeof form.isVisible === "boolean" &&
    typeof form.abv === "string" &&
    typeof form.itemTypeKey === "string" &&
    Array.isArray(form.prices) &&
    Boolean(form.details) &&
    typeof form.internalMemo === "string" &&
    typeof form.confirmDetailReset === "boolean"
  );
}

function parseItemType(value: string): MenuItemTypeSelection | null {
  if (value === "none") return null;
  const [source, id] = value.split(":");
  if ((source === "system" || source === "bar") && id) return { source, id };
  return null;
}

function MenuStatusState<T>({ state, navigate }: { state: LoadState<T>; navigate: Navigate }) {
  if (state.status === "loading") {
    return <LoadingSkeleton ariaLabel="메뉴 정보 로딩 중" />;
  }
  if (state.status === "unauthenticated") {
    return (
      <MenuStatus title="로그인이 필요합니다" message={state.message}>
        <button className="button primary" type="button" onClick={() => navigate("/login")}>
          로그인으로 이동
        </button>
      </MenuStatus>
    );
  }
  if (state.status === "forbidden") {
    return <MenuStatus title="접근할 수 없습니다" message={state.message} tone="error" />;
  }
  if (state.status === "error") {
    return <MenuStatus title="메뉴 정보를 불러오지 못했습니다" message={state.message} tone="error" />;
  }
  return null;
}

function MenuStatus({
  title,
  message,
  tone = "info",
  children
}: {
  title: string;
  message: string;
  tone?: "info" | "error";
  children?: ReactNode;
}) {
  return (
    <section className={`panel dashboard-status ${tone}`} role={tone === "error" ? "alert" : "status"}>
      <h1>{title}</h1>
      <p>{message}</p>
      {children}
    </section>
  );
}

function toLoadError<T>(error: unknown): LoadState<T> {
  if (error instanceof AuthApiError && ["AUTH_REQUIRED", "SESSION_EXPIRED"].includes(error.code)) {
    return { status: "unauthenticated", message: error.message };
  }
  if (
    error instanceof AuthApiError &&
    ["PASSWORD_CHANGE_REQUIRED", "SYSTEM_ADMIN_REQUIRED", "ACCOUNT_INACTIVE", "BAR_PERMISSION_REQUIRED"].includes(error.code)
  ) {
    return { status: "forbidden", message: error.message };
  }
  return { status: "error", message: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." };
}

function handleFormError(
  error: unknown,
  setErrors: (errors: FieldErrors) => void,
  setMessage: (message: string) => void,
  setStatus: (status: SaveState) => void
): void {
  setStatus("error");
  if (error instanceof AuthApiError) {
    setErrors(error.fieldErrors);
    setMessage(error.message);
    return;
  }
  setErrors({});
  setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.");
}

function confirmDiscard(isDirty: boolean, onConfirm: () => void): void {
  if (!isDirty || window.confirm("저장하지 않은 입력을 버릴까요?")) {
    onConfirm();
  }
}
