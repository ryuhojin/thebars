import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type {
  BarItemType,
  BarItemTypeOverride,
  BarItemTypesResponse,
  GrapeVarietyCandidate,
  GrapeVarietiesResponse,
  GrapeVarietyCandidatesResponse,
  ItemTemplate,
  ItemTypeBarOption,
  ItemTypesResponse,
  SystemItemType
} from "../../../contracts/itemTypes";
import { AuthApiError } from "../auth/authApi";
import { useDirtyWarning } from "../auth/useDirtyWarning";
import {
  approveGrapeCandidate,
  createBarItemType,
  createSystemItemType,
  deleteBarItemType,
  deleteSystemItemType,
  readBarItemTypes,
  readGrapeCandidates,
  readGrapeVarieties,
  readItemTypes,
  rejectGrapeCandidate,
  submitGrapeCandidate,
  updateBarItemType,
  updateBarItemTypeOverride,
  updateSystemItemType
} from "./itemTypesApi";

type Navigate = (path: string) => void;
type FieldErrors = Record<string, string[]>;
type TabId = "system" | "bar" | "grapes";
type EditorMode = "editing" | "creating";
type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "unauthenticated"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "error"; message: string };

type TypeForm = {
  name: string;
  template: ItemTemplate;
  defaultPriceLabels: string[];
  isActive: boolean;
};

type OverrideForm = {
  isHidden: boolean;
  defaultPriceLabels: string[];
};

type TemplateOption = ItemTypesResponse["templates"][number];

const tabLabels: Record<TabId, string> = {
  system: "시스템 공통",
  bar: "바 전용",
  grapes: "포도 품종 후보"
};

export function ItemTypesPage({ navigate }: { navigate: Navigate }) {
  const [state, setState] = useState<LoadState<ItemTypesResponse>>({ status: "loading" });
  const [tab, setTab] = useState<TabId>("system");
  const [reloadKey, setReloadKey] = useState(0);

  const [systemQuery, setSystemQuery] = useState("");
  const [systemSelectedId, setSystemSelectedId] = useState("");
  const [systemMode, setSystemMode] = useState<EditorMode>("editing");
  const [systemForm, setSystemForm] = useState<TypeForm>(emptyTypeForm());
  const [systemOriginal, setSystemOriginal] = useState<TypeForm>(emptyTypeForm());
  const [systemErrors, setSystemErrors] = useState<FieldErrors>({});
  const [systemMessage, setSystemMessage] = useState("");
  const [systemStatus, setSystemStatus] = useState<"idle" | "saving" | "error">("idle");

  const [selectedBarId, setSelectedBarId] = useState("");
  const [barState, setBarState] = useState<LoadState<BarItemTypesResponse>>({ status: "idle" });
  const [barQuery, setBarQuery] = useState("");
  const [barSelectedId, setBarSelectedId] = useState("");
  const [barMode, setBarMode] = useState<EditorMode>("editing");
  const [barForm, setBarForm] = useState<TypeForm>(emptyTypeForm());
  const [barOriginal, setBarOriginal] = useState<TypeForm>(emptyTypeForm());
  const [barErrors, setBarErrors] = useState<FieldErrors>({});
  const [barMessage, setBarMessage] = useState("");
  const [barStatus, setBarStatus] = useState<"idle" | "saving" | "error">("idle");

  const [overrideSelectedId, setOverrideSelectedId] = useState("");
  const [overrideForm, setOverrideForm] = useState<OverrideForm>(emptyOverrideForm());
  const [overrideOriginal, setOverrideOriginal] = useState<OverrideForm>(emptyOverrideForm());
  const [overrideErrors, setOverrideErrors] = useState<FieldErrors>({});
  const [overrideMessage, setOverrideMessage] = useState("");
  const [overrideStatus, setOverrideStatus] = useState<"idle" | "saving" | "error">("idle");

  const [grapeState, setGrapeState] = useState<LoadState<GrapeVarietiesResponse>>({ status: "loading" });
  const [candidateState, setCandidateState] = useState<LoadState<GrapeVarietyCandidatesResponse>>({ status: "idle" });
  const [candidateForm, setCandidateForm] = useState({ barId: "", proposedName: "" });
  const [candidateErrors, setCandidateErrors] = useState<FieldErrors>({});
  const [candidateMessage, setCandidateMessage] = useState("");
  const [candidateStatus, setCandidateStatus] = useState<"idle" | "saving" | "error">("idle");
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [reviewForm, setReviewForm] = useState({ standardName: "", reason: "" });
  const [reviewErrors, setReviewErrors] = useState<FieldErrors>({});
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewStatus, setReviewStatus] = useState<"idle" | "saving" | "error">("idle");

  const systemDirty = JSON.stringify(systemForm) !== JSON.stringify(systemOriginal);
  const barDirty = JSON.stringify(barForm) !== JSON.stringify(barOriginal);
  const overrideDirty = JSON.stringify(overrideForm) !== JSON.stringify(overrideOriginal);
  const candidateDirty = candidateForm.proposedName.trim().length > 0 || reviewForm.reason.trim().length > 0;
  useDirtyWarning(systemDirty || barDirty || overrideDirty || candidateDirty);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    readItemTypes()
      .then((data) => {
        if (cancelled) return;
        const firstType = data.systemTypes[0];
        const firstBar = data.accessibleBars[0];
        if (firstType) {
          const nextForm = typeToForm(firstType);
          setSystemSelectedId(firstType.id);
          setSystemForm(nextForm);
          setSystemOriginal(nextForm);
        }
        setSelectedBarId((current) => current || firstBar?.id || "");
        setCandidateForm((current) => ({ ...current, barId: current.barId || firstBar?.id || "" }));
        setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const isSystemAdmin = state.status === "ready" && state.data.accessibleBars.some((bar) => bar.role === "system-admin");
  const accessibleBars = state.status === "ready" ? state.data.accessibleBars : [];

  useEffect(() => {
    let cancelled = false;
    setGrapeState({ status: "loading" });
    readGrapeVarieties()
      .then((data) => {
        if (!cancelled) setGrapeState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setGrapeState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    if (!isSystemAdmin) {
      setCandidateState({ status: "forbidden", message: "후보 승인 큐는 시스템 관리자만 조회할 수 있습니다." });
      return () => {
        cancelled = true;
      };
    }
    setCandidateState({ status: "loading" });
    readGrapeCandidates()
      .then((data) => {
        if (cancelled) return;
        const firstCandidate = data.candidates[0];
        setSelectedCandidateId(firstCandidate?.id || "");
        setReviewForm({ standardName: firstCandidate?.standardName || firstCandidate?.proposedName || "", reason: "" });
        setCandidateState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setCandidateState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [isSystemAdmin, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedBarId) {
      setBarState({ status: "idle" });
      return () => {
        cancelled = true;
      };
    }
    setBarState({ status: "loading" });
    readBarItemTypes(selectedBarId)
      .then((data) => {
        if (cancelled) return;
        const firstBarType = data.barTypes[0];
        if (firstBarType) {
          const nextForm = typeToForm(firstBarType);
          setBarSelectedId(firstBarType.id);
          setBarMode("editing");
          setBarForm(nextForm);
          setBarOriginal(nextForm);
        } else {
          const nextForm = emptyTypeForm();
          setBarSelectedId("");
          setBarMode("creating");
          setBarForm(nextForm);
          setBarOriginal(nextForm);
        }
        const firstSystemType = data.systemTypes[0];
        if (firstSystemType) {
          const nextOverrideId = overrideSelectedId || firstSystemType.id;
          setOverrideSelectedId(nextOverrideId);
          const nextOverride = overrideToForm(data, nextOverrideId);
          setOverrideForm(nextOverride);
          setOverrideOriginal(nextOverride);
        }
        setBarErrors({});
        setBarMessage("");
        setOverrideErrors({});
        setOverrideMessage("");
        setBarState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setBarState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBarId, reloadKey]);

  const selectedCandidate = useMemo(() => {
    if (candidateState.status !== "ready") return null;
    return candidateState.data.candidates.find((candidate) => candidate.id === selectedCandidateId) ?? null;
  }, [candidateState, selectedCandidateId]);

  if (state.status !== "ready") {
    return <ItemTypesStatusState state={state} navigate={navigate} />;
  }

  const refreshBase = () => setReloadKey((value) => value + 1);

  const selectSystemType = (typeId: string) => {
    confirmDiscard(systemDirty, () => {
      const item = state.data.systemTypes.find((type) => type.id === typeId);
      if (!item) return;
      const nextForm = typeToForm(item);
      setSystemSelectedId(typeId);
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
      const nextForm = emptyTypeForm();
      setSystemMode("creating");
      setSystemSelectedId("");
      setSystemQuery("");
      setSystemForm(nextForm);
      setSystemOriginal(nextForm);
      setSystemErrors({});
      setSystemMessage("");
      setSystemStatus("idle");
    });
  };

  const saveSystemType = (event: FormEvent) => {
    event.preventDefault();
    if (!isSystemAdmin) {
      setSystemStatus("error");
      setSystemMessage("시스템 공통 유형은 시스템 관리자만 저장할 수 있습니다.");
      return;
    }
    setSystemStatus("saving");
    setSystemErrors({});
    setSystemMessage("");
    const request =
      systemMode === "creating"
        ? createSystemItemType({
            name: systemForm.name,
            template: systemForm.template,
            defaultPriceLabels: systemForm.defaultPriceLabels
          })
        : updateSystemItemType(systemSelectedId, systemForm);
    request
      .then((saved) => {
        setState((current) => {
          if (current.status !== "ready") return current;
          const systemTypes =
            systemMode === "creating"
              ? sortTypes([...current.data.systemTypes, saved])
              : sortTypes(current.data.systemTypes.map((type) => (type.id === saved.id ? saved : type)));
          return { ...current, data: { ...current.data, systemTypes } };
        });
        const nextForm = typeToForm(saved);
        setSystemSelectedId(saved.id);
        setSystemMode("editing");
        setSystemForm(nextForm);
        setSystemOriginal(nextForm);
        setSystemMessage("시스템 공통 유형을 저장했습니다.");
        setSystemStatus("idle");
      })
      .catch((error: unknown) => handleFormError(error, setSystemErrors, setSystemMessage, setSystemStatus));
  };

  const removeSystemType = () => {
    if (!systemSelectedId || !window.confirm("선택한 시스템 공통 유형을 삭제할까요?")) return;
    setSystemStatus("saving");
    deleteSystemItemType(systemSelectedId)
      .then(() => {
        setState((current) => {
          if (current.status !== "ready") return current;
          const systemTypes = current.data.systemTypes.filter((type) => type.id !== systemSelectedId);
          const nextSelected = systemTypes[0];
          if (nextSelected) {
            const nextForm = typeToForm(nextSelected);
            setSystemSelectedId(nextSelected.id);
            setSystemForm(nextForm);
            setSystemOriginal(nextForm);
          } else {
            const nextForm = emptyTypeForm();
            setSystemSelectedId("");
            setSystemMode("creating");
            setSystemForm(nextForm);
            setSystemOriginal(nextForm);
          }
          return { ...current, data: { ...current.data, systemTypes } };
        });
        setSystemMessage("시스템 공통 유형을 삭제했습니다.");
        setSystemStatus("idle");
      })
      .catch((error: unknown) => handleFormError(error, setSystemErrors, setSystemMessage, setSystemStatus));
  };

  const selectBar = (barId: string) => {
    confirmDiscard(barDirty || overrideDirty, () => {
      setSelectedBarId(barId);
      setCandidateForm((current) => ({ ...current, barId }));
    });
  };

  const selectBarType = (typeId: string) => {
    if (barState.status !== "ready") return;
    confirmDiscard(barDirty, () => {
      const item = barState.data.barTypes.find((type) => type.id === typeId);
      if (!item) return;
      const nextForm = typeToForm(item);
      setBarSelectedId(typeId);
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
      const nextForm = emptyTypeForm();
      setBarMode("creating");
      setBarSelectedId("");
      setBarQuery("");
      setBarForm(nextForm);
      setBarOriginal(nextForm);
      setBarErrors({});
      setBarMessage("");
      setBarStatus("idle");
    });
  };

  const saveBarType = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedBarId) return;
    setBarStatus("saving");
    setBarErrors({});
    setBarMessage("");
    const request =
      barMode === "creating"
        ? createBarItemType(selectedBarId, {
            name: barForm.name,
            template: barForm.template,
            defaultPriceLabels: barForm.defaultPriceLabels
          })
        : updateBarItemType(selectedBarId, barSelectedId, barForm);
    request
      .then((data) => {
        setBarState({ status: "ready", data });
        const saved =
          data.barTypes.find((type) => type.id === barSelectedId) ??
          data.barTypes.find((type) => type.normalizedName === normalizeLocal(barForm.name)) ??
          data.barTypes[0];
        const nextForm = saved ? typeToForm(saved) : emptyTypeForm();
        setBarSelectedId(saved?.id || "");
        setBarMode(saved ? "editing" : "creating");
        setBarForm(nextForm);
        setBarOriginal(nextForm);
        setBarMessage("바 전용 유형을 저장했습니다.");
        setBarStatus("idle");
      })
      .catch((error: unknown) => handleFormError(error, setBarErrors, setBarMessage, setBarStatus));
  };

  const removeBarType = () => {
    if (!selectedBarId || !barSelectedId || !window.confirm("선택한 바 전용 유형을 삭제할까요?")) return;
    setBarStatus("saving");
    deleteBarItemType(selectedBarId, barSelectedId)
      .then(() => readBarItemTypes(selectedBarId))
      .then((data) => {
        setBarState({ status: "ready", data });
        const first = data.barTypes[0];
        const nextForm = first ? typeToForm(first) : emptyTypeForm();
        setBarSelectedId(first?.id || "");
        setBarMode(first ? "editing" : "creating");
        setBarForm(nextForm);
        setBarOriginal(nextForm);
        setBarMessage("바 전용 유형을 삭제했습니다.");
        setBarStatus("idle");
      })
      .catch((error: unknown) => handleFormError(error, setBarErrors, setBarMessage, setBarStatus));
  };

  const selectOverride = (systemTypeId: string) => {
    if (barState.status !== "ready") return;
    confirmDiscard(overrideDirty, () => {
      const nextForm = overrideToForm(barState.data, systemTypeId);
      setOverrideSelectedId(systemTypeId);
      setOverrideForm(nextForm);
      setOverrideOriginal(nextForm);
      setOverrideErrors({});
      setOverrideMessage("");
      setOverrideStatus("idle");
    });
  };

  const saveOverride = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedBarId || !overrideSelectedId) return;
    setOverrideStatus("saving");
    setOverrideErrors({});
    setOverrideMessage("");
    updateBarItemTypeOverride(selectedBarId, overrideSelectedId, overrideForm)
      .then((data) => {
        setBarState({ status: "ready", data });
        const nextForm = overrideToForm(data, overrideSelectedId);
        setOverrideForm(nextForm);
        setOverrideOriginal(nextForm);
        setOverrideMessage("공통 유형의 바별 숨김·가격 라벨을 저장했습니다.");
        setOverrideStatus("idle");
      })
      .catch((error: unknown) => handleFormError(error, setOverrideErrors, setOverrideMessage, setOverrideStatus));
  };

  const submitCandidate = (event: FormEvent) => {
    event.preventDefault();
    if (!candidateForm.barId) {
      setCandidateStatus("error");
      setCandidateMessage("후보를 제출할 바를 선택하세요.");
      return;
    }
    setCandidateStatus("saving");
    setCandidateErrors({});
    setCandidateMessage("");
    submitGrapeCandidate(candidateForm)
      .then((data) => {
        setCandidateForm((current) => ({ ...current, proposedName: "" }));
        setCandidateMessage("포도 품종 후보를 제출했습니다. 승인 전까지 메뉴 입력에는 사용할 수 없습니다.");
        setCandidateStatus("idle");
        if (isSystemAdmin) {
          setCandidateState((current) =>
            current.status === "ready"
              ? { status: "ready", data: { candidates: sortCandidates([...data.candidates, ...current.data.candidates]) } }
              : { status: "ready", data }
          );
        }
      })
      .catch((error: unknown) => handleFormError(error, setCandidateErrors, setCandidateMessage, setCandidateStatus));
  };

  const reviewCandidate = (action: "approve" | "reject") => {
    if (!selectedCandidate) return;
    setReviewStatus("saving");
    setReviewErrors({});
    setReviewMessage("");
    const request =
      action === "approve"
        ? approveGrapeCandidate(selectedCandidate.id, { standardName: reviewForm.standardName || selectedCandidate.proposedName })
        : rejectGrapeCandidate(selectedCandidate.id, { reason: reviewForm.reason });
    request
      .then((data) => {
        setCandidateState({ status: "ready", data });
        const nextCandidate = data.candidates.find((candidate) => candidate.status === "pending") ?? data.candidates[0];
        setSelectedCandidateId(nextCandidate?.id || "");
        setReviewForm({ standardName: nextCandidate?.proposedName || "", reason: "" });
        setReviewMessage(action === "approve" ? "후보를 승인하고 승인 품종 목록에 반영했습니다." : "후보를 반려했습니다.");
        setReviewStatus("idle");
        if (action === "approve") {
          readGrapeVarieties()
            .then((varieties) => setGrapeState({ status: "ready", data: varieties }))
            .catch((error: unknown) => setGrapeState(toLoadError(error)));
        }
      })
      .catch((error: unknown) => handleFormError(error, setReviewErrors, setReviewMessage, setReviewStatus));
  };

  return (
    <div className="item-types-page">
      <section className="hero-panel" aria-labelledby="item-types-title">
        <div>
          <p className="eyebrow">메뉴 유형 관리</p>
          <h1 id="item-types-title">품목 유형·고정 템플릿·포도 품종</h1>
          <p>코드로 고정된 정보 템플릿을 기준으로 공통 유형, 바 전용 유형, 포도 품종 승인 흐름을 관리합니다.</p>
        </div>
        <div className="status-box" role="status">
          <span>공통 유형</span>
          <strong>{state.data.systemTypes.length}개</strong>
          <small>접근 가능 바 {accessibleBars.length}개 · 승인 품종 {grapeState.status === "ready" ? grapeState.data.varieties.length : 0}개</small>
        </div>
      </section>

      <nav className="item-type-tabs" aria-label="품목 유형 관리 섹션">
        {(["system", "bar", "grapes"] as TabId[]).map((item) => (
          <button
            key={item}
            type="button"
            className={tab === item ? "is-active" : ""}
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
          >
            {tabLabels[item]}
          </button>
        ))}
      </nav>

      {tab === "system" ? (
        <SystemTypesSection
          canEdit={isSystemAdmin}
          dirty={systemDirty}
          errors={systemErrors}
          form={systemForm}
          message={systemMessage}
          mode={systemMode}
          query={systemQuery}
          selectedId={systemSelectedId}
          status={systemStatus}
          templates={state.data.templates}
          types={state.data.systemTypes}
          onAdd={startSystemCreate}
          onDelete={removeSystemType}
          onFormChange={setSystemForm}
          onQueryChange={setSystemQuery}
          onReset={() => {
            setSystemForm(systemOriginal);
            setSystemErrors({});
            setSystemMessage("");
            setSystemStatus("idle");
          }}
          onSave={saveSystemType}
          onSelect={selectSystemType}
        />
      ) : null}

      {tab === "bar" ? (
        <BarTypesSection
          barDirty={barDirty}
          barErrors={barErrors}
          barForm={barForm}
          barMessage={barMessage}
          barMode={barMode}
          barQuery={barQuery}
          barSelectedId={barSelectedId}
          barState={barState}
          barStatus={barStatus}
          bars={accessibleBars}
          overrideDirty={overrideDirty}
          overrideErrors={overrideErrors}
          overrideForm={overrideForm}
          overrideMessage={overrideMessage}
          overrideSelectedId={overrideSelectedId}
          overrideStatus={overrideStatus}
          selectedBarId={selectedBarId}
          onAddBarType={startBarCreate}
          onBarFormChange={setBarForm}
          onBarQueryChange={setBarQuery}
          onBarReset={() => {
            setBarForm(barOriginal);
            setBarErrors({});
            setBarMessage("");
            setBarStatus("idle");
          }}
          onBarSave={saveBarType}
          onDeleteBarType={removeBarType}
          onOverrideFormChange={setOverrideForm}
          onOverrideReset={() => {
            setOverrideForm(overrideOriginal);
            setOverrideErrors({});
            setOverrideMessage("");
            setOverrideStatus("idle");
          }}
          onOverrideSave={saveOverride}
          onRefresh={refreshBase}
          onSelectBar={selectBar}
          onSelectBarType={selectBarType}
          onSelectOverride={selectOverride}
        />
      ) : null}

      {tab === "grapes" ? (
        <GrapeSection
          bars={accessibleBars}
          candidateErrors={candidateErrors}
          candidateForm={candidateForm}
          candidateMessage={candidateMessage}
          candidateState={candidateState}
          candidateStatus={candidateStatus}
          grapeState={grapeState}
          isSystemAdmin={isSystemAdmin}
          reviewErrors={reviewErrors}
          reviewForm={reviewForm}
          reviewMessage={reviewMessage}
          reviewStatus={reviewStatus}
          selectedCandidate={selectedCandidate}
          selectedCandidateId={selectedCandidateId}
          onCandidateFormChange={setCandidateForm}
          onRefresh={refreshBase}
          onReview={reviewCandidate}
          onReviewFormChange={setReviewForm}
          onSelectCandidate={(candidate) => {
            setSelectedCandidateId(candidate.id);
            setReviewForm({ standardName: candidate.standardName || candidate.proposedName, reason: candidate.rejectionReason || "" });
            setReviewErrors({});
            setReviewMessage("");
            setReviewStatus("idle");
          }}
          onSubmitCandidate={submitCandidate}
        />
      ) : null}
    </div>
  );
}

function SystemTypesSection({
  canEdit,
  dirty,
  errors,
  form,
  message,
  mode,
  query,
  selectedId,
  status,
  templates,
  types,
  onAdd,
  onDelete,
  onFormChange,
  onQueryChange,
  onReset,
  onSave,
  onSelect
}: {
  canEdit: boolean;
  dirty: boolean;
  errors: FieldErrors;
  form: TypeForm;
  message: string;
  mode: EditorMode;
  query: string;
  selectedId: string;
  status: "idle" | "saving" | "error";
  templates: TemplateOption[];
  types: SystemItemType[];
  onAdd: () => void;
  onDelete: () => void;
  onFormChange: (form: TypeForm) => void;
  onQueryChange: (query: string) => void;
  onReset: () => void;
  onSave: (event: FormEvent) => void;
  onSelect: (id: string) => void;
}) {
  const filteredTypes = filterTypes(types, query);
  return (
    <section className="panel" aria-labelledby="system-types-title">
      <div className="section-heading item-type-section-heading">
        <div>
          <p className="eyebrow">공통 유형</p>
          <h2 id="system-types-title">시스템 공통 유형</h2>
        </div>
        <button className="button primary" type="button" disabled={!canEdit} onClick={onAdd}>
          품목 유형 추가
        </button>
      </div>
      {!canEdit ? (
        <div className="form-status" role="alert">
          시스템 공통 유형 저장은 시스템 관리자만 가능합니다.
        </div>
      ) : null}
      <div className="filter-grid">
        <label className="field">
          <span>공통 유형 검색</span>
          <input
            aria-label="공통 유형 검색"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="이름 또는 템플릿"
          />
        </label>
        <div className="readonly-field" role="status">
          선택: {mode === "creating" ? "새 유형" : types.find((type) => type.id === selectedId)?.name ?? "없음"}
        </div>
      </div>
      <div className="item-type-workspace">
        <TypeList
          ariaLabel="시스템 공통 유형 목록"
          selectedId={selectedId}
          types={filteredTypes}
          onSelect={onSelect}
        />
        <TypeEditor
          canDelete={canEdit && mode === "editing" && Boolean(selectedId)}
          dirty={dirty}
          disabled={!canEdit}
          errors={errors}
          form={form}
          message={message}
          mode={mode}
          status={status}
          templates={templates}
          title={mode === "creating" ? "새 공통 유형" : "공통 유형 편집"}
          labelPrefix="공통 유형"
          onChange={onFormChange}
          onDelete={onDelete}
          onReset={onReset}
          onSave={onSave}
        />
      </div>
    </section>
  );
}

function BarTypesSection({
  barDirty,
  barErrors,
  barForm,
  barMessage,
  barMode,
  barQuery,
  barSelectedId,
  barState,
  barStatus,
  bars,
  overrideDirty,
  overrideErrors,
  overrideForm,
  overrideMessage,
  overrideSelectedId,
  overrideStatus,
  selectedBarId,
  onAddBarType,
  onBarFormChange,
  onBarQueryChange,
  onBarReset,
  onBarSave,
  onDeleteBarType,
  onOverrideFormChange,
  onOverrideReset,
  onOverrideSave,
  onRefresh,
  onSelectBar,
  onSelectBarType,
  onSelectOverride
}: {
  barDirty: boolean;
  barErrors: FieldErrors;
  barForm: TypeForm;
  barMessage: string;
  barMode: EditorMode;
  barQuery: string;
  barSelectedId: string;
  barState: LoadState<BarItemTypesResponse>;
  barStatus: "idle" | "saving" | "error";
  bars: ItemTypeBarOption[];
  overrideDirty: boolean;
  overrideErrors: FieldErrors;
  overrideForm: OverrideForm;
  overrideMessage: string;
  overrideSelectedId: string;
  overrideStatus: "idle" | "saving" | "error";
  selectedBarId: string;
  onAddBarType: () => void;
  onBarFormChange: (form: TypeForm) => void;
  onBarQueryChange: (query: string) => void;
  onBarReset: () => void;
  onBarSave: (event: FormEvent) => void;
  onDeleteBarType: () => void;
  onOverrideFormChange: (form: OverrideForm) => void;
  onOverrideReset: () => void;
  onOverrideSave: (event: FormEvent) => void;
  onRefresh: () => void;
  onSelectBar: (barId: string) => void;
  onSelectBarType: (id: string) => void;
  onSelectOverride: (id: string) => void;
}) {
  const selectedBar = bars.find((bar) => bar.id === selectedBarId);
  if (bars.length === 0) {
    return (
      <section className="panel" aria-labelledby="bar-types-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">바별 유형</p>
            <h2 id="bar-types-title">바 전용 유형</h2>
          </div>
        </div>
        <div className="dashboard-empty" role="status">
          <strong>관리 가능한 바가 없습니다.</strong>
          <p>시스템 관리자 또는 해당 바 오너 권한이 있어야 바 전용 품목 유형을 관리할 수 있습니다.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="bar-types-title">
      <div className="section-heading item-type-section-heading">
        <div>
          <p className="eyebrow">바별 유형</p>
          <h2 id="bar-types-title">바 전용 유형·공통 유형 조정</h2>
        </div>
        <button className="button primary" type="button" disabled={barState.status !== "ready"} onClick={onAddBarType}>
          바 전용 유형 추가
        </button>
      </div>
      <div className="filter-grid">
        <label className="field">
          <span>관리 바</span>
          <select aria-label="관리 바 선택" value={selectedBarId} onChange={(event) => onSelectBar(event.target.value)}>
            {bars.map((bar) => (
              <option value={bar.id} key={bar.id}>
                {bar.name} · {itemTypeRoleLabel(bar.role)}
              </option>
            ))}
          </select>
        </label>
        <div className="readonly-field" role="status">
          선택 바: {selectedBar?.name ?? "없음"}
        </div>
      </div>
      {barState.status === "loading" ? <div className="dashboard-empty" role="status">바 전용 유형을 불러오는 중입니다.</div> : null}
      {barState.status === "forbidden" || barState.status === "unauthenticated" || barState.status === "error" ? (
        <div className="form-status" role="alert">
          {barState.message}
          <button className="button secondary" type="button" onClick={onRefresh}>
            다시 시도
          </button>
        </div>
      ) : null}
      {barState.status === "ready" ? (
        <div className="bar-type-grid">
          <section className="sub-panel" aria-labelledby="bar-common-override-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">공통 유형 조정</p>
                <h3 id="bar-common-override-title">공통 유형 숨김·가격 라벨</h3>
              </div>
            </div>
            <div className="item-type-workspace compact-workspace">
              <TypeList
                ariaLabel="조정 대상 공통 유형 목록"
                selectedId={overrideSelectedId}
                types={barState.data.systemTypes}
                onSelect={onSelectOverride}
              />
              <OverrideEditor
                dirty={overrideDirty}
                errors={overrideErrors}
                form={overrideForm}
                message={overrideMessage}
                selectedType={barState.data.systemTypes.find((type) => type.id === overrideSelectedId) ?? null}
                status={overrideStatus}
                onChange={onOverrideFormChange}
                onReset={onOverrideReset}
                onSave={onOverrideSave}
              />
            </div>
          </section>

          <section className="sub-panel" aria-labelledby="bar-specific-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">바 전용 유형</p>
                <h3 id="bar-specific-title">바 전용 유형</h3>
              </div>
            </div>
            <label className="field">
              <span>바 전용 유형 검색</span>
              <input
                aria-label="바 전용 유형 검색"
                value={barQuery}
                onChange={(event) => onBarQueryChange(event.target.value)}
                placeholder="이름 또는 템플릿"
              />
            </label>
            <div className="item-type-workspace compact-workspace">
              <TypeList
                ariaLabel="바 전용 유형 목록"
                selectedId={barSelectedId}
                types={filterTypes(barState.data.barTypes, barQuery)}
                onSelect={onSelectBarType}
              />
              <TypeEditor
                canDelete={barMode === "editing" && Boolean(barSelectedId)}
                dirty={barDirty}
                disabled={false}
                errors={barErrors}
                form={barForm}
                message={barMessage}
                mode={barMode}
                status={barStatus}
                templates={barState.data.templates}
                title={barMode === "creating" ? "새 바 전용 유형" : "바 전용 유형 편집"}
                labelPrefix="바 전용 유형"
                onChange={onBarFormChange}
                onDelete={onDeleteBarType}
                onReset={onBarReset}
                onSave={onBarSave}
              />
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function GrapeSection({
  bars,
  candidateErrors,
  candidateForm,
  candidateMessage,
  candidateState,
  candidateStatus,
  grapeState,
  isSystemAdmin,
  reviewErrors,
  reviewForm,
  reviewMessage,
  reviewStatus,
  selectedCandidate,
  selectedCandidateId,
  onCandidateFormChange,
  onRefresh,
  onReview,
  onReviewFormChange,
  onSelectCandidate,
  onSubmitCandidate
}: {
  bars: ItemTypeBarOption[];
  candidateErrors: FieldErrors;
  candidateForm: { barId: string; proposedName: string };
  candidateMessage: string;
  candidateState: LoadState<GrapeVarietyCandidatesResponse>;
  candidateStatus: "idle" | "saving" | "error";
  grapeState: LoadState<GrapeVarietiesResponse>;
  isSystemAdmin: boolean;
  reviewErrors: FieldErrors;
  reviewForm: { standardName: string; reason: string };
  reviewMessage: string;
  reviewStatus: "idle" | "saving" | "error";
  selectedCandidate: GrapeVarietyCandidate | null;
  selectedCandidateId: string;
  onCandidateFormChange: (form: { barId: string; proposedName: string }) => void;
  onRefresh: () => void;
  onReview: (action: "approve" | "reject") => void;
  onReviewFormChange: (form: { standardName: string; reason: string }) => void;
  onSelectCandidate: (candidate: GrapeVarietyCandidate) => void;
  onSubmitCandidate: (event: FormEvent) => void;
}) {
  return (
    <section className="panel" aria-labelledby="grape-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">포도 품종</p>
          <h2 id="grape-title">포도 품종 승인</h2>
        </div>
        <button className="button secondary" type="button" onClick={onRefresh}>
          새로고침
        </button>
      </div>
      <div className="grape-grid">
        <section className="sub-panel" aria-labelledby="approved-grapes-title">
          <h3 id="approved-grapes-title">승인된 품종</h3>
          {grapeState.status === "loading" ? <div className="dashboard-empty" role="status">승인 목록을 불러오는 중입니다.</div> : null}
          {grapeState.status === "ready" && grapeState.data.varieties.length === 0 ? (
            <div className="dashboard-empty" role="status">
              <strong>승인된 품종이 없습니다.</strong>
              <p>후보 승인 후 메뉴 상세 입력에서 사용할 수 있습니다.</p>
            </div>
          ) : null}
          {grapeState.status === "ready" && grapeState.data.varieties.length > 0 ? (
            <div className="tag-list" aria-label="승인된 포도 품종 목록">
              {grapeState.data.varieties.map((variety) => (
                <span className="status-badge active" key={variety.id}>
                  {variety.name}
                </span>
              ))}
            </div>
          ) : null}
          {grapeState.status === "error" || grapeState.status === "forbidden" || grapeState.status === "unauthenticated" ? (
            <div className="form-status" role="alert">
              {grapeState.message}
            </div>
          ) : null}
        </section>

        <section className="sub-panel" aria-labelledby="submit-grape-title">
          <h3 id="submit-grape-title">후보 제출</h3>
          {bars.length === 0 ? (
            <div className="dashboard-empty" role="status">
              <strong>후보를 제출할 바가 없습니다.</strong>
              <p>메뉴 편집 권한이 있는 바에서만 후보를 제출할 수 있습니다.</p>
            </div>
          ) : (
            <form className="dialog-form" onSubmit={onSubmitCandidate}>
              <label className="field">
                <span>제출 바</span>
                <select
                  aria-label="후보 제출 바"
                  value={candidateForm.barId}
                  onChange={(event) => onCandidateFormChange({ ...candidateForm, barId: event.target.value })}
                >
                  {bars.map((bar) => (
                    <option key={bar.id} value={bar.id}>
                      {bar.name} · {bar.role}
                    </option>
                  ))}
                </select>
              </label>
              <TextField
                label="후보 품종명"
                name="grape-candidate-name"
                value={candidateForm.proposedName}
                error={candidateErrors.proposedName}
                onChange={(value) => onCandidateFormChange({ ...candidateForm, proposedName: value })}
              />
              {candidateMessage ? (
                <div className={candidateStatus === "error" ? "form-status" : "form-status success"} role={candidateStatus === "error" ? "alert" : "status"}>
                  {candidateMessage}
                </div>
              ) : null}
              <div className="dialog-actions">
                <button className="button primary" type="submit" disabled={candidateStatus === "saving"}>
                  후보 제출
                </button>
              </div>
            </form>
          )}
        </section>
      </div>

      <section className="sub-panel" aria-labelledby="candidate-queue-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">승인 대기</p>
            <h3 id="candidate-queue-title">후보 승인 큐</h3>
          </div>
        </div>
        {!isSystemAdmin ? (
          <div className="form-status" role="alert">
            후보 승인 큐는 시스템 관리자만 볼 수 있습니다.
          </div>
        ) : null}
        {candidateState.status === "loading" ? <div className="dashboard-empty" role="status">후보 큐를 불러오는 중입니다.</div> : null}
        {candidateState.status === "ready" ? (
          <div className="item-type-workspace">
            <CandidateList
              candidates={candidateState.data.candidates}
              selectedId={selectedCandidateId}
              onSelect={onSelectCandidate}
            />
            <CandidateReview
              candidate={selectedCandidate}
              errors={reviewErrors}
              form={reviewForm}
              message={reviewMessage}
              status={reviewStatus}
              onChange={onReviewFormChange}
              onReview={onReview}
            />
          </div>
        ) : null}
        {candidateState.status === "error" || candidateState.status === "unauthenticated" ? (
          <div className="form-status" role="alert">
            {candidateState.message}
          </div>
        ) : null}
      </section>
    </section>
  );
}

function TypeList({
  ariaLabel,
  selectedId,
  types,
  onSelect
}: {
  ariaLabel: string;
  selectedId: string;
  types: Array<SystemItemType | BarItemType>;
  onSelect: (id: string) => void;
}) {
  if (types.length === 0) {
    return (
      <div className="dashboard-empty" role="status">
        <strong>표시할 유형이 없습니다.</strong>
        <p>검색어를 조정하거나 새 유형을 추가하세요.</p>
      </div>
    );
  }
  return (
    <div className="item-type-list" aria-label={ariaLabel}>
      <table className="data-table item-type-table">
        <thead>
          <tr>
            <th scope="col">유형</th>
            <th scope="col">템플릿</th>
            <th scope="col">가격 라벨</th>
            <th scope="col">상태</th>
            <th scope="col">작업</th>
          </tr>
        </thead>
        <tbody>
          {types.map((type) => (
            <tr key={type.id} data-selected={type.id === selectedId}>
              <td>
                <strong>{type.name}</strong>
                <small>{type.normalizedName}</small>
              </td>
              <td>{templateLabel(type.template)}</td>
              <td>{type.defaultPriceLabels.length ? type.defaultPriceLabels.join(", ") : "없음"}</td>
              <td>
                <span className={type.isActive ? "status-badge active" : "status-badge inactive"}>
                  {type.isActive ? "활성" : "비활성"}
                </span>
              </td>
              <td>
                <button className="button compact secondary" type="button" onClick={() => onSelect(type.id)}>
                  선택
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="data-cards">
        {types.map((type) => (
          <article className="data-card item-type-card" data-selected={type.id === selectedId} key={type.id}>
            <div>
              <strong>{type.name}</strong>
              <span>{templateLabel(type.template)}</span>
            </div>
            <div className="card-row">
              <span>가격 라벨</span>
              <strong>{type.defaultPriceLabels.length ? type.defaultPriceLabels.join(", ") : "없음"}</strong>
            </div>
            <div className="card-row">
              <span>사용</span>
              <strong>{type.usageCount}건</strong>
            </div>
            <button className="button secondary" type="button" onClick={() => onSelect(type.id)}>
              선택
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function TypeEditor({
  canDelete,
  dirty,
  disabled,
  errors,
  form,
  labelPrefix,
  message,
  mode,
  status,
  templates,
  title,
  onChange,
  onDelete,
  onReset,
  onSave
}: {
  canDelete: boolean;
  dirty: boolean;
  disabled: boolean;
  errors: FieldErrors;
  form: TypeForm;
  labelPrefix: string;
  message: string;
  mode: EditorMode;
  status: "idle" | "saving" | "error";
  templates: TemplateOption[];
  title: string;
  onChange: (form: TypeForm) => void;
  onDelete: () => void;
  onReset: () => void;
  onSave: (event: FormEvent) => void;
}) {
  const selectedTemplate = templates.find((template) => template.value === form.template);
  const editorRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (mode !== "creating") return;
    const frame = window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ block: "nearest" });
      const firstInput = editorRef.current?.querySelector<HTMLInputElement>("input:not([disabled])");
      firstInput?.focus();
      firstInput?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mode, title]);

  return (
    <form className="type-editor" onSubmit={onSave} ref={editorRef}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{mode === "creating" ? "새 유형" : "유형 편집"}</p>
          <h3>{title}</h3>
        </div>
        {dirty ? <span className="status-badge locked">미저장</span> : <span className="status-badge active">저장됨</span>}
      </div>
      {Object.keys(errors).length > 0 ? (
        <div className="form-summary" role="alert">
          입력값을 확인하세요.
        </div>
      ) : null}
      {message ? (
        <div className={status === "error" ? "form-status" : "form-status success"} role={status === "error" ? "alert" : "status"}>
          {message}
        </div>
      ) : null}
      <TextField
        label="유형 이름"
        name={`${labelPrefix}-name`}
        value={form.name}
        disabled={disabled}
        error={errors.name}
        onChange={(value) => onChange({ ...form, name: value })}
      />
      <label className="field">
        <span>정보 템플릿</span>
        <select
          aria-label={`${labelPrefix} 정보 템플릿`}
          value={form.template}
          disabled={disabled}
          onChange={(event) => onChange({ ...form, template: event.target.value as ItemTemplate })}
        >
          {templates.map((template) => (
            <option value={template.value} key={template.value}>
              {template.label}
            </option>
          ))}
        </select>
      </label>
      <TemplateSummary template={selectedTemplate} />
      <PriceLabelEditor
        disabled={disabled}
        errors={errors.defaultPriceLabels}
        labelPrefix={`${labelPrefix} 가격 라벨`}
        labels={form.defaultPriceLabels}
        onChange={(labels) => onChange({ ...form, defaultPriceLabels: labels })}
      />
      <label className="check-row">
        <input
          type="checkbox"
          checked={form.isActive}
          disabled={disabled}
          onChange={(event) => onChange({ ...form, isActive: event.target.checked })}
        />
        활성 유형
      </label>
      <div className="dialog-actions">
        <button className="button secondary" type="button" disabled={!dirty || status === "saving"} onClick={onReset}>
          되돌리기
        </button>
        {canDelete ? (
          <button className="button secondary" type="button" disabled={status === "saving"} onClick={onDelete}>
            삭제
          </button>
        ) : null}
        <button className="button primary" type="submit" disabled={disabled || status === "saving"}>
          저장
        </button>
      </div>
    </form>
  );
}

function OverrideEditor({
  dirty,
  errors,
  form,
  message,
  selectedType,
  status,
  onChange,
  onReset,
  onSave
}: {
  dirty: boolean;
  errors: FieldErrors;
  form: OverrideForm;
  message: string;
  selectedType: SystemItemType | null;
  status: "idle" | "saving" | "error";
  onChange: (form: OverrideForm) => void;
  onReset: () => void;
  onSave: (event: FormEvent) => void;
}) {
  return (
    <form className="type-editor" onSubmit={onSave}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">바별 조정</p>
          <h3>{selectedType?.name ?? "공통 유형 선택"}</h3>
        </div>
        {dirty ? <span className="status-badge locked">미저장</span> : <span className="status-badge active">저장됨</span>}
      </div>
      {Object.keys(errors).length > 0 ? (
        <div className="form-summary" role="alert">
          입력값을 확인하세요.
        </div>
      ) : null}
      {message ? (
        <div className={status === "error" ? "form-status" : "form-status success"} role={status === "error" ? "alert" : "status"}>
          {message}
        </div>
      ) : null}
      <label className="check-row">
        <input
          aria-label="공통 유형 숨김"
          type="checkbox"
          checked={form.isHidden}
          onChange={(event) => onChange({ ...form, isHidden: event.target.checked })}
        />
        이 바에서 숨김
      </label>
      <PriceLabelEditor
        disabled={false}
        errors={errors.defaultPriceLabels}
        labelPrefix="공통 유형 조정 가격 라벨"
        labels={form.defaultPriceLabels}
        onChange={(labels) => onChange({ ...form, defaultPriceLabels: labels })}
      />
      <div className="dialog-actions">
        <button className="button secondary" type="button" disabled={!dirty || status === "saving"} onClick={onReset}>
          되돌리기
        </button>
        <button className="button primary" type="submit" disabled={!selectedType || status === "saving"}>
          저장
        </button>
      </div>
    </form>
  );
}

function PriceLabelEditor({
  disabled,
  errors,
  labelPrefix,
  labels,
  onChange
}: {
  disabled: boolean;
  errors?: string[];
  labelPrefix: string;
  labels: string[];
  onChange: (labels: string[]) => void;
}) {
  const update = (index: number, value: string) => onChange(labels.map((label, currentIndex) => (currentIndex === index ? value : label)));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= labels.length) return;
    const next = [...labels];
    const [item] = next.splice(index, 1);
    if (item === undefined) return;
    next.splice(target, 0, item);
    onChange(next);
  };
  const remove = (index: number) => onChange(labels.filter((_, currentIndex) => currentIndex !== index));
  return (
    <div className="price-label-editor">
      <div className="section-heading">
        <div>
          <p className="eyebrow">가격 라벨</p>
          <h4>기본 가격 항목</h4>
        </div>
        <button
          className="button compact secondary"
          type="button"
          disabled={disabled || labels.length >= 10}
          onClick={() => onChange([...labels, ""])}
        >
          추가
        </button>
      </div>
      {errors?.length ? <span className="field-error">{errors.join(", ")}</span> : null}
      {labels.length === 0 ? (
        <div className="dashboard-empty" role="status">
          <strong>기본 가격 항목 없음</strong>
          <p>선택 시 금액은 자동 입력하지 않고 라벨만 제안합니다.</p>
        </div>
      ) : null}
      {labels.map((label, index) => (
        <div className="price-label-row" key={`${index}-${labelPrefix}`}>
          <label className="field">
            <span>{index + 1}번 라벨</span>
            <input
              aria-label={`${labelPrefix} ${index + 1}`}
              value={label}
              disabled={disabled}
              onChange={(event) => update(index, event.target.value)}
            />
          </label>
          <div className="label-actions">
            <button className="icon-button" type="button" aria-label={`${labelPrefix} ${index + 1} 위로`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>
              ↑
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label={`${labelPrefix} ${index + 1} 아래로`}
              disabled={disabled || index === labels.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
            <button className="icon-button" type="button" aria-label={`${labelPrefix} ${index + 1} 삭제`} disabled={disabled} onClick={() => remove(index)}>
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function CandidateList({
  candidates,
  selectedId,
  onSelect
}: {
  candidates: GrapeVarietyCandidate[];
  selectedId: string;
  onSelect: (candidate: GrapeVarietyCandidate) => void;
}) {
  if (candidates.length === 0) {
    return (
      <div className="dashboard-empty" role="status">
        <strong>승인 대기 후보가 없습니다.</strong>
        <p>메뉴 편집자가 제출한 후보가 이곳에 표시됩니다.</p>
      </div>
    );
  }
  return (
    <div className="candidate-list" aria-label="포도 품종 후보 목록">
      {candidates.map((candidate) => (
        <button
          key={candidate.id}
          className="candidate-row"
          type="button"
          data-selected={candidate.id === selectedId}
          onClick={() => onSelect(candidate)}
        >
          <strong>{candidate.proposedName}</strong>
          <span>{candidate.status === "pending" ? "승인 대기" : candidate.status === "approved" ? "승인됨" : "반려됨"}</span>
          <small>{candidate.submittedByUsername}</small>
        </button>
      ))}
    </div>
  );
}

function CandidateReview({
  candidate,
  errors,
  form,
  message,
  status,
  onChange,
  onReview
}: {
  candidate: GrapeVarietyCandidate | null;
  errors: FieldErrors;
  form: { standardName: string; reason: string };
  message: string;
  status: "idle" | "saving" | "error";
  onChange: (form: { standardName: string; reason: string }) => void;
  onReview: (action: "approve" | "reject") => void;
}) {
  if (!candidate) {
    return (
      <div className="dashboard-empty" role="status">
        <strong>선택된 후보가 없습니다.</strong>
        <p>승인하거나 반려할 후보를 선택하세요.</p>
      </div>
    );
  }
  const pending = candidate.status === "pending";
  return (
    <div className="type-editor">
      <div className="section-heading">
        <div>
          <p className="eyebrow">검토</p>
          <h3>{candidate.proposedName}</h3>
        </div>
        <span className={pending ? "status-badge locked" : "status-badge active"}>{pending ? "승인 대기" : candidate.status}</span>
      </div>
      {message ? (
        <div className={status === "error" ? "form-status" : "form-status success"} role={status === "error" ? "alert" : "status"}>
          {message}
        </div>
      ) : null}
      <TextField
        label="승인 표준명"
        name="grape-standard-name"
        value={form.standardName}
        disabled={!pending}
        error={errors.standardName}
        onChange={(value) => onChange({ ...form, standardName: value })}
      />
      <TextField
        label="반려 사유"
        name="grape-reject-reason"
        value={form.reason}
        disabled={!pending}
        error={errors.reason}
        onChange={(value) => onChange({ ...form, reason: value })}
      />
      <dl className="detail-list">
        <div>
          <dt>제출자</dt>
          <dd>{candidate.submittedByUsername}</dd>
        </div>
        <div>
          <dt>상태</dt>
          <dd>{candidate.status}</dd>
        </div>
      </dl>
      <div className="dialog-actions">
        <button className="button secondary" type="button" disabled={!pending || status === "saving"} onClick={() => onReview("reject")}>
          반려
        </button>
        <button className="button primary" type="button" disabled={!pending || status === "saving"} onClick={() => onReview("approve")}>
          승인
        </button>
      </div>
    </div>
  );
}

function TemplateSummary({ template }: { template?: TemplateOption }) {
  if (!template) return null;
  return (
    <div className="template-summary">
      <strong>{template.label} 고정 필드</strong>
      <p>{template.fields.length ? template.fields.join(" · ") : "추가 상세 필드 없음"}</p>
    </div>
  );
}

function TextField({
  className,
  disabled,
  error,
  label,
  name,
  onChange,
  value
}: {
  className?: string;
  disabled?: boolean;
  error?: string[];
  label: string;
  name: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className={className ? `field ${className}` : "field"}>
      <span>{label}</span>
      <input
        aria-label={label}
        id={name}
        name={name}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {error?.length ? <span className="field-error">{error.join(", ")}</span> : null}
    </label>
  );
}

function ItemTypesStatusState({ state, navigate }: { state: LoadState<unknown>; navigate: Navigate }) {
  const title =
    state.status === "loading"
      ? "품목 유형을 불러오는 중입니다."
      : state.status === "unauthenticated"
        ? "로그인이 필요합니다."
        : state.status === "forbidden"
          ? "접근 권한이 없습니다."
          : "품목 유형을 불러오지 못했습니다.";
  const message = "message" in state ? state.message : "잠시 후 다시 시도하세요.";
  return (
    <section className="panel status-panel">
      <h1>{title}</h1>
      <p>{message}</p>
      {state.status === "unauthenticated" ? (
        <button className="button primary" type="button" onClick={() => navigate("/login")}>
          로그인
        </button>
      ) : null}
    </section>
  );
}

function emptyTypeForm(): TypeForm {
  return { name: "", template: "general", defaultPriceLabels: [], isActive: true };
}

function emptyOverrideForm(): OverrideForm {
  return { isHidden: false, defaultPriceLabels: [] };
}

function typeToForm(type: SystemItemType | BarItemType): TypeForm {
  return {
    name: type.name,
    template: type.template,
    defaultPriceLabels: [...type.defaultPriceLabels],
    isActive: type.isActive
  };
}

function overrideToForm(data: BarItemTypesResponse, systemTypeId: string): OverrideForm {
  const override = data.overrides.find((item) => item.systemItemTypeId === systemTypeId);
  if (override) return overrideRecordToForm(override);
  const systemType = data.systemTypes.find((item) => item.id === systemTypeId);
  return {
    isHidden: false,
    defaultPriceLabels: systemType ? [...systemType.defaultPriceLabels] : []
  };
}

function overrideRecordToForm(override: BarItemTypeOverride): OverrideForm {
  return {
    isHidden: override.isHidden,
    defaultPriceLabels: [...override.defaultPriceLabels]
  };
}

function filterTypes<T extends SystemItemType | BarItemType>(types: T[], query: string): T[] {
  const normalized = normalizeLocal(query);
  if (!normalized) return types;
  return types.filter((type) => normalizeLocal(`${type.name} ${type.template} ${type.defaultPriceLabels.join(" ")}`).includes(normalized));
}

function sortTypes<T extends SystemItemType | BarItemType>(types: T[]): T[] {
  return [...types].sort((left, right) => left.name.localeCompare(right.name, "ko"));
}

function sortCandidates(candidates: GrapeVarietyCandidate[]): GrapeVarietyCandidate[] {
  const unique = new Map<string, GrapeVarietyCandidate>();
  candidates.forEach((candidate) => unique.set(candidate.id, candidate));
  return [...unique.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function normalizeLocal(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function templateLabel(template: ItemTemplate): string {
  const labels: Record<ItemTemplate, string> = {
    general: "일반",
    wine: "와인",
    whisky: "위스키",
    spirit: "일반 증류주",
    beer: "맥주",
    cocktail: "칵테일",
    food: "푸드·디저트",
    cigar: "시가"
  };
  return labels[template];
}

function itemTypeRoleLabel(role: ItemTypeBarOption["role"]): string {
  if (role === "system-admin") return "시스템 관리자";
  if (role === "owner") return "오너";
  if (role === "manager") return "매니저";
  return "스태프";
}

function toLoadError(error: unknown): LoadState<never> {
  if (error instanceof AuthApiError) {
    if (error.code === "AUTH_REQUIRED" || error.code === "SESSION_EXPIRED") {
      return { status: "unauthenticated", message: error.message };
    }
    if (error.code.endsWith("_REQUIRED") || error.code === "BAR_PERMISSION_REQUIRED") {
      return { status: "forbidden", message: error.message };
    }
    return { status: "error", message: error.message };
  }
  return { status: "error", message: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." };
}

function handleFormError(
  error: unknown,
  setErrors: (errors: FieldErrors) => void,
  setMessage: (message: string) => void,
  setStatus: (status: "idle" | "saving" | "error") => void
) {
  setStatus("error");
  if (error instanceof AuthApiError) {
    setErrors(error.fieldErrors);
    setMessage(error.message);
    return;
  }
  setErrors({});
  setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.");
}

function confirmDiscard(dirty: boolean, action: () => void) {
  if (!dirty || window.confirm("저장하지 않은 변경을 버릴까요?")) action();
}
