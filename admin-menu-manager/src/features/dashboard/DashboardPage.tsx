import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { DashboardBar, DashboardMetric, DashboardQuickAction, DashboardResponse } from "../../../contracts/dashboard";
import { AuthApiError } from "../auth/authApi";
import { readDashboard } from "./dashboardApi";

type Navigate = (path: string) => void;

type DashboardState =
  | { status: "loading" }
  | { status: "ready"; data: DashboardResponse }
  | { status: "unauthenticated"; message: string }
  | { status: "forbidden"; code: string; message: string }
  | { status: "error"; message: string };

export function DashboardPage({ navigate }: { navigate: Navigate }) {
  const [state, setState] = useState<DashboardState>({ status: "loading" });
  const [selectedBarId, setSelectedBarId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    readDashboard()
      .then((data) => {
        if (cancelled) return;
        setSelectedBarId((current) => current || data.selectedBarId || data.accessibleBars[0]?.id || "");
        setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof AuthApiError && ["AUTH_REQUIRED", "SESSION_EXPIRED"].includes(error.code)) {
          setState({ status: "unauthenticated", message: error.message });
          return;
        }
        if (error instanceof AuthApiError && ["PASSWORD_CHANGE_REQUIRED", "ACCOUNT_INACTIVE"].includes(error.code)) {
          setState({ status: "forbidden", code: error.code, message: error.message });
          return;
        }
        setState({ status: "error", message: error instanceof Error ? error.message : "대시보드를 불러오지 못했습니다." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <DashboardStatus title="대시보드 로딩 중" message="운영 요약을 불러오고 있습니다." />;
  }

  if (state.status === "unauthenticated") {
    return (
      <DashboardStatus title="로그인이 필요합니다" message={state.message}>
        <button className="button primary" type="button" onClick={() => navigate("/login")}>
          로그인으로 이동
        </button>
      </DashboardStatus>
    );
  }

  if (state.status === "forbidden") {
    return (
      <DashboardStatus title="접근할 수 없습니다" message={state.message} tone="error">
        {state.code === "PASSWORD_CHANGE_REQUIRED" ? (
          <button className="button primary" type="button" onClick={() => navigate("/change-password")}>
            비밀번호 변경
          </button>
        ) : null}
      </DashboardStatus>
    );
  }

  if (state.status === "error") {
    return <DashboardStatus title="대시보드 오류" message={state.message} tone="error" />;
  }

  return (
    <DashboardReadyView
      data={state.data}
      selectedBarId={selectedBarId}
      onSelectBar={setSelectedBarId}
      navigate={navigate}
    />
  );
}

function DashboardReadyView({
  data,
  selectedBarId,
  onSelectBar,
  navigate
}: {
  data: DashboardResponse;
  selectedBarId: string;
  onSelectBar: (barId: string) => void;
  navigate: Navigate;
}) {
  const selectedBar = useMemo(
    () => data.accessibleBars.find((bar) => bar.id === selectedBarId) ?? null,
    [data.accessibleBars, selectedBarId]
  );
  const variantTitle = data.mode === "system-admin" ? "시스템 관리자 대시보드" : "바 운영 대시보드";

  return (
    <div className="dashboard-page" data-dashboard-mode={data.mode}>
      <section className="dashboard-hero" aria-labelledby="dashboard-title">
        <div>
          <p className="eyebrow">운영 현황</p>
          <h1 id="dashboard-title">대시보드</h1>
          <p>{variantTitle}입니다. 오늘 확인해야 할 바 운영 상태와 주요 작업을 한 화면에서 확인합니다.</p>
        </div>
        <div className="status-box" aria-label="현재 사용자">
          <span>현재 사용자</span>
          <strong>{data.actor.username}</strong>
          <small>{data.mode === "system-admin" ? "시스템 관리자" : "바 운영자"}</small>
        </div>
      </section>

      <section className="dashboard-metrics" aria-label="운영 요약">
        {data.metrics.map((metric) => (
          <MetricCard metric={metric} key={metric.id} />
        ))}
      </section>

      <div className="dashboard-main">
        <section className="panel" aria-labelledby="bars-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">작업 바</p>
              <h2 id="bars-title">접근 가능한 바</h2>
            </div>
          </div>
          <BarSelector bars={data.accessibleBars} selectedBarId={selectedBarId} onSelect={onSelectBar} emptyState={data.emptyState} />
          <div className="selected-bar-summary" role="status">
            {selectedBar ? `${selectedBar.name} 선택됨` : "선택된 바 없음"}
          </div>
        </section>

        <section className="panel" aria-labelledby="actions-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">빠른 실행</p>
              <h2 id="actions-title">빠른 작업</h2>
            </div>
          </div>
          <div className="quick-action-grid">
            {data.quickActions.map((action) => (
              <QuickActionButton key={action.id} action={action} navigate={navigate} />
            ))}
          </div>
        </section>
      </div>

      <section className="panel" aria-labelledby="activity-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">최근 알림</p>
            <h2 id="activity-title">최근 알림</h2>
          </div>
        </div>
        <div className="activity-list">
          {data.activities.map((activity) => (
            <article className={`activity-item ${activity.tone}`} key={activity.id}>
              <strong>{activity.label}</strong>
              <p>{activity.description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ metric }: { metric: DashboardMetric }) {
  return (
    <article className={`metric-card ${metric.tone}`} data-status={metric.status}>
      <div>
        <span>{metric.label}</span>
        <strong>{metric.value}</strong>
      </div>
      <p>{metric.description}</p>
      {metric.unavailableReason ? <small>{metric.unavailableReason}</small> : null}
    </article>
  );
}

function BarSelector({
  bars,
  selectedBarId,
  onSelect,
  emptyState
}: {
  bars: DashboardBar[];
  selectedBarId: string;
  onSelect: (barId: string) => void;
  emptyState: DashboardResponse["emptyState"];
}) {
  if (bars.length === 0) {
    return (
      <div className="dashboard-empty">
        <strong>{emptyState?.title ?? "표시할 바가 없습니다."}</strong>
        <p>{emptyState?.message ?? "접근 가능한 바가 없습니다."}</p>
      </div>
    );
  }

  return (
    <div className="bar-card-list">
      {bars.map((bar) => (
        <button
          type="button"
          className="bar-card"
          data-selected={bar.id === selectedBarId}
          key={bar.id}
          onClick={() => onSelect(bar.id)}
        >
          <strong>{bar.name}</strong>
          <span>{bar.role} · {bar.status}</span>
        </button>
      ))}
    </div>
  );
}

function QuickActionButton({ action, navigate }: { action: DashboardQuickAction; navigate: Navigate }) {
  return (
    <button
      className={action.priority === "primary" ? "button primary" : "button secondary"}
      type="button"
      disabled={action.status === "unavailable"}
      onClick={() => {
        if (action.status === "available") navigate(action.href);
      }}
      title={action.unavailableReason}
    >
      {action.label}
      {action.status === "unavailable" ? <span>준비 중</span> : null}
    </button>
  );
}

function DashboardStatus({
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
