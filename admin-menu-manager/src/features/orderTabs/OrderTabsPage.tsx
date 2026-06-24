import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  OrderMenuPickerItem,
  OrderTabDetailResponse,
  OrderTabDto,
  OrderTabItemDto,
  OrderTabListQuery,
  OrderTabStatus,
  OrderTabsResponse
} from "../../../contracts/orderTabs";
import { StickyActionBar } from "../../components/adaptive/StickyActionBar";
import { AuthApiError } from "../auth/authApi";
import { useDirtyWarning } from "../auth/useDirtyWarning";
import {
  addAdjustmentOrderItem,
  addCustomOrderItem,
  addMenuOrderItem,
  cancelOrderTab,
  createOrderTab,
  readOrderTab,
  readOrderTabs,
  reopenOrderTab,
  requestCheckoutOrderTab,
  settleOrderTab,
  updateOrderItemQuantity,
  updateOrderTab,
  voidOrderItem
} from "./orderTabsApi";

type Navigate = (path: string) => void;
type FieldErrors = Record<string, string[]>;
type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "unauthenticated"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "not-found"; message: string }
  | { status: "error"; message: string; code?: string };

type CreateForm = {
  tableLabel: string;
  guestDescription: string;
};

type DetailForm = CreateForm;

type AddLineForm = {
  query: string;
  menuItemId: string;
  priceId: string;
  quantity: number;
  confirmReopen: boolean;
};

type CustomLineForm = {
  name: string;
  unitAmountMinor: string;
  quantity: number;
  reason: string;
  confirmReopen: boolean;
};

type AdjustmentForm = {
  label: string;
  amountMinor: string;
  reason: string;
  confirmReopen: boolean;
};

type VoidForm = {
  itemId: string;
  reason: string;
};

type SettleForm = {
  transferConfirmed: boolean;
  note: string;
};

type CancelForm = {
  reason: string;
};

export function OrderTabsPage({
  barId,
  orderTabId,
  navigate
}: {
  barId: string;
  orderTabId?: string;
  navigate: Navigate;
}) {
  const [listState, setListState] = useState<LoadState<OrderTabsResponse>>({ status: "loading" });
  const [detailState, setDetailState] = useState<LoadState<OrderTabDetailResponse> | null>(orderTabId ? { status: "loading" } : null);
  const [listReloadKey, setListReloadKey] = useState(0);
  const [detailReloadKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<OrderTabListQuery["status"]>("all");
  const [query, setQuery] = useState("");
  const [createFormState, setCreateFormState] = useState<CreateForm>({ tableLabel: "", guestDescription: "" });
  const [createErrors, setCreateErrors] = useState<FieldErrors>({});
  const [createMessage, setCreateMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [detailForm, setDetailForm] = useState<DetailForm>({ tableLabel: "", guestDescription: "" });
  const [detailOriginal, setDetailOriginal] = useState<DetailForm>({ tableLabel: "", guestDescription: "" });
  const [detailErrors, setDetailErrors] = useState<FieldErrors>({});
  const [detailMessage, setDetailMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [addLineForm, setAddLineForm] = useState<AddLineForm>({ query: "", menuItemId: "", priceId: "", quantity: 1, confirmReopen: false });
  const [customLineForm, setCustomLineForm] = useState<CustomLineForm>({ name: "", unitAmountMinor: "", quantity: 1, reason: "", confirmReopen: false });
  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentForm>({ label: "할인", amountMinor: "", reason: "", confirmReopen: false });
  const [addLineMessage, setAddLineMessage] = useState("");
  const [addingLine, setAddingLine] = useState(false);
  const [addingCustomLine, setAddingCustomLine] = useState(false);
  const [addingAdjustment, setAddingAdjustment] = useState(false);
  const [lineMutatingId, setLineMutatingId] = useState("");
  const [voidForm, setVoidForm] = useState<VoidForm>({ itemId: "", reason: "" });
  const [voidingLine, setVoidingLine] = useState(false);
  const [settleForm, setSettleForm] = useState<SettleForm>({ transferConfirmed: false, note: "" });
  const [cancelForm, setCancelForm] = useState<CancelForm>({ reason: "" });
  const [transitioning, setTransitioning] = useState("");
  const [transitionMessage, setTransitionMessage] = useState("");

  const createDirty = createFormState.tableLabel.trim().length > 0 || createFormState.guestDescription.trim().length > 0;
  const detailDirty = JSON.stringify(detailForm) !== JSON.stringify(detailOriginal);
  const voidDirty = Boolean(voidForm.itemId && voidForm.reason.trim());
  const customDirty = Boolean(customLineForm.name.trim() || customLineForm.unitAmountMinor.trim() || customLineForm.reason.trim());
  const adjustmentDirty = Boolean(adjustmentForm.amountMinor.trim() || adjustmentForm.reason.trim() || adjustmentForm.label.trim() !== "할인");
  const settleDirty = settleForm.transferConfirmed || settleForm.note.trim().length > 0;
  const cancelDirty = cancelForm.reason.trim().length > 0;
  useDirtyWarning(createDirty || detailDirty || voidDirty || customDirty || adjustmentDirty || settleDirty || cancelDirty);

  useEffect(() => {
    let cancelled = false;
    setListState({ status: "loading" });
    readOrderTabs(barId, { status: statusFilter, query })
      .then((data) => {
        if (!cancelled) setListState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setListState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [barId, statusFilter, query, listReloadKey]);

  useEffect(() => {
    let cancelled = false;
    if (!orderTabId) {
      setDetailState(null);
      setDetailForm({ tableLabel: "", guestDescription: "" });
      setDetailOriginal({ tableLabel: "", guestDescription: "" });
      setDetailErrors({});
      setDetailMessage("");
      setAddLineMessage("");
      setCustomLineForm({ name: "", unitAmountMinor: "", quantity: 1, reason: "", confirmReopen: false });
      setAdjustmentForm({ label: "할인", amountMinor: "", reason: "", confirmReopen: false });
      setVoidForm({ itemId: "", reason: "" });
      setSettleForm({ transferConfirmed: false, note: "" });
      setCancelForm({ reason: "" });
      setTransitionMessage("");
      return undefined;
    }
    setDetailState({ status: "loading" });
    readOrderTab(barId, orderTabId)
      .then((data) => {
        if (cancelled) return;
        const nextForm = tabToForm(data.tab);
        setDetailState({ status: "ready", data });
        setDetailForm(nextForm);
        setDetailOriginal(nextForm);
        setDetailErrors({});
        setDetailMessage("");
        setAddLineMessage("");
        setCustomLineForm({ name: "", unitAmountMinor: "", quantity: 1, reason: "", confirmReopen: false });
        setAdjustmentForm({ label: "할인", amountMinor: "", reason: "", confirmReopen: false });
        setVoidForm({ itemId: "", reason: "" });
        setSettleForm({ transferConfirmed: false, note: "" });
        setCancelForm({ reason: "" });
        setTransitionMessage("");
      })
      .catch((error: unknown) => {
        if (!cancelled) setDetailState(toLoadError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [barId, orderTabId, detailReloadKey]);

  const selectedTab = useMemo(() => {
    if (detailState?.status === "ready") return detailState.data.tab;
    if (listState.status !== "ready" || !orderTabId) return null;
    return listState.data.tabs.find((tab) => tab.id === orderTabId) ?? null;
  }, [detailState, listState, orderTabId]);

  if (listState.status !== "ready") return <OrdersStatusState state={listState} navigate={navigate} />;

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setCreateErrors({});
    setCreateMessage("");
    createOrderTab(barId, createFormState)
      .then((data) => {
        setCreateFormState({ tableLabel: "", guestDescription: "" });
        setCreateMessage(`${data.tab.displayCode} 주문 탭을 열었습니다.`);
        setListReloadKey((value) => value + 1);
        navigate(`/bars/${barId}/orders/${data.tab.id}`);
      })
      .catch((error: unknown) => handleFormError(error, setCreateErrors, setCreateMessage))
      .finally(() => setCreating(false));
  };

  const submitDetail = (event: FormEvent) => {
    event.preventDefault();
    if (!orderTabId || detailState?.status !== "ready") return;
    setSaving(true);
    setDetailErrors({});
    setDetailMessage("");
    updateOrderTab(barId, orderTabId, {
      expectedVersion: detailState.data.tab.version,
      tableLabel: detailForm.tableLabel,
      guestDescription: detailForm.guestDescription
    })
      .then((data) => {
        const nextForm = tabToForm(data.tab);
        setDetailState({ status: "ready", data });
        setDetailForm(nextForm);
        setDetailOriginal(nextForm);
        setDetailMessage("주문 탭 정보를 저장했습니다.");
        setListReloadKey((value) => value + 1);
      })
      .catch((error: unknown) => handleDetailError(error, setDetailErrors, setDetailMessage))
      .finally(() => setSaving(false));
  };

  const selectTab = (tabId: string) => {
    confirmDiscard(createDirty || detailDirty || voidDirty || customDirty || adjustmentDirty || settleDirty || cancelDirty, () => navigate(`/bars/${barId}/orders/${tabId}`));
  };

  const submitAddLine = () => {
    if (!orderTabId || detailState?.status !== "ready") return;
    if (!addLineForm.menuItemId || !addLineForm.priceId) {
      setAddLineMessage("추가할 메뉴와 가격 항목을 선택하세요.");
      return;
    }
    setAddingLine(true);
    setAddLineMessage("");
    addMenuOrderItem(barId, orderTabId, {
      expectedVersion: detailState.data.tab.version,
      idempotencyKey: createIdempotencyKey(),
      menuItemId: addLineForm.menuItemId,
      priceId: addLineForm.priceId,
      quantity: addLineForm.quantity,
      confirmReopen: addLineForm.confirmReopen
    })
      .then((data) => {
        setDetailState({ status: "ready", data });
        setAddLineForm({ query: "", menuItemId: "", priceId: "", quantity: 1, confirmReopen: false });
        setAddLineMessage("메뉴 주문을 추가했습니다.");
        setListReloadKey((value) => value + 1);
      })
      .catch((error: unknown) => handleLineError(error, setAddLineMessage))
      .finally(() => setAddingLine(false));
  };

  const changeLineQuantity = (item: OrderTabItemDto, quantity: number) => {
    if (!orderTabId || detailState?.status !== "ready" || quantity < 1) return;
    setLineMutatingId(item.id);
    setAddLineMessage("");
    updateOrderItemQuantity(barId, orderTabId, item.id, {
      expectedVersion: detailState.data.tab.version,
      itemExpectedVersion: item.version,
      quantity
    })
      .then((data) => {
        setDetailState({ status: "ready", data });
        setListReloadKey((value) => value + 1);
      })
      .catch((error: unknown) => handleLineError(error, setAddLineMessage))
      .finally(() => setLineMutatingId(""));
  };

  const submitCustomLine = () => {
    if (!orderTabId || detailState?.status !== "ready") return;
    const amount = parseAmountMinor(customLineForm.unitAmountMinor);
    if (!customLineForm.name.trim() || amount === null || !customLineForm.reason.trim()) {
      setAddLineMessage("기타 항목명, 금액, 사유를 입력하세요.");
      return;
    }
    setAddingCustomLine(true);
    setAddLineMessage("");
    addCustomOrderItem(barId, orderTabId, {
      expectedVersion: detailState.data.tab.version,
      idempotencyKey: createIdempotencyKey(),
      name: customLineForm.name,
      unitAmountMinor: amount,
      quantity: customLineForm.quantity,
      reason: customLineForm.reason,
      confirmReopen: customLineForm.confirmReopen
    })
      .then((data) => {
        setDetailState({ status: "ready", data });
        setCustomLineForm({ name: "", unitAmountMinor: "", quantity: 1, reason: "", confirmReopen: false });
        setAddLineMessage("기타 주문 항목을 추가했습니다.");
        setListReloadKey((value) => value + 1);
      })
      .catch((error: unknown) => handleLineError(error, setAddLineMessage))
      .finally(() => setAddingCustomLine(false));
  };

  const submitAdjustment = () => {
    if (!orderTabId || detailState?.status !== "ready") return;
    const amount = parseAmountMinor(adjustmentForm.amountMinor);
    if (!adjustmentForm.label.trim() || amount === null || amount === 0 || !adjustmentForm.reason.trim()) {
      setAddLineMessage("조정명, 0이 아닌 금액, 사유를 입력하세요.");
      return;
    }
    setAddingAdjustment(true);
    setAddLineMessage("");
    addAdjustmentOrderItem(barId, orderTabId, {
      expectedVersion: detailState.data.tab.version,
      idempotencyKey: createIdempotencyKey(),
      label: adjustmentForm.label,
      amountMinor: amount,
      reason: adjustmentForm.reason,
      confirmReopen: adjustmentForm.confirmReopen
    })
      .then((data) => {
        setDetailState({ status: "ready", data });
        setAdjustmentForm({ label: "할인", amountMinor: "", reason: "", confirmReopen: false });
        setAddLineMessage("금액 조정을 추가했습니다.");
        setListReloadKey((value) => value + 1);
      })
      .catch((error: unknown) => handleLineError(error, setAddLineMessage))
      .finally(() => setAddingAdjustment(false));
  };

  const submitVoidLine = () => {
    if (!orderTabId || detailState?.status !== "ready" || !voidForm.itemId) return;
    const item = detailState.data.items.find((entry) => entry.id === voidForm.itemId);
    if (!item) return;
    setVoidingLine(true);
    setAddLineMessage("");
    voidOrderItem(barId, orderTabId, item.id, {
      expectedVersion: detailState.data.tab.version,
      itemExpectedVersion: item.version,
      reason: voidForm.reason
    })
      .then((data) => {
        setDetailState({ status: "ready", data });
        setVoidForm({ itemId: "", reason: "" });
        setAddLineMessage("주문 항목을 취소 처리했습니다.");
        setListReloadKey((value) => value + 1);
      })
      .catch((error: unknown) => handleLineError(error, setAddLineMessage))
      .finally(() => setVoidingLine(false));
  };

  const applyTransition = (operation: string, request: () => Promise<OrderTabDetailResponse>, successMessage: string) => {
    setTransitioning(operation);
    setTransitionMessage("");
    request()
      .then((data) => {
        setDetailState({ status: "ready", data });
        setTransitionMessage(successMessage);
        setSettleForm({ transferConfirmed: false, note: "" });
        setCancelForm({ reason: "" });
        setListReloadKey((value) => value + 1);
      })
      .catch((error: unknown) => handleLineError(error, setTransitionMessage))
      .finally(() => setTransitioning(""));
  };

  const submitCheckoutRequest = () => {
    if (!orderTabId || detailState?.status !== "ready") return;
    applyTransition(
      "checkout",
      () => requestCheckoutOrderTab(barId, orderTabId, { expectedVersion: detailState.data.tab.version }),
      "계산 요청으로 표시했습니다."
    );
  };

  const submitReopen = () => {
    if (!orderTabId || detailState?.status !== "ready") return;
    if (!window.confirm("계산 요청을 해제하고 주문 탭을 다시 열까요?")) return;
    applyTransition(
      "reopen",
      () => reopenOrderTab(barId, orderTabId, { expectedVersion: detailState.data.tab.version, reason: "운영자 재오픈" }),
      "주문 탭을 다시 열었습니다."
    );
  };

  const submitSettle = () => {
    if (!orderTabId || detailState?.status !== "ready") return;
    if (!settleForm.transferConfirmed) {
      setTransitionMessage("계좌이체 확인을 체크하세요.");
      return;
    }
    if (!window.confirm("계좌이체 확인 후 이 주문 탭을 정산 완료로 닫을까요?")) return;
    applyTransition(
      "settle",
      () =>
        settleOrderTab(barId, orderTabId, {
          expectedVersion: detailState.data.tab.version,
          idempotencyKey: createIdempotencyKey(),
          transferConfirmed: true,
          note: settleForm.note || undefined
        }),
      "정산을 완료하고 최종 합계를 고정했습니다."
    );
  };

  const submitCancel = () => {
    if (!orderTabId || detailState?.status !== "ready") return;
    if (!cancelForm.reason.trim()) {
      setTransitionMessage("취소 사유를 입력하세요.");
      return;
    }
    if (!window.confirm("이 주문 탭을 취소할까요? 주문 라인이 남아 있으면 취소할 수 없습니다.")) return;
    applyTransition(
      "cancel",
      () => cancelOrderTab(barId, orderTabId, { expectedVersion: detailState.data.tab.version, reason: cancelForm.reason }),
      "주문 탭을 취소했습니다."
    );
  };

  const summary = listState.data.summary;
  const dailySummary = listState.data.dailySummary;
  const checkoutQueue = listState.data.tabs.filter((tab) => tab.status === "checkout_requested");
  return (
    <div className="page-stack orders-page" data-has-detail={orderTabId ? "true" : "false"}>
      <section className="hero-panel" aria-labelledby="orders-title">
        <div>
          <p className="eyebrow">주문 운영</p>
          <h1 id="orders-title">주문 탭</h1>
          <p>{listState.data.bar.name}의 열린 주문 탭을 만들고 테이블·손님 설명을 최신 상태로 유지합니다.</p>
        </div>
        <div className="status-box" role="status">
          <span>운영 중</span>
          <strong>{summary.open + summary.checkoutRequested}개 탭</strong>
          <small>계산 요청 {summary.checkoutRequested}개 · 전체 {summary.total}개</small>
        </div>
      </section>

      <section className="orders-summary-strip" aria-label="정산 요약">
        <div>
          <span>오늘 정산</span>
          <strong>{formatMoney(dailySummary.settledTotalAmountMinor, dailySummary.currency)}</strong>
          <small>{dailySummary.businessDate} · 완료 {dailySummary.settledTabCount}건 · 취소 {dailySummary.cancelledTabCount}건</small>
        </div>
        <div>
          <span>계산 요청 큐</span>
          <strong>{summary.checkoutRequested}개</strong>
          <small>{checkoutQueue.length ? checkoutQueue.map((tab) => `${tab.displayCode} ${tab.tableLabel}`).join(", ") : "대기 없음"}</small>
        </div>
      </section>

      <section className="panel orders-toolbar-panel" aria-labelledby="orders-filter-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">조회 조건</p>
            <h2 id="orders-filter-title">탭 찾기</h2>
          </div>
          <a className="button secondary" data-app-link href={`/bars/${barId}/preview`}>
            메뉴판 확인
          </a>
        </div>
        <div className="filter-grid">
          <label className="field">
            <span>상태</span>
            <select aria-label="주문 탭 상태 필터" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as OrderTabListQuery["status"])}>
              <option value="all">전체</option>
              <option value="open">열림</option>
              <option value="checkout_requested">계산 요청</option>
              <option value="closed">닫힘</option>
              <option value="cancelled">취소</option>
            </select>
          </label>
          <label className="field">
            <span>검색</span>
            <input
              aria-label="주문 탭 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="테이블, 손님 설명, 탭 번호"
            />
          </label>
        </div>
      </section>

      <div className="orders-workspace">
        <section className="panel orders-list-panel" aria-labelledby="orders-list-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">열린 주문</p>
              <h2 id="orders-list-title">탭 목록</h2>
            </div>
            <span className="status-badge active">{listState.data.tabs.length}개 표시</span>
          </div>
          <OrderTabList tabs={listState.data.tabs} selectedId={selectedTab?.id ?? ""} onSelect={selectTab} />
        </section>

        <section className="panel orders-create-panel" aria-labelledby="orders-create-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">새 주문</p>
              <h2 id="orders-create-title">새 탭 생성</h2>
            </div>
          </div>
          <form id="order-tab-create-form" className="orders-form" onSubmit={submitCreate} noValidate>
            {createMessage ? <div className="form-status" role="status">{createMessage}</div> : null}
            <label className="field" htmlFor="order-tab-table-label">
              <span>테이블 라벨</span>
              <input
                id="order-tab-table-label"
                aria-label="새 탭 테이블 라벨"
                aria-invalid={createErrors.tableLabel?.length ? "true" : undefined}
                aria-describedby={createErrors.tableLabel?.length ? "order-tab-table-label-error" : undefined}
                value={createFormState.tableLabel}
                onChange={(event) => setCreateFormState((current) => ({ ...current, tableLabel: event.target.value }))}
                placeholder="예: A1, Bar 3"
              />
              {createErrors.tableLabel?.length ? <strong id="order-tab-table-label-error" className="field-error">{createErrors.tableLabel[0]}</strong> : null}
            </label>
            <label className="field" htmlFor="order-tab-guest-description">
              <span>손님 설명</span>
              <textarea
                id="order-tab-guest-description"
                aria-label="새 탭 손님 설명"
                aria-invalid={createErrors.guestDescription?.length ? "true" : undefined}
                aria-describedby={createErrors.guestDescription?.length ? "order-tab-guest-description-error" : undefined}
                value={createFormState.guestDescription}
                onChange={(event) => setCreateFormState((current) => ({ ...current, guestDescription: event.target.value }))}
                placeholder="예: 2명, 창가, 단골"
              />
              {createErrors.guestDescription?.length ? <strong id="order-tab-guest-description-error" className="field-error">{createErrors.guestDescription[0]}</strong> : null}
            </label>
            <div className="orders-new-tab-actions">
              <button className="button primary" type="submit" disabled={creating}>
                {creating ? "생성 중" : "새 탭 생성"}
              </button>
            </div>
          </form>
        </section>

        <section className="panel orders-detail-panel" aria-labelledby="orders-detail-title">
          <DetailPanel
            state={detailState}
            form={detailForm}
            original={detailOriginal}
            errors={detailErrors}
            message={detailMessage}
            saving={saving}
            addLineForm={addLineForm}
            customLineForm={customLineForm}
            adjustmentForm={adjustmentForm}
            addLineMessage={addLineMessage}
            addingLine={addingLine}
            addingCustomLine={addingCustomLine}
            addingAdjustment={addingAdjustment}
            lineMutatingId={lineMutatingId}
            voidForm={voidForm}
            voidingLine={voidingLine}
            settleForm={settleForm}
            cancelForm={cancelForm}
            transitioning={transitioning}
            transitionMessage={transitionMessage}
            onFormChange={setDetailForm}
            onAddLineFormChange={setAddLineForm}
            onCustomLineFormChange={setCustomLineForm}
            onAdjustmentFormChange={setAdjustmentForm}
            onSettleFormChange={setSettleForm}
            onCancelFormChange={setCancelForm}
            onAddLine={submitAddLine}
            onAddCustomLine={submitCustomLine}
            onAddAdjustment={submitAdjustment}
            onQuantityChange={changeLineQuantity}
            onRequestVoid={(itemId) => setVoidForm({ itemId, reason: "" })}
            onVoidFormChange={setVoidForm}
            onSubmitVoid={submitVoidLine}
            onRequestCheckout={submitCheckoutRequest}
            onReopen={submitReopen}
            onSettle={submitSettle}
            onCancel={submitCancel}
            onSubmit={submitDetail}
            onBack={() => confirmDiscard(detailDirty || voidDirty || customDirty || adjustmentDirty || settleDirty || cancelDirty, () => navigate(`/bars/${barId}/orders`))}
          />
        </section>
      </div>

      <StickyActionBar>
        <span>
          {selectedTab ? `${selectedTab.displayCode} ${selectedTab.tableLabel} · ${formatMoney(selectedTab.totalAmountMinor, selectedTab.currency)}` : "선택: 없음"}
        </span>
        <div className="orders-sticky-actions">
          <button className="button secondary" type="button" onClick={() => navigate(`/bars/${barId}/orders`)}>
            목록
          </button>
          {detailState?.status === "ready" && detailState.data.tab.status === "open" ? (
            <button className="button primary" type="button" disabled={transitioning === "checkout"} onClick={submitCheckoutRequest}>
              계산 요청
            </button>
          ) : null}
          {detailState?.status === "ready" && detailState.data.tab.status === "checkout_requested" ? (
            <>
              <label className="sticky-check">
                <input
                  type="checkbox"
                  checked={settleForm.transferConfirmed}
                  onChange={(event) => setSettleForm({ ...settleForm, transferConfirmed: event.target.checked })}
                />
                <span>이체 확인</span>
              </label>
              <button className="button primary" type="button" disabled={transitioning === "settle" || !settleForm.transferConfirmed} onClick={submitSettle}>
                정산 완료
              </button>
            </>
          ) : null}
          {detailState?.status !== "ready" ? (
            <button className="button primary" type="submit" form="order-tab-create-form" disabled={creating}>
              새 탭 생성
            </button>
          ) : null}
        </div>
      </StickyActionBar>
    </div>
  );
}

function OrderTabList({ tabs, selectedId, onSelect }: { tabs: OrderTabDto[]; selectedId: string; onSelect: (tabId: string) => void }) {
  if (tabs.length === 0) {
    return (
      <div className="dashboard-empty" role="status">
        <strong>표시할 주문 탭이 없습니다.</strong>
        <p>필터를 조정하거나 새 탭을 생성하세요.</p>
      </div>
    );
  }
  return (
    <div className="orders-data-view" aria-label="주문 탭 목록">
      <table className="data-table orders-table">
        <thead>
          <tr>
            <th scope="col">탭</th>
            <th scope="col">테이블</th>
            <th scope="col">상태</th>
            <th scope="col">합계</th>
            <th scope="col">작업</th>
          </tr>
        </thead>
        <tbody>
          {tabs.map((tab) => (
            <tr key={tab.id} data-selected={tab.id === selectedId}>
              <td>{tab.displayCode}</td>
              <td>
                <strong>{tab.tableLabel}</strong>
                <small>{tab.guestDescription || "설명 없음"}</small>
              </td>
              <td><OrderStatusBadge status={tab.status} /></td>
              <td>{formatMoney(tab.totalAmountMinor, tab.currency)}</td>
              <td>
                <button className="button compact" type="button" onClick={() => onSelect(tab.id)}>
                  상세
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="data-cards">
        {tabs.map((tab) => (
          <article className="data-card order-tab-card" key={tab.id} data-selected={tab.id === selectedId}>
            <div className="order-card-heading">
              <strong>{tab.displayCode} · {tab.tableLabel}</strong>
              <OrderStatusBadge status={tab.status} />
            </div>
            <div className="card-row">
              <span>손님</span>
              <strong>{tab.guestDescription || "설명 없음"}</strong>
            </div>
            <div className="card-row">
              <span>합계</span>
              <strong>{formatMoney(tab.totalAmountMinor, tab.currency)}</strong>
            </div>
            <button className="button secondary" type="button" onClick={() => onSelect(tab.id)}>
              상세
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function DetailPanel({
  state,
  form,
  original,
  errors,
  message,
  saving,
  addLineForm,
  customLineForm,
  adjustmentForm,
  addLineMessage,
  addingLine,
  addingCustomLine,
  addingAdjustment,
  lineMutatingId,
  voidForm,
  voidingLine,
  settleForm,
  cancelForm,
  transitioning,
  transitionMessage,
  onFormChange,
  onAddLineFormChange,
  onCustomLineFormChange,
  onAdjustmentFormChange,
  onSettleFormChange,
  onCancelFormChange,
  onAddLine,
  onAddCustomLine,
  onAddAdjustment,
  onQuantityChange,
  onRequestVoid,
  onVoidFormChange,
  onSubmitVoid,
  onRequestCheckout,
  onReopen,
  onSettle,
  onCancel,
  onSubmit,
  onBack
}: {
  state: LoadState<OrderTabDetailResponse> | null;
  form: DetailForm;
  original: DetailForm;
  errors: FieldErrors;
  message: string;
  saving: boolean;
  addLineForm: AddLineForm;
  customLineForm: CustomLineForm;
  adjustmentForm: AdjustmentForm;
  addLineMessage: string;
  addingLine: boolean;
  addingCustomLine: boolean;
  addingAdjustment: boolean;
  lineMutatingId: string;
  voidForm: VoidForm;
  voidingLine: boolean;
  settleForm: SettleForm;
  cancelForm: CancelForm;
  transitioning: string;
  transitionMessage: string;
  onFormChange: (form: DetailForm) => void;
  onAddLineFormChange: (form: AddLineForm) => void;
  onCustomLineFormChange: (form: CustomLineForm) => void;
  onAdjustmentFormChange: (form: AdjustmentForm) => void;
  onSettleFormChange: (form: SettleForm) => void;
  onCancelFormChange: (form: CancelForm) => void;
  onAddLine: () => void;
  onAddCustomLine: () => void;
  onAddAdjustment: () => void;
  onQuantityChange: (item: OrderTabItemDto, quantity: number) => void;
  onRequestVoid: (itemId: string) => void;
  onVoidFormChange: (form: VoidForm) => void;
  onSubmitVoid: () => void;
  onRequestCheckout: () => void;
  onReopen: () => void;
  onSettle: () => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
  onBack: () => void;
}) {
  if (state === null) {
    return (
      <div className="orders-detail-empty" role="status">
        <p className="eyebrow">상세 정보</p>
        <h2 id="orders-detail-title">탭 상세</h2>
        <p>목록에서 탭을 선택하면 테이블 라벨과 손님 설명을 수정할 수 있습니다.</p>
      </div>
    );
  }
  if (state.status !== "ready") {
    return <OrdersStatusState state={state} navigate={() => undefined} compact />;
  }
  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  const filteredPickerItems = filterPickerItems(state.data.menuPicker.items, addLineForm.query);
  const selectedMenu = state.data.menuPicker.items.find((item) => item.id === addLineForm.menuItemId) ?? null;
  const selectedPrice = selectedMenu?.prices.find((price) => price.id === addLineForm.priceId) ?? selectedMenu?.prices[0] ?? null;
  const canMutateLines = state.data.tab.status !== "closed" && state.data.tab.status !== "cancelled";
  const canEditDetails = canMutateLines;
  const customAmount = parseAmountMinor(customLineForm.unitAmountMinor);
  const adjustmentAmount = parseAmountMinor(adjustmentForm.amountMinor);
  const customPreview = customAmount === null ? null : customAmount * customLineForm.quantity;
  const adjustmentPreview = adjustmentAmount === null ? null : state.data.tab.totalAmountMinor + adjustmentAmount;
  return (
    <div className="orders-form orders-detail-form">
      <div className="section-heading">
        <div>
          <p className="eyebrow">상세 정보</p>
          <h2 id="orders-detail-title">{state.data.tab.displayCode} 주문 탭</h2>
        </div>
        <OrderStatusBadge status={state.data.tab.status} />
      </div>
      <div className="orders-detail-meta" role="status">
        <span>version {state.data.tab.version}</span>
        <span>{formatMoney(state.data.tab.totalAmountMinor, state.data.tab.currency)}</span>
        <span>{state.data.tab.activeItemCount}개 항목</span>
        {dirty ? <span className="status-badge locked">미저장</span> : <span className="status-badge active">저장됨</span>}
      </div>
      {message ? <div className={message.includes("다시") ? "form-status error" : "form-status"} role={message.includes("다시") ? "alert" : "status"}>{message}</div> : null}
      <form className="orders-form" onSubmit={onSubmit} noValidate>
        <label className="field" htmlFor="order-detail-table-label">
          <span>테이블 라벨</span>
          <input
            id="order-detail-table-label"
            aria-label="상세 테이블 라벨"
            aria-invalid={errors.tableLabel?.length ? "true" : undefined}
            aria-describedby={errors.tableLabel?.length ? "order-detail-table-label-error" : undefined}
            value={form.tableLabel}
            onChange={(event) => onFormChange({ ...form, tableLabel: event.target.value })}
            disabled={!canEditDetails}
          />
          {errors.tableLabel?.length ? <strong id="order-detail-table-label-error" className="field-error">{errors.tableLabel[0]}</strong> : null}
        </label>
        <label className="field" htmlFor="order-detail-guest-description">
          <span>손님 설명</span>
          <textarea
            id="order-detail-guest-description"
            aria-label="상세 손님 설명"
            aria-invalid={errors.guestDescription?.length ? "true" : undefined}
            aria-describedby={errors.guestDescription?.length ? "order-detail-guest-description-error" : undefined}
            value={form.guestDescription}
            onChange={(event) => onFormChange({ ...form, guestDescription: event.target.value })}
            disabled={!canEditDetails}
          />
          {errors.guestDescription?.length ? <strong id="order-detail-guest-description-error" className="field-error">{errors.guestDescription[0]}</strong> : null}
        </label>
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={onBack}>
            목록
          </button>
          <button className="button primary" type="submit" disabled={!canEditDetails || !dirty || saving}>
            {saving ? "저장 중" : "탭 정보 저장"}
          </button>
        </div>
      </form>

      <section className="order-lines-section" aria-labelledby="order-lines-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">주문 항목</p>
            <h3 id="order-lines-title">주문 라인</h3>
          </div>
          <span className="status-badge active">진행 중 {state.data.items.filter((item) => item.status === "active").length}개</span>
        </div>
        {state.data.items.length === 0 ? (
          <div className="dashboard-empty" role="status">
            <strong>아직 주문 라인이 없습니다.</strong>
            <p>아래 메뉴 선택에서 가격 항목과 수량을 선택해 추가하세요.</p>
          </div>
        ) : (
          <div className="order-line-list" aria-label="주문 라인 목록">
            {state.data.items.map((item) => (
              <article className="order-line-card" key={item.id} data-status={item.status}>
                <div className="order-line-main">
                  <div>
                    <strong>{item.menuItemName}</strong>
                    <small>
                      {lineTypeLabel(item.type)} · {item.priceLabel}
                      {item.volumeText ? ` · ${item.volumeText}` : ""} · {formatMoney(item.unitAmountMinor, item.currency)}
                    </small>
                    {item.reason ? <small>사유: {item.reason}</small> : null}
                    {item.status === "voided" ? <small>취소: {item.voidReason}</small> : null}
                  </div>
                  <strong>{formatMoney(item.lineTotalAmountMinor, item.currency)}</strong>
                </div>
                <div className="quantity-stepper" aria-label={`${item.menuItemName} 수량 조정`}>
                  <button className="icon-button" type="button" aria-label={`${item.menuItemName} 수량 줄이기`} disabled={!canMutateLines || item.type === "adjustment" || item.status !== "active" || item.quantity <= 1 || lineMutatingId === item.id} onClick={() => onQuantityChange(item, item.quantity - 1)}>
                    -
                  </button>
                  <output aria-label={`${item.menuItemName} 현재 수량`}>{item.quantity}</output>
                  <button className="icon-button" type="button" aria-label={`${item.menuItemName} 수량 늘리기`} disabled={!canMutateLines || item.type === "adjustment" || item.status !== "active" || item.quantity >= 99 || lineMutatingId === item.id} onClick={() => onQuantityChange(item, item.quantity + 1)}>
                    +
                  </button>
                  <button className="button danger compact" type="button" disabled={!canMutateLines || item.status !== "active" || lineMutatingId === item.id} onClick={() => onRequestVoid(item.id)}>
                    취소
                  </button>
                </div>
                {voidForm.itemId === item.id ? (
                  <div className="void-confirm-panel">
                    <label className="field" htmlFor={`void-reason-${item.id}`}>
                      <span>취소 사유</span>
                      <input
                        id={`void-reason-${item.id}`}
                        aria-label="취소 사유"
                        value={voidForm.reason}
                        onChange={(event) => onVoidFormChange({ itemId: item.id, reason: event.target.value })}
                        placeholder="예: 잘못 입력"
                      />
                    </label>
                    <div className="form-actions">
                      <button className="button secondary" type="button" onClick={() => onVoidFormChange({ itemId: "", reason: "" })}>
                        취소
                      </button>
                      <button className="button danger" type="button" disabled={voidingLine || !voidForm.reason.trim()} onClick={onSubmitVoid}>
                        취소 확정
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="order-menu-picker-panel" aria-labelledby="order-menu-picker-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">메뉴 선택</p>
            <h3 id="order-menu-picker-title">메뉴 추가</h3>
          </div>
        </div>
        {addLineMessage ? <div className={addLineMessage.includes("다시") || addLineMessage.includes("선택") ? "form-status error" : "form-status"} role={addLineMessage.includes("다시") || addLineMessage.includes("선택") ? "alert" : "status"}>{addLineMessage}</div> : null}
        <div className="order-picker-grid">
          <label className="field" htmlFor="order-menu-search">
            <span>메뉴 검색</span>
            <input
              id="order-menu-search"
              aria-label="주문 메뉴 검색"
              value={addLineForm.query}
              onChange={(event) => onAddLineFormChange({ ...addLineForm, query: event.target.value })}
              placeholder="메뉴명 또는 카테고리"
            />
          </label>
          <label className="field" htmlFor="order-menu-select">
            <span>메뉴</span>
            <select
              id="order-menu-select"
              aria-label="추가할 메뉴"
              value={addLineForm.menuItemId}
              onChange={(event) => {
                const nextMenu = state.data.menuPicker.items.find((item) => item.id === event.target.value);
                onAddLineFormChange({ ...addLineForm, menuItemId: event.target.value, priceId: nextMenu?.prices[0]?.id ?? "" });
              }}
              disabled={!canMutateLines || filteredPickerItems.length === 0}
            >
              <option value="">메뉴 선택</option>
              {filteredPickerItems.map((item) => (
                <option key={item.id} value={item.id}>{item.categoryPath} · {item.name}</option>
              ))}
            </select>
          </label>
          <label className="field" htmlFor="order-price-select">
            <span>가격 항목</span>
            <select
              id="order-price-select"
              aria-label="추가할 가격 항목"
              value={selectedPrice?.id ?? ""}
              onChange={(event) => onAddLineFormChange({ ...addLineForm, priceId: event.target.value })}
              disabled={!canMutateLines || !selectedMenu}
            >
              {selectedMenu ? selectedMenu.prices.map((price) => (
                <option key={price.id} value={price.id}>{price.label}{price.volumeText ? ` · ${price.volumeText}` : ""} · {formatMoney(price.amountMinor, price.currency)}</option>
              )) : <option value="">가격 선택</option>}
            </select>
          </label>
          <label className="field" htmlFor="order-line-quantity">
            <span>수량</span>
            <input
              id="order-line-quantity"
              aria-label="추가할 수량"
              type="number"
              min="1"
              max="99"
              value={addLineForm.quantity}
              onChange={(event) => onAddLineFormChange({ ...addLineForm, quantity: clampQuantity(event.target.valueAsNumber) })}
              disabled={!canMutateLines}
            />
          </label>
        </div>
        {state.data.tab.status === "checkout_requested" ? (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={addLineForm.confirmReopen}
              onChange={(event) => onAddLineFormChange({ ...addLineForm, confirmReopen: event.target.checked })}
            />
            <span>계산 요청 중인 탭을 다시 열고 주문을 추가합니다.</span>
          </label>
        ) : null}
        <div className="order-picker-actions">
          <span>{selectedPrice ? `예상 추가 ${formatMoney(selectedPrice.amountMinor * addLineForm.quantity, selectedPrice.currency)}` : "메뉴와 가격을 선택하세요."}</span>
          <button className="button primary" type="button" disabled={!canMutateLines || addingLine || !selectedMenu || !selectedPrice} onClick={onAddLine}>
            {addingLine ? "추가 중" : "메뉴 추가"}
          </button>
        </div>
      </section>

      {(state.data.permissions.canAddCustomOrderItem || state.data.permissions.canApplyOrderAdjustment) ? (
        <section className="order-extra-actions-panel" aria-labelledby="order-extra-actions-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">직접 입력·조정</p>
              <h3 id="order-extra-actions-title">기타 항목·금액 조정</h3>
            </div>
          </div>
          {state.data.permissions.canAddCustomOrderItem ? (
            <div className="order-adjustment-card">
              <div className="section-heading compact-heading">
                <div>
                  <p className="eyebrow">직접 입력</p>
                  <h4>기타 주문 항목</h4>
                </div>
                <span>{customPreview === null ? "금액 입력" : `예상 추가 ${formatMoney(customPreview, state.data.tab.currency)}`}</span>
              </div>
              <div className="order-adjustment-grid">
                <label className="field" htmlFor="custom-line-name">
                  <span>항목명</span>
                  <input
                    id="custom-line-name"
                    aria-label="기타 항목명"
                    value={customLineForm.name}
                    onChange={(event) => onCustomLineFormChange({ ...customLineForm, name: event.target.value })}
                    placeholder="예: 커버차지"
                    disabled={!canMutateLines}
                  />
                </label>
                <label className="field" htmlFor="custom-line-amount">
                  <span>단가</span>
                  <input
                    id="custom-line-amount"
                    aria-label="기타 항목 단가"
                    inputMode="numeric"
                    value={customLineForm.unitAmountMinor}
                    onChange={(event) => onCustomLineFormChange({ ...customLineForm, unitAmountMinor: event.target.value })}
                    placeholder="예: 5000"
                    disabled={!canMutateLines}
                  />
                </label>
                <label className="field" htmlFor="custom-line-quantity">
                  <span>수량</span>
                  <input
                    id="custom-line-quantity"
                    aria-label="기타 항목 수량"
                    type="number"
                    min="1"
                    max="99"
                    value={customLineForm.quantity}
                    onChange={(event) => onCustomLineFormChange({ ...customLineForm, quantity: clampQuantity(event.target.valueAsNumber) })}
                    disabled={!canMutateLines}
                  />
                </label>
                <label className="field" htmlFor="custom-line-reason">
                  <span>사유</span>
                  <input
                    id="custom-line-reason"
                    aria-label="기타 항목 사유"
                    value={customLineForm.reason}
                    onChange={(event) => onCustomLineFormChange({ ...customLineForm, reason: event.target.value })}
                    placeholder="예: 라이브 커버"
                    disabled={!canMutateLines}
                  />
                </label>
              </div>
              {state.data.tab.status === "checkout_requested" ? (
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={customLineForm.confirmReopen}
                    onChange={(event) => onCustomLineFormChange({ ...customLineForm, confirmReopen: event.target.checked })}
                  />
                  <span>계산 요청 중인 탭을 다시 열고 기타 항목을 추가합니다.</span>
                </label>
              ) : null}
              <div className="order-picker-actions">
                <span>사유와 금액은 주문 라인에 함께 보관됩니다.</span>
                <button
                  className="button secondary"
                  type="button"
                  disabled={!canMutateLines || addingCustomLine || !customLineForm.name.trim() || customAmount === null || !customLineForm.reason.trim()}
                  onClick={onAddCustomLine}
                >
                  {addingCustomLine ? "추가 중" : "기타 항목 추가"}
                </button>
              </div>
            </div>
          ) : null}

          {state.data.permissions.canApplyOrderAdjustment ? (
            <div className="order-adjustment-card">
              <div className="section-heading compact-heading">
                <div>
                  <p className="eyebrow">할인·조정</p>
                  <h4>할인·추가금</h4>
                </div>
                <span>
                  {adjustmentPreview === null
                    ? "금액 입력"
                    : `예상 최종 ${formatMoney(adjustmentPreview, state.data.tab.currency)}`}
                </span>
              </div>
              <div className="order-adjustment-grid">
                <label className="field" htmlFor="adjustment-label">
                  <span>구분</span>
                  <select
                    id="adjustment-label"
                    aria-label="금액 조정 구분"
                    value={adjustmentForm.label}
                    onChange={(event) => onAdjustmentFormChange({ ...adjustmentForm, label: event.target.value })}
                    disabled={!canMutateLines}
                  >
                    <option value="할인">할인</option>
                    <option value="추가금">추가금</option>
                    <option value="서비스 조정">서비스 조정</option>
                  </select>
                </label>
                <label className="field" htmlFor="adjustment-amount">
                  <span>조정 금액</span>
                  <input
                    id="adjustment-amount"
                    aria-label="조정 금액"
                    inputMode="numeric"
                    value={adjustmentForm.amountMinor}
                    onChange={(event) => onAdjustmentFormChange({ ...adjustmentForm, amountMinor: event.target.value })}
                    placeholder="할인은 -5000"
                    disabled={!canMutateLines}
                  />
                </label>
                <label className="field full" htmlFor="adjustment-reason">
                  <span>사유</span>
                  <input
                    id="adjustment-reason"
                    aria-label="금액 조정 사유"
                    value={adjustmentForm.reason}
                    onChange={(event) => onAdjustmentFormChange({ ...adjustmentForm, reason: event.target.value })}
                    placeholder="예: 단골 할인"
                    disabled={!canMutateLines}
                  />
                </label>
              </div>
              {state.data.tab.status === "checkout_requested" ? (
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={adjustmentForm.confirmReopen}
                    onChange={(event) => onAdjustmentFormChange({ ...adjustmentForm, confirmReopen: event.target.checked })}
                  />
                  <span>계산 요청 중인 탭을 다시 열고 금액 조정을 추가합니다.</span>
                </label>
              ) : null}
              <div className="order-picker-actions">
                <span>음수는 할인, 양수는 추가금으로 합계에 반영됩니다.</span>
                <button
                  className="button secondary"
                  type="button"
                  disabled={!canMutateLines || addingAdjustment || adjustmentAmount === null || adjustmentAmount === 0 || !adjustmentForm.reason.trim()}
                  onClick={onAddAdjustment}
                >
                  {addingAdjustment ? "적용 중" : "조정 추가"}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="order-settlement-panel" aria-labelledby="order-settlement-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">결제 정산</p>
            <h3 id="order-settlement-title">계산 요청·정산·취소</h3>
          </div>
          <strong>{formatMoney(state.data.tab.finalTotalAmountMinor ?? state.data.tab.totalAmountMinor, state.data.tab.currency)}</strong>
        </div>
        {transitionMessage ? (
          <div className={transitionMessage.includes("체크") || transitionMessage.includes("입력") || transitionMessage.includes("다시") ? "form-status error" : "form-status"} role={transitionMessage.includes("체크") || transitionMessage.includes("입력") || transitionMessage.includes("다시") ? "alert" : "status"}>
            {transitionMessage}
          </div>
        ) : null}

        {state.data.tab.status === "open" ? (
          <div className="settlement-action-card">
            <div>
              <strong>열린 탭</strong>
              <span>손님이 계산을 요청하면 탭을 계산 요청 큐에 올립니다.</span>
            </div>
            <button className="button primary" type="button" disabled={transitioning === "checkout"} onClick={onRequestCheckout}>
              {transitioning === "checkout" ? "요청 중" : "계산 요청"}
            </button>
          </div>
        ) : null}

        {state.data.tab.status === "checkout_requested" ? (
          <div className="settlement-action-card settlement-grid">
            <div>
              <strong>계산 요청 중</strong>
              <span>계좌이체 확인 후 최종 합계를 고정하고 탭을 닫습니다.</span>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settleForm.transferConfirmed}
                onChange={(event) => onSettleFormChange({ ...settleForm, transferConfirmed: event.target.checked })}
              />
              <span>계좌이체 확인</span>
            </label>
            <label className="field" htmlFor="settlement-note">
              <span>정산 메모</span>
              <input
                id="settlement-note"
                aria-label="정산 메모"
                value={settleForm.note}
                onChange={(event) => onSettleFormChange({ ...settleForm, note: event.target.value })}
                placeholder="예: 계좌이체 확인"
              />
            </label>
            <div className="form-actions">
              <button className="button secondary" type="button" disabled={transitioning === "reopen"} onClick={onReopen}>
                {transitioning === "reopen" ? "여는 중" : "주문 다시 열기"}
              </button>
              <button className="button primary" type="button" disabled={transitioning === "settle" || !settleForm.transferConfirmed} onClick={onSettle}>
                {transitioning === "settle" ? "정산 중" : "정산 완료"}
              </button>
            </div>
          </div>
        ) : null}

        {state.data.tab.status === "closed" ? (
          <div className="settlement-result-grid" role="status">
            <div>
              <span>최종 합계</span>
              <strong>{formatMoney(state.data.tab.finalTotalAmountMinor ?? state.data.tab.totalAmountMinor, state.data.tab.currency)}</strong>
            </div>
            <div>
              <span>정산 시각</span>
              <strong>{state.data.tab.settledAt ? formatDate(state.data.tab.settledAt) : "기록 없음"}</strong>
            </div>
          </div>
        ) : null}

        {state.data.tab.status === "cancelled" ? (
          <div className="settlement-result-grid" role="status">
            <div>
              <span>취소 사유</span>
              <strong>{state.data.tab.cancelledReason ?? "기록 없음"}</strong>
            </div>
            <div>
              <span>취소 시각</span>
              <strong>{state.data.tab.cancelledAt ? formatDate(state.data.tab.cancelledAt) : "기록 없음"}</strong>
            </div>
          </div>
        ) : null}

        {(state.data.tab.status === "open" || state.data.tab.status === "checkout_requested") ? (
          <div className="settlement-cancel-card">
            <label className="field" htmlFor="order-cancel-reason">
              <span>취소 사유</span>
              <input
                id="order-cancel-reason"
                aria-label="주문 탭 취소 사유"
                value={cancelForm.reason}
                onChange={(event) => onCancelFormChange({ reason: event.target.value })}
                placeholder={state.data.tab.activeItemCount > 0 ? "진행 중인 주문 항목을 먼저 취소 처리하세요" : "예: 손님 착석 취소"}
                disabled={state.data.tab.activeItemCount > 0}
              />
            </label>
            <button
              className="button danger"
              type="button"
              disabled={transitioning === "cancel" || state.data.tab.activeItemCount > 0 || !cancelForm.reason.trim()}
              onClick={onCancel}
            >
              {transitioning === "cancel" ? "취소 중" : "탭 취소"}
            </button>
          </div>
        ) : null}
      </section>

      <div className="orders-event-list" aria-label="주문 탭 이벤트">
        {state.data.events.map((event) => (
          <div key={event.id}>
            <span>{formatDate(event.createdAt)}</span>
            <strong>{event.note}</strong>
            <small>v{event.resultingVersion}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderStatusBadge({ status }: { status: OrderTabStatus }) {
  const label = status === "open" ? "열림" : status === "checkout_requested" ? "계산 요청" : status === "closed" ? "닫힘" : "취소";
  const className =
    status === "open"
      ? "status-badge active"
      : status === "checkout_requested"
        ? "status-badge locked"
        : "status-badge inactive";
  return <span className={className}>{label}</span>;
}

function OrdersStatusState({ state, navigate, compact = false }: { state: LoadState<unknown>; navigate: Navigate; compact?: boolean }) {
  const title =
    state.status === "loading"
      ? "주문 탭을 불러오는 중"
      : state.status === "unauthenticated"
        ? "로그인이 필요합니다"
        : state.status === "forbidden"
          ? "접근할 수 없습니다"
          : state.status === "not-found"
            ? "주문 탭을 찾을 수 없습니다"
            : "주문 탭을 불러오지 못했습니다";
  const message = state.status === "loading" ? "잠시만 기다려 주세요." : state.status === "ready" ? "" : state.message;
  const className = `${compact ? "dashboard-status" : "panel dashboard-status"} ${state.status === "loading" ? "info" : "error"} ${compact ? "compact-status" : ""}`;
  return (
    <section className={className} role={state.status === "loading" ? "status" : "alert"}>
      <h1>{title}</h1>
      <p>{message}</p>
      {state.status === "unauthenticated" ? (
        <button className="button primary" type="button" onClick={() => navigate("/login")}>
          로그인으로 이동
        </button>
      ) : null}
    </section>
  );
}

function tabToForm(tab: OrderTabDto): DetailForm {
  return {
    tableLabel: tab.tableLabel,
    guestDescription: tab.guestDescription
  };
}

function handleFormError(error: unknown, setErrors: (errors: FieldErrors) => void, setMessage: (message: string) => void) {
  if (error instanceof AuthApiError) {
    setErrors(error.fieldErrors);
    setMessage(error.message);
    return;
  }
  setMessage(error instanceof Error ? error.message : "저장하지 못했습니다.");
}

function handleDetailError(error: unknown, setErrors: (errors: FieldErrors) => void, setMessage: (message: string) => void) {
  if (error instanceof AuthApiError) {
    setErrors(error.fieldErrors);
    if (error.code === "ORDER_TAB_VERSION_CONFLICT") {
      const latest = typeof error.details.latestVersion === "number" ? ` 최신 version ${error.details.latestVersion}.` : "";
      setMessage(`${error.message}${latest}`);
      return;
    }
    setMessage(error.message);
    return;
  }
  setMessage(error instanceof Error ? error.message : "저장하지 못했습니다.");
}

function handleLineError(error: unknown, setMessage: (message: string) => void) {
  if (error instanceof AuthApiError) {
    if (error.code === "ORDER_TAB_VERSION_CONFLICT" || error.code === "ORDER_ITEM_VERSION_CONFLICT") {
      const latest = typeof error.details.latestVersion === "number" ? ` 최신 version ${error.details.latestVersion}.` : "";
      setMessage(`${error.message}${latest}`);
      return;
    }
    setMessage(error.message);
    return;
  }
  setMessage(error instanceof Error ? error.message : "주문 라인을 저장하지 못했습니다.");
}

function toLoadError(error: unknown): LoadState<never> {
  if (error instanceof AuthApiError) {
    if (["AUTH_REQUIRED", "SESSION_EXPIRED"].includes(error.code)) return { status: "unauthenticated", message: error.message };
    if (error.code === "BAR_NOT_FOUND" || error.code === "ORDER_TAB_NOT_FOUND") return { status: "not-found", message: error.message };
    if (error.code === "ORDER_PERMISSION_REQUIRED" || error.code === "BAR_PERMISSION_REQUIRED") return { status: "forbidden", message: error.message };
    return { status: "error", message: error.message, code: error.code };
  }
  return { status: "error", message: error instanceof Error ? error.message : "주문 탭 정보를 불러오지 못했습니다." };
}

function confirmDiscard(isDirty: boolean, callback: () => void) {
  if (!isDirty || window.confirm("저장하지 않은 변경을 버릴까요?")) callback();
}

function filterPickerItems(items: OrderMenuPickerItem[], query: string): OrderMenuPickerItem[] {
  const normalized = query.trim().toLocaleLowerCase("ko");
  if (!normalized) return items;
  return items.filter((item) => `${item.categoryPath} ${item.name}`.toLocaleLowerCase("ko").includes(normalized));
}

function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(99, Math.max(1, Math.trunc(value)));
}

function parseAmountMinor(value: string): number | null {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized || !/^-?\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) ? amount : null;
}

function lineTypeLabel(type: OrderTabItemDto["type"]): string {
  if (type === "custom") return "기타";
  if (type === "adjustment") return "조정";
  return "메뉴";
}

function createIdempotencyKey(): string {
  return crypto.randomUUID?.() ?? `order-line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatMoney(amountMinor: number, currency: string): string {
  return `${new Intl.NumberFormat("ko-KR").format(amountMinor)} ${currency}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
