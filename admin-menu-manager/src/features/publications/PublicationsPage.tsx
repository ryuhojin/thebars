import { useEffect, useMemo, useState } from "react";
import type {
  CloudflareDeploymentStatus,
  PublicationListResponse,
  PublicationOperation,
  PublicationStep,
  PublicationSummary,
  PublishCurrentMenuResponse
} from "../../../contracts/publications";
import { AdaptiveDialog } from "../../components/adaptive/AdaptiveDialog";
import { AuthApiError } from "../auth/authApi";
import { publishCurrentMenu, readPublications, republishSnapshot } from "./publicationsApi";

type Navigate = (path: string) => void;

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: PublicationListResponse }
  | { status: "unauthenticated"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "not-found"; message: string }
  | { status: "error"; message: string; code?: string };

type PublishState =
  | { status: "idle" }
  | { status: "confirming" }
  | { status: "publishing" }
  | { status: "confirming-republish"; publication: PublicationSummary }
  | { status: "republishing"; publicationId: string }
  | { status: "success"; result: PublishCurrentMenuResponse }
  | { status: "error"; code?: string; message: string };

export function PublicationsPage({ barId, navigate }: { barId: string; navigate: Navigate }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [publishState, setPublishState] = useState<PublishState>({ status: "idle" });
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedPublicationId, setSelectedPublicationId] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    readPublications(barId)
      .then((data) => {
        if (cancelled) return;
        setSelectedPublicationId((current) =>
          data.publications.some((publication) => publication.id === current)
            ? current
            : data.publications[0]?.id ?? ""
        );
        setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [barId, reloadKey]);

  useEffect(() => {
    if (state.status !== "ready" || !state.data.polling.active) return undefined;
    const timer = window.setInterval(() => setReloadKey((value) => value + 1), state.data.polling.intervalMs);
    return () => window.clearInterval(timer);
  }, [state]);

  if (state.status !== "ready") return <PublicationStatusState state={state} navigate={navigate} />;

  const selectedPublication = state.data.publications.find((publication) => publication.id === selectedPublicationId) ?? state.data.publications[0] ?? null;
  const activePublication = selectedPublication ?? (publishState.status === "success" ? publishState.result.publication : null);
  const mutationInFlight = publishState.status === "publishing" || publishState.status === "republishing";
  const publishDisabled = !state.data.canPublish || mutationInFlight;

  const startPublish = () => {
    if (!state.data.canPublish) return;
    setPublishState({ status: "confirming" });
  };

  const confirmPublish = () => {
    setPublishState({ status: "publishing" });
    publishCurrentMenu(barId, { confirmSavedOnly: true })
      .then((result) => {
        setPublishState({ status: "success", result });
        setReloadKey((value) => value + 1);
        setSelectedPublicationId(result.publication.id);
      })
      .catch((error: unknown) => {
        setPublishState({
          status: "error",
          code: error instanceof AuthApiError ? error.code : undefined,
          message: error instanceof Error ? error.message : "발행을 시작하지 못했습니다."
        });
      });
  };

  const startRepublish = (publication: PublicationSummary) => {
    if (!state.data.canPublish || publication.status !== "success") return;
    setSelectedPublicationId(publication.id);
    setPublishState({ status: "confirming-republish", publication });
  };

  const confirmRepublish = () => {
    if (publishState.status !== "confirming-republish") return;
    const publicationId = publishState.publication.id;
    setPublishState({ status: "republishing", publicationId });
    republishSnapshot(barId, publicationId, { confirmCurrentEditUnchanged: true })
      .then((result) => {
        setPublishState({ status: "success", result });
        setReloadKey((value) => value + 1);
        setSelectedPublicationId(result.publication.id);
      })
      .catch((error: unknown) => {
        setPublishState({
          status: "error",
          code: error instanceof AuthApiError ? error.code : undefined,
          message: error instanceof Error ? error.message : "과거 공개본을 다시 발행하지 못했습니다."
        });
      });
  };

  return (
    <div className="publications-page">
      <section className="hero-panel" aria-labelledby="publications-title">
        <div>
          <p className="eyebrow">발행 관리</p>
          <h1 id="publications-title">발행·배포 상태</h1>
          <p>{state.data.bar.name}의 고객 메뉴판 반영과 배포 결과를 발행 번호 기준으로 추적합니다.</p>
        </div>
        <div className="status-box" role="status">
          <span>고객 경로</span>
          <strong>{state.data.bar.customerPath}</strong>
          <small>검증 번호 {state.data.current.contentHash.slice(0, 12)} · {state.data.polling.active ? "배포 확인 중" : "확인 대기"}</small>
        </div>
      </section>

      <section className="panel publication-command-panel" aria-labelledby="publication-command-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">현재 메뉴 발행</p>
            <h2 id="publication-command-title">현재 저장본 발행</h2>
          </div>
          <div className="table-actions">
            <button className="button secondary" type="button" onClick={() => navigate(`/bars/${barId}/preview`)}>
              미리보기
            </button>
            <button className="button primary" type="button" disabled={publishDisabled} onClick={startPublish}>
              {publishState.status === "publishing" ? "발행 중" : "발행 시작"}
            </button>
          </div>
        </div>

        {!state.data.canPublish ? (
          <div className="form-summary" role="alert">
            이 계정에는 발행 권한이 없습니다. 시스템 관리자 또는 바로 발행이 허용된 오너만 발행할 수 있습니다.
          </div>
        ) : null}

        <div className="preview-callout" role="status">
          {state.data.current.savedOnlyNotice}
        </div>

        <div className={state.data.editDiff.hasUnpublishedChanges ? "form-summary warning" : "preview-callout"} role="status">
          {state.data.editDiff.hasUnpublishedChanges
            ? "최신 공개본과 현재 저장본이 다릅니다. 고객 메뉴판에 반영하려면 새 발행이 필요합니다."
            : "최신 공개본과 현재 저장본이 같습니다."}
        </div>

        <div className="publication-target-grid">
          <Metric label="메뉴 데이터 경로" value={state.data.current.menuPath} />
          <Metric label="변경 확인 경로" value={state.data.current.triggerPath} />
          <Metric label="최근 성공 발행" value={state.data.latestSuccess ? `공개 ${state.data.latestSuccess.revision}` : "첫 발행 전"} />
          <Metric label="배포 확인" value={state.data.polling.active ? "30초마다 확인" : "대기 없음"} />
        </div>

        {publishState.status === "confirming" ? (
          <div className="publication-confirmation" role="dialog" aria-modal="false" aria-labelledby="publication-confirm-title">
            <div>
              <p className="eyebrow">확인</p>
              <h3 id="publication-confirm-title">저장된 메뉴판을 발행할까요?</h3>
              <p>현재 화면에서 저장하지 않은 입력, 선택, 필터 상태는 고객 메뉴판에 포함되지 않습니다.</p>
            </div>
            <div className="dialog-actions">
              <button className="button secondary" type="button" onClick={() => setPublishState({ status: "idle" })}>
                취소
              </button>
              <button className="button primary" type="button" onClick={confirmPublish}>
                확인 후 발행
              </button>
            </div>
          </div>
        ) : null}

        {publishState.status === "confirming-republish" ? (
          <div className="publication-confirmation" role="dialog" aria-modal="false" aria-labelledby="republish-confirm-title">
            <div>
              <p className="eyebrow">스냅샷 복구</p>
              <h3 id="republish-confirm-title">공개 {publishState.publication.revision}번을 다시 발행할까요?</h3>
              <p>저장된 공개본을 다시 반영하며, 현재 편집 중인 메뉴 데이터는 변경하지 않습니다.</p>
            </div>
            <div className="dialog-actions">
              <button className="button secondary" type="button" onClick={() => setPublishState({ status: "idle" })}>
                취소
              </button>
              <button className="button primary" type="button" onClick={confirmRepublish}>
                현재 편집본 유지 후 재발행
              </button>
            </div>
          </div>
        ) : null}

        {publishState.status === "publishing" || publishState.status === "republishing" ? (
          <ProgressPanel
            title={publishState.status === "republishing" ? "과거 공개본 재발행 중" : "발행 요청 처리 중"}
            steps={publishingSteps}
            note={publishState.status === "republishing"
              ? "현재 편집본을 변경하지 않고 저장된 공개본을 다시 반영합니다."
              : "중복 클릭을 막고 고객 메뉴판 반영과 배포 확인을 순서대로 처리합니다."}
          />
        ) : null}

        {publishState.status === "success" ? (
          <ProgressPanel
            title={publishState.result.publication.status === "success" ? "고객 배포 완료" : "고객 화면 배포 확인 중"}
            steps={publishState.result.publication.steps}
            note={`${publicationOperationLabel(publishState.result.commit.operation)} · 반영 번호 ${shortIdentifier(publishState.result.commit.commitSha)} · ${deploymentStatusLabel(publishState.result.deployment?.status ?? "queued")}`}
          />
        ) : null}

        {publishState.status === "error" ? (
          <div className="form-summary" role="alert">
            {publishState.message}
          </div>
        ) : null}
      </section>

      <section className="publication-workspace">
        <section className="panel" aria-labelledby="publication-history-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">발행 이력</p>
              <h2 id="publication-history-title">발행 요청</h2>
            </div>
            <button className="button secondary compact" type="button" onClick={() => setReloadKey((value) => value + 1)}>
              새로고침
            </button>
          </div>

          {state.data.publications.length === 0 ? (
            <div className="dashboard-empty" role="status">
              <strong>아직 발행 요청이 없습니다.</strong>
              <p>첫 발행을 시작하면 고객 메뉴판 반영 결과가 여기에 남습니다.</p>
            </div>
          ) : (
            <PublicationHistory
              publications={state.data.publications}
              selectedId={selectedPublicationId}
              onSelect={setSelectedPublicationId}
              canPublish={state.data.canPublish && !mutationInFlight}
              onRepublish={startRepublish}
            />
          )}
        </section>

        <aside className="panel publication-detail-panel" aria-labelledby="publication-detail-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">상세 정보</p>
              <h2 id="publication-detail-title">진행 단계</h2>
            </div>
            <div className="table-actions">
              <span className={statusBadgeClass(activePublication?.status)}>{publicationStatusLabel(activePublication?.status)}</span>
              <button className="button secondary compact" type="button" disabled={!activePublication} onClick={() => setDetailOpen(true)}>
                상세
              </button>
            </div>
          </div>
          {activePublication ? (
            <PublicationDetailContent publication={activePublication} compact />
          ) : (
            <div className="dashboard-empty" role="status">
              <strong>선택된 발행이 없습니다.</strong>
              <p>발행을 시작하면 단계별 상태를 확인할 수 있습니다.</p>
            </div>
          )}
        </aside>
      </section>

      <AdaptiveDialog title="발행 상세" open={detailOpen && !!activePublication} onClose={() => setDetailOpen(false)}>
        {activePublication ? <PublicationDetailContent publication={activePublication} /> : null}
      </AdaptiveDialog>
    </div>
  );
}

function PublicationHistory({
  publications,
  selectedId,
  onSelect,
  canPublish,
  onRepublish
}: {
  publications: PublicationSummary[];
  selectedId: string;
  onSelect: (publicationId: string) => void;
  canPublish: boolean;
  onRepublish: (publication: PublicationSummary) => void;
}) {
  return (
    <>
      <table className="data-table publication-history-table">
        <thead>
          <tr>
            <th>상태</th>
            <th>공개 번호</th>
            <th>발행 방식</th>
            <th>반영 번호</th>
            <th>배포</th>
            <th>완료 시각</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {publications.map((publication) => (
            <tr key={publication.id} data-selected={publication.id === selectedId}>
              <td><span className={statusBadgeClass(publication.status)}>{publicationStatusLabel(publication.status)}</span></td>
              <td>공개 {publication.revision}</td>
              <td>{publicationOperationLabel(publication.operation)}</td>
              <td>{shortIdentifier(publication.commitSha)}</td>
              <td>{deploymentStatusLabel(publication.deployment?.status)}</td>
              <td>{formatDate(publication.completedAt ?? publication.createdAt)}</td>
              <td>
                <div className="table-actions">
                  <button className="button secondary compact" type="button" onClick={() => onSelect(publication.id)}>
                    보기
                  </button>
                  <button
                    className="button compact"
                    type="button"
                    disabled={!canPublish || publication.status !== "success"}
                    onClick={() => onRepublish(publication)}
                  >
                    재발행
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="data-cards">
        {publications.map((publication) => (
          <article
            key={publication.id}
            className="data-card publication-card"
            data-selected={publication.id === selectedId}
          >
            <span className={statusBadgeClass(publication.status)}>{publicationStatusLabel(publication.status)}</span>
            <strong>공개 {publication.revision}</strong>
            <span>{publicationOperationLabel(publication.operation)} · 반영 번호 {shortIdentifier(publication.commitSha)}</span>
            <span>배포 · {deploymentStatusLabel(publication.deployment?.status)}</span>
            <small>{formatDate(publication.completedAt ?? publication.createdAt)}</small>
            <span className="card-actions">
              <button className="button secondary compact" type="button" onClick={() => onSelect(publication.id)}>
                보기
              </button>
              <button
                className="button compact"
                type="button"
                disabled={!canPublish || publication.status !== "success"}
                onClick={() => onRepublish(publication)}
              >
                재발행
              </button>
            </span>
          </article>
        ))}
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProgressPanel({
  title,
  steps,
  note,
  compact = false
}: {
  title: string;
  steps: PublicationStep[];
  note: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "publication-progress compact" : "publication-progress"} role="status">
      <div>
        <strong>{title}</strong>
        <p>{note}</p>
      </div>
      <ol>
        {steps.map((step) => (
          <li key={step.id} data-status={step.status}>
            <span>{step.label}</span>
            <small>{stepStatusLabel(step.status)}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PublicationDetailContent({ publication, compact = false }: { publication: PublicationSummary; compact?: boolean }) {
  return (
    <div className="publication-detail-content">
      <ProgressPanel title={`공개 ${publication.revision}`} steps={publication.steps} note={detailNote(publication)} compact={compact} />
      {publication.status === "timeout_unknown" ? (
        <div className="form-summary warning" role="alert">
          확인 제한 시간 3분을 넘겼습니다. 늦게 성공한 배포가 있을 수 있으므로 대상 반영 번호를 기준으로 다시 확인해야 합니다.
        </div>
      ) : null}
      <dl className="detail-list">
        <div>
          <dt>검증 번호</dt>
          <dd>{publication.contentHash}</dd>
        </div>
        <div>
          <dt>반영 번호</dt>
          <dd>{shortIdentifier(publication.commitSha)}</dd>
        </div>
        <div>
          <dt>배포 상태</dt>
          <dd>{publication.deployment ? `${deploymentStatusLabel(publication.deployment.status)} · ${shortIdentifier(publication.deployment.deploymentId)}` : "아직 없음"}</dd>
        </div>
        <div>
          <dt>배포 기준</dt>
          <dd>{shortIdentifier(publication.deployment?.sourceCommitSha)}</dd>
        </div>
        <div>
          <dt>대상 파일</dt>
          <dd>{publication.operation === "trigger" ? publication.triggerPath : publication.menuPath}</dd>
        </div>
      </dl>
    </div>
  );
}

function PublicationStatusState({ state, navigate }: { state: Exclude<LoadState, { status: "ready" }>; navigate: Navigate }) {
  const title =
    state.status === "loading"
      ? "발행 화면 로딩 중"
      : state.status === "not-found"
        ? "바를 찾을 수 없습니다"
        : state.status === "forbidden" || state.status === "unauthenticated"
          ? "접근할 수 없습니다"
          : "발행 화면 오류";
  const message = state.status === "loading" ? "저장된 메뉴판과 발행 상태를 확인하고 있습니다." : state.message;
  return (
    <section className={`panel state-panel ${state.status === "loading" ? "info" : "error"}`} role={state.status === "loading" ? "status" : "alert"}>
      <p className="eyebrow">발행 관리</p>
      <h1>{title}</h1>
      <p>{message}</p>
      {state.status !== "loading" ? (
        <button className="button secondary" type="button" onClick={() => navigate("/dashboard")}>
          대시보드
        </button>
      ) : null}
    </section>
  );
}

const publishingSteps: PublicationStep[] = [
  { id: "building_json", label: "저장 데이터 수집", status: "active", at: null },
  { id: "validating_json", label: "공개 데이터 검증", status: "pending", at: null },
  { id: "committing_github", label: "고객 메뉴판 반영", status: "pending", at: null },
  { id: "waiting_cloudflare", label: "고객 화면 배포 확인", status: "pending", at: null },
  { id: "completed", label: "배포 상태 기록", status: "pending", at: null }
];

function toLoadError(error: unknown): LoadState {
  if (error instanceof AuthApiError && ["AUTH_REQUIRED", "SESSION_EXPIRED"].includes(error.code)) {
    return { status: "unauthenticated", message: "로그인이 필요합니다." };
  }
  if (error instanceof AuthApiError && error.code === "BAR_NOT_FOUND") {
    return { status: "not-found", message: error.message };
  }
  if (error instanceof AuthApiError && ["BAR_PERMISSION_REQUIRED", "PUBLICATION_PERMISSION_REQUIRED"].includes(error.code)) {
    return { status: "forbidden", message: error.message };
  }
  return {
    status: "error",
    code: error instanceof AuthApiError ? error.code : undefined,
    message: error instanceof Error ? error.message : "발행 정보를 불러오지 못했습니다."
  };
}

function statusBadgeClass(status?: string): string {
  if (status === "success") return "status-badge active";
  if (status === "failed" || status === "timeout_unknown") return "status-badge inactive";
  return "status-badge locked";
}

function detailNote(publication: PublicationSummary): string {
  if (publication.error) return publication.error.message;
  if (publication.status === "waiting_cloudflare") {
    return `대상 반영 번호 ${shortIdentifier(publication.commitSha)}의 고객 화면 배포를 확인 중입니다.`;
  }
  if (publication.status === "timeout_unknown") return "성공이나 실패로 단정하지 않고 확인 불가 상태로 기록했습니다.";
  if (publication.deployment?.status === "success") return "대상 반영 번호와 일치하는 고객 화면 배포가 성공했습니다.";
  if (publication.operation === "trigger") return "동일 내용 재발행이라 변경 확인 파일만 갱신했습니다.";
  return publication.commitSha ? "메뉴 데이터를 고객 메뉴판에 반영했습니다." : "아직 반영 결과가 없습니다.";
}

function publicationStatusLabel(status?: PublicationSummary["status"]): string {
  if (!status) return "선택 없음";
  if (status === "pending") return "대기";
  if (status === "building_json") return "데이터 준비";
  if (status === "validating_json") return "검증 중";
  if (status === "committing_github") return "반영 중";
  if (status === "waiting_cloudflare") return "배포 확인 중";
  if (status === "success") return "완료";
  if (status === "failed") return "실패";
  return "확인 필요";
}

function publicationOperationLabel(operation: PublicationOperation | null): string {
  if (operation === "menu_json") return "현재 메뉴 발행";
  if (operation === "trigger") return "동일 내용 재발행";
  if (operation === "snapshot_republish") return "과거 공개본 재발행";
  if (operation === "delete_menu_json") return "고객 메뉴판 비활성화";
  if (operation === "restore_snapshot") return "마지막 공개본 복원";
  if (operation === "restore_preparing") return "준비 상태 복원";
  return "준비 중";
}

function deploymentStatusLabel(status?: CloudflareDeploymentStatus | null): string {
  if (!status) return "대기 전";
  if (status === "queued") return "대기";
  if (status === "building") return "배포 중";
  if (status === "success") return "성공";
  if (status === "failed") return "실패";
  return "확인 필요";
}

function stepStatusLabel(status: PublicationStep["status"]): string {
  if (status === "pending") return "대기";
  if (status === "active") return "진행 중";
  if (status === "completed") return "완료";
  return "실패";
}

function shortIdentifier(value?: string | null): string {
  if (!value) return "아직 없음";
  return value.replace(/^fake-(commit|deployment)-/, "").slice(0, 18);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
