import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  BarBusinessHourInput,
  BarLinkInput,
  BarSettingsResponse,
  UpdateBarSettingsRequest
} from "../../../contracts/barSettings";
import { readCurrentPermissions } from "../memberships/membershipsApi";
import { AuthApiError } from "../auth/authApi";
import { useDirtyWarning } from "../auth/useDirtyWarning";
import { readBarSettings, updateBarSettings } from "./barSettingsApi";

type Navigate = (path: string) => void;
type FieldErrors = Record<string, string[]>;
type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "unauthenticated"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "error"; message: string };

type SettingsPageData = {
  response: BarSettingsResponse;
  canEdit: boolean;
  canChangeCurrency: boolean;
};

const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];
const currencyOptions = [
  ["KRW", "KRW — 대한민국 원"],
  ["USD", "USD — 미국 달러"],
  ["JPY", "JPY — 일본 엔"],
  ["EUR", "EUR — 유로"]
];

export function BarSettingsPage({ barId, navigate }: { barId: string; navigate: Navigate }) {
  const [state, setState] = useState<LoadState<SettingsPageData>>({ status: "loading" });
  const [form, setForm] = useState<UpdateBarSettingsRequest | null>(null);
  const [original, setOriginal] = useState<UpdateBarSettingsRequest | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const dirty = Boolean(form && original && JSON.stringify(form) !== JSON.stringify(original));
  useDirtyWarning(dirty && status !== "saving");

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    Promise.all([readBarSettings(barId), readCurrentPermissions(barId)])
      .then(([response, permissions]) => {
        if (cancelled) return;
        const nextForm = toSettingsForm(response);
        setForm(nextForm);
        setOriginal(nextForm);
        setFieldErrors({});
        setMessage("");
        setStatus("idle");
        setState({
          status: "ready",
          data: {
            response,
            canEdit: permissions.permissions.canEditMenu,
            canChangeCurrency: permissions.role === "system-admin"
          }
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [barId]);

  const groupedHours = useMemo(() => {
    const groups = Array.from({ length: 7 }, () => [] as Array<{ range: BarBusinessHourInput; index: number }>);
    form?.businessHours.forEach((range, index) => {
      groups[range.dayOfWeek]?.push({ range, index });
    });
    return groups;
  }, [form]);

  if (state.status !== "ready" || !form || !original) {
    return <SettingsStatusState state={state} navigate={navigate} />;
  }

  const { response, canEdit, canChangeCurrency } = state.data;

  const patchForm = (patch: Partial<UpdateBarSettingsRequest>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
  };

  const updateHour = (index: number, patch: Partial<BarBusinessHourInput>) => {
    patchForm({
      businessHours: form.businessHours.map((range, currentIndex) =>
        currentIndex === index ? { ...range, ...patch } : range
      )
    });
  };

  const addHour = (dayOfWeek: number) => {
    patchForm({
      businessHours: [...form.businessHours, { dayOfWeek, opensAt: "18:00", closesAt: "02:00" }]
    });
  };

  const removeHour = (index: number) => {
    patchForm({ businessHours: form.businessHours.filter((_, currentIndex) => currentIndex !== index) });
  };

  const updateLink = (index: number, patch: Partial<BarLinkInput>) => {
    patchForm({
      links: form.links.map((link, currentIndex) => (currentIndex === index ? { ...link, ...patch } : link))
    });
  };

  const moveLink = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= form.links.length) return;
    const nextLinks = [...form.links];
    const [item] = nextLinks.splice(index, 1);
    if (!item) return;
    nextLinks.splice(targetIndex, 0, item);
    patchForm({ links: nextLinks });
  };

  const addLink = () => {
    if (form.links.length >= 5) return;
    patchForm({ links: [...form.links, { label: "", url: "" }] });
  };

  const removeLink = (index: number) => {
    patchForm({ links: form.links.filter((_, currentIndex) => currentIndex !== index) });
  };

  const save = () => {
    setStatus("saving");
    setFieldErrors({});
    setMessage("");
    updateBarSettings(barId, form)
      .then((nextResponse) => {
        const nextForm = toSettingsForm(nextResponse);
        setForm(nextForm);
        setOriginal(nextForm);
        setMessage("바 기본 정보를 저장했습니다. 발행 전까지 기존 고객 메뉴판은 유지됩니다.");
        setStatus("idle");
        setState((current) =>
          current.status === "ready" ? { ...current, data: { ...current.data, response: nextResponse } } : current
        );
      })
      .catch((error: unknown) => {
        setStatus("error");
        if (error instanceof AuthApiError) {
          setFieldErrors(error.fieldErrors);
          setMessage(error.message);
          return;
        }
        setMessage(error instanceof Error ? error.message : "바 기본 정보를 저장하지 못했습니다.");
      });
  };

  const reset = () => {
    confirmDiscard(dirty, () => {
      setForm(original);
      setFieldErrors({});
      setMessage("");
      setStatus("idle");
    });
  };

  return (
    <div className="bar-settings-page">
      <section className="hero-panel" aria-labelledby="settings-title">
        <div>
          <p className="eyebrow">바 설정</p>
          <h1 id="settings-title">바 기본 정보·영업시간</h1>
          <p>{response.settings.name}의 고객 공개용 소개, 영업시간, 링크, 통화를 관리합니다.</p>
        </div>
        <div className="status-box" role="status">
          <span>미발행 변경 기반</span>
          <strong>{response.settings.settingsDraftHash.slice(0, 8)}</strong>
          <small>{publicMenuStatusLabel(response.bar.publicMenuStatus)} · {response.settings.currency}</small>
          <button className="button secondary" type="button" onClick={() => navigate(`/bars/${barId}`)}>
            바 개요
          </button>
        </div>
      </section>

      <nav className="settings-tabs" aria-label="바 설정 섹션">
        <a href="#settings-profile">기본 정보</a>
        <a href="#settings-hours">영업시간</a>
        <a href="#settings-links">외부 링크</a>
        <a href="#settings-operations">운영 설정</a>
      </nav>

      {message ? <div className={status === "error" ? "form-status" : "form-status success"} role={status === "error" ? "alert" : "status"}>{message}</div> : null}
      {!canEdit ? (
        <div className="form-status" role="alert">
          이 바에서 메뉴 편집 권한이 없어 설정을 저장할 수 없습니다.
        </div>
      ) : null}
      {Object.keys(fieldErrors).length > 0 ? (
        <div className="form-summary" role="alert">
          입력값을 확인하세요.
        </div>
      ) : null}

      <section className="panel" id="settings-profile" aria-labelledby="settings-profile-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">기본 정보</p>
            <h2 id="settings-profile-title">기본 정보</h2>
          </div>
        </div>
        <div className="settings-form-grid">
          <TextField
            label="바 이름"
            name="settings-name"
            value={form.name}
            disabled={!canEdit}
            error={fieldErrors.name}
            onChange={(value) => patchForm({ name: value })}
          />
          <TextField
            label="국내 전화번호"
            name="settings-phone"
            value={form.phoneNumberDigits}
            disabled={!canEdit}
            placeholder="숫자만 입력"
            error={fieldErrors.phoneNumberDigits}
            onChange={(value) => patchForm({ phoneNumberDigits: value.replace(/\D/g, "") })}
            help={response.settings.phoneNumberDisplay ? `표시: ${response.settings.phoneNumberDisplay}` : "숫자만 저장하고 화면에서 포맷합니다."}
          />
          <TextField
            label="소개 문구"
            name="settings-description"
            value={form.description}
            disabled={!canEdit}
            textarea
            className="full"
            placeholder="최대 500자"
            error={fieldErrors.description}
            onChange={(value) => patchForm({ description: value })}
          />
          <TextField
            label="주소"
            name="settings-address"
            value={form.address}
            disabled={!canEdit}
            className="full"
            placeholder="주소 자유 입력"
            error={fieldErrors.address}
            onChange={(value) => patchForm({ address: value })}
          />
          <TextField
            label="지도 링크"
            name="settings-map"
            value={form.mapUrl}
            disabled={!canEdit}
            className="full"
            placeholder="https://..."
            error={fieldErrors.mapUrl}
            onChange={(value) => patchForm({ mapUrl: value })}
          />
        </div>
      </section>

      <section className="panel" id="settings-hours" aria-labelledby="settings-hours-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">영업시간</p>
            <h2 id="settings-hours-title">영업시간</h2>
          </div>
          <span className="step-chip">익일 마감 허용</span>
        </div>
        <div className="hours-editor">
          {dayLabels.map((label, dayOfWeek) => (
            <details className="hours-day" open key={label}>
              <summary>{label}요일</summary>
              <div className="hours-range-list">
                {groupedHours[dayOfWeek]?.length ? (
                  groupedHours[dayOfWeek].map(({ range, index }) => (
                    <div className="hours-range-row" key={`${dayOfWeek}-${index}`}>
                      <label className="field">
                        <span>시작</span>
                        <input
                          aria-label={`${label}요일 시작 ${index + 1}`}
                          type="time"
                          value={range.opensAt}
                          disabled={!canEdit}
                          onChange={(event) => updateHour(index, { opensAt: event.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>마감</span>
                        <input
                          aria-label={`${label}요일 마감 ${index + 1}`}
                          type="time"
                          value={range.closesAt}
                          disabled={!canEdit}
                          onChange={(event) => updateHour(index, { closesAt: event.target.value })}
                        />
                      </label>
                      <button className="button secondary" type="button" disabled={!canEdit} onClick={() => removeHour(index)}>
                        삭제
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="muted">휴무</p>
                )}
                <button className="button secondary" type="button" disabled={!canEdit} onClick={() => addHour(dayOfWeek)}>
                  구간 추가
                </button>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="panel" id="settings-links" aria-labelledby="settings-links-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">외부 링크</p>
            <h2 id="settings-links-title">외부 링크</h2>
          </div>
          <button className="button primary" type="button" disabled={!canEdit || form.links.length >= 5} onClick={addLink}>
            링크 추가
          </button>
        </div>
        {form.links.length === 0 ? (
          <div className="dashboard-empty" role="status">
            <strong>등록된 외부 링크가 없습니다.</strong>
            <p>고객 메뉴판에 표시할 인스타그램, 예약 링크 등을 최대 5개까지 추가하세요.</p>
          </div>
        ) : (
          <div className="links-editor">
            {form.links.map((link, index) => (
              <div className="link-row" key={link.id ?? index}>
                <TextField
                  label="링크 이름"
                  name={`settings-link-label-${index}`}
                  value={link.label}
                  disabled={!canEdit}
                  error={fieldErrors[`links.${index}.label`]}
                  onChange={(value) => updateLink(index, { label: value })}
                />
                <TextField
                  label="URL"
                  name={`settings-link-url-${index}`}
                  value={link.url}
                  disabled={!canEdit}
                  error={fieldErrors[`links.${index}.url`]}
                  onChange={(value) => updateLink(index, { url: value })}
                />
                <div className="link-actions">
                  <button className="button secondary" type="button" disabled={!canEdit || index === 0} onClick={() => moveLink(index, -1)}>
                    위로
                  </button>
                  <button className="button secondary" type="button" disabled={!canEdit || index === form.links.length - 1} onClick={() => moveLink(index, 1)}>
                    아래로
                  </button>
                  <button className="button secondary" type="button" disabled={!canEdit} onClick={() => removeLink(index)}>
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel" id="settings-operations" aria-labelledby="settings-operations-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">운영 옵션</p>
            <h2 id="settings-operations-title">운영 설정</h2>
          </div>
        </div>
        <div className="settings-form-grid">
          <label className="field">
            <span>통화</span>
            <select
              aria-label="바 통화"
              value={form.currency}
              disabled={!canEdit || !canChangeCurrency}
              onChange={(event) => patchForm({ currency: event.target.value })}
            >
              {currencyOptions.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
            {!canChangeCurrency ? <small>통화 변경은 시스템 관리자만 수행할 수 있습니다.</small> : null}
            {fieldErrors.currency?.length ? <strong className="field-error">{fieldErrors.currency[0]}</strong> : null}
          </label>
          <div className="dashboard-empty">
            <strong>통화 변경은 기존 금액 숫자를 변환하지 않습니다.</strong>
            <p>현재 메뉴 가격과 주문 금액 기록은 서버 규칙에 따라 별도로 보존됩니다.</p>
          </div>
        </div>
        {form.currency !== original.currency ? (
          <div className="form-status" role="alert">
            통화를 변경해도 기존 금액 숫자는 자동 변환되지 않습니다.
          </div>
        ) : null}
      </section>

      <div className="sticky-action-bar">
        <button className="button secondary" type="button" disabled={!dirty || status === "saving"} onClick={reset}>
          되돌리기
        </button>
        <button className="button primary" type="button" disabled={!canEdit || !dirty || status === "saving"} onClick={save}>
          {status === "saving" ? "저장 중" : "저장"}
        </button>
      </div>
    </div>
  );
}

function publicMenuStatusLabel(status: string): string {
  if (status === "published") return "공개 중";
  return "준비 중";
}

function toSettingsForm(response: BarSettingsResponse): UpdateBarSettingsRequest {
  return {
    name: response.settings.name,
    description: response.settings.description,
    address: response.settings.address,
    mapUrl: response.settings.mapUrl,
    phoneNumberDigits: response.settings.phoneNumberDigits,
    openingNote: response.settings.openingNote,
    currency: response.settings.currency,
    businessHours: response.settings.businessHours.map((range) => ({
      id: range.id,
      dayOfWeek: range.dayOfWeek,
      opensAt: range.opensAt,
      closesAt: range.closesAt
    })),
    links: response.settings.links.map((link) => ({
      id: link.id,
      label: link.label,
      url: link.url
    }))
  };
}

function SettingsStatusState<T>({ state, navigate }: { state: LoadState<T>; navigate: Navigate }) {
  if (state.status === "loading") {
    return <SettingsStatus title="바 기본 정보 로딩 중" message="공개 profile과 영업시간을 불러오고 있습니다." />;
  }
  if (state.status === "unauthenticated") {
    return (
      <SettingsStatus title="로그인이 필요합니다" message={state.message}>
        <button className="button primary" type="button" onClick={() => navigate("/login")}>
          로그인으로 이동
        </button>
      </SettingsStatus>
    );
  }
  if (state.status === "forbidden") {
    return <SettingsStatus title="접근할 수 없습니다" message={state.message} tone="error" />;
  }
  if (state.status === "error") {
    return <SettingsStatus title="바 기본 정보를 불러오지 못했습니다" message={state.message} tone="error" />;
  }
  return null;
}

function SettingsStatus({
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
  disabled,
  onChange,
  placeholder,
  error,
  help,
  textarea = false,
  className = ""
}: {
  label: string;
  name: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string[];
  help?: string;
  textarea?: boolean;
  className?: string;
}) {
  const errorId = `${name}-error`;
  return (
    <label className={`field ${className}`} htmlFor={name}>
      <span>{label}</span>
      {textarea ? (
        <textarea
          id={name}
          name={name}
          value={value}
          disabled={disabled}
          aria-invalid={error?.length ? "true" : undefined}
          aria-describedby={error?.length ? errorId : undefined}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={name}
          name={name}
          value={value}
          disabled={disabled}
          aria-invalid={error?.length ? "true" : undefined}
          aria-describedby={error?.length ? errorId : undefined}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {help ? <small>{help}</small> : null}
      {error?.length ? <strong id={errorId} className="field-error">{error[0]}</strong> : null}
    </label>
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

function confirmDiscard(isDirty: boolean, onConfirm: () => void): void {
  if (!isDirty || window.confirm("저장하지 않은 입력을 버릴까요?")) {
    onConfirm();
  }
}
