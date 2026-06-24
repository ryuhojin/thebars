import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { CategoriesResponse, Category } from "../../../contracts/categories";
import { AuthApiError } from "../auth/authApi";
import { useDirtyWarning } from "../auth/useDirtyWarning";
import { createCategory, deleteCategory, moveCategory, readCategories, reorderCategories, updateCategory } from "./categoriesApi";

type Navigate = (path: string) => void;
type FieldErrors = Record<string, string[]>;
type SaveState = "idle" | "saving" | "error";
type EditorMode = "editing" | "creating";
type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "unauthenticated"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "error"; message: string };

type CategoryForm = {
  parentId: string | null;
  name: string;
  description: string;
  showDescription: boolean;
  isVisible: boolean;
  confirmCascade: boolean;
};

export function CategoriesPage({ barId, navigate }: { barId: string; navigate: Navigate }) {
  const [state, setState] = useState<LoadState<CategoriesResponse>>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState<EditorMode>("editing");
  const [form, setForm] = useState<CategoryForm>(emptyCategoryForm());
  const [original, setOriginal] = useState<CategoryForm>(emptyCategoryForm());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<SaveState>("idle");
  const [query, setQuery] = useState("");
  const [draggedId, setDraggedId] = useState("");
  const selectedIdRef = useRef("");

  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  useDirtyWarning(dirty);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    readCategories(barId)
      .then((data) => {
        if (cancelled) return;
        const selected = data.categories.find((category) => category.id === selectedIdRef.current) ?? data.categories[0];
        if (selected) {
          const nextForm = categoryToForm(selected);
          setSelectedId(selected.id);
          setMode("editing");
          setForm(nextForm);
          setOriginal(nextForm);
        } else {
          const nextForm = emptyCategoryForm();
          setSelectedId("");
          setMode("creating");
          setForm(nextForm);
          setOriginal(nextForm);
        }
        setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [barId, reloadKey]);

  const categories = state.status === "ready" ? state.data.categories : [];
  const topCategories = useMemo(() => sortCategories(categories.filter((category) => category.parentId === null)), [categories]);
  const selectedCategory = categories.find((category) => category.id === selectedId) ?? null;
  const visibleCategories = useMemo(() => filterTree(categories, query), [categories, query]);
  const topLevelOptions = topCategories.filter((category) => category.id !== selectedId);
  const childOptionsAllowed = selectedCategory?.parentId === null;

  if (state.status !== "ready") return <CategoriesStatusState state={state} navigate={navigate} />;

  const startCreateRoot = () => {
    confirmDiscard(dirty, () => {
      const nextForm = emptyCategoryForm(null);
      setMode("creating");
      setSelectedId("");
      setForm(nextForm);
      setOriginal(nextForm);
      resetFeedback();
    });
  };

  const startCreateChild = () => {
    if (!selectedCategory || selectedCategory.parentId !== null) return;
    confirmDiscard(dirty, () => {
      const nextForm = emptyCategoryForm(selectedCategory.id);
      setMode("creating");
      setSelectedId("");
      setForm(nextForm);
      setOriginal(nextForm);
      resetFeedback();
    });
  };

  const selectCategory = (categoryId: string) => {
    confirmDiscard(dirty, () => {
      const category = categories.find((item) => item.id === categoryId);
      if (!category) return;
      const nextForm = categoryToForm(category);
      setSelectedId(category.id);
      setMode("editing");
      setForm(nextForm);
      setOriginal(nextForm);
      resetFeedback();
    });
  };

  const saveCategory = (event: FormEvent) => {
    event.preventDefault();
    setStatus("saving");
    setErrors({});
    setMessage("");
    const request =
      mode === "creating"
        ? createCategory(barId, {
            parentId: form.parentId,
            name: form.name,
            description: form.description,
            showDescription: form.showDescription,
            isVisible: form.isVisible
          })
        : updateCategory(barId, selectedId, {
            name: form.name,
            description: form.description,
            showDescription: form.showDescription,
            isVisible: form.isVisible
          });
    request
      .then((data) => {
        setState({ status: "ready", data });
        const saved = findSavedCategory(data.categories, mode === "creating" ? "" : selectedId, form.name, form.parentId);
        const nextForm = categoryToForm(saved ?? data.categories[0]);
        setSelectedId(saved?.id ?? data.categories[0]?.id ?? "");
        setMode("editing");
        setForm(nextForm);
        setOriginal(nextForm);
        setMessage("카테고리를 저장했습니다.");
        setStatus("idle");
      })
      .catch((error: unknown) => handleFormError(error, setErrors, setMessage, setStatus));
  };

  const moveSelected = (parentId: string | null) => {
    if (!selectedId) return;
    setStatus("saving");
    moveCategory(barId, selectedId, { parentId })
      .then((data) => {
        setState({ status: "ready", data });
        const moved = data.categories.find((category) => category.id === selectedId);
        const nextForm = categoryToForm(moved);
        setForm(nextForm);
        setOriginal(nextForm);
        setMessage("카테고리를 이동했습니다.");
        setStatus("idle");
      })
      .catch((error: unknown) => handleFormError(error, setErrors, setMessage, setStatus));
  };

  const reorderSibling = (categoryId: string, direction: -1 | 1) => {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return;
    const siblings = sortCategories(categories.filter((item) => item.parentId === category.parentId));
    const index = siblings.findIndex((item) => item.id === categoryId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;
    const ordered = [...siblings];
    const [moved] = ordered.splice(index, 1);
    if (!moved) return;
    ordered.splice(targetIndex, 0, moved);
    saveOrder(category.parentId, ordered.map((item) => item.id), "카테고리 순서를 저장했습니다.");
  };

  const dropOnCategory = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const dragged = categories.find((item) => item.id === draggedId);
    const target = categories.find((item) => item.id === targetId);
    setDraggedId("");
    if (!dragged || !target || dragged.parentId !== target.parentId) return;
    const siblings = sortCategories(categories.filter((item) => item.parentId === target.parentId));
    const from = siblings.findIndex((item) => item.id === draggedId);
    const to = siblings.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const ordered = [...siblings];
    const [moved] = ordered.splice(from, 1);
    if (!moved) return;
    ordered.splice(to, 0, moved);
    saveOrder(target.parentId, ordered.map((item) => item.id), "드래그 정렬을 저장했습니다.");
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setStatus("saving");
    setErrors({});
    setMessage("");
    deleteCategory(barId, selectedId, { confirmCascade: form.confirmCascade })
      .then(() => {
        setMessage("카테고리를 삭제했습니다.");
        setStatus("idle");
        setSelectedId("");
        setReloadKey((value) => value + 1);
      })
      .catch((error: unknown) => handleFormError(error, setErrors, setMessage, setStatus));
  };

  function saveOrder(parentId: string | null, orderedIds: string[], successMessage: string) {
    setStatus("saving");
    reorderCategories(barId, { parentId, orderedIds })
      .then((data) => {
        setState({ status: "ready", data });
        setMessage(successMessage);
        setStatus("idle");
      })
      .catch((error: unknown) => handleFormError(error, setErrors, setMessage, setStatus));
  }

  function resetFeedback() {
    setErrors({});
    setMessage("");
    setStatus("idle");
  }

  return (
    <div className="categories-page">
      <section className="hero-panel" aria-labelledby="categories-title">
        <div>
          <p className="eyebrow">카테고리 구조</p>
          <h1 id="categories-title">카테고리 관리</h1>
          <p>{state.data.bar.name}의 2단계 카테고리를 생성, 정렬, 이동, 숨김 처리합니다.</p>
        </div>
        <div className="status-box" role="status">
          <span>단일 URL</span>
          <strong>/bars/{barId}/categories</strong>
          <button className="button secondary compact" type="button" onClick={() => setReloadKey((value) => value + 1)}>
            새로고침
          </button>
        </div>
      </section>

      <div className="category-workspace">
        <section className="panel" aria-labelledby="category-tree-title">
          <div className="section-heading category-section-heading">
            <div>
              <p className="eyebrow">카테고리 트리</p>
              <h2 id="category-tree-title">카테고리 구조</h2>
            </div>
            <button className="button secondary" type="button" onClick={startCreateRoot}>
              상위 추가
            </button>
          </div>

          <label className="field">
            <span>카테고리 검색</span>
            <input
              aria-label="카테고리 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="위스키, 칵테일"
            />
          </label>

          {visibleCategories.length ? (
            <div className="category-tree" role="tree" aria-label="카테고리 구조">
              {sortCategories(visibleCategories.filter((category) => category.parentId === null)).map((root) => (
                <CategoryTreeNode
                  key={root.id}
                  category={root}
                  children={sortCategories(visibleCategories.filter((category) => category.parentId === root.id))}
                  selectedId={selectedId}
                  onSelect={selectCategory}
                  onMoveUp={() => reorderSibling(root.id, -1)}
                  onMoveDown={() => reorderSibling(root.id, 1)}
                  onDragStart={() => setDraggedId(root.id)}
                  onDrop={() => dropOnCategory(root.id)}
                  onChildMoveUp={(id) => reorderSibling(id, -1)}
                  onChildMoveDown={(id) => reorderSibling(id, 1)}
                  onChildDragStart={setDraggedId}
                  onChildDrop={dropOnCategory}
                />
              ))}
            </div>
          ) : (
            <div className="dashboard-empty">
              <strong>{categories.length ? "검색 결과 없음" : "카테고리가 없습니다"}</strong>
              <p>상위 카테고리를 추가해 메뉴 구조를 시작하세요.</p>
            </div>
          )}
        </section>

        <section className="panel category-editor-panel" aria-labelledby="category-editor-title">
          <div className="section-heading category-section-heading">
            <div>
              <p className="eyebrow">편집기</p>
              <h2 id="category-editor-title">{mode === "creating" ? "카테고리 추가" : selectedCategory?.name ?? "카테고리 편집"}</h2>
            </div>
            <button className="button secondary" type="button" onClick={startCreateChild} disabled={!childOptionsAllowed}>
              하위 추가
            </button>
          </div>

          <form className="category-editor" onSubmit={saveCategory}>
            <label className="field">
              <span>상위 카테고리</span>
              <select
                aria-label="상위 카테고리"
                value={form.parentId ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value || null }))}
                disabled={mode === "editing"}
              >
                <option value="">상위 없음</option>
                {topLevelOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>카테고리 이름</span>
              <input
                aria-label="카테고리 이름"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
              <FieldError errors={errors} field="name" />
            </label>

            <label className="field">
              <span>설명</span>
              <textarea
                aria-label="설명"
                value={form.description}
                maxLength={100}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
              <FieldError errors={errors} field="description" />
            </label>

            <div className="category-toggle-grid">
              <label className="check-row">
                <input
                  aria-label="설명 고객 노출"
                  type="checkbox"
                  checked={form.showDescription}
                  onChange={(event) => setForm((current) => ({ ...current, showDescription: event.target.checked }))}
                />
                <span>설명 고객 노출</span>
              </label>
              <label className="check-row">
                <input
                  aria-label="카테고리 노출"
                  type="checkbox"
                  checked={form.isVisible}
                  onChange={(event) => setForm((current) => ({ ...current, isVisible: event.target.checked }))}
                />
                <span>카테고리 노출</span>
              </label>
            </div>

            {mode === "editing" && selectedCategory ? (
              <div className="category-move-panel">
                <label className="field">
                  <span>다른 상위로 이동</span>
                  <select
                    aria-label="다른 상위로 이동"
                    value={selectedCategory.parentId ?? ""}
                    onChange={(event) => moveSelected(event.target.value || null)}
                  >
                    <option value="">상위 없음</option>
                    {topLevelOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="category-meta-grid">
                  <span className="status-badge">{selectedCategory.publicId}</span>
                  <span className="status-badge">{selectedCategory.childCount} 하위</span>
                  <span className="status-badge">{selectedCategory.menuCount} 메뉴</span>
                  <span className="status-badge">수정 {selectedCategory.updatedByUsername}</span>
                </div>
              </div>
            ) : null}

            {mode === "editing" ? (
              <label className="check-row">
                <input
                  aria-label="하위 카테고리 함께 삭제 확인"
                  type="checkbox"
                  checked={form.confirmCascade}
                  onChange={(event) => setForm((current) => ({ ...current, confirmCascade: event.target.checked }))}
                />
                <span>비어 있는 하위 카테고리도 함께 삭제합니다.</span>
              </label>
            ) : null}

            <FormMessage status={status} message={message} />
            <div className="dialog-actions">
              {mode === "editing" ? (
                <button className="button secondary" type="button" onClick={deleteSelected} disabled={status === "saving"}>
                  삭제
                </button>
              ) : null}
              <button className="button primary" type="submit" disabled={status === "saving"}>
                {mode === "creating" ? "카테고리 추가" : "저장"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function CategoryTreeNode({
  category,
  children,
  selectedId,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDrop,
  onChildMoveUp,
  onChildMoveDown,
  onChildDragStart,
  onChildDrop
}: {
  category: Category;
  children: Category[];
  selectedId: string;
  onSelect: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onChildMoveUp: (id: string) => void;
  onChildMoveDown: (id: string) => void;
  onChildDragStart: (id: string) => void;
  onChildDrop: (id: string) => void;
}) {
  return (
    <div className="category-node">
      <CategoryRow
        category={category}
        selectedId={selectedId}
        level={0}
        onSelect={onSelect}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDragStart={onDragStart}
        onDrop={onDrop}
      />
      {children.length ? (
        <div className="category-children">
          {children.map((child) => (
            <CategoryRow
              key={child.id}
              category={child}
              selectedId={selectedId}
              level={1}
              onSelect={onSelect}
              onMoveUp={() => onChildMoveUp(child.id)}
              onMoveDown={() => onChildMoveDown(child.id)}
              onDragStart={() => onChildDragStart(child.id)}
              onDrop={() => onChildDrop(child.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CategoryRow({
  category,
  selectedId,
  level,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDrop
}: {
  category: Category;
  selectedId: string;
  level: 0 | 1;
  onSelect: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  return (
    <div
      className="category-row"
      data-selected={category.id === selectedId}
      data-level={level}
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      role="treeitem"
      aria-selected={category.id === selectedId}
    >
      <button className="category-select-button" type="button" onClick={() => onSelect(category.id)}>
        <strong>{category.name}</strong>
        <span>
          {category.menuCount ? `메뉴 ${category.menuCount}개` : "메뉴 없음"} · {category.isVisible ? "노출" : "숨김"}
        </span>
      </button>
      <div className="category-row-actions" aria-label={`${category.name} 정렬`}>
        <button className="icon-button" type="button" aria-label={`${category.name} 위로 이동`} onClick={onMoveUp}>
          ↑
        </button>
        <button className="icon-button" type="button" aria-label={`${category.name} 아래로 이동`} onClick={onMoveDown}>
          ↓
        </button>
      </div>
    </div>
  );
}

function CategoriesStatusState({ state, navigate }: { state: LoadState<CategoriesResponse>; navigate: Navigate }) {
  if (state.status === "ready") return null;
  return (
    <section className="panel status-panel" aria-live="polite">
      <h1>{state.status === "loading" ? "카테고리를 불러오는 중" : "카테고리를 표시할 수 없습니다"}</h1>
      {state.status !== "loading" ? <p>{state.message}</p> : null}
      {state.status === "unauthenticated" ? (
        <button className="button primary" type="button" onClick={() => navigate("/login")}>
          로그인으로 이동
        </button>
      ) : null}
    </section>
  );
}

function FieldError({ errors, field }: { errors: FieldErrors; field: string }) {
  const messages = errors[field];
  return messages?.length ? <span className="field-error">{messages.join(" ")}</span> : null;
}

function FormMessage({ status, message }: { status: SaveState; message: string }) {
  if (!message) return null;
  return <div className={status === "error" ? "form-status" : "form-status success"}>{message}</div>;
}

function emptyCategoryForm(parentId: string | null = null): CategoryForm {
  return {
    parentId,
    name: "",
    description: "",
    showDescription: false,
    isVisible: true,
    confirmCascade: false
  };
}

function categoryToForm(category?: Category): CategoryForm {
  if (!category) return emptyCategoryForm();
  return {
    parentId: category.parentId,
    name: category.name,
    description: category.description,
    showDescription: category.showDescription,
    isVisible: category.isVisible,
    confirmCascade: false
  };
}

function sortCategories(categories: Category[]): Category[] {
  return [...categories].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "ko"));
}

function filterTree(categories: Category[], query: string): Category[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return categories;
  const directMatches = new Set(categories.filter((category) => category.name.toLowerCase().includes(normalized)).map((category) => category.id));
  for (const category of categories) {
    if (category.parentId && directMatches.has(category.id)) directMatches.add(category.parentId);
  }
  return categories.filter((category) => directMatches.has(category.id));
}

function findSavedCategory(categories: Category[], id: string, name: string, parentId: string | null): Category | undefined {
  return categories.find((category) => category.id === id) ?? categories.find((category) => category.name === name.trim() && category.parentId === parentId);
}

function handleFormError(
  error: unknown,
  setErrors: (errors: FieldErrors) => void,
  setMessage: (message: string) => void,
  setStatus: (status: SaveState) => void
) {
  setStatus("error");
  if (error instanceof AuthApiError) {
    setErrors(error.fieldErrors);
    const childCount = typeof error.details.childCount === "number" ? ` 하위 ${error.details.childCount}개.` : "";
    setMessage(`${error.message}${childCount}`);
    return;
  }
  setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.");
}

function toLoadError(error: unknown): LoadState<never> {
  if (error instanceof AuthApiError) {
    if (error.code === "AUTH_REQUIRED") return { status: "unauthenticated", message: error.message };
    if (error.code === "SYSTEM_ADMIN_REQUIRED" || error.code === "BAR_PERMISSION_REQUIRED") {
      return { status: "forbidden", message: error.message };
    }
    return { status: "error", message: error.message };
  }
  return { status: "error", message: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." };
}

function confirmDiscard(isDirty: boolean, callback: () => void) {
  if (!isDirty || window.confirm("저장하지 않은 변경을 버릴까요?")) callback();
}
