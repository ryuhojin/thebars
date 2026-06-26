import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  SystemUser,
  SystemUserDetail,
  SystemUserListResponse,
  SystemUserStatusFilter
} from "../../../contracts/systemUsers";
import { AdaptiveDialog } from "../../components/adaptive/AdaptiveDialog";
import { LoadingSkeleton } from "../../components/feedback/LoadingSkeleton";
import { AuthApiError } from "../auth/authApi";
import { useDirtyWarning } from "../auth/useDirtyWarning";
import {
  activateSystemUser,
  createSystemUser,
  deactivateSystemUser,
  readSystemUser,
  readSystemUsers,
  resetSystemUserPassword,
  unlockSystemUser
} from "./systemUsersApi";

type Navigate = (path: string) => void;
type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "unauthenticated"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "error"; message: string };

type TemporaryPasswordNotice = {
  username: string;
  password: string;
  kind: "created" | "reset";
};

export function SystemUsersPage({ navigate }: { navigate: Navigate }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SystemUserStatusFilter>("all");
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<LoadState<SystemUserListResponse>>({ status: "loading" });
  const [selectedId, setSelectedId] = useState("");
  const [selectedDetail, setSelectedDetail] = useState<LoadState<SystemUserDetail> | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState<TemporaryPasswordNotice | null>(null);

  useEffect(() => {
    let cancelled = false;
    readSystemUsers({ q: query, status: statusFilter, pageSize: 50 })
      .then((data) => {
        if (cancelled) return;
        setSelectedId((current) => current || data.items[0]?.id || "");
        setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [query, reloadKey, statusFilter]);

  const selectedUser = useMemo(
    () => (state.status === "ready" ? state.data.items.find((user) => user.id === selectedId) ?? null : null),
    [selectedId, state]
  );

  if (state.status !== "ready") {
    return <UsersStatusState state={state} navigate={navigate} />;
  }

  const openDetail = (userId: string) => {
    setSelectedId(userId);
    setSelectedDetail({ status: "loading" });
    readSystemUser(userId)
      .then((data) => setSelectedDetail({ status: "ready", data }))
      .catch((error: unknown) => setSelectedDetail(toLoadError(error)));
  };

  const refresh = () => setReloadKey((value) => value + 1);

  return (
    <div className="users-page">
      <section className="hero-panel" aria-labelledby="users-title">
        <div>
          <p className="eyebrow">사용자 관리</p>
          <h1 id="users-title">사용자 계정 관리</h1>
          <p>시스템 관리자가 일반 사용자 계정을 생성하고 잠금, 비활성, 비밀번호 초기화를 관리합니다.</p>
        </div>
        <div className="status-box" role="status">
          <span>사용자</span>
          <strong>{state.data.summary.totalUsers}명</strong>
          <small>
            활성 {state.data.summary.activeUsers}명 · 잠김 {state.data.summary.lockedUsers}명 · 비활성{" "}
            {state.data.summary.inactiveUsers}명
          </small>
        </div>
      </section>

      <section className="panel" aria-labelledby="users-list-title">
        <div className="section-heading users-toolbar">
          <div>
            <p className="eyebrow">사용자 목록</p>
            <h2 id="users-list-title">계정 목록</h2>
          </div>
          <button className="button primary" type="button" onClick={() => setCreateOpen(true)}>
            사용자 생성
          </button>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>사용자 검색</span>
            <input
              aria-label="아이디 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="아이디 또는 user ID"
            />
          </label>
          <label className="field">
            <span>상태 필터</span>
            <select
              aria-label="사용자 상태 필터"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as SystemUserStatusFilter)}
            >
              <option value="all">전체 상태</option>
              <option value="active">정상</option>
              <option value="locked">잠김</option>
              <option value="inactive">비활성</option>
              <option value="forced_password_change">비밀번호 변경 필요</option>
            </select>
          </label>
        </div>

        {notice ? <TemporaryPasswordPanel notice={notice} onDismiss={() => setNotice(null)} /> : null}

        {state.data.items.length === 0 ? (
          <div className="dashboard-empty" role="status">
            <strong>검색 결과가 없습니다.</strong>
            <p>검색어나 상태 필터를 조정하세요.</p>
          </div>
        ) : (
          <>
            <UsersList users={state.data.items} selectedId={selectedId} onSelect={setSelectedId} onManage={openDetail} />
            <div className="selected-bar-summary" role="status">
              선택: {selectedUser?.username ?? "없음"}
            </div>
          </>
        )}
      </section>

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(createdNotice) => {
          setNotice(createdNotice);
          setCreateOpen(false);
          refresh();
        }}
      />

      <UserDetailDialog
        state={selectedDetail}
        onClose={() => setSelectedDetail(null)}
        onRefresh={refresh}
        onTemporaryPassword={setNotice}
      />
    </div>
  );
}

function UsersList({
  users,
  selectedId,
  onSelect,
  onManage
}: {
  users: SystemUser[];
  selectedId: string;
  onSelect: (userId: string) => void;
  onManage: (userId: string) => void;
}) {
  return (
    <div className="users-data-view" aria-label="사용자 목록">
      <table className="data-table users-table">
        <thead>
          <tr>
            <th scope="col">사용자</th>
            <th scope="col">상태</th>
            <th scope="col">소속 바</th>
            <th scope="col">마지막 로그인</th>
            <th scope="col">작업</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} data-selected={user.id === selectedId}>
              <td>
                <strong>{user.username}</strong>
                <small>{user.isSystemAdmin ? "시스템 관리자" : "아이디 로그인"}</small>
              </td>
              <td>
                <StatusBadge user={user} />
              </td>
              <td>{user.membershipsLabel}</td>
              <td>{formatDateTime(user.lastLoginAt)}</td>
              <td>
                <div className="table-actions">
                  <button className="button compact" type="button" onClick={() => onSelect(user.id)}>
                    선택
                  </button>
                  <button className="button compact secondary" type="button" onClick={() => onManage(user.id)}>
                    관리
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="data-cards">
        {users.map((user) => (
          <article className="data-card user-card-summary" data-selected={user.id === selectedId} key={user.id}>
            <div>
              <strong>{user.username}</strong>
              <span>{user.isSystemAdmin ? "시스템 관리자" : "아이디 로그인"}</span>
            </div>
            <div className="card-row">
              <span>상태</span>
              <StatusBadge user={user} />
            </div>
            <div className="card-row">
              <span>소속 바</span>
              <strong>{user.membershipsLabel}</strong>
            </div>
            <div className="card-row">
              <span>마지막 로그인</span>
              <strong>{formatDateTime(user.lastLoginAt)}</strong>
            </div>
            <div className="card-actions">
              <button className="button secondary" type="button" onClick={() => onSelect(user.id)}>
                선택
              </button>
              <button className="button primary" type="button" onClick={() => onManage(user.id)}>
                관리
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function CreateUserDialog({
  open,
  onClose,
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (notice: TemporaryPasswordNotice) => void;
}) {
  const [username, setUsername] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useDirtyWarning(open && username.length > 0 && !submitting);

  useEffect(() => {
    if (!open) {
      setUsername("");
      setFieldErrors({});
      setMessage("");
      setSubmitting(false);
    }
  }, [open]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setMessage("");
    createSystemUser({ username })
      .then((response) => {
        onCreated({ username: response.user.username, password: response.temporaryPassword, kind: "created" });
      })
      .catch((error: unknown) => {
        setSubmitting(false);
        if (error instanceof AuthApiError) {
          setFieldErrors(error.fieldErrors);
          setMessage(error.message);
          return;
        }
        setMessage(error instanceof Error ? error.message : "사용자를 생성하지 못했습니다.");
      });
  };

  return (
    <AdaptiveDialog title="사용자 생성" open={open} onClose={() => confirmDiscard(username.length > 0, onClose)}>
      <form className="dialog-form" onSubmit={submit} noValidate>
        {message ? <div className="form-status" role="alert">{message}</div> : null}
        <label className="field" htmlFor="system-user-username">
          <span>아이디</span>
          <input
            id="system-user-username"
            aria-invalid={fieldErrors.username?.length ? "true" : undefined}
            aria-describedby={fieldErrors.username?.length ? "system-user-username-error" : undefined}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="영문 소문자·숫자 4~20자"
          />
          {fieldErrors.username?.length ? (
            <strong id="system-user-username-error" className="field-error">
              {fieldErrors.username[0]}
            </strong>
          ) : null}
        </label>
        <div className="dashboard-empty">
          <strong>임시 비밀번호는 생성 직후 한 번만 표시됩니다.</strong>
          <p>사용자는 최초 로그인 후 비밀번호를 변경해야 다른 기능을 사용할 수 있습니다.</p>
        </div>
        <div className="dialog-actions">
          <button className="button secondary" type="button" onClick={() => confirmDiscard(username.length > 0, onClose)}>
            취소
          </button>
          <button className="button primary" type="submit" disabled={submitting}>
            {submitting ? "생성 중" : "생성"}
          </button>
        </div>
      </form>
    </AdaptiveDialog>
  );
}

function UserDetailDialog({
  state,
  onClose,
  onRefresh,
  onTemporaryPassword
}: {
  state: LoadState<SystemUserDetail> | null;
  onClose: () => void;
  onRefresh: () => void;
  onTemporaryPassword: (notice: TemporaryPasswordNotice) => void;
}) {
  const [message, setMessage] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  if (!state) return null;

  const runCommand = (
    action: string,
    confirmMessage: string | null,
    command: () => Promise<{ user: SystemUserDetail } | { user: SystemUserDetail; temporaryPassword: string }>
  ) => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setPendingAction(action);
    setMessage("");
    command()
      .then((response) => {
        if ("temporaryPassword" in response) {
          onTemporaryPassword({ username: response.user.username, password: response.temporaryPassword, kind: "reset" });
        }
        onRefresh();
        onClose();
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "작업을 완료하지 못했습니다.");
      })
      .finally(() => setPendingAction(""));
  };

  return (
    <AdaptiveDialog title="사용자 관리" open={state !== null} onClose={onClose}>
      {state.status === "loading" ? <LoadingSkeleton variant="inline" ariaLabel="사용자 상세 로딩 중" /> : null}
      {state.status === "unauthenticated" || state.status === "forbidden" || state.status === "error" ? (
        <UsersStatus title="사용자 정보를 불러오지 못했습니다" message={state.message} tone="error" />
      ) : null}
      {state.status === "ready" ? (
        <div className="user-detail-sheet">
          {message ? <div className="form-status" role="alert">{message}</div> : null}
          <dl className="detail-list">
            <div>
              <dt>아이디</dt>
              <dd>{state.data.username}</dd>
            </div>
            <div>
              <dt>상태</dt>
              <dd>
                <StatusBadge user={state.data} />
              </dd>
            </div>
            <div>
              <dt>활성 세션</dt>
              <dd>{state.data.activeSessionCount}개</dd>
            </div>
            <div>
              <dt>비밀번호 변경</dt>
              <dd>{state.data.forcedPasswordChange ? "필요" : "완료"}</dd>
            </div>
            <div>
              <dt>소속 바</dt>
              <dd>{state.data.membershipsLabel}</dd>
            </div>
          </dl>

          {state.data.isSystemAdmin ? (
            <div className="dashboard-empty">
              <strong>시스템 관리자 계정</strong>
              <p>이 화면에서는 일반 사용자 계정만 변경합니다.</p>
            </div>
          ) : (
            <div className="user-command-grid">
              {state.data.isActive ? (
                <button
                  className="button secondary"
                  type="button"
                  disabled={pendingAction !== ""}
                  onClick={() =>
                    runCommand("deactivate", "이 사용자를 비활성화하고 활성 세션을 즉시 종료할까요?", () =>
                      deactivateSystemUser(state.data.id)
                    )
                  }
                >
                  비활성화
                </button>
              ) : (
                <button
                  className="button primary"
                  type="button"
                  disabled={pendingAction !== ""}
                  onClick={() => runCommand("activate", null, () => activateSystemUser(state.data.id))}
                >
                  활성화
                </button>
              )}
              <button
                className="button secondary"
                type="button"
                disabled={pendingAction !== "" || !state.data.isLocked}
                onClick={() => runCommand("unlock", null, () => unlockSystemUser(state.data.id))}
              >
                잠금 해제
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={pendingAction !== ""}
                onClick={() =>
                  runCommand("reset", "임시 비밀번호를 재발급하고 다음 로그인에서 변경을 요구할까요?", () =>
                    resetSystemUserPassword(state.data.id)
                  )
                }
              >
                비밀번호 초기화
              </button>
            </div>
          )}
        </div>
      ) : null}
    </AdaptiveDialog>
  );
}

function TemporaryPasswordPanel({ notice, onDismiss }: { notice: TemporaryPasswordNotice; onDismiss: () => void }) {
  return (
    <div className="temporary-password-panel" role="status" aria-live="polite">
      <div>
        <strong>{notice.kind === "created" ? "계정 생성 완료" : "비밀번호 초기화 완료"}</strong>
        <p>{notice.username} 임시 비밀번호는 지금만 표시됩니다.</p>
      </div>
      <code>{notice.password}</code>
      <button className="button secondary" type="button" onClick={onDismiss}>
        확인
      </button>
    </div>
  );
}

function StatusBadge({ user }: { user: Pick<SystemUser, "status" | "forcedPasswordChange"> }) {
  const label = user.status === "inactive" ? "비활성" : user.status === "locked" ? "잠김" : "정상";
  return (
    <span className={`status-badge ${user.status}`}>
      {label}
      {user.forcedPasswordChange ? " · 변경 필요" : ""}
    </span>
  );
}

function UsersStatusState<T>({ state, navigate }: { state: LoadState<T>; navigate: Navigate }) {
  if (state.status === "loading") {
    return <LoadingSkeleton ariaLabel="사용자 정보 로딩 중" />;
  }
  if (state.status === "unauthenticated") {
    return (
      <UsersStatus title="로그인이 필요합니다" message={state.message}>
        <button className="button primary" type="button" onClick={() => navigate("/login")}>
          로그인으로 이동
        </button>
      </UsersStatus>
    );
  }
  if (state.status === "forbidden") {
    return <UsersStatus title="접근할 수 없습니다" message={state.message} tone="error" />;
  }
  if (state.status === "error") {
    return <UsersStatus title="사용자 정보를 불러오지 못했습니다" message={state.message} tone="error" />;
  }
  return null;
}

function UsersStatus({
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
    ["PASSWORD_CHANGE_REQUIRED", "ACCOUNT_INACTIVE", "SYSTEM_ADMIN_REQUIRED"].includes(error.code)
  ) {
    return { status: "forbidden", message: error.message };
  }
  return { status: "error", message: error instanceof Error ? error.message : "사용자 정보를 불러오지 못했습니다." };
}

function formatDateTime(value: string | null): string {
  if (!value) return "기록 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function confirmDiscard(dirty: boolean, action: () => void): void {
  if (!dirty || window.confirm("작성 중인 내용이 사라집니다. 계속할까요?")) action();
}
