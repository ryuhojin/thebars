import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { BarDetail, BarListResponse, BarSummary, CreateBarRequest } from "../../../contracts/bars";
import { AdaptiveDialog } from "../../components/adaptive/AdaptiveDialog";
import { AuthApiError } from "../auth/authApi";
import { useDirtyWarning } from "../auth/useDirtyWarning";
import { createBar, readBar, readBars, updateBarLifecycle } from "./barsApi";

type Navigate = (path: string) => void;
type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "unauthenticated"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "error"; message: string };

type FieldErrors = Record<string, string[]>;

export function BarsListPage({ navigate }: { navigate: Navigate }) {
  const [state, setState] = useState<LoadState<BarListResponse>>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    let cancelled = false;
    readBars()
      .then((data) => {
        if (cancelled) return;
        setSelectedId((current) => current || data.items[0]?.id || "");
        setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status !== "ready") {
    return <BarsStatusState state={state} navigate={navigate} />;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredBars = state.data.items.filter((bar) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      bar.name.toLowerCase().includes(normalizedQuery) ||
      bar.customerPath.toLowerCase().includes(normalizedQuery);
    const matchesStatus = statusFilter === "all" || bar.status === statusFilter;
    return matchesQuery && matchesStatus;
  });
  const selectedBar = state.data.items.find((bar) => bar.id === selectedId) ?? null;

  return (
    <div className="bars-page">
      <section className="hero-panel" aria-labelledby="bars-title">
        <div>
          <p className="eyebrow">바 운영 관리</p>
          <h1 id="bars-title">바 관리</h1>
          <p>시스템 관리자가 운영할 바를 등록하고 운영·준비 상태를 확인합니다.</p>
        </div>
        <div className="status-box" role="status">
          <span>총 바</span>
          <strong>{state.data.summary.totalBars}개</strong>
          <small>활성 {state.data.summary.activeBars}개 · 비활성 {state.data.summary.inactiveBars}개</small>
        </div>
      </section>

      <section className="panel" aria-labelledby="bar-list-title">
        <div className="section-heading bars-toolbar">
          <div>
            <p className="eyebrow">등록된 바</p>
            <h2 id="bar-list-title">등록된 바</h2>
          </div>
          <button className="button primary" type="button" onClick={() => navigate("/bars/new")}>
            바 등록
          </button>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>바 검색</span>
            <input
              aria-label="바 이름 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="바 이름 또는 고객 경로"
            />
          </label>
          <label className="field">
            <span>상태 필터</span>
            <select
              aria-label="상태 필터"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}
            >
              <option value="all">전체 상태</option>
              <option value="active">활성</option>
              <option value="inactive">비활성</option>
            </select>
          </label>
        </div>

        {state.data.items.length === 0 ? (
          <EmptyBars navigate={navigate} />
        ) : filteredBars.length === 0 ? (
          <div className="dashboard-empty" role="status">
            <strong>검색 결과가 없습니다.</strong>
            <p>검색어나 상태 필터를 조정하세요.</p>
          </div>
        ) : (
          <>
            <BarsList
              bars={filteredBars}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onOpen={(barId) => navigate(`/bars/${barId}`)}
            />
            <div className="selected-bar-summary" role="status">
              선택: {selectedBar?.name ?? "없음"}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export function BarCreatePage({ navigate }: { navigate: Navigate }) {
  const [authState, setAuthState] = useState<LoadState<true>>({ status: "loading" });
  const [form, setForm] = useState<CreateBarRequest>({ name: "", currency: "KRW" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const dirty = form.name.length > 0 || form.currency !== "KRW";
  useDirtyWarning(dirty && status !== "submitting");

  useEffect(() => {
    let cancelled = false;
    readBars()
      .then(() => {
        if (!cancelled) setAuthState({ status: "ready", data: true });
      })
      .catch((error: unknown) => {
        if (!cancelled) setAuthState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (authState.status !== "ready") {
    return <BarsStatusState state={authState} navigate={navigate} />;
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setFieldErrors({});
    setMessage("");
    createBar(form)
      .then((bar) => {
        setForm({ name: "", currency: "KRW" });
        navigate(`/bars/${bar.id}`);
      })
      .catch((error: unknown) => {
        setStatus("error");
        if (error instanceof AuthApiError) {
          setFieldErrors(error.fieldErrors);
          setMessage(error.message);
          return;
        }
        setMessage(error instanceof Error ? error.message : "바를 생성하지 못했습니다.");
      });
  };

  return (
    <form className="bars-page" onSubmit={submit} noValidate>
      <section className="hero-panel" aria-labelledby="bar-new-title">
        <div>
          <p className="eyebrow">신규 바</p>
          <h1 id="bar-new-title">새 바 등록</h1>
          <p>필수 정보만 입력해 운영 바와 고객 메뉴판 준비 상태를 생성합니다.</p>
        </div>
        <div className="status-box" role="status">
          <span>생성 후</span>
          <strong>고객 경로 자동 생성</strong>
          <small>변경 불가 · 고객 경로 자동 계산</small>
        </div>
      </section>

      <section className="panel bar-form-panel" aria-labelledby="bar-required-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">필수 정보</p>
            <h2 id="bar-required-title">필수 정보</h2>
          </div>
          <span className="step-chip">1 / 1</span>
        </div>

        {Object.keys(fieldErrors).length > 0 ? (
          <div className="form-summary" role="alert">
            입력값을 확인하세요.
          </div>
        ) : null}
        {message ? <div className="form-status" role="alert">{message}</div> : null}

        <div className="bar-form-grid">
          <TextField
            label="바 이름"
            name="name"
            value={form.name}
            error={fieldErrors.name}
            placeholder="예: 한남 와인바"
            onChange={(value) => setForm((current) => ({ ...current, name: value }))}
          />
          <label className="field">
            <span>통화</span>
            <select
              aria-label="통화"
              value={form.currency}
              onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))}
            >
              <option value="KRW">KRW — 대한민국 원</option>
              <option value="USD">USD — 미국 달러</option>
              <option value="JPY">JPY — 일본 엔</option>
              <option value="EUR">EUR — 유로</option>
            </select>
            {fieldErrors.currency?.length ? <strong className="field-error">{fieldErrors.currency[0]}</strong> : null}
          </label>
          <ReadOnlyField label="관리 식별자" value="서버에서 자동 생성" help="생성 후 변경할 수 없습니다." />
          <ReadOnlyField label="고객 메뉴판 경로" value="생성 후 표시" help="고객에게 안내할 공개 경로입니다." />
        </div>

        <div className="dashboard-empty">
          <strong>생성 후 고객 메뉴판은 준비 중 상태입니다.</strong>
          <p>발행 전까지 고객 메뉴판에는 반영되지 않습니다.</p>
        </div>
      </section>

      <StickySubmitBar>
        <button className="button secondary" type="button" onClick={() => confirmDiscard(dirty, () => navigate("/bars"))}>
          취소
        </button>
        <button className="button primary" type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "생성 중" : "생성"}
        </button>
      </StickySubmitBar>
    </form>
  );
}

export function BarDetailPage({ barId, navigate }: { barId: string; navigate: Navigate }) {
  const [state, setState] = useState<LoadState<BarDetail>>({ status: "loading" });
  const [lifecycleDialogOpen, setLifecycleDialogOpen] = useState(false);
  const [lifecycleStatus, setLifecycleStatus] = useState<
    | { status: "idle" }
    | { status: "running" }
    | { status: "success"; message: string }
    | { status: "error"; message: string; code?: string }
  >({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    readBar(barId)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [barId]);

  if (state.status !== "ready") {
    return <BarsStatusState state={state} navigate={navigate} />;
  }

  const bar = state.data;
  const lifecycleLabel = bar.lifecycle.nextAction === "deactivate" ? "비활성화" : "재활성화";
  const runLifecycle = () => {
    setLifecycleStatus({ status: "running" });
    updateBarLifecycle(bar.id, { action: bar.lifecycle.nextAction, confirmImpact: true })
      .then((result) => {
        setState({ status: "ready", data: result.bar });
        setLifecycleStatus({ status: "success", message: result.event.result });
        setLifecycleDialogOpen(false);
      })
      .catch((error: unknown) => {
        setLifecycleStatus({
          status: "error",
          code: error instanceof AuthApiError ? error.code : undefined,
          message: error instanceof Error ? error.message : "바 수명주기 상태를 변경하지 못했습니다."
        });
      });
  };

  return (
    <div className="bars-page">
      <section className="hero-panel" aria-labelledby="bar-overview-title">
        <div>
          <p className="eyebrow">바 상세</p>
          <h1 id="bar-overview-title">{bar.name}</h1>
          <p>
            고객 메뉴판 경로 <code>{bar.customerPath}</code>
          </p>
        </div>
        <div className="status-box" role="status">
          <span>상태</span>
          <strong>{bar.status === "active" ? "활성" : "비활성"}</strong>
          <small>{bar.currency} · {publicMenuStatusLabel(bar.publicMenuStatus)}</small>
        </div>
      </section>

      <section className="dashboard-metrics" aria-label="바 운영 요약">
        {bar.overviewCards.map((card) => (
          <article className="metric-card" data-status={card.status} key={card.id}>
            <div>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
            <p>{card.description}</p>
            {card.unavailableReason ? <small>{card.unavailableReason}</small> : null}
          </article>
        ))}
      </section>

      <div className="dashboard-main">
        <section className="panel" aria-labelledby="bar-info-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">식별 정보</p>
              <h2 id="bar-info-title">바 식별 정보</h2>
            </div>
          </div>
          <dl className="detail-list">
            <div>
              <dt>고객 메뉴판 경로</dt>
              <dd>{bar.customerPath}</dd>
            </div>
            <div>
              <dt>운영 상태</dt>
              <dd>{bar.status === "active" ? "활성" : "비활성"}</dd>
            </div>
            <div>
              <dt>통화</dt>
              <dd>{bar.currency}</dd>
            </div>
            <div>
              <dt>바로 발행</dt>
              <dd>{bar.directPublishEnabled ? "사용" : "사용 안 함"}</dd>
            </div>
          </dl>
        </section>

        <section className="panel" aria-labelledby="bar-actions-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">관리 진입점</p>
              <h2 id="bar-actions-title">관리 진입점</h2>
            </div>
          </div>
          <div className="quick-action-grid">
            <button className="button primary" type="button" onClick={() => navigate(`/bars/${bar.id}/members`)}>
              회원 관리<span>역할·권한</span>
            </button>
            <button className="button secondary" type="button" onClick={() => navigate(`/bars/${bar.id}/categories`)}>
              카테고리 관리<span>2단계 구조·노출</span>
            </button>
            <button className="button secondary" type="button" onClick={() => navigate(`/bars/${bar.id}/menus`)}>
              메뉴 관리<span>기본 CRUD·노출·품절</span>
            </button>
            <button className="button secondary" type="button" onClick={() => navigate(`/bars/${bar.id}/publications`)}>
              발행<span>이력·복구</span>
            </button>
            <button className="button secondary" type="button" onClick={() => navigate(`/bars/${bar.id}/orders`)}>
              테이블 목록<span>주문 추가·계산 요청</span>
            </button>
            <button className="button secondary" type="button" onClick={() => navigate(`/bars/${bar.id}/settlements`)}>
              정산 내역<span>정산 완료 조회</span>
            </button>
            <button className="button secondary" type="button" onClick={() => navigate(`/bars/${bar.id}/settings`)}>
              바 설정<span>영업시간·주소·링크</span>
            </button>
          </div>
        </section>
      </div>

      <section className="panel" aria-labelledby="bar-lifecycle-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">운영 상태</p>
            <h2 id="bar-lifecycle-title">공개 상태 전환</h2>
          </div>
          <button
            className={bar.lifecycle.nextAction === "deactivate" ? "button danger" : "button primary"}
            type="button"
            disabled={!bar.lifecycle.canChangeStatus || lifecycleStatus.status === "running"}
            onClick={() => setLifecycleDialogOpen(true)}
          >
            {lifecycleStatus.status === "running" ? "처리 중" : lifecycleLabel}
          </button>
        </div>
        {!bar.lifecycle.canChangeStatus ? (
          <div className="form-summary" role="alert">
            바 활성/비활성 전환은 시스템 관리자만 수행할 수 있습니다.
          </div>
        ) : null}
        <div className="preview-callout" role="status">
          {bar.lifecycle.impactLabel}
        </div>
        <dl className="detail-list">
          <div>
            <dt>고객 메뉴판 상태</dt>
            <dd>{bar.lifecycle.customerJsonState}</dd>
          </div>
          <div>
            <dt>다음 액션</dt>
            <dd>{lifecycleLabel}</dd>
          </div>
        </dl>
        {lifecycleStatus.status === "success" ? (
          <div className="preview-callout" role="status">
            {lifecycleStatus.message}
          </div>
        ) : null}
        {lifecycleStatus.status === "error" ? (
          <div className="form-summary" role="alert">
            {lifecycleStatus.message}
          </div>
        ) : null}
        {bar.lifecycleEvents.length > 0 ? (
          <div className="activity-list" aria-label="최근 수명주기 이벤트">
            {bar.lifecycleEvents.map((event) => (
              <article className="activity-item" key={event.id}>
                <strong>{event.action === "deactivate" ? "비활성화" : "재활성화"} · {event.afterStatus === "active" ? "활성" : "비활성"}</strong>
                <p>{event.result}</p>
                <small>{formatDate(event.createdAt)}</small>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="publication-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">최근 발행</p>
            <h2 id="publication-title">최근 발행</h2>
          </div>
        </div>
        <div className="activity-item">
          <strong>{bar.recentPublication?.label ?? "발행 이력 없음"}</strong>
          <p>{bar.recentPublication?.description ?? "아직 표시할 발행 이력이 없습니다."}</p>
        </div>
      </section>

      <StickySubmitBar>
        <button className="button secondary" type="button" onClick={() => navigate("/bars")}>
          바 목록
        </button>
        <button className="button primary" type="button" onClick={() => navigate("/bars/new")}>
          새 바 등록
        </button>
      </StickySubmitBar>

      <AdaptiveDialog title={`바 ${lifecycleLabel}`} open={lifecycleDialogOpen} onClose={() => setLifecycleDialogOpen(false)}>
        <div className="dialog-stack">
          <p>{bar.lifecycle.impactLabel}</p>
          <div className="form-summary warning" role="alert">
            실제 운영 비밀값, 원격 반영, 운영 배포는 실행하지 않고 로컬 검증 흐름만 확인합니다.
          </div>
          <div className="dialog-actions">
            <button className="button secondary" type="button" onClick={() => setLifecycleDialogOpen(false)}>
              취소
            </button>
            <button
              className={bar.lifecycle.nextAction === "deactivate" ? "button danger" : "button primary"}
              type="button"
              disabled={lifecycleStatus.status === "running"}
              onClick={runLifecycle}
            >
              {lifecycleStatus.status === "running" ? "처리 중" : `${lifecycleLabel} 실행`}
            </button>
          </div>
        </div>
      </AdaptiveDialog>
    </div>
  );
}

function BarsList({
  bars,
  selectedId,
  onSelect,
  onOpen
}: {
  bars: BarSummary[];
  selectedId: string;
  onSelect: (barId: string) => void;
  onOpen: (barId: string) => void;
}) {
  return (
    <div className="bars-data-view" aria-label="바 목록">
      <table className="data-table bars-table">
        <thead>
          <tr>
            <th scope="col">바</th>
            <th scope="col">상태</th>
            <th scope="col">통화</th>
            <th scope="col">고객 경로</th>
            <th scope="col">공개 상태</th>
            <th scope="col">작업</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.id} data-selected={bar.id === selectedId}>
              <td>
                <strong>{bar.name}</strong>
                <small>{bar.customerPath}</small>
              </td>
              <td>{bar.status === "active" ? "활성" : "비활성"}</td>
              <td>{bar.currency}</td>
              <td>{bar.customerPath}</td>
              <td>{publicMenuStatusLabel(bar.publicMenuStatus)}</td>
              <td>
                <div className="table-actions">
                  <button className="button compact" type="button" onClick={() => onSelect(bar.id)}>
                    선택
                  </button>
                  <button className="button compact secondary" type="button" onClick={() => onOpen(bar.id)}>
                    열기
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="data-cards">
        {bars.map((bar) => (
          <article className="data-card bar-card-summary" key={bar.id} data-selected={bar.id === selectedId}>
            <div>
              <strong>{bar.name}</strong>
              <span>{bar.customerPath}</span>
            </div>
            <div className="card-row">
              <span>상태</span>
              <strong>{bar.status === "active" ? "활성" : "비활성"}</strong>
            </div>
            <div className="card-row">
              <span>통화</span>
              <strong>{bar.currency}</strong>
            </div>
            <div className="card-row">
              <span>고객 경로</span>
              <strong>{bar.customerPath}</strong>
            </div>
            <div className="card-actions">
              <button className="button secondary" type="button" onClick={() => onSelect(bar.id)}>
                선택
              </button>
              <button className="button primary" type="button" onClick={() => onOpen(bar.id)}>
                열기
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function publicMenuStatusLabel(status: string): string {
  if (status === "published") return "공개 중";
  return "준비 중";
}

function EmptyBars({ navigate }: { navigate: Navigate }) {
  return (
    <div className="dashboard-empty" role="status">
      <strong>등록된 바가 없습니다.</strong>
      <p>첫 바를 등록하면 고객 경로가 자동 생성되고 메뉴판 준비 상태로 시작합니다.</p>
      <button className="button primary" type="button" onClick={() => navigate("/bars/new")}>
        바 등록
      </button>
    </div>
  );
}

function BarsStatusState<T>({ state, navigate }: { state: LoadState<T>; navigate: Navigate }) {
  if (state.status === "loading") {
    return <BarsStatus title="바 정보 로딩 중" message="운영 바 데이터를 불러오고 있습니다." />;
  }
  if (state.status === "unauthenticated") {
    return (
      <BarsStatus title="로그인이 필요합니다" message={state.message}>
        <button className="button primary" type="button" onClick={() => navigate("/login")}>
          로그인으로 이동
        </button>
      </BarsStatus>
    );
  }
  if (state.status === "forbidden") {
    return <BarsStatus title="접근할 수 없습니다" message={state.message} tone="error" />;
  }
  if (state.status === "error") {
    return <BarsStatus title="바 정보를 불러오지 못했습니다" message={state.message} tone="error" />;
  }
  return null;
}

function BarsStatus({
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

function TextField({
  label,
  name,
  value,
  onChange,
  placeholder,
  error
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string[];
}) {
  const errorId = `${name}-bar-error`;
  return (
    <label className="field" htmlFor={name}>
      <span>{label}</span>
      <input
        id={name}
        name={name}
        value={value}
        aria-invalid={error?.length ? "true" : undefined}
        aria-describedby={error?.length ? errorId : undefined}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {error?.length ? <strong id={errorId} className="field-error">{error[0]}</strong> : null}
    </label>
  );
}

function ReadOnlyField({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="field">
      <span>{label}</span>
      <output className="readonly-field">{value}</output>
      <small>{help}</small>
    </div>
  );
}

function StickySubmitBar({ children }: { children: ReactNode }) {
  return <div className="sticky-action-bar">{children}</div>;
}

function toLoadError<T>(error: unknown): LoadState<T> {
  if (error instanceof AuthApiError && ["AUTH_REQUIRED", "SESSION_EXPIRED"].includes(error.code)) {
    return { status: "unauthenticated", message: error.message };
  }
  if (error instanceof AuthApiError && ["PASSWORD_CHANGE_REQUIRED", "SYSTEM_ADMIN_REQUIRED", "ACCOUNT_INACTIVE"].includes(error.code)) {
    return { status: "forbidden", message: error.message };
  }
  return { status: "error", message: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function confirmDiscard(isDirty: boolean, onConfirm: () => void): void {
  if (!isDirty || window.confirm("저장하지 않은 입력을 버릴까요?")) {
    onConfirm();
  }
}
