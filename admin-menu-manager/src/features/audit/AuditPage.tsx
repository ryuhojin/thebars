import { useEffect, useMemo, useState } from "react";
import type { AuditListResponse, AuditLog, AuditLogQuery, AuditOperation, AuditResult, MaintenanceRunResponse } from "../../../contracts/audit";
import type { PilotReadinessResponse, PilotReadinessStatus } from "../../../contracts/pilotReadiness";
import { LoadingSkeleton } from "../../components/feedback/LoadingSkeleton";
import { AuthApiError } from "../auth/authApi";
import { readAuditLogs, readPilotReadiness, runMaintenance } from "./auditApi";

type Navigate = (path: string) => void;
type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: AuditListResponse }
  | { status: "unauthenticated"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "error"; message: string; code?: string };

type FilterState = {
  q: string;
  actorUserId: string;
  barId: string;
  operation: AuditOperation | "all";
  result: AuditResult | "all";
  dateFrom: string;
  dateTo: string;
};

type MaintenanceState =
  | { status: "idle" }
  | { status: "running"; dryRun: boolean }
  | { status: "success"; response: MaintenanceRunResponse }
  | { status: "error"; message: string; code?: string };

type PilotReadinessState =
  | { status: "loading" }
  | { status: "ready"; data: PilotReadinessResponse }
  | { status: "error"; message: string; code?: string };

const defaultFilters: FilterState = {
  q: "",
  actorUserId: "all",
  barId: "all",
  operation: "all",
  result: "all",
  dateFrom: "",
  dateTo: ""
};

export function AuditPage({ navigate }: { navigate: Navigate }) {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState("");
  const [maintenance, setMaintenance] = useState<MaintenanceState>({ status: "idle" });
  const [pilotReadiness, setPilotReadiness] = useState<PilotReadinessState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    readPilotReadiness()
      .then((data) => {
        if (!cancelled) setPilotReadiness({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPilotReadiness({
          status: "error",
          code: error instanceof AuthApiError ? error.code : undefined,
          message: error instanceof Error ? error.message : "파일럿 준비 상태를 불러오지 못했습니다."
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState((current) => current.status === "ready" ? current : { status: "loading" });
    readAuditLogs({ ...filters, pageSize: 100 })
      .then((data) => {
        if (cancelled) return;
        setSelectedId((current) => data.items.some((item) => item.id === current) ? current : data.items[0]?.id ?? "");
        setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [filters, reloadKey]);

  const selectedLog = useMemo(
    () => (state.status === "ready" ? state.data.items.find((item) => item.id === selectedId) ?? state.data.items[0] ?? null : null),
    [selectedId, state]
  );

  if (state.status !== "ready") return <AuditStatusState state={state} navigate={navigate} />;

  const executeMaintenance = (dryRun: boolean) => {
    setMaintenance({ status: "running", dryRun });
    runMaintenance({ dryRun })
      .then((response) => {
        setMaintenance({ status: "success", response });
        setReloadKey((value) => value + 1);
      })
      .catch((error: unknown) => {
        setMaintenance({
          status: "error",
          code: error instanceof AuthApiError ? error.code : undefined,
          message: error instanceof Error ? error.message : "보관 작업을 실행하지 못했습니다."
        });
      });
  };

  return (
    <div className="audit-page">
      <section className="hero-panel" aria-labelledby="audit-title">
        <div>
          <p className="eyebrow">운영 감사</p>
          <h1 id="audit-title">감사 로그·보관 작업</h1>
          <p>중요 운영 변경의 작업자, 바, 요청 번호, 결과를 추적하고 오래된 주문·발행 이력을 관리자 권한으로 정리합니다.</p>
        </div>
        <div className="status-box" role="status">
          <span>조회 결과</span>
          <strong>{state.data.summary.total}건</strong>
          <small>성공 {state.data.summary.success} · 실패 {state.data.summary.failure}</small>
        </div>
      </section>

      <PilotReadinessPanel state={pilotReadiness} />

      <section className="panel" aria-labelledby="audit-filter-title">
        <div className="section-heading audit-toolbar">
          <div>
            <p className="eyebrow">조회 조건</p>
            <h2 id="audit-filter-title">로그 필터</h2>
          </div>
          <button className="button secondary" type="button" onClick={() => setFilters(defaultFilters)}>
            초기화
          </button>
        </div>
        <div className="audit-filter-grid">
          <label className="field audit-search-field">
            <span>작업자 또는 요청 번호 검색</span>
            <input
              aria-label="감사 로그 검색"
              value={filters.q}
              onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
              placeholder="작업자, 요청 번호, 대상"
            />
          </label>
          <label className="field">
            <span>바</span>
            <select
              aria-label="감사 로그 바 필터"
              value={filters.barId}
              onChange={(event) => setFilters((current) => ({ ...current, barId: event.target.value }))}
            >
              <option value="all">전체 바</option>
              {state.data.filters.bars.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>행위자</span>
            <select
              aria-label="감사 로그 행위자 필터"
              value={filters.actorUserId}
              onChange={(event) => setFilters((current) => ({ ...current, actorUserId: event.target.value }))}
            >
              <option value="all">전체 행위자</option>
              {state.data.filters.actors.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>작업</span>
            <select
              aria-label="감사 로그 작업 필터"
              value={filters.operation}
              onChange={(event) => setFilters((current) => ({ ...current, operation: event.target.value as AuditOperation | "all" }))}
            >
              <option value="all">전체 작업</option>
              {state.data.filters.operations.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>결과</span>
            <select
              aria-label="감사 로그 결과 필터"
              value={filters.result}
              onChange={(event) => setFilters((current) => ({ ...current, result: event.target.value as AuditResult | "all" }))}
            >
              <option value="all">전체 결과</option>
              {state.data.filters.results.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>시작일</span>
            <input
              aria-label="감사 로그 시작일"
              type="date"
              value={filters.dateFrom}
              onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>종료일</span>
            <input
              aria-label="감사 로그 종료일"
              type="date"
              value={filters.dateTo}
              onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
            />
          </label>
        </div>
      </section>

      <section className="audit-workspace">
        <section className="panel" aria-labelledby="audit-list-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">로그 목록</p>
              <h2 id="audit-list-title">이벤트</h2>
            </div>
            <span className="selected-bar-summary" role="status">선택 {selectedLog ? auditOperationLabel(selectedLog.operation) : "없음"}</span>
          </div>
          {state.data.items.length === 0 ? (
            <div className="dashboard-empty" role="status">
              <strong>감사 로그가 없습니다.</strong>
              <p>필터를 조정하거나 중요한 운영 작업을 먼저 수행하세요.</p>
            </div>
          ) : (
            <AuditLogList items={state.data.items} selectedId={selectedLog?.id ?? ""} onSelect={setSelectedId} />
          )}
        </section>

        <aside className="panel audit-detail-panel" aria-labelledby="audit-detail-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">상세 정보</p>
              <h2 id="audit-detail-title">안전 메타데이터</h2>
            </div>
          </div>
          {selectedLog ? <AuditLogDetail log={selectedLog} /> : <p className="muted-text">선택된 로그가 없습니다.</p>}
        </aside>
      </section>

      <section className="panel" aria-labelledby="maintenance-title">
        <div className="section-heading audit-toolbar">
          <div>
            <p className="eyebrow">보관 정책</p>
            <h2 id="maintenance-title">보관 작업</h2>
          </div>
          <div className="table-actions">
            <button
              className="button secondary"
              type="button"
              disabled={maintenance.status === "running"}
              onClick={() => executeMaintenance(true)}
            >
              미리 계산
            </button>
            <button
              className="button primary"
              type="button"
              disabled={maintenance.status === "running"}
              onClick={() => executeMaintenance(false)}
            >
              실행
            </button>
          </div>
        </div>
        <div className="audit-retention-grid">
          <RetentionMetric label="정리 대상 테이블 기록" value={state.data.maintenance.preview.closedCancelledOrderTabs} />
          <RetentionMetric label="정리 대상 일별 요약" value={state.data.maintenance.preview.dailyOrderSummaries} />
          <RetentionMetric label="초과 발행 이력" value={state.data.maintenance.preview.publicationHistoryOverflow} />
          <RetentionMetric label="마지막 실행" value={state.data.maintenance.lastRun ? formatDateTime(state.data.maintenance.lastRun.finishedAt) : "없음"} />
        </div>
        <p className="muted-text">
          테이블 기준 {formatDateTime(state.data.maintenance.preview.orderTerminalCutoff)} 이전 정산 완료·취소, 일별 요약 기준{" "}
          {state.data.maintenance.preview.dailySummaryCutoffDate} 이전 데이터만 대상입니다.
        </p>
        {maintenance.status === "running" ? (
          <div className="preview-callout" role="status">{maintenance.dryRun ? "정리 대상 계산 중" : "보관 작업 실행 중"}</div>
        ) : null}
        {maintenance.status === "error" ? (
          <div className="form-summary" role="alert">{maintenance.message}</div>
        ) : null}
        {maintenance.status === "success" ? (
          <div className="preview-callout" role="status">
            {maintenance.response.run.dryRun ? "정리 대상 계산 완료" : "보관 작업 완료"} · 주문 {maintenance.response.deleted.closedCancelledOrderTabs} ·
            요약 {maintenance.response.deleted.dailyOrderSummaries} · 발행 {maintenance.response.deleted.publicationHistoryOverflow}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function AuditLogList({ items, selectedId, onSelect }: { items: AuditLog[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="audit-data-view" aria-label="감사 로그 목록">
      <table className="data-table audit-table">
        <thead>
          <tr>
            <th scope="col">시간</th>
            <th scope="col">행위자</th>
            <th scope="col">작업</th>
            <th scope="col">대상</th>
            <th scope="col">결과</th>
            <th scope="col">요청 번호</th>
            <th scope="col">선택</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} data-selected={item.id === selectedId}>
              <td>{formatDateTime(item.occurredAt)}</td>
              <td>{item.actorUsername || "시스템"}</td>
              <td>{auditOperationLabel(item.operation)}</td>
              <td>{item.targetLabel || item.targetId || "-"}</td>
              <td><ResultBadge result={item.result} errorCode={item.errorCode} /></td>
              <td><code>{item.requestId}</code></td>
              <td>
                <button className="button compact secondary" type="button" onClick={() => onSelect(item.id)}>
                  보기
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="data-cards">
        {items.map((item) => (
          <article className="data-card audit-card" data-selected={item.id === selectedId} key={item.id}>
            <div className="card-row">
              <span>{formatDateTime(item.occurredAt)}</span>
              <ResultBadge result={item.result} errorCode={item.errorCode} />
            </div>
            <strong>{auditOperationLabel(item.operation)}</strong>
            <span>{item.actorUsername || "시스템"} · {item.barName || "전체 시스템"}</span>
            <small>{item.targetLabel || item.targetId || item.requestId}</small>
            <button className="button secondary" type="button" onClick={() => onSelect(item.id)}>
              상세
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function AuditLogDetail({ log }: { log: AuditLog }) {
  const metadata = Object.entries(log.metadata);
  return (
    <div className="audit-detail-content">
      <dl className="detail-list">
        <div><dt>시간</dt><dd>{formatDateTime(log.occurredAt)}</dd></div>
        <div><dt>행위자</dt><dd>{log.actorUsername || "시스템"}</dd></div>
        <div><dt>바</dt><dd>{log.barName || "전체 시스템"}</dd></div>
        <div><dt>작업</dt><dd>{auditOperationLabel(log.operation)}</dd></div>
        <div><dt>대상</dt><dd>{log.targetLabel || log.targetId || "-"}</dd></div>
        <div><dt>요청 번호</dt><dd><code>{log.requestId}</code></dd></div>
        <div><dt>오류</dt><dd>{log.errorCode ? "확인 필요" : "-"}</dd></div>
      </dl>
      <div className="audit-metadata-list" aria-label="감사 로그 안전 메타데이터">
        {metadata.length === 0 ? (
          <p className="muted-text">표시 가능한 메타데이터가 없습니다.</p>
        ) : (
          metadata.map(([key, value]) => (
            <div key={key}>
              <span>{key}</span>
              <strong>{String(value)}</strong>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RetentionMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PilotReadinessPanel({ state }: { state: PilotReadinessState }) {
  if (state.status === "loading") {
    return (
      <section className="panel" aria-labelledby="pilot-readiness-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">파일럿 점검</p>
            <h2 id="pilot-readiness-title">파일럿 준비</h2>
          </div>
          <span className="selected-bar-summary" role="status">확인 중</span>
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="panel" aria-labelledby="pilot-readiness-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">파일럿 점검</p>
            <h2 id="pilot-readiness-title">파일럿 준비</h2>
          </div>
        </div>
        <div className="form-summary" role="alert">{state.message}</div>
      </section>
    );
  }

  const data = state.data;
  return (
    <section className="panel pilot-readiness-panel" aria-labelledby="pilot-readiness-title">
      <div className="section-heading audit-toolbar">
        <div>
          <p className="eyebrow">파일럿 점검</p>
          <h2 id="pilot-readiness-title">파일럿 준비</h2>
        </div>
        <span className={data.overallStatus === "ready_for_pilot" ? "status-badge active" : "status-badge inactive"}>
          {data.overallStatus === "ready_for_pilot" ? "파일럿 시작 준비" : "조치 필요"}
        </span>
      </div>

      <div className="pilot-bar-grid" aria-label="파일럿 후보 바">
        {data.pilotBars.map((bar) => (
          <article className="metric-card pilot-bar-card" key={bar.id}>
            <strong>{bar.name}</strong>
            <span>고객 메뉴판 준비 상태</span>
            <small>
              역할 {formatCoverage(bar.roleCoverage)} · 메뉴 {bar.visibleMenuItemCount}/{bar.menuItemCount} · 주문 {bar.orderSummary.total}
            </small>
            <small>대표 데이터 {bar.representativeTemplates.map(templateLabel).join(", ") || "없음"}</small>
          </article>
        ))}
      </div>

      <div className="pilot-section-grid">
        {data.sections.map((section) => (
          <article className="pilot-section" key={section.id} data-status={section.status}>
            <div className="card-row">
              <strong>{section.label}</strong>
              <span className={statusBadgeClass(section.status)}>{statusLabel(section.status)}</span>
            </div>
            <ul className="pilot-check-list">
              {section.checks.map((check) => (
                <li key={check.id}>
                  <span className={statusBadgeClass(check.status)}>{statusLabel(check.status)}</span>
                  <div>
                    <strong>{check.label}</strong>
                    <p>{check.evidence}</p>
                    <small>{check.owner}{check.runbookHref ? " · 운영 문서 연결됨" : ""}</small>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="preview-callout" role="status">
        실제 운영 비밀값, 원격 반영, 운영 배포는 승인 전까지 실행하지 않습니다.
      </div>
    </section>
  );
}

function statusLabel(status: PilotReadinessStatus): string {
  if (status === "pass") return "통과";
  if (status === "manual_required") return "사람 확인";
  return "조치 필요";
}

function statusBadgeClass(status: PilotReadinessStatus): string {
  if (status === "pass") return "status-badge active";
  if (status === "manual_required") return "status-badge locked";
  return "status-badge inactive";
}

function formatCoverage(coverage: { owner: boolean; manager: boolean; staff: boolean }): string {
  return [
    coverage.owner ? "오너" : "",
    coverage.manager ? "매니저" : "",
    coverage.staff ? "스태프" : ""
  ].filter(Boolean).join("/");
}

function templateLabel(template: string): string {
  const labels: Record<string, string> = {
    general: "일반",
    wine: "와인",
    whisky: "위스키",
    spirit: "증류주",
    beer: "맥주",
    cocktail: "칵테일",
    food: "푸드",
    cigar: "시가"
  };
  return labels[template] ?? template;
}

function ResultBadge({ result, errorCode }: { result: AuditResult; errorCode: string | null }) {
  return (
    <span className={result === "success" ? "status-badge active" : "status-badge inactive"}>
      {result === "success" ? "성공" : errorCode ? "확인 필요" : "실패"}
    </span>
  );
}

function auditOperationLabel(operation: AuditOperation): string {
  const labels: Record<AuditOperation, string> = {
    "auth.login_failed": "로그인 실패",
    "auth.login_succeeded": "로그인 성공",
    "user.created": "사용자 생성",
    "user.updated": "사용자 변경",
    "user.unlocked": "사용자 잠금 해제",
    "membership.changed": "회원·권한 변경",
    "permission.changed": "역할 권한 변경",
    "bar.created": "바 생성",
    "bar.lifecycle_changed": "바 상태 변경",
    "bar.settings_updated": "바 기본 정보 변경",
    "publication.requested": "발행 요청",
    "publication.republished": "재발행",
    "order_tab.item_voided": "주문 항목 취소",
    "order_tab.adjusted": "주문 금액 조정",
    "order_tab.settled": "주문 정산",
    "order_tab.cancelled": "주문 취소",
    "category.changed": "카테고리 변경",
    "menu_item.changed": "메뉴 변경",
    "badge.changed": "배지 변경",
    "item_type.changed": "품목 유형 변경",
    "maintenance.retention": "보관 작업"
  };
  return labels[operation];
}

function AuditStatusState({ state, navigate }: { state: Exclude<LoadState, { status: "ready" }>; navigate: Navigate }) {
  if (state.status === "loading") return <LoadingSkeleton ariaLabel="감사 로그 로딩 중" />;
  const title =
    state.status === "forbidden"
        ? "시스템 관리자 권한이 필요합니다."
        : state.status === "unauthenticated"
          ? "로그인이 필요합니다."
          : "감사 로그를 불러오지 못했습니다.";
  return (
    <div className="page-stack">
      <section className="hero-panel" aria-labelledby="audit-status-title">
        <div>
          <p className="eyebrow">운영 감사</p>
          <h1 id="audit-status-title">{title}</h1>
          <p>{state.message}</p>
        </div>
        {state.status === "unauthenticated" ? (
          <button className="button primary" type="button" onClick={() => navigate("/login")}>
            로그인
          </button>
        ) : null}
      </section>
    </div>
  );
}

function toLoadError(error: unknown): LoadState {
  if (error instanceof AuthApiError) {
    if (error.code === "AUTH_REQUIRED" || error.code === "SESSION_EXPIRED") {
      return { status: "unauthenticated", message: error.message };
    }
    if (error.code === "SYSTEM_ADMIN_REQUIRED" || error.code === "PASSWORD_CHANGE_REQUIRED") {
      return { status: "forbidden", message: error.message };
    }
    return { status: "error", code: error.code, message: error.message };
  }
  return { status: "error", message: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다." };
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}
