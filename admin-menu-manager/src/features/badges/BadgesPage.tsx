import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { BadgeColor, BadgesResponse, BarBadge, BarBadgesResponse, SystemBadge, SystemBadgeForBar } from "../../../contracts/badges";
import { readableTextColor } from "../../../contracts/badges";
import { LoadingSkeleton } from "../../components/feedback/LoadingSkeleton";
import { AuthApiError } from "../auth/authApi";
import { useDirtyWarning } from "../auth/useDirtyWarning";
import {
  createBadgeColor,
  createBarBadge,
  createSystemBadge,
  deleteBarBadge,
  readBadges,
  readBarBadges,
  updateBadgeColor,
  updateBarBadge,
  updateBarSystemBadgeVisibility,
  updateSystemBadge
} from "./badgesApi";

type Navigate = (path: string) => void;
type TabId = "badges" | "colors";
type EditorMode = "editing" | "creating";
type FieldErrors = Record<string, string[]>;
type SaveState = "idle" | "saving" | "error";
type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "unauthenticated"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "error"; message: string };

type ColorForm = {
  name: string;
  backgroundHex: string;
  isActive: boolean;
  replacementColorId: string;
};

type BadgeForm = {
  name: string;
  colorId: string;
  isActive: boolean;
  confirmImpact: boolean;
};

const tabLabels: Record<TabId, string> = {
  badges: "배지",
  colors: "허용 색상"
};

export function BadgesPage({ navigate }: { navigate: Navigate }) {
  const [state, setState] = useState<LoadState<BadgesResponse>>({ status: "loading" });
  const [barState, setBarState] = useState<LoadState<BarBadgesResponse>>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [barReloadKey, setBarReloadKey] = useState(0);
  const [tab, setTab] = useState<TabId>("badges");

  const [selectedBarId, setSelectedBarId] = useState("");

  const [systemQuery, setSystemQuery] = useState("");
  const [systemSelectedId, setSystemSelectedId] = useState("");
  const [systemMode, setSystemMode] = useState<EditorMode>("editing");
  const [systemForm, setSystemForm] = useState<BadgeForm>(emptyBadgeForm());
  const [systemOriginal, setSystemOriginal] = useState<BadgeForm>(emptyBadgeForm());
  const [systemErrors, setSystemErrors] = useState<FieldErrors>({});
  const [systemMessage, setSystemMessage] = useState("");
  const [systemStatus, setSystemStatus] = useState<SaveState>("idle");

  const [barQuery, setBarQuery] = useState("");
  const [barSelectedId, setBarSelectedId] = useState("");
  const [barMode, setBarMode] = useState<EditorMode>("editing");
  const [barForm, setBarForm] = useState<BadgeForm>(emptyBadgeForm());
  const [barOriginal, setBarOriginal] = useState<BadgeForm>(emptyBadgeForm());
  const [barErrors, setBarErrors] = useState<FieldErrors>({});
  const [barMessage, setBarMessage] = useState("");
  const [barStatus, setBarStatus] = useState<SaveState>("idle");

  const [colorQuery, setColorQuery] = useState("");
  const [colorSelectedId, setColorSelectedId] = useState("");
  const [colorMode, setColorMode] = useState<EditorMode>("editing");
  const [colorForm, setColorForm] = useState<ColorForm>(emptyColorForm());
  const [colorOriginal, setColorOriginal] = useState<ColorForm>(emptyColorForm());
  const [colorErrors, setColorErrors] = useState<FieldErrors>({});
  const [colorMessage, setColorMessage] = useState("");
  const [colorStatus, setColorStatus] = useState<SaveState>("idle");

  const systemDirty = JSON.stringify(systemForm) !== JSON.stringify(systemOriginal);
  const barDirty = JSON.stringify(barForm) !== JSON.stringify(barOriginal);
  const colorDirty = JSON.stringify(colorForm) !== JSON.stringify(colorOriginal);
  useDirtyWarning(systemDirty || barDirty || colorDirty);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    readBadges()
      .then((data) => {
        if (cancelled) return;
        const firstColor = data.colors[0];
        const firstBadge = data.systemBadges[0];
        const firstBar = data.accessibleBars[0];
        if (firstColor && !colorSelectedId) {
          const nextForm = colorToForm(firstColor);
          setColorSelectedId(firstColor.id);
          setColorForm(nextForm);
          setColorOriginal(nextForm);
        }
        if (firstBadge && !systemSelectedId) {
          const nextForm = badgeToForm(firstBadge);
          setSystemSelectedId(firstBadge.id);
          setSystemForm(nextForm);
          setSystemOriginal(nextForm);
        }
        setSelectedBarId((current) => current || firstBar?.id || "");
        setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedBarId) {
      setBarState({ status: "error", message: "배지를 관리할 수 있는 바가 없습니다." });
      return () => {
        cancelled = true;
      };
    }
    setBarState({ status: "loading" });
    readBarBadges(selectedBarId)
      .then((data) => {
        if (cancelled) return;
        const firstBadge = data.barBadges[0];
        if (firstBadge) {
          const nextForm = badgeToForm(firstBadge);
          setBarSelectedId(firstBadge.id);
          setBarMode("editing");
          setBarForm(nextForm);
          setBarOriginal(nextForm);
        } else {
          const nextForm = emptyBadgeForm(data.colors[0]?.id);
          setBarSelectedId("");
          setBarMode("creating");
          setBarForm(nextForm);
          setBarOriginal(nextForm);
        }
        setBarErrors({});
        setBarMessage("");
        setBarStatus("idle");
        setBarState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setBarState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBarId, barReloadKey]);

  const isSystemAdmin = state.status === "ready" && state.data.accessibleBars.some((bar) => bar.role === "system-admin");
  const colors = state.status === "ready" ? state.data.colors : [];
  const activeColors = colors.filter((color) => color.isActive);
  const selectedBar = state.status === "ready" ? state.data.accessibleBars.find((bar) => bar.id === selectedBarId) : null;
  const systemBadges = state.status === "ready" ? state.data.systemBadges : [];
  const filteredSystemBadges = filterByQuery(systemBadges, systemQuery);
  const filteredColors = filterByQuery(colors, colorQuery);
  const filteredBarBadges = barState.status === "ready" ? filterByQuery(barState.data.barBadges, barQuery) : [];
  const previewBadges = useMemo(() => {
    if (barState.status === "ready") {
      return [
        ...barState.data.systemBadges.filter((badge) => badge.isActive && !badge.isHiddenForBar).map((badge) => ({ ...badge, kind: "common" })),
        ...barState.data.barBadges.filter((badge) => badge.isActive).map((badge) => ({ ...badge, kind: "bar" }))
      ].slice(0, 3);
    }
    return systemBadges.filter((badge) => badge.isActive).map((badge) => ({ ...badge, kind: "common" })).slice(0, 3);
  }, [barState, systemBadges]);

  if (state.status !== "ready") {
    return <BadgesStatusState state={state} navigate={navigate} />;
  }

  const refreshAll = () => {
    setReloadKey((value) => value + 1);
    setBarReloadKey((value) => value + 1);
  };

  const selectBar = (barId: string) => {
    confirmDiscard(barDirty, () => setSelectedBarId(barId));
  };

  const selectSystemBadge = (badgeId: string) => {
    confirmDiscard(systemDirty, () => {
      const badge = systemBadges.find((item) => item.id === badgeId);
      if (!badge) return;
      const nextForm = badgeToForm(badge);
      setSystemSelectedId(badge.id);
      setSystemMode("editing");
      setSystemForm(nextForm);
      setSystemOriginal(nextForm);
      setSystemErrors({});
      setSystemMessage("");
      setSystemStatus("idle");
    });
  };

  const startSystemCreate = () => {
    confirmDiscard(systemDirty, () => {
      const nextForm = emptyBadgeForm(activeColors[0]?.id ?? colors[0]?.id);
      setSystemSelectedId("");
      setSystemMode("creating");
      setSystemForm(nextForm);
      setSystemOriginal(nextForm);
      setSystemErrors({});
      setSystemMessage("");
      setSystemStatus("idle");
    });
  };

  const saveSystemBadge = (event: FormEvent) => {
    event.preventDefault();
    if (!isSystemAdmin) {
      setSystemStatus("error");
      setSystemMessage("시스템 공통 배지는 시스템 관리자만 저장할 수 있습니다.");
      return;
    }
    setSystemStatus("saving");
    setSystemErrors({});
    setSystemMessage("");
    const request =
      systemMode === "creating"
        ? createSystemBadge({ name: systemForm.name, colorId: systemForm.colorId })
        : updateSystemBadge(systemSelectedId, {
            name: systemForm.name,
            colorId: systemForm.colorId,
            isActive: systemForm.isActive,
            confirmImpact: systemForm.confirmImpact
          });
    request
      .then((data) => {
        setState({ status: "ready", data });
        const saved = findSavedBadge(data.systemBadges, systemMode === "creating" ? "" : systemSelectedId, systemForm.name);
        const nextForm = badgeToForm(saved ?? data.systemBadges[0]);
        setSystemSelectedId(saved?.id ?? data.systemBadges[0]?.id ?? "");
        setSystemMode("editing");
        setSystemForm(nextForm);
        setSystemOriginal(nextForm);
        setSystemMessage("공통 배지를 저장했습니다.");
        setSystemStatus("idle");
        setBarReloadKey((value) => value + 1);
      })
      .catch((error: unknown) => handleFormError(error, setSystemErrors, setSystemMessage, setSystemStatus));
  };

  const selectBarBadge = (badgeId: string) => {
    if (barState.status !== "ready") return;
    confirmDiscard(barDirty, () => {
      const badge = barState.data.barBadges.find((item) => item.id === badgeId);
      if (!badge) return;
      const nextForm = badgeToForm(badge);
      setBarSelectedId(badge.id);
      setBarMode("editing");
      setBarForm(nextForm);
      setBarOriginal(nextForm);
      setBarErrors({});
      setBarMessage("");
      setBarStatus("idle");
    });
  };

  const startBarCreate = () => {
    confirmDiscard(barDirty, () => {
      const nextForm = emptyBadgeForm(activeColors[0]?.id ?? colors[0]?.id);
      setBarSelectedId("");
      setBarMode("creating");
      setBarForm(nextForm);
      setBarOriginal(nextForm);
      setBarErrors({});
      setBarMessage("");
      setBarStatus("idle");
    });
  };

  const saveBarBadge = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedBarId) return;
    setBarStatus("saving");
    setBarErrors({});
    setBarMessage("");
    const request =
      barMode === "creating"
        ? createBarBadge(selectedBarId, { name: barForm.name, colorId: barForm.colorId })
        : updateBarBadge(selectedBarId, barSelectedId, {
            name: barForm.name,
            colorId: barForm.colorId,
            isActive: barForm.isActive,
            confirmImpact: barForm.confirmImpact
          });
    request
      .then((data) => {
        setBarState({ status: "ready", data });
        const saved = findSavedBadge(data.barBadges, barMode === "creating" ? "" : barSelectedId, barForm.name);
        const nextForm = badgeToForm(saved ?? data.barBadges[0]);
        setBarSelectedId(saved?.id ?? data.barBadges[0]?.id ?? "");
        setBarMode("editing");
        setBarForm(nextForm);
        setBarOriginal(nextForm);
        setBarMessage("바 전용 배지를 저장했습니다.");
        setBarStatus("idle");
      })
      .catch((error: unknown) => handleFormError(error, setBarErrors, setBarMessage, setBarStatus));
  };

  const removeBarBadge = () => {
    if (!selectedBarId || !barSelectedId) return;
    setBarStatus("saving");
    setBarErrors({});
    setBarMessage("");
    deleteBarBadge(selectedBarId, barSelectedId, { confirmImpact: barForm.confirmImpact })
      .then(() => {
        setBarMessage("바 전용 배지를 삭제했습니다.");
        setBarStatus("idle");
        setBarReloadKey((value) => value + 1);
      })
      .catch((error: unknown) => handleFormError(error, setBarErrors, setBarMessage, setBarStatus));
  };

  const toggleVisibility = (badge: SystemBadgeForBar) => {
    if (!selectedBarId) return;
    updateBarSystemBadgeVisibility(selectedBarId, badge.id, { isHidden: !badge.isHiddenForBar })
      .then((data) => setBarState({ status: "ready", data }))
      .catch((error: unknown) => {
        setBarStatus("error");
        setBarMessage(error instanceof Error ? error.message : "공통 배지 표시 상태를 저장하지 못했습니다.");
      });
  };

  const selectColor = (colorId: string) => {
    confirmDiscard(colorDirty, () => {
      const color = colors.find((item) => item.id === colorId);
      if (!color) return;
      const nextForm = colorToForm(color);
      setColorSelectedId(color.id);
      setColorMode("editing");
      setColorForm(nextForm);
      setColorOriginal(nextForm);
      setColorErrors({});
      setColorMessage("");
      setColorStatus("idle");
    });
  };

  const startColorCreate = () => {
    confirmDiscard(colorDirty, () => {
      const nextForm = emptyColorForm();
      setColorSelectedId("");
      setColorMode("creating");
      setColorForm(nextForm);
      setColorOriginal(nextForm);
      setColorErrors({});
      setColorMessage("");
      setColorStatus("idle");
    });
  };

  const saveColor = (event: FormEvent) => {
    event.preventDefault();
    if (!isSystemAdmin) {
      setColorStatus("error");
      setColorMessage("허용 색상은 시스템 관리자만 저장할 수 있습니다.");
      return;
    }
    setColorStatus("saving");
    setColorErrors({});
    setColorMessage("");
    const normalizedHex = colorForm.backgroundHex.trim().toUpperCase();
    const request =
      colorMode === "creating"
        ? createBadgeColor({ name: colorForm.name, backgroundHex: normalizedHex })
        : updateBadgeColor(colorSelectedId, {
            name: colorForm.name,
            backgroundHex: normalizedHex,
            isActive: colorForm.isActive,
            replacementColorId: colorForm.replacementColorId || undefined
          });
    request
      .then((data) => {
        setState({ status: "ready", data });
        const saved = findSavedColor(data.colors, colorMode === "creating" ? "" : colorSelectedId, colorForm.name, normalizedHex);
        const nextForm = colorToForm(saved ?? data.colors[0]);
        setColorSelectedId(saved?.id ?? data.colors[0]?.id ?? "");
        setColorMode("editing");
        setColorForm(nextForm);
        setColorOriginal(nextForm);
        setColorMessage("허용 색상을 저장했습니다.");
        setColorStatus("idle");
        setBarReloadKey((value) => value + 1);
      })
      .catch((error: unknown) => handleFormError(error, setColorErrors, setColorMessage, setColorStatus));
  };

  return (
    <div className="badges-page">
      <section className="hero-panel" aria-labelledby="badges-title">
        <div>
          <p className="eyebrow">배지·색상 관리</p>
          <h1 id="badges-title">배지·색상 관리</h1>
          <p>공통 배지, 바 전용 배지, 표시 상태와 색상 대비를 같은 URL에서 관리합니다.</p>
        </div>
        <div className="status-box" role="status">
          <span>공통 배지</span>
          <strong>{state.data.systemBadges.length}개</strong>
          <small>허용 색상 {state.data.colors.length}개</small>
          <button className="button secondary compact" type="button" onClick={refreshAll}>
            새로고침
          </button>
        </div>
      </section>

      <nav className="badge-tabs" aria-label="배지 관리 보기">
        {(Object.keys(tabLabels) as TabId[]).map((item) => (
          <button key={item} className={tab === item ? "is-active" : ""} type="button" onClick={() => setTab(item)}>
            {tabLabels[item]}
          </button>
        ))}
      </nav>

      {tab === "badges" ? (
        <div className="badge-workspace">
          <section className="panel" aria-labelledby="system-badges-title">
            <div className="section-heading badge-section-heading">
              <div>
                <p className="eyebrow">공통 배지</p>
                <h2 id="system-badges-title">시스템 공통 배지</h2>
              </div>
              <button className="button secondary" type="button" onClick={startSystemCreate} disabled={!isSystemAdmin}>
                새 공통 배지
              </button>
            </div>

            <label className="field">
              <span>공통 배지 검색</span>
              <input
                aria-label="공통 배지 검색"
                value={systemQuery}
                onChange={(event) => setSystemQuery(event.target.value)}
                placeholder="추천, 시그니처"
              />
            </label>

            <BadgeList badges={filteredSystemBadges} selectedId={systemSelectedId} onSelect={selectSystemBadge} emptyText="공통 배지가 없습니다." />

            <BadgeEditor
              title={systemMode === "creating" ? "공통 배지 추가" : "공통 배지 편집"}
              mode={systemMode}
              form={systemForm}
              colors={activeColors}
              nameLabel="공통 배지 이름"
              colorLabel="공통 배지 색상"
              activeLabel="공통 배지 활성"
              disabled={!isSystemAdmin}
              errors={systemErrors}
              message={systemMessage}
              status={systemStatus}
              saveLabel={systemMode === "creating" ? "공통 배지 추가" : "공통 배지 저장"}
              onChange={setSystemForm}
              onSubmit={saveSystemBadge}
            />
          </section>

          <section className="panel" aria-labelledby="bar-badges-title">
            <div className="section-heading badge-section-heading">
              <div>
                <p className="eyebrow">바 전용 배지</p>
                <h2 id="bar-badges-title">{selectedBar?.name ?? "바"} 전용</h2>
              </div>
              <button className="button secondary" type="button" onClick={startBarCreate} disabled={!selectedBarId}>
                새 전용 배지
              </button>
            </div>

            <label className="field">
              <span>바 선택</span>
              <select aria-label="바 선택" value={selectedBarId} onChange={(event) => selectBar(event.target.value)}>
                {state.data.accessibleBars.map((bar) => (
                  <option key={bar.id} value={bar.id}>
                    {bar.name} · {bar.role}
                  </option>
                ))}
              </select>
            </label>

            {barState.status === "ready" ? (
              <>
                <div className="sub-panel">
                  <h3>공통 배지 표시</h3>
                  <div className="visibility-list">
                    {barState.data.systemBadges.map((badge) => (
                      <label className="check-row" key={badge.id}>
                        <input
                          aria-label={`${badge.name} 공통 배지 표시`}
                          type="checkbox"
                          checked={!badge.isHiddenForBar}
                          onChange={() => toggleVisibility(badge)}
                        />
                        <BadgeChip badge={badge} />
                        <span>{badge.isHiddenForBar ? "숨김" : "표시"}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <label className="field">
                  <span>전용 배지 검색</span>
                  <input
                    aria-label="전용 배지 검색"
                    value={barQuery}
                    onChange={(event) => setBarQuery(event.target.value)}
                    placeholder="오늘의 픽, 한정"
                  />
                </label>

                <BadgeList badges={filteredBarBadges} selectedId={barSelectedId} onSelect={selectBarBadge} emptyText="전용 배지가 없습니다." />

                <BadgeEditor
                  title={barMode === "creating" ? "전용 배지 추가" : "전용 배지 편집"}
                  mode={barMode}
                  form={barForm}
                  colors={activeColors}
                  nameLabel="바 전용 배지 이름"
                  colorLabel="바 전용 배지 색상"
                  activeLabel="바 전용 배지 활성"
                  errors={barErrors}
                  message={barMessage}
                  status={barStatus}
                  saveLabel={barMode === "creating" ? "전용 배지 추가" : "전용 배지 저장"}
                  onChange={setBarForm}
                  onSubmit={saveBarBadge}
                  extraActions={
                    barMode === "editing" ? (
                      <button className="button secondary" type="button" onClick={removeBarBadge} disabled={barStatus === "saving"}>
                        전용 배지 삭제
                      </button>
                    ) : null
                  }
                />
              </>
            ) : (
              <InlineState state={barState} />
            )}
          </section>

          <aside className="panel badge-preview-panel" aria-labelledby="badge-preview-title">
            <div>
              <p className="eyebrow">미리보기</p>
              <h2 id="badge-preview-title">배지 미리보기</h2>
              <p className="muted">고객 메뉴에서는 sold out 메뉴의 배지를 숨기며, 메뉴별 노출은 최대 3개입니다.</p>
            </div>
            <div className="mock-menu-row">
              <strong>House Highball</strong>
              <div className="badge-chip-list">
                {previewBadges.length ? previewBadges.map((badge) => <BadgeChip key={`${badge.kind}-${badge.id}`} badge={badge} />) : <span className="muted">표시할 배지가 없습니다.</span>}
              </div>
            </div>
            <div className="mock-menu-row sold-out">
              <strong>Sold out menu</strong>
              <span className="status-badge inactive">sold out · 배지 숨김</span>
            </div>
          </aside>
        </div>
      ) : (
        <div className="color-workspace">
          <section className="panel" aria-labelledby="colors-list-title">
            <div className="section-heading badge-section-heading">
              <div>
                <p className="eyebrow">허용 색상</p>
                <h2 id="colors-list-title">허용 색상</h2>
              </div>
              <button className="button secondary" type="button" onClick={startColorCreate} disabled={!isSystemAdmin}>
                새 색상
              </button>
            </div>
            <label className="field">
              <span>색상 검색</span>
              <input
                aria-label="색상 검색"
                value={colorQuery}
                onChange={(event) => setColorQuery(event.target.value)}
                placeholder="Warm, Plum"
              />
            </label>
            <div className="color-list" role="list" aria-label="허용 색상 목록">
              {filteredColors.map((color) => (
                <button
                  key={color.id}
                  className="color-row"
                  type="button"
                  data-selected={color.id === colorSelectedId}
                  onClick={() => selectColor(color.id)}
                >
                  <span className="color-swatch" style={{ backgroundColor: color.backgroundHex }} />
                  <span>
                    <strong>{color.name}</strong>
                    <small>{color.backgroundHex} · 사용 {color.usageCount}</small>
                  </span>
                  <span className={color.isActive ? "status-badge active" : "status-badge inactive"}>{color.isActive ? "활성" : "비활성"}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel" aria-labelledby="color-editor-title">
            <div>
              <p className="eyebrow">색상 코드</p>
              <h2 id="color-editor-title">{colorMode === "creating" ? "색상 추가" : "색상 편집"}</h2>
            </div>
            <form className="badge-editor" onSubmit={saveColor}>
              <label className="field">
                <span>색상 이름</span>
                <input
                  aria-label="색상 이름"
                  value={colorForm.name}
                  onChange={(event) => setColorForm((current) => ({ ...current, name: event.target.value }))}
                  disabled={!isSystemAdmin}
                />
                <FieldError errors={colorErrors} field="name" />
              </label>
              <div className="hex-sync-grid">
                <label className="field">
                  <span>색상 HEX</span>
                  <input
                    aria-label="색상 HEX"
                    value={colorForm.backgroundHex}
                    onChange={(event) => setColorForm((current) => ({ ...current, backgroundHex: event.target.value }))}
                    placeholder="#RRGGBB 또는 #RRGGBBAA"
                    disabled={!isSystemAdmin}
                  />
                  <FieldError errors={colorErrors} field="backgroundHex" />
                </label>
                <label className="field color-picker-field">
                  <span>색상 선택</span>
                  <input
                    aria-label="색상 선택"
                    type="color"
                    value={toColorPickerValue(colorForm.backgroundHex)}
                    onChange={(event) => setColorForm((current) => ({ ...current, backgroundHex: event.target.value.toUpperCase() }))}
                    disabled={!isSystemAdmin}
                  />
                </label>
              </div>
              <div className="badge-preview-swatch" style={{ backgroundColor: safeHex(colorForm.backgroundHex), color: safeTextColor(colorForm.backgroundHex) }}>
                Preview · {safeTextColor(colorForm.backgroundHex)}
              </div>
              {colorMode === "editing" ? (
                <>
                  <label className="check-row">
                    <input
                      aria-label="색상 활성"
                      type="checkbox"
                      checked={colorForm.isActive}
                      disabled={!isSystemAdmin}
                      onChange={(event) => setColorForm((current) => ({ ...current, isActive: event.target.checked }))}
                    />
                    <span>색상 활성</span>
                  </label>
                  {!colorForm.isActive ? (
                    <label className="field">
                      <span>대체 색상</span>
                      <select
                        aria-label="대체 색상"
                        value={colorForm.replacementColorId}
                        onChange={(event) => setColorForm((current) => ({ ...current, replacementColorId: event.target.value }))}
                        disabled={!isSystemAdmin}
                      >
                        <option value="">사용 중이면 선택 필요</option>
                        {activeColors
                          .filter((color) => color.id !== colorSelectedId)
                          .map((color) => (
                            <option key={color.id} value={color.id}>
                              {color.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : null}
                </>
              ) : null}
              <FormMessage status={colorStatus} message={colorMessage} />
              <div className="dialog-actions">
                <button className="button primary" type="submit" disabled={!isSystemAdmin || colorStatus === "saving"}>
                  {colorMode === "creating" ? "색상 추가" : "색상 저장"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

type BadgeEditorProps = {
  title: string;
  mode: EditorMode;
  form: BadgeForm;
  colors: BadgeColor[];
  nameLabel: string;
  colorLabel: string;
  activeLabel: string;
  disabled?: boolean;
  errors: FieldErrors;
  message: string;
  status: SaveState;
  saveLabel: string;
  onChange: (form: BadgeForm) => void;
  onSubmit: (event: FormEvent) => void;
  extraActions?: ReactNode;
};

function BadgeEditor({
  title,
  mode,
  form,
  colors,
  nameLabel,
  colorLabel,
  activeLabel,
  disabled = false,
  errors,
  message,
  status,
  saveLabel,
  onChange,
  onSubmit,
  extraActions
}: BadgeEditorProps) {
  const selectedColor = colors.find((color) => color.id === form.colorId) ?? colors[0];
  return (
    <form className="badge-editor" onSubmit={onSubmit}>
      <h3>{title}</h3>
      <label className="field">
        <span>{nameLabel}</span>
        <input
          aria-label={nameLabel}
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          disabled={disabled}
        />
        <FieldError errors={errors} field="name" />
      </label>
      <label className="field">
        <span>{colorLabel}</span>
        <select
          aria-label={colorLabel}
          value={form.colorId}
          onChange={(event) => onChange({ ...form, colorId: event.target.value })}
          disabled={disabled}
        >
          {colors.map((color) => (
            <option key={color.id} value={color.id}>
              {color.name} · {color.backgroundHex}
            </option>
          ))}
        </select>
        <FieldError errors={errors} field="colorId" />
      </label>
      <div className="badge-preview-swatch" style={{ backgroundColor: selectedColor?.backgroundHex ?? "#333333", color: selectedColor?.textColor ?? "#FFFFFF" }}>
        {form.name || "미리보기"}
      </div>
      {mode === "editing" ? (
        <>
          <label className="check-row">
            <input
              aria-label={activeLabel}
              type="checkbox"
              checked={form.isActive}
              disabled={disabled}
              onChange={(event) => onChange({ ...form, isActive: event.target.checked })}
            />
            <span>{activeLabel}</span>
          </label>
          {!form.isActive ? (
            <label className="check-row">
              <input
                aria-label="영향 확인"
                type="checkbox"
                checked={form.confirmImpact}
                disabled={disabled}
                onChange={(event) => onChange({ ...form, confirmImpact: event.target.checked })}
              />
              <span>사용 중인 메뉴에서 제거되는 영향을 확인했습니다.</span>
            </label>
          ) : null}
        </>
      ) : null}
      <FormMessage status={status} message={message} />
      <div className="dialog-actions">
        {extraActions}
        <button className="button primary" type="submit" disabled={disabled || status === "saving"}>
          {saveLabel}
        </button>
      </div>
    </form>
  );
}

function BadgeList({
  badges,
  selectedId,
  emptyText,
  onSelect
}: {
  badges: Array<SystemBadge | BarBadge>;
  selectedId: string;
  emptyText: string;
  onSelect: (id: string) => void;
}) {
  if (!badges.length) return <p className="muted">{emptyText}</p>;
  return (
    <div className="badge-list" role="list" aria-label="배지 목록">
      {badges.map((badge) => (
        <button key={badge.id} className="badge-row" type="button" data-selected={badge.id === selectedId} onClick={() => onSelect(badge.id)}>
          <BadgeChip badge={badge} />
          <span className={badge.isActive ? "status-badge active" : "status-badge inactive"}>{badge.isActive ? "활성" : "비활성"}</span>
          <small>사용 {badge.usageCount}</small>
        </button>
      ))}
    </div>
  );
}

function BadgeChip({ badge }: { badge: Pick<SystemBadge, "name" | "color"> }) {
  return (
    <span className="menu-badge-chip" style={{ backgroundColor: badge.color.backgroundHex, color: badge.color.textColor }}>
      {badge.name}
    </span>
  );
}

function BadgesStatusState({ state, navigate }: { state: LoadState<BadgesResponse>; navigate: Navigate }) {
  if (state.status === "ready") return null;
  if (state.status === "loading") return <LoadingSkeleton ariaLabel="배지 정보 로딩 중" />;
  return (
    <section className="panel status-panel" aria-live="polite">
      <h1>배지 정보를 표시할 수 없습니다</h1>
      <p>{state.message}</p>
      {state.status === "unauthenticated" ? (
        <button className="button primary" type="button" onClick={() => navigate("/login")}>
          로그인으로 이동
        </button>
      ) : null}
    </section>
  );
}

function InlineState({ state }: { state: LoadState<BarBadgesResponse> }) {
  if (state.status === "ready") return null;
  if (state.status === "loading") return <LoadingSkeleton variant="inline" ariaLabel="바 배지 정보 로딩 중" />;
  return (
    <div className="status-message" aria-live="polite">
      <strong>바 배지 정보를 표시할 수 없습니다</strong>
      <p>{state.message}</p>
    </div>
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

function emptyBadgeForm(colorId = ""): BadgeForm {
  return {
    name: "",
    colorId,
    isActive: true,
    confirmImpact: false
  };
}

function emptyColorForm(): ColorForm {
  return {
    name: "",
    backgroundHex: "#355B47",
    isActive: true,
    replacementColorId: ""
  };
}

function badgeToForm(badge?: SystemBadge | BarBadge): BadgeForm {
  if (!badge) return emptyBadgeForm();
  return {
    name: badge.name,
    colorId: badge.color.id,
    isActive: badge.isActive,
    confirmImpact: false
  };
}

function colorToForm(color?: BadgeColor): ColorForm {
  if (!color) return emptyColorForm();
  return {
    name: color.name,
    backgroundHex: color.backgroundHex,
    isActive: color.isActive,
    replacementColorId: ""
  };
}

function findSavedBadge<TBadge extends SystemBadge | BarBadge>(badges: TBadge[], id: string, name: string): TBadge | undefined {
  return badges.find((badge) => badge.id === id) ?? badges.find((badge) => badge.name === name.trim());
}

function findSavedColor(colors: BadgeColor[], id: string, name: string, backgroundHex: string): BadgeColor | undefined {
  return colors.find((color) => color.id === id) ?? colors.find((color) => color.name === name.trim() && color.backgroundHex === backgroundHex);
}

function filterByQuery<T extends { name: string }>(items: T[], query: string): T[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => item.name.toLowerCase().includes(normalized));
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
    const usageCount = typeof error.details.usageCount === "number" ? ` 영향 메뉴 ${error.details.usageCount}개.` : "";
    setMessage(`${error.message}${usageCount}`);
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

function toColorPickerValue(value: string): string {
  return /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value.trim()) ? value.trim().slice(0, 7).toUpperCase() : "#355B47";
}

function safeHex(value: string): string {
  return /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value.trim()) ? value.trim().toUpperCase() : "#355B47";
}

function safeTextColor(value: string): "#000000" | "#FFFFFF" {
  try {
    return readableTextColor(value);
  } catch {
    return "#FFFFFF";
  }
}
