import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  BarMembership,
  BarMembersResponse,
  MembershipRole,
  MembershipUserOption,
  RolePermission
} from "../../../contracts/memberships";
import { AdaptiveDialog } from "../../components/adaptive/AdaptiveDialog";
import { AuthApiError } from "../auth/authApi";
import { useDirtyWarning } from "../auth/useDirtyWarning";
import {
  addBarMember,
  deactivateBarMember,
  readBarMembers,
  updateBarMember,
  updateRolePermissions
} from "./membershipsApi";

type Navigate = (path: string) => void;
type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "unauthenticated"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "error"; message: string };

type PermissionKey = Exclude<keyof RolePermission, "role">;

const permissionLabels: Array<{ key: PermissionKey; label: string }> = [
  { key: "canEditMenu", label: "메뉴 편집" },
  { key: "canManageOrders", label: "주문 운영" },
  { key: "canAddCustomOrderItem", label: "기타 주문 항목" },
  { key: "canApplyOrderAdjustment", label: "금액 조정" }
];

export function MembersPage({ barId, navigate }: { barId: string; navigate: Navigate }) {
  const [state, setState] = useState<LoadState<BarMembersResponse>>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editRole, setEditRole] = useState<MembershipRole>("staff");
  const [addOpen, setAddOpen] = useState(false);
  const [permissionDraft, setPermissionDraft] = useState<RolePermission[]>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState("");

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    readBarMembers(barId)
      .then((data) => {
        if (cancelled) return;
        setSelectedId((current) =>
          current && data.members.some((member) => member.id === current) ? current : data.members[0]?.id ?? ""
        );
        setPermissionDraft(data.rolePermissions);
        setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [barId, reloadKey]);

  const selectedMember = useMemo(
    () => (state.status === "ready" ? state.data.members.find((member) => member.id === selectedId) ?? null : null),
    [selectedId, state]
  );
  useEffect(() => {
    if (selectedMember) setEditRole(selectedMember.role);
  }, [selectedMember]);

  const permissionDirty =
    state.status === "ready" && JSON.stringify(permissionDraft) !== JSON.stringify(state.data.rolePermissions);
  const editorDirty = selectedMember ? editRole !== selectedMember.role : false;
  useDirtyWarning(permissionDirty || editorDirty);

  if (state.status !== "ready") {
    return <MembersStatusState state={state} navigate={navigate} />;
  }

  const refresh = () => setReloadKey((value) => value + 1);

  const saveMember = () => {
    if (!selectedMember) return;
    setPending("member-save");
    setMessage("");
    updateBarMember(barId, selectedMember.id, { role: editRole })
      .then(() => {
        setMessage("회원 역할을 저장했습니다.");
        setEditorOpen(false);
        refresh();
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "회원 역할을 저장하지 못했습니다."))
      .finally(() => setPending(""));
  };

  const deactivateMember = () => {
    if (!selectedMember) return;
    if (!window.confirm("이 바 소속을 비활성화할까요?")) return;
    setPending("member-deactivate");
    setMessage("");
    deactivateBarMember(barId, selectedMember.id)
      .then(() => {
        setMessage("바 소속을 비활성화했습니다.");
        setEditorOpen(false);
        refresh();
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "바 소속을 비활성화하지 못했습니다."))
      .finally(() => setPending(""));
  };

  const savePermissions = () => {
    setPending("permissions");
    setMessage("");
    updateRolePermissions(barId, { permissions: permissionDraft })
      .then(() => {
        setMessage("역할별 권한을 저장했습니다.");
        refresh();
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "역할별 권한을 저장하지 못했습니다."))
      .finally(() => setPending(""));
  };

  return (
    <div className="members-page">
      <section className="hero-panel" aria-labelledby="members-title">
        <div>
          <p className="eyebrow">멤버 권한</p>
          <h1 id="members-title">바 회원·권한</h1>
          <p>{state.data.bar.name}의 사용자 소속과 owner/manager/staff 권한을 관리합니다.</p>
        </div>
        <div className="status-box" role="status">
          <span>활성 회원</span>
          <strong>{state.data.members.filter((member) => member.isActive).length}명</strong>
          <small>전체 {state.data.members.length}명 · {state.data.bar.status}</small>
          <button className="button secondary" type="button" onClick={() => navigate(`/bars/${barId}`)}>
            바 개요
          </button>
        </div>
      </section>

      {message ? <div className="form-status success" role="status">{message}</div> : null}

      <div className="members-master-detail">
        <section className="panel" aria-labelledby="member-list-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">바 멤버</p>
              <h2 id="member-list-title">회원 목록</h2>
            </div>
            <button className="button primary" type="button" onClick={() => setAddOpen(true)}>
              회원 추가
            </button>
          </div>
          <MembersList
            members={state.data.members}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onManage={(membershipId) => {
              setSelectedId(membershipId);
              if (window.matchMedia("(max-width: 767px)").matches) setEditorOpen(true);
            }}
          />
          <div className="selected-bar-summary" role="status">
            선택: {selectedMember?.username ?? "없음"}
          </div>
        </section>

        <aside className="panel member-editor-inline" aria-labelledby="member-editor-inline-title">
          <MemberEditor
            member={selectedMember}
            titleId="member-editor-inline-title"
            editRole={editRole}
            pending={pending}
            onRoleChange={setEditRole}
            onSave={saveMember}
            onDeactivate={deactivateMember}
          />
        </aside>
      </div>

      <section className="panel" aria-labelledby="permissions-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">권한 매트릭스</p>
            <h2 id="permissions-title">역할별 권한</h2>
          </div>
          <button className="button primary" type="button" disabled={!permissionDirty || pending === "permissions"} onClick={savePermissions}>
            {pending === "permissions" ? "저장 중" : "권한 저장"}
          </button>
        </div>
        <PermissionMatrix permissions={permissionDraft} onChange={setPermissionDraft} />
      </section>

      <AddMemberDialog
        open={addOpen}
        users={state.data.availableUsers}
        onClose={() => setAddOpen(false)}
        onAdded={() => {
          setAddOpen(false);
          setMessage("회원을 추가했습니다.");
          refresh();
        }}
        barId={barId}
      />

      <AdaptiveDialog title="회원 편집" open={editorOpen} onClose={() => confirmDiscard(editorDirty, () => setEditorOpen(false))}>
        <MemberEditor
          member={selectedMember}
          titleId="member-editor-dialog-title"
          editRole={editRole}
          pending={pending}
          onRoleChange={setEditRole}
          onSave={saveMember}
          onDeactivate={deactivateMember}
        />
      </AdaptiveDialog>
    </div>
  );
}

function MembersList({
  members,
  selectedId,
  onSelect,
  onManage
}: {
  members: BarMembership[];
  selectedId: string;
  onSelect: (membershipId: string) => void;
  onManage: (membershipId: string) => void;
}) {
  if (members.length === 0) {
    return (
      <div className="dashboard-empty" role="status">
        <strong>아직 회원이 없습니다.</strong>
        <p>회원 추가로 바 운영자를 배정하세요.</p>
      </div>
    );
  }

  return (
    <div className="members-data-view" aria-label="바 회원 목록">
      <table className="data-table members-table">
        <thead>
          <tr>
            <th scope="col">사용자</th>
            <th scope="col">역할</th>
            <th scope="col">상태</th>
            <th scope="col">작업</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} data-selected={member.id === selectedId}>
              <td>
                <strong>{member.username}</strong>
                <small>{member.userIsActive ? "계정 활성" : "계정 비활성"}</small>
              </td>
              <td>{member.role}</td>
              <td>{member.isActive ? "활성" : "비활성"}</td>
              <td>
                <div className="table-actions">
                  <button className="button compact" type="button" onClick={() => onSelect(member.id)}>
                    선택
                  </button>
                  <button className="button compact secondary" type="button" onClick={() => onManage(member.id)}>
                    편집
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="data-cards">
        {members.map((member) => (
          <article className="data-card member-card-summary" data-selected={member.id === selectedId} key={member.id}>
            <div>
              <strong>{member.username}</strong>
              <span>{member.userIsActive ? "계정 활성" : "계정 비활성"}</span>
            </div>
            <div className="card-row">
              <span>역할</span>
              <strong>{member.role}</strong>
            </div>
            <div className="card-row">
              <span>소속</span>
              <strong>{member.isActive ? "활성" : "비활성"}</strong>
            </div>
            <div className="card-actions">
              <button className="button secondary" type="button" onClick={() => onSelect(member.id)}>
                선택
              </button>
              <button className="button primary" type="button" onClick={() => onManage(member.id)}>
                편집
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function MemberEditor({
  member,
  titleId,
  editRole,
  pending,
  onRoleChange,
  onSave,
  onDeactivate
}: {
  member: BarMembership | null;
  titleId: string;
  editRole: MembershipRole;
  pending: string;
  onRoleChange: (role: MembershipRole) => void;
  onSave: () => void;
  onDeactivate: () => void;
}) {
  if (!member) {
    return (
      <div className="dashboard-empty" role="status">
        <strong>선택된 회원이 없습니다.</strong>
        <p>회원 목록에서 편집할 사용자를 선택하세요.</p>
      </div>
    );
  }

  return (
    <div className="member-editor" aria-labelledby={titleId}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">선택한 멤버</p>
          <h2 id={titleId}>{member.username}</h2>
        </div>
        <span className={`status-badge ${member.isActive ? "active" : "inactive"}`}>{member.isActive ? "활성" : "비활성"}</span>
      </div>
      <label className="field">
        <span>역할</span>
        <select aria-label="회원 역할" value={editRole} onChange={(event) => onRoleChange(event.target.value as MembershipRole)}>
          <option value="owner">owner</option>
          <option value="manager">manager</option>
          <option value="staff">staff</option>
        </select>
      </label>
      <div className="dialog-actions">
        <button className="button secondary" type="button" disabled={pending !== "" || !member.isActive} onClick={onDeactivate}>
          소속 비활성화
        </button>
        <button className="button primary" type="button" disabled={pending !== "" || !member.isActive} onClick={onSave}>
          {pending === "member-save" ? "저장 중" : "저장"}
        </button>
      </div>
    </div>
  );
}

function AddMemberDialog({
  open,
  users,
  barId,
  onClose,
  onAdded
}: {
  open: boolean;
  users: MembershipUserOption[];
  barId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<MembershipRole>("staff");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dirty = query.length > 0 || userId.length > 0 || role !== "staff";
  useDirtyWarning(open && dirty && !submitting);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setUserId("");
      setRole("staff");
      setMessage("");
      setSubmitting(false);
    }
  }, [open]);

  const filteredUsers = users.filter((user) => user.username.includes(query.trim().toLowerCase()));
  const selectableUsers = filteredUsers.filter((user) => user.isActive && !user.alreadyMember);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    addBarMember(barId, { userId, role })
      .then(onAdded)
      .catch((error: unknown) => {
        setSubmitting(false);
        setMessage(error instanceof Error ? error.message : "회원을 추가하지 못했습니다.");
      });
  };

  return (
    <AdaptiveDialog title="회원 추가" open={open} onClose={() => confirmDiscard(dirty, onClose)}>
      <form className="dialog-form" onSubmit={submit} noValidate>
        {message ? <div className="form-status" role="alert">{message}</div> : null}
        <label className="field">
          <span>사용자 검색</span>
          <input
            aria-label="회원 추가 사용자 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="아이디 검색"
          />
        </label>
        <label className="field">
          <span>사용자</span>
          <select aria-label="추가할 사용자" value={userId} onChange={(event) => setUserId(event.target.value)}>
            <option value="">사용자 선택</option>
            {selectableUsers.map((user) => (
              <option value={user.id} key={user.id}>
                {user.username}
              </option>
            ))}
          </select>
          <small>이미 활성 소속이거나 비활성 계정인 사용자는 제외됩니다.</small>
        </label>
        <label className="field">
          <span>역할</span>
          <select aria-label="추가 역할" value={role} onChange={(event) => setRole(event.target.value as MembershipRole)}>
            <option value="owner">owner</option>
            <option value="manager">manager</option>
            <option value="staff">staff</option>
          </select>
        </label>
        <div className="dialog-actions">
          <button className="button secondary" type="button" onClick={() => confirmDiscard(dirty, onClose)}>
            취소
          </button>
          <button className="button primary" type="submit" disabled={submitting || !userId}>
            {submitting ? "추가 중" : "회원 추가"}
          </button>
        </div>
      </form>
    </AdaptiveDialog>
  );
}

function PermissionMatrix({
  permissions,
  onChange
}: {
  permissions: RolePermission[];
  onChange: (permissions: RolePermission[]) => void;
}) {
  return (
    <div className="permission-matrix" aria-label="역할별 권한 matrix">
      {permissions.map((permission) => (
        <details className="permission-role-card" open key={permission.role}>
          <summary>{permission.role}</summary>
          <div className="permission-check-grid">
            {permissionLabels.map((item) => (
              <label className="check-row" key={item.key}>
                <input
                  type="checkbox"
                  checked={permission[item.key]}
                  aria-label={`${permission.role} ${item.label}`}
                  onChange={(event) =>
                    onChange(
                      permissions.map((current) =>
                        current.role === permission.role ? { ...current, [item.key]: event.target.checked } : current
                      )
                    )
                  }
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function MembersStatusState<T>({ state, navigate }: { state: LoadState<T>; navigate: Navigate }) {
  if (state.status === "loading") {
    return <MembersStatus title="회원 정보 로딩 중" message="바 회원과 역할 권한을 불러오고 있습니다." />;
  }
  if (state.status === "unauthenticated") {
    return (
      <MembersStatus title="로그인이 필요합니다" message={state.message}>
        <button className="button primary" type="button" onClick={() => navigate("/login")}>
          로그인으로 이동
        </button>
      </MembersStatus>
    );
  }
  if (state.status === "forbidden") {
    return <MembersStatus title="접근할 수 없습니다" message={state.message} tone="error" />;
  }
  if (state.status === "error") {
    return <MembersStatus title="회원 정보를 불러오지 못했습니다" message={state.message} tone="error" />;
  }
  return null;
}

function MembersStatus({
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
  return { status: "error", message: error instanceof Error ? error.message : "회원 정보를 불러오지 못했습니다." };
}

function confirmDiscard(dirty: boolean, action: () => void): void {
  if (!dirty || window.confirm("작성 중인 내용이 사라집니다. 계속할까요?")) action();
}
