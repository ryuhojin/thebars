import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { changePassword, login, logout, readSession, recoverAdmin, setupAdmin, AuthApiError } from "./authApi";
import { useDirtyWarning } from "./useDirtyWarning";
import type { AuthUser } from "../../../contracts/auth";

type Navigate = (path: string) => void;

type AuthRoutePageProps = {
  pathname: string;
  navigate: Navigate;
};

type FieldErrors = Record<string, string[]>;

export function AuthRoutePage({ pathname, navigate }: AuthRoutePageProps) {
  if (pathname === "/setup") return <SetupScreen navigate={navigate} />;
  if (pathname === "/recovery") return <RecoveryScreen navigate={navigate} />;
  if (pathname === "/change-password") return <ChangePasswordRoute navigate={navigate} />;
  return <LoginScreen navigate={navigate} />;
}

function ChangePasswordRoute({ navigate }: { navigate: Navigate }) {
  const [status, setStatus] = useState<"checking" | "ready" | "error">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    readSession()
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof AuthApiError && ["AUTH_REQUIRED", "SESSION_EXPIRED"].includes(error.code)) {
          navigate("/login");
          return;
        }
        setMessage(error instanceof Error ? error.message : "세션을 확인하지 못했습니다.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (status === "ready") return <ChangePasswordScreen navigate={navigate} />;
  if (status === "error") return <StatusPanel title="세션 확인 오류" message={message} tone="error" />;
  return <StatusPanel title="로그인 상태 확인 중" message="비밀번호 변경 권한을 확인하고 있습니다." />;
}

export function ProtectedDashboard({ navigate }: { navigate: Navigate }) {
  const [status, setStatus] = useState<"loading" | "ready" | "unauthenticated" | "error">("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    readSession()
      .then((session) => {
        if (cancelled) return;
        if (session.user.forcedPasswordChange) {
          navigate("/change-password");
          return;
        }
        setUser(session.user);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof AuthApiError && ["AUTH_REQUIRED", "SESSION_EXPIRED"].includes(error.code)) {
          setStatus("unauthenticated");
          setMessage(error.message);
          return;
        }
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "세션을 확인하지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (status === "loading") {
    return <StatusPanel title="세션 확인 중" message="로그인 상태를 확인하고 있습니다." />;
  }

  if (status === "unauthenticated") {
    return (
      <StatusPanel title="로그인이 필요합니다" message={message || "다시 로그인하세요."}>
        <button className="button primary" type="button" onClick={() => navigate("/login")}>
          로그인으로 이동
        </button>
      </StatusPanel>
    );
  }

  if (status === "error") {
    return <StatusPanel title="세션 오류" message={message} tone="error" />;
  }

  return (
    <div className="page-stack">
      <section className="hero-panel" aria-labelledby="dashboard-title">
        <div>
          <p className="eyebrow">보호된 관리자 화면</p>
          <h1 id="dashboard-title">대시보드</h1>
          <p>로그인된 관리자 세션으로 운영 현황을 확인합니다.</p>
        </div>
        <div className="status-box" role="status">
          <span>로그인 사용자</span>
          <strong>{user?.username}</strong>
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">세션 관리</p>
            <h2>계정 보안</h2>
          </div>
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              logout().finally(() => navigate("/login"));
            }}
          >
            로그아웃
          </button>
        </div>
      </section>
    </div>
  );
}

function SetupScreen({ navigate }: { navigate: Navigate }) {
  const [form, setForm] = useState({ setupToken: "", username: "", password: "", passwordConfirm: "" });
  const { submit, fieldErrors, message, status } = useSubmitState(async () => {
    await setupAdmin(form);
    setForm({ setupToken: "", username: "", password: "", passwordConfirm: "" });
  });
  useDirtyWarning(isDirty(form));

  return (
    <AuthFrame
      eyebrow="최초 설정"
      title="최초 관리자 설정"
      description="시스템에 관리자가 없을 때 SETUP_TOKEN으로 한 번만 생성합니다."
      status={status}
      message={message}
      fieldErrors={fieldErrors}
      onSubmit={submit}
      successAction={<button className="button primary" type="button" onClick={() => navigate("/login")}>로그인으로 이동</button>}
    >
      <TextField label="설정 토큰" name="setupToken" type="password" value={form.setupToken} error={fieldErrors.setupToken} onChange={(value) => setForm({ ...form, setupToken: value })} />
      <TextField label="관리자 아이디" name="username" value={form.username} error={fieldErrors.username} help="영문 소문자·숫자 4~20자" onChange={(value) => setForm({ ...form, username: value })} />
      <TextField label="비밀번호" name="password" type="password" value={form.password} error={fieldErrors.password} help="영문·숫자·특수문자 포함 10자 이상" onChange={(value) => setForm({ ...form, password: value })} />
      <TextField label="비밀번호 확인" name="passwordConfirm" type="password" value={form.passwordConfirm} error={fieldErrors.passwordConfirm} onChange={(value) => setForm({ ...form, passwordConfirm: value })} />
      <button className="button primary full-width" type="submit" disabled={status === "submitting"}>{status === "submitting" ? "생성 중" : "관리자 생성"}</button>
    </AuthFrame>
  );
}

function LoginScreen({ navigate }: { navigate: Navigate }) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [lockedUntil, setLockedUntil] = useState("");
  const { submit, fieldErrors, message, status } = useSubmitState(async () => {
    const result = await login(form);
    setForm({ username: "", password: "" });
    navigate(result.nextPath);
  }, (error) => {
    setLockedUntil(typeof error.details.lockedUntil === "string" ? error.details.lockedUntil : "");
  });
  useDirtyWarning(isDirty(form));

  const lockMessage = useMemo(() => {
    if (!lockedUntil) return "";
    return `잠금 해제 예정: ${new Date(lockedUntil).toLocaleString("ko-KR")}`;
  }, [lockedUntil]);

  return (
    <AuthFrame
      eyebrow="관리자 로그인"
      title="로그인"
      description="아이디와 비밀번호로 안전하게 로그인합니다."
      status={status}
      message={lockMessage || message}
      fieldErrors={fieldErrors}
      onSubmit={submit}
    >
      <TextField label="아이디" name="username" value={form.username} error={fieldErrors.username} onChange={(value) => setForm({ ...form, username: value })} />
      <TextField label="비밀번호" name="password" type="password" value={form.password} error={fieldErrors.password} onChange={(value) => setForm({ ...form, password: value })} />
      <button className="button primary full-width" type="submit" disabled={status === "submitting"}>{status === "submitting" ? "로그인 중" : "로그인"}</button>
    </AuthFrame>
  );
}

function ChangePasswordScreen({ navigate }: { navigate: Navigate }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", newPasswordConfirm: "" });
  const { submit, fieldErrors, message, status } = useSubmitState(async () => {
    await changePassword(form);
    setForm({ currentPassword: "", newPassword: "", newPasswordConfirm: "" });
    navigate("/dashboard");
  });
  useDirtyWarning(isDirty(form));

  return (
    <AuthFrame
      eyebrow="계정 보안"
      title="비밀번호 변경"
      description="임시 비밀번호를 실제 비밀번호로 교체해야 다른 기능을 사용할 수 있습니다."
      status={status}
      message={message}
      fieldErrors={fieldErrors}
      onSubmit={submit}
      secondaryAction={<button className="button secondary" type="button" onClick={() => logout().finally(() => navigate("/login"))}>로그아웃</button>}
    >
      <TextField label="현재 임시 비밀번호" name="currentPassword" type="password" value={form.currentPassword} error={fieldErrors.currentPassword} onChange={(value) => setForm({ ...form, currentPassword: value })} />
      <TextField label="새 비밀번호" name="newPassword" type="password" value={form.newPassword} error={fieldErrors.newPassword} help="영문·숫자·특수문자 포함 10자 이상" onChange={(value) => setForm({ ...form, newPassword: value })} />
      <TextField label="새 비밀번호 확인" name="newPasswordConfirm" type="password" value={form.newPasswordConfirm} error={fieldErrors.newPasswordConfirm} onChange={(value) => setForm({ ...form, newPasswordConfirm: value })} />
      <button className="button primary full-width" type="submit" disabled={status === "submitting"}>{status === "submitting" ? "변경 중" : "변경하고 계속"}</button>
    </AuthFrame>
  );
}

function RecoveryScreen({ navigate }: { navigate: Navigate }) {
  const [form, setForm] = useState({ recoveryToken: "", newPassword: "", newPasswordConfirm: "" });
  const { submit, fieldErrors, message, status } = useSubmitState(async () => {
    await recoverAdmin(form);
    setForm({ recoveryToken: "", newPassword: "", newPasswordConfirm: "" });
  });
  useDirtyWarning(isDirty(form));

  return (
    <AuthFrame
      eyebrow="관리자 복구"
      title="시스템 관리자 복구"
      description="ADMIN_RECOVERY_TOKEN으로 단일 시스템 관리자 비밀번호를 재설정합니다."
      status={status}
      message={message}
      fieldErrors={fieldErrors}
      onSubmit={submit}
      successAction={<button className="button primary" type="button" onClick={() => navigate("/login")}>로그인으로 이동</button>}
    >
      <TextField label="복구 토큰" name="recoveryToken" type="password" value={form.recoveryToken} error={fieldErrors.recoveryToken} onChange={(value) => setForm({ ...form, recoveryToken: value })} />
      <TextField label="새 비밀번호" name="newPassword" type="password" value={form.newPassword} error={fieldErrors.newPassword} onChange={(value) => setForm({ ...form, newPassword: value })} />
      <TextField label="새 비밀번호 확인" name="newPasswordConfirm" type="password" value={form.newPasswordConfirm} error={fieldErrors.newPasswordConfirm} onChange={(value) => setForm({ ...form, newPasswordConfirm: value })} />
      <button className="button primary full-width" type="submit" disabled={status === "submitting"}>{status === "submitting" ? "복구 중" : "비밀번호 재설정"}</button>
    </AuthFrame>
  );
}

function AuthFrame({
  eyebrow,
  title,
  description,
  status,
  message,
  fieldErrors,
  onSubmit,
  children,
  secondaryAction,
  successAction
}: {
  eyebrow: string;
  title: string;
  description: string;
  status: SubmitStatus;
  message: string;
  fieldErrors: FieldErrors;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  secondaryAction?: ReactNode;
  successAction?: ReactNode;
}) {
  return (
    <main className="auth-screen">
      <section className="auth-visual" aria-label="제품 설명">
        <div className="auth-visual-copy">
          <p className="eyebrow">THE BAR ADMIN</p>
          <h1>바 운영을 위한 관리자 콘솔</h1>
          <p>메뉴 공개, 테이블 주문, 정산 내역, 권한 관리를 한 곳에서 다루는 운영자 전용 공간입니다.</p>
        </div>
        <div className="auth-product-shot" aria-hidden="true">
          <div className="auth-shot-topbar">
            <strong>THE BAR</strong>
            <span>현재 작업 바</span>
          </div>
          <div className="auth-shot-body">
            <div className="auth-shot-sidebar">
              <span className="active">대시보드</span>
              <span>메뉴 관리</span>
              <span>테이블 목록</span>
              <span>발행 이력</span>
            </div>
            <div className="auth-shot-content">
              <div className="auth-shot-kpis">
                <div>
                  <span>오늘 주문</span>
                  <strong>18</strong>
                </div>
                <div>
                  <span>발행 상태</span>
                  <strong>정상</strong>
                </div>
                <div>
                  <span>품절 관리</span>
                  <strong>3</strong>
                </div>
              </div>
              <div className="auth-shot-table">
                <div>
                  <strong>맥캘란 12년</strong>
                  <span className="auth-shot-chip">판매 중</span>
                </div>
                <div>
                  <strong>하우스 하이볼</strong>
                  <span className="auth-shot-chip warning">재고 확인</span>
                </div>
                <div>
                  <strong>마감 정산</strong>
                  <span className="auth-shot-chip neutral">대기</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <ul className="auth-visual-points" aria-hidden="true">
          <li>
            <strong>권한별 접근</strong>
            <span>바별 역할과 메뉴를 분리</span>
          </li>
          <li>
            <strong>주문 운영</strong>
            <span>테이블 생성부터 정산까지 추적</span>
          </li>
          <li>
            <strong>고객 메뉴판</strong>
            <span>공개 상태와 발행 이력 확인</span>
          </li>
        </ul>
      </section>
      <section className="auth-card" aria-labelledby="auth-title">
        <form onSubmit={onSubmit} noValidate>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id="auth-title">{title}</h2>
          <p>{description}</p>
          {Object.keys(fieldErrors).length > 0 ? (
            <div className="form-summary" role="alert">
              입력값을 확인하세요.
            </div>
          ) : null}
          {message ? <div className={status === "success" ? "form-status success" : "form-status"} role={status === "error" ? "alert" : "status"}>{message}</div> : null}
          <div className="form-grid">{children}</div>
        </form>
        <div className="auth-actions">
          {successAction}
          {secondaryAction}
        </div>
      </section>
    </main>
  );
}

function TextField({
  label,
  name,
  value,
  onChange,
  type = "text",
  help,
  error
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  help?: string;
  error?: string[];
}) {
  const errorId = `${name}-error`;
  const helpId = `${name}-help`;
  const describedBy = [help ? helpId : "", error?.length ? errorId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        aria-invalid={error?.length ? "true" : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
      {help ? <small id={helpId}>{help}</small> : null}
      {error?.length ? <strong id={errorId} className="field-error">{error[0]}</strong> : null}
    </div>
  );
}

function StatusPanel({
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
    <section className={`panel status-panel ${tone}`} role={tone === "error" ? "alert" : "status"}>
      <h1>{title}</h1>
      <p>{message}</p>
      {children}
    </section>
  );
}

type SubmitStatus = "idle" | "submitting" | "success" | "error";

function useSubmitState(action: () => Promise<void>, onError?: (error: AuthApiError) => void) {
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  return {
    status,
    message,
    fieldErrors,
    submit: (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setStatus("submitting");
      setMessage("");
      setFieldErrors({});
      action()
        .then(() => {
          setStatus("success");
          setMessage("처리되었습니다.");
        })
        .catch((error: unknown) => {
          setStatus("error");
          if (error instanceof AuthApiError) {
            setFieldErrors(error.fieldErrors);
            setMessage(error.message);
            onError?.(error);
            return;
          }
          setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.");
        });
    }
  };
}

function isDirty(values: Record<string, string>): boolean {
  return Object.values(values).some((value) => value.length > 0);
}
