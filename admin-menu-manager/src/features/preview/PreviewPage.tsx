import { useEffect, useMemo, useState } from "react";
import { PublicMenuRenderer } from "../../../../shared/PublicMenuRenderer";
import { filterPublicMenu, flattenPublicCategorySections } from "../../../../shared/publicMenu";
import type { PublicMenuPreviewResponse, PreviewScopeOption } from "../../../contracts/preview";
import { AuthApiError } from "../auth/authApi";
import { readPublicMenuPreview } from "./previewApi";

type Navigate = (path: string) => void;

type PreviewState =
  | { status: "loading" }
  | { status: "ready"; data: PublicMenuPreviewResponse }
  | { status: "forbidden"; message: string }
  | { status: "not-found"; message: string }
  | { status: "error"; message: string; code?: string };

export function PreviewPage({ barId, navigate }: { barId: string; navigate: Navigate }) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [scopeId, setScopeId] = useState("all");

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    readPublicMenuPreview(barId)
      .then((data) => {
        if (cancelled) return;
        setScopeId((current) => (data.scopeOptions.some((option) => option.id === current) ? current : "all"));
        setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof AuthApiError && ["AUTH_REQUIRED", "SESSION_EXPIRED"].includes(error.code)) {
          setState({ status: "forbidden", message: "로그인이 필요합니다." });
          return;
        }
        if (error instanceof AuthApiError && error.code === "BAR_NOT_FOUND") {
          setState({ status: "not-found", message: error.message });
          return;
        }
        if (error instanceof AuthApiError && error.code === "BAR_PERMISSION_REQUIRED") {
          setState({ status: "forbidden", message: error.message });
          return;
        }
        setState({
          status: "error",
          code: error instanceof AuthApiError ? error.code : undefined,
          message: error instanceof Error ? error.message : "미리보기를 불러오지 못했습니다."
        });
      });
    return () => {
      cancelled = true;
    };
  }, [barId]);

  if (state.status === "loading") return <PreviewStatus title="미리보기 로딩 중" message="저장된 메뉴 데이터를 고객 화면 형식으로 변환하고 있습니다." />;
  if (state.status === "forbidden") return <PreviewStatus title="접근할 수 없습니다" message={state.message} tone="error" />;
  if (state.status === "not-found") return <PreviewStatus title="바를 찾을 수 없습니다" message={state.message} tone="error" />;
  if (state.status === "error") {
    return (
      <PreviewStatus
        title={state.code === "PUBLIC_SCHEMA_INVALID" ? "공개 데이터 오류" : "미리보기 오류"}
        message={state.message}
        tone="error"
      />
    );
  }

  return (
    <PreviewReadyView
      data={state.data}
      query={query}
      scopeId={scopeId}
      onQueryChange={setQuery}
      onScopeChange={setScopeId}
      navigate={navigate}
    />
  );
}

function PreviewReadyView({
  data,
  query,
  scopeId,
  onQueryChange,
  onScopeChange,
  navigate
}: {
  data: PublicMenuPreviewResponse;
  query: string;
  scopeId: string;
  onQueryChange: (query: string) => void;
  onScopeChange: (scopeId: string) => void;
  navigate: Navigate;
}) {
  const selectedScope = data.scopeOptions.find((option) => option.id === scopeId) ?? data.scopeOptions[0];
  const filteredMenu = useMemo(() => filterPublicMenu(data.menu, query), [data.menu, query]);
  const selectedCategoryId = selectedScope?.type === "category" ? selectedScope.id : selectedScope?.type === "menu" ? selectedScope.categoryId ?? null : null;
  const selectedItemId = selectedScope?.type === "menu" ? selectedScope.id : null;
  const sections = flattenPublicCategorySections(filteredMenu.categories);

  return (
    <div className="preview-page">
      <section className="hero-panel" aria-labelledby="preview-title">
        <div>
          <p className="eyebrow">고객 메뉴판 미리보기</p>
          <h1 id="preview-title">메뉴판 미리보기</h1>
          <p>저장된 운영 데이터를 고객 메뉴판 형태로 변환해 발행 전 결과를 검증합니다.</p>
        </div>
        <div className="status-box">
          <span>공개 데이터</span>
          <strong>{data.schema.valid ? "검증 통과" : "검증 필요"}</strong>
          <small>{publicMenuStatusLabel(data.menu.status)} · 검증 번호 {data.menu.contentHash.slice(0, 12)}</small>
        </div>
      </section>

      <section className="panel preview-control-panel" aria-labelledby="preview-controls-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">공개 데이터</p>
            <h2 id="preview-controls-title">검증 범위</h2>
          </div>
          <div className="preview-actions">
            <button className="button secondary" type="button" onClick={() => navigate(`/bars/${data.bar.id}/menus`)}>
              메뉴 편집
            </button>
            <button className="button primary" type="button" onClick={() => navigate(`/bars/${data.bar.id}/publications`)}>
              발행
            </button>
          </div>
        </div>

        <div className="preview-filter-grid">
          <label className="field">
            <span>미리보기 범위</span>
            <select aria-label="미리보기 범위" value={scopeId} onChange={(event) => onScopeChange(event.target.value)}>
              {data.scopeOptions.map((option) => (
                <option key={`${option.type}-${option.id}`} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>고객 메뉴 검색</span>
            <input
              aria-label="고객 메뉴 검색"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="메뉴명, 가격, 배지, 상세"
            />
          </label>
        </div>

        <div className="preview-callout" role="status">
          저장되지 않은 입력값은 미리보기에 반영되지 않습니다. 내부 메모, 내부 ID, 사용자 정보는 공개 메뉴판 데이터에서 제외됩니다.
        </div>
        <div className="preview-hash-grid">
          <div>
            <span>고객 경로</span>
            <strong>{data.bar.customerPath}</strong>
          </div>
          <div>
            <span>검증 번호</span>
            <strong>{data.hash.contentHash.slice(0, 16)}</strong>
          </div>
          <div>
            <span>표시 섹션</span>
            <strong>{sections.length}개</strong>
          </div>
        </div>
      </section>

      <section className="panel preview-frame-panel" aria-labelledby="preview-frame-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">고객 화면</p>
            <h2 id="preview-frame-title">실제 고객 레이아웃</h2>
          </div>
          <span className="status-badge">{selectedScope?.label ?? "전체 메뉴판"}</span>
        </div>
        <div className="preview-frame">
          <PublicMenuRenderer
            menu={filteredMenu}
            selectedCategoryId={selectedCategoryId}
            selectedItemId={selectedItemId}
            onSelectCategory={(categoryId) => onScopeChange(categoryId || "all")}
            onSelectItem={onScopeChange}
          />
        </div>
      </section>
    </div>
  );
}

function publicMenuStatusLabel(status: string): string {
  if (status === "published") return "공개 중";
  return "준비 중";
}

function PreviewStatus({
  title,
  message,
  tone = "info"
}: {
  title: string;
  message: string;
  tone?: "info" | "error";
}) {
  return (
    <section className={`panel state-panel ${tone}`} role={tone === "error" ? "alert" : "status"}>
      <p className="eyebrow">고객 메뉴판 미리보기</p>
      <h1>{title}</h1>
      <p>{message}</p>
    </section>
  );
}
