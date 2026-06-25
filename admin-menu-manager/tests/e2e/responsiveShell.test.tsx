import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApp } from "../../src/app/router/AdminApp";

const viewports = [
  { width: 390, height: 844, label: "compact" },
  { width: 768, height: 1024, label: "medium" },
  { width: 1440, height: 900, label: "wide" }
];

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  window.dispatchEvent(new Event("resize"));
}

describe("admin responsive shell", () => {
  beforeEach(() => {
    window.history.pushState(null, "", "/");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
        if (path.includes("/api/auth/session")) return jsonResponse(sessionEnvelope());
        if (path.includes("/api/dashboard")) return jsonResponse(dashboardEnvelope());
        if (path.includes("/api/bars/bar-1/current-permissions")) return jsonResponse(currentPermissionsEnvelope());
        if (path.includes("/api/bars/bar-1/publications")) return jsonResponse(publicationsEnvelope());
        if (path.includes("/api/bars/bar-1/preview")) return jsonResponse(previewEnvelope());
        if (path.includes("/api/bars/bar-1/settings")) return jsonResponse(barSettingsEnvelope());
        if (path.includes("/api/bars/bar-1/item-types")) return jsonResponse(barItemTypesEnvelope());
        if (path.includes("/api/bars/bar-1/badges")) return jsonResponse(barBadgesEnvelope());
        if (path.includes("/api/bars/bar-1/menu-items/menu-1")) return jsonResponse(menuItemDetailEnvelope());
        if (path.includes("/api/bars/bar-1/menu-items")) return jsonResponse(menuItemsEnvelope());
        if (path.includes("/api/bars/bar-1/categories")) return jsonResponse(categoriesEnvelope());
        if (path.includes("/api/bars/bar-1/members")) return jsonResponse(barMembersEnvelope());
        if (path.includes("/api/system/item-types")) return jsonResponse(itemTypesEnvelope());
        if (path.includes("/api/system/badges")) return jsonResponse(badgesEnvelope());
        if (path.includes("/api/system/grape-varieties")) return jsonResponse(grapeVarietiesEnvelope());
        if (path.includes("/api/system/grape-variety-candidates")) return jsonResponse(grapeCandidatesEnvelope());
        if (path.includes("/api/system/pilot-readiness")) return jsonResponse(pilotReadinessEnvelope());
        if (path.includes("/api/system/audit/maintenance-runs")) return jsonResponse(maintenanceRunEnvelope());
        if (path.includes("/api/system/audit")) return jsonResponse(auditEnvelope());
        if (path.includes("/api/system/users")) return jsonResponse(systemUserListEnvelope());
        return jsonResponse(barListEnvelope());
      })
    );
  });

  it.each(viewports)("renders the same bars URL at $label", async ({ width, height }) => {
    window.history.pushState(null, "", "/bars");
    setViewport(width, height);

    render(<AdminApp />);

    expect(window.location.pathname).toBe("/bars");
    expect(await screen.findByRole("heading", { name: "바 관리" })).toBeInTheDocument();
    expect(screen.getByLabelText("바 이름 검색")).toBeInTheDocument();
  });

  it("preserves form and selection state during resize", async () => {
    const user = userEvent.setup();
    window.history.pushState(null, "", "/bars");
    setViewport(1440, 900);
    render(<AdminApp />);

    await screen.findByRole("heading", { name: "바 관리" });
    await user.type(screen.getByLabelText("바 이름 검색"), "a");
    const secondSelectButton = screen.getAllByRole("button", { name: "선택" }).at(1);
    expect(secondSelectButton).toBeDefined();
    await user.click(secondSelectButton as HTMLElement);

    setViewport(390, 844);

    expect(window.location.pathname).toBe("/bars");
    expect(screen.getByLabelText("바 이름 검색")).toHaveValue("a");
    expect(screen.getByText("선택: Cigar Room")).toBeInTheDocument();
  });

  it.each(viewports)("renders the same system users URL at $label", async ({ width, height }) => {
    window.history.pushState(null, "", "/system/users");
    setViewport(width, height);

    render(<AdminApp />);

    expect(window.location.pathname).toBe("/system/users");
    expect(await screen.findByRole("heading", { name: "사용자 계정 관리" })).toBeInTheDocument();
    expect(screen.getByLabelText("아이디 검색")).toBeInTheDocument();
  });

  it("preserves user search, status filter, and selection during resize", async () => {
    const user = userEvent.setup();
    window.history.pushState(null, "", "/system/users");
    setViewport(1440, 900);
    render(<AdminApp />);

    await screen.findByRole("heading", { name: "사용자 계정 관리" });
    await user.type(screen.getByLabelText("아이디 검색"), "owner");
    await user.selectOptions(screen.getByLabelText("사용자 상태 필터"), "forced_password_change");
    await user.click(screen.getAllByRole("button", { name: "선택" })[0] as HTMLElement);

    setViewport(390, 844);

    expect(window.location.pathname).toBe("/system/users");
    expect(screen.getByLabelText("아이디 검색")).toHaveValue("owner");
    expect(screen.getByLabelText("사용자 상태 필터")).toHaveValue("forced_password_change");
    expect(screen.getByText("선택: owner01")).toBeInTheDocument();
  });

  it.each(viewports)("renders the same audit URL at $label", async ({ width, height }) => {
    window.history.pushState(null, "", "/system/audit");
    setViewport(width, height);

    render(<AdminApp />);

    expect(window.location.pathname).toBe("/system/audit");
    expect(await screen.findByRole("heading", { name: "감사 로그·보관 작업" })).toBeInTheDocument();
    expect(screen.getByLabelText("감사 로그 검색")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "보관 작업" })).toBeInTheDocument();
  });

  it("preserves audit filters, selected event, and maintenance result during resize", async () => {
    const user = userEvent.setup();
    window.history.pushState(null, "", "/system/audit");
    setViewport(1440, 900);
    render(<AdminApp />);

    await screen.findByRole("heading", { name: "감사 로그·보관 작업" });
    await user.type(screen.getByLabelText("감사 로그 검색"), "manager");
    await user.selectOptions(screen.getByLabelText("감사 로그 작업 필터"), "order_tab.settled");
    await user.selectOptions(screen.getByLabelText("감사 로그 결과 필터"), "success");
    await user.click(screen.getAllByRole("button", { name: "상세" })[1] as HTMLElement);
    await user.click(screen.getByRole("button", { name: "미리 계산" }));
    await screen.findByText(/정리 대상 계산 완료/);

    setViewport(390, 844);

    expect(window.location.pathname).toBe("/system/audit");
    expect(screen.getByLabelText("감사 로그 검색")).toHaveValue("manager");
    expect(screen.getByLabelText("감사 로그 작업 필터")).toHaveValue("order_tab.settled");
    expect(screen.getByLabelText("감사 로그 결과 필터")).toHaveValue("success");
    expect(screen.getAllByText("테이블 4 정산").length).toBeGreaterThan(0);
    expect(screen.getByText(/정리 대상 계산 완료/)).toBeInTheDocument();
  });

  it.each(viewports)("renders the same members URL at $label", async ({ width, height }) => {
    window.history.pushState(null, "", "/bars/bar-1/members");
    setViewport(width, height);

    render(<AdminApp />);

    expect(window.location.pathname).toBe("/bars/bar-1/members");
    expect(await screen.findByRole("heading", { name: "바 회원·권한" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "회원 목록" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "역할별 권한" })).toBeInTheDocument();
  });

  it("preserves member selection and permission draft during resize", async () => {
    const user = userEvent.setup();
    window.history.pushState(null, "", "/bars/bar-1/members");
    setViewport(1440, 900);
    render(<AdminApp />);

    await screen.findByRole("heading", { name: "바 회원·권한" });
    await user.click(screen.getAllByRole("button", { name: "선택" })[1] as HTMLElement);
    await user.click(screen.getByLabelText("staff 메뉴 편집"));

    setViewport(390, 844);

    expect(window.location.pathname).toBe("/bars/bar-1/members");
    expect(screen.getByText("선택: manager01")).toBeInTheDocument();
    expect(screen.getByLabelText("staff 메뉴 편집")).toBeChecked();
  });

  it.each(viewports)("renders the same bar settings URL at $label", async ({ width, height }) => {
    window.history.pushState(null, "", "/bars/bar-1/settings");
    setViewport(width, height);

    render(<AdminApp />);

    expect(window.location.pathname).toBe("/bars/bar-1/settings");
    expect(await screen.findByRole("heading", { name: "바 기본 정보·영업시간" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "기본 정보" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "영업시간" })).toBeInTheDocument();
  });

  it("preserves unsaved bar settings form state during resize", async () => {
    const user = userEvent.setup();
    window.history.pushState(null, "", "/bars/bar-1/settings");
    setViewport(1440, 900);
    render(<AdminApp />);

    await screen.findByRole("heading", { name: "바 기본 정보·영업시간" });
    await user.clear(screen.getByLabelText("바 이름"));
    await user.type(screen.getByLabelText("바 이름"), "Edited Bar");
    await user.clear(screen.getByLabelText("URL"));
    await user.type(screen.getByLabelText("URL"), "https://links.example.test/edited");

    setViewport(390, 844);

    expect(window.location.pathname).toBe("/bars/bar-1/settings");
    expect(screen.getByLabelText("바 이름")).toHaveValue("Edited Bar");
    expect(screen.getByLabelText("URL")).toHaveValue("https://links.example.test/edited");
  });

  it.each(viewports)("renders the same item types URL at $label", async ({ width, height }) => {
    window.history.pushState(null, "", "/system/item-types");
    setViewport(width, height);

    render(<AdminApp />);

    expect(window.location.pathname).toBe("/system/item-types");
    expect(await screen.findByRole("heading", { name: "품목 유형·고정 템플릿·포도 품종" })).toBeInTheDocument();
    expect(screen.getByLabelText("공통 유형 검색")).toBeInTheDocument();
  });

  it("preserves item type search, selection, and draft labels during resize", async () => {
    const user = userEvent.setup();
    window.history.pushState(null, "", "/system/item-types");
    setViewport(1440, 900);
    render(<AdminApp />);

    await screen.findByRole("heading", { name: "품목 유형·고정 템플릿·포도 품종" });
    await user.type(screen.getByLabelText("공통 유형 검색"), "와");
    await user.clear(screen.getByLabelText("공통 유형 가격 라벨 1"));
    await user.type(screen.getByLabelText("공통 유형 가격 라벨 1"), "잔");

    setViewport(390, 844);

    expect(window.location.pathname).toBe("/system/item-types");
    expect(screen.getByLabelText("공통 유형 검색")).toHaveValue("와");
    expect(screen.getByLabelText("공통 유형 가격 라벨 1")).toHaveValue("잔");
    expect(screen.getByText("선택: 와인")).toBeInTheDocument();
  });

  it.each(viewports)("renders the same badges URL at $label", async ({ width, height }) => {
    window.history.pushState(null, "", "/system/badges");
    setViewport(width, height);

    render(<AdminApp />);

    expect(window.location.pathname).toBe("/system/badges");
    expect(await screen.findByRole("heading", { name: "배지·색상 관리" })).toBeInTheDocument();
    expect(screen.getByLabelText("공통 배지 검색")).toBeInTheDocument();
    expect(screen.getByLabelText("바 선택")).toBeInTheDocument();
  });

  it("preserves badge tab, bar selection, and color draft during resize", async () => {
    const user = userEvent.setup();
    window.history.pushState(null, "", "/system/badges");
    setViewport(1440, 900);
    render(<AdminApp />);

    await screen.findByRole("heading", { name: "배지·색상 관리" });
    await user.type(screen.getByLabelText("공통 배지 검색"), "추");
    await user.click(screen.getByRole("button", { name: "허용 색상" }));
    await user.clear(screen.getByLabelText("색상 HEX"));
    await user.type(screen.getByLabelText("색상 HEX"), "#123456");

    setViewport(390, 844);

    expect(window.location.pathname).toBe("/system/badges");
    expect(screen.getByRole("button", { name: "허용 색상" })).toHaveClass("is-active");
    expect(screen.getByLabelText("색상 HEX")).toHaveValue("#123456");
    await user.click(screen.getByRole("button", { name: "배지" }));
    expect(screen.getByLabelText("공통 배지 검색")).toHaveValue("추");
    expect(screen.getByLabelText("바 선택")).toHaveValue("bar-1");
  });

  it.each(viewports)("renders the same categories URL at $label", async ({ width, height }) => {
    window.history.pushState(null, "", "/bars/bar-1/categories");
    setViewport(width, height);

    render(<AdminApp />);

    expect(window.location.pathname).toBe("/bars/bar-1/categories");
    expect(await screen.findByRole("heading", { name: "카테고리 관리" })).toBeInTheDocument();
    expect(screen.getByLabelText("카테고리 검색")).toBeInTheDocument();
    expect(screen.getByLabelText("카테고리 이름")).toBeInTheDocument();
  });

  it("preserves category search, selection, and draft during resize", async () => {
    const user = userEvent.setup();
    window.history.pushState(null, "", "/bars/bar-1/categories");
    setViewport(1440, 900);
    render(<AdminApp />);

    await screen.findByRole("heading", { name: "카테고리 관리" });
    await user.type(screen.getByLabelText("카테고리 검색"), "싱");
    const singleMaltButton = screen.getAllByRole("button", { name: /싱글몰트/ })[0];
    expect(singleMaltButton).toBeDefined();
    await user.click(singleMaltButton as HTMLElement);
    await user.clear(screen.getByLabelText("카테고리 이름"));
    await user.type(screen.getByLabelText("카테고리 이름"), "싱글몰트 수정");

    setViewport(390, 844);

    expect(window.location.pathname).toBe("/bars/bar-1/categories");
    expect(screen.getByLabelText("카테고리 검색")).toHaveValue("싱");
    expect(screen.getByLabelText("카테고리 이름")).toHaveValue("싱글몰트 수정");
    expect(screen.getAllByRole("button", { name: /싱글몰트/ })[0]).toBeInTheDocument();
  });

  it.each(viewports)("renders the same menus URL at $label", async ({ width, height }) => {
    window.history.pushState(null, "", "/bars/bar-1/menus");
    setViewport(width, height);

    render(<AdminApp />);

    expect(window.location.pathname).toBe("/bars/bar-1/menus");
    expect(await screen.findByRole("heading", { name: "메뉴 관리" })).toBeInTheDocument();
    expect(screen.getByLabelText("메뉴 검색")).toBeInTheDocument();
    expect(screen.getByLabelText("카테고리 선택")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /전체 메뉴/ })).toBeInTheDocument();
  });

  it("preserves menu filters during resize", async () => {
    const user = userEvent.setup();
    window.history.pushState(null, "", "/bars/bar-1/menus");
    setViewport(1440, 900);
    render(<AdminApp />);

    await screen.findByRole("heading", { name: "메뉴 관리" });
    await user.type(screen.getByLabelText("메뉴 검색"), "네");
    await user.selectOptions(screen.getByLabelText("판매 상태 필터"), "available");

    setViewport(390, 844);

    expect(window.location.pathname).toBe("/bars/bar-1/menus");
    expect(screen.getByLabelText("메뉴 검색")).toHaveValue("네");
    expect(screen.getByLabelText("판매 상태 필터")).toHaveValue("available");
  });

  it("preserves D12 menu filters, selection, and unsaved bulk drafts during resize", async () => {
    const user = userEvent.setup();
    window.history.pushState(null, "", "/bars/bar-1/menus");
    setViewport(1440, 900);
    render(<AdminApp />);

    await screen.findByRole("heading", { name: "메뉴 관리" });
    await user.type(screen.getByLabelText("메뉴 검색"), "맥");
    await user.selectOptions(screen.getByLabelText("품목 유형 필터"), "system:system-type-whisky");
    await user.selectOptions(screen.getByLabelText("배지 필터"), "system:system-badge-recommended");
    await user.selectOptions(screen.getAllByLabelText("맥캘란 12 판매 상태 빠른 변경")[0] as HTMLElement, "sold_out");
    await user.selectOptions(screen.getAllByLabelText("맥캘란 12 카테고리 빠른 변경")[0] as HTMLElement, "category-cocktail");

    setViewport(390, 844);

    expect(window.location.pathname).toBe("/bars/bar-1/menus");
    expect(screen.getByLabelText("메뉴 검색")).toHaveValue("맥");
    expect(screen.getByLabelText("품목 유형 필터")).toHaveValue("system:system-type-whisky");
    expect(screen.getByLabelText("배지 필터")).toHaveValue("system:system-badge-recommended");
    expect(
      screen
        .getAllByLabelText("맥캘란 12 판매 상태 빠른 변경")
        .some((select) => select instanceof HTMLSelectElement && select.value === "sold_out")
    ).toBe(true);
    expect(screen.getAllByText(/미저장 1개/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "목록 변경 저장" })).toBeEnabled();
  });

  it.each(viewports)("renders the same preview URL at $label", async ({ width, height }) => {
    window.history.pushState(null, "", "/bars/bar-1/preview");
    setViewport(width, height);

    render(<AdminApp />);

    expect(window.location.pathname).toBe("/bars/bar-1/preview");
    expect(await screen.findByRole("heading", { name: "메뉴판 미리보기" })).toBeInTheDocument();
    expect(screen.getByLabelText("미리보기 범위")).toBeInTheDocument();
    expect(screen.getByText("검증 통과")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "실제 고객 레이아웃" })).toBeInTheDocument();
    expect(screen.getByText("맥캘란 12")).toBeInTheDocument();
  });

  it("preserves preview scope, search, and shell bar selection during resize", async () => {
    const user = userEvent.setup();
    window.history.pushState(null, "", "/bars/bar-1/preview");
    setViewport(1440, 900);
    render(<AdminApp />);

    await screen.findByRole("heading", { name: "메뉴판 미리보기" });
    await user.selectOptions(screen.getByLabelText("미리보기 범위"), "menu_1");
    await user.type(screen.getByLabelText("고객 메뉴 검색"), "맥");
    await user.selectOptions(screen.getByLabelText("현재 작업 바"), "bar-1");

    setViewport(390, 844);

    expect(window.location.pathname).toBe("/bars/bar-1/preview");
    expect(screen.getByLabelText("미리보기 범위")).toHaveValue("menu_1");
    expect(screen.getByLabelText("고객 메뉴 검색")).toHaveValue("맥");
    expect(screen.getByLabelText("현재 작업 바")).toHaveValue("bar-1");
    expect(screen.getByText("맥캘란 12")).toBeInTheDocument();
  });

  it.each(viewports)("renders the same publications URL at $label", async ({ width, height }) => {
    window.history.pushState(null, "", "/bars/bar-1/publications");
    setViewport(width, height);

    render(<AdminApp />);

    expect(window.location.pathname).toBe("/bars/bar-1/publications");
    expect(await screen.findByRole("heading", { name: "발행·배포 상태" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "현재 저장본 발행" })).toBeInTheDocument();
    expect(screen.getByText("public/menus/YmFyLWE3azJtOQ.json")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "발행 요청" })).toBeInTheDocument();
  });

  it("preserves publication confirmation and selected history during resize", async () => {
    const user = userEvent.setup();
    window.history.pushState(null, "", "/bars/bar-1/publications");
    setViewport(1440, 900);
    render(<AdminApp />);

    await screen.findByRole("heading", { name: "발행·배포 상태" });
    await user.click(screen.getAllByRole("button", { name: "보기" })[1] as HTMLElement);
    await user.click(screen.getByRole("button", { name: "발행 시작" }));

    setViewport(390, 844);

    expect(window.location.pathname).toBe("/bars/bar-1/publications");
    expect(screen.getByRole("heading", { name: "저장된 메뉴판을 발행할까요?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "확인 후 발행" })).toBeInTheDocument();
    expect(screen.getAllByText("공개 1").length).toBeGreaterThan(0);
  });

  it.each(viewports)("renders the same menu editor URL at $label", async ({ width, height }) => {
    window.history.pushState(null, "", "/bars/bar-1/menus/menu-1");
    setViewport(width, height);

    render(<AdminApp />);

    expect(window.location.pathname).toBe("/bars/bar-1/menus/menu-1");
    expect(await screen.findByRole("heading", { name: "메뉴 기본 정보" })).toBeInTheDocument();
    expect(screen.getByLabelText("메뉴 이름")).toBeInTheDocument();
    expect(screen.getByLabelText("메뉴 카테고리")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "가격" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "상세 정보" })).toBeInTheDocument();
    expect(screen.getByLabelText("가격 금액 1")).toBeInTheDocument();
  });

  it("preserves menu editor draft during resize", async () => {
    const user = userEvent.setup();
    window.history.pushState(null, "", "/bars/bar-1/menus/menu-1");
    setViewport(1440, 900);
    render(<AdminApp />);

    await screen.findByRole("heading", { name: "메뉴 기본 정보" });
    await user.clear(screen.getByLabelText("메뉴 이름"));
    await user.type(screen.getByLabelText("메뉴 이름"), "맥캘란 12 수정");
    await user.clear(screen.getByLabelText("ABV"));
    await user.type(screen.getByLabelText("ABV"), "43");
    await user.click(screen.getByLabelText("메뉴 노출"));
    await user.clear(screen.getByLabelText("가격 금액 1"));
    await user.type(screen.getByLabelText("가격 금액 1"), "22000");
    await user.clear(screen.getByLabelText("브랜드·증류소"));
    await user.type(screen.getByLabelText("브랜드·증류소"), "Macallan Estate");
    await user.clear(screen.getByLabelText("내부 메모 입력"));
    await user.type(screen.getByLabelText("내부 메모 입력"), "resize memo");

    setViewport(390, 844);

    expect(window.location.pathname).toBe("/bars/bar-1/menus/menu-1");
    expect(screen.getByLabelText("메뉴 이름")).toHaveValue("맥캘란 12 수정");
    expect(screen.getByLabelText("ABV")).toHaveValue("43");
    expect(screen.getByLabelText("메뉴 노출")).not.toBeChecked();
    expect(screen.getByLabelText("가격 금액 1")).toHaveValue("22000");
    expect(screen.getByLabelText("브랜드·증류소")).toHaveValue("Macallan Estate");
    expect(screen.getByLabelText("내부 메모 입력")).toHaveValue("resize memo");
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function sessionEnvelope() {
  return {
    data: {
      user: {
        id: "user-admin",
        username: "admin1",
        role: "system-admin",
        forcedPasswordChange: false
      },
      csrfToken: "csrf-test"
    },
    meta: { requestId: "req-session" }
  };
}

function barListEnvelope() {
  return {
    data: {
      summary: { totalBars: 2, activeBars: 2, inactiveBars: 0 },
      items: [
        {
          id: "bar-1",
          name: "Sample Bar",
          slug: "bar-a7k2m9",
          encodedSlug: "YmFyLWE3azJtOQ",
          customerPath: "/YmFyLWE3azJtOQ",
          status: "active",
          currency: "KRW",
          publicMenuStatus: "preparing",
          directPublishEnabled: false,
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z"
        },
        {
          id: "bar-2",
          name: "Cigar Room",
          slug: "bar-f9q2x1",
          encodedSlug: "YmFyLWY5cTJ4MQ",
          customerPath: "/YmFyLWY5cTJ4MQ",
          status: "active",
          currency: "KRW",
          publicMenuStatus: "preparing",
          directPublishEnabled: false,
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z"
        }
      ]
    },
    meta: { requestId: "test-request" }
  };
}

function dashboardEnvelope() {
  return {
    data: {
      actor: {
        id: "user-admin",
        username: "admin1",
        isSystemAdmin: true,
        forcedPasswordChange: false
      },
      mode: "system-admin",
      selectedBarId: "bar-1",
      accessibleBars: [
        { id: "bar-1", name: "Sample Bar", role: "system-admin", status: "active", directPublishEnabled: false, href: "/bars/bar-1" },
        { id: "bar-2", name: "Cigar Room", role: "system-admin", status: "active", directPublishEnabled: false, href: "/bars/bar-2" }
      ],
      metrics: [],
      quickActions: [],
      activities: [],
      emptyState: null
    },
    meta: { requestId: "test-request" }
  };
}

function auditEnvelope() {
  return {
    data: {
      items: [
        auditItem("audit-1", "publication.requested", "admin1", "Sample Bar", "Sample Bar 공개 12", "success", "req-pub-001"),
        auditItem("audit-2", "order_tab.settled", "manager1", "Sample Bar", "테이블 4 정산", "success", "req-order-001"),
        auditItem("audit-3", "user.unlocked", "admin1", "", "staff1", "success", "req-user-001"),
        auditItem("audit-4", "publication.requested", "admin1", "Sample Bar", "Cloudflare 확인 필요", "failure", "req-pub-002", "PUBLICATION_TIMEOUT_UNKNOWN")
      ],
      summary: { total: 4, success: 3, failure: 1 },
      filters: {
        actors: [
          { value: "user-admin", label: "admin1" },
          { value: "user-manager", label: "manager1" }
        ],
        bars: [{ value: "bar-1", label: "Sample Bar" }],
        operations: [
          { value: "publication.requested", label: "발행 요청" },
          { value: "order_tab.settled", label: "주문 정산" },
          { value: "user.unlocked", label: "사용자 잠금 해제" }
        ],
        results: [
          { value: "success", label: "성공" },
          { value: "failure", label: "실패" }
        ]
      },
      maintenance: {
        policy: {
          closedCancelledOrderDays: 365,
          dailySummaryYears: 3,
          publicationSuccessLimit: 100,
          publicationFailureLimit: 100
        },
        lastRun: null,
        preview: {
          orderTerminalCutoff: "2025-06-23T00:00:00.000Z",
          dailySummaryCutoffDate: "2023-06-23",
          closedCancelledOrderTabs: 2,
          dailyOrderSummaries: 1,
          publicationHistoryOverflow: 0
        }
      }
    },
    meta: { requestId: "test-request" }
  };
}

function pilotReadinessEnvelope() {
  return {
    data: {
      generatedAt: "2026-06-24T00:00:00.000Z",
      overallStatus: "ready_for_pilot",
      humanApprovalRequired: true,
      pilotBars: [
        {
          id: "bar-1",
          name: "Sample Bar",
          status: "active",
          encodedSlug: "YmFyLTE",
          roleCoverage: { owner: true, manager: true, staff: true },
          categoryCount: 5,
          menuItemCount: 6,
          visibleMenuItemCount: 6,
          representativeTemplates: ["wine", "whisky", "cocktail", "food", "cigar"],
          orderSummary: { total: 3, open: 1, checkoutRequested: 1, closed: 1, cancelled: 0, activeTotalAmountMinor: 30000 },
          latestSuccessfulPublicationAt: null,
          lastPublicationStatus: null
        },
        {
          id: "bar-2",
          name: "Cigar Room",
          status: "active",
          encodedSlug: "YmFyLTI",
          roleCoverage: { owner: true, manager: true, staff: true },
          categoryCount: 1,
          menuItemCount: 1,
          visibleMenuItemCount: 1,
          representativeTemplates: ["cigar"],
          orderSummary: { total: 0, open: 0, checkoutRequested: 0, closed: 0, cancelled: 0, activeTotalAmountMinor: 0 },
          latestSuccessfulPublicationAt: null,
          lastPublicationStatus: null
        }
      ],
      sections: [
        {
          id: "pilot-data",
          label: "파일럿 데이터",
          status: "manual_required",
          checks: [
            {
              id: "two-bars",
              label: "테스트 바와 실제 바 등록 절차",
              status: "pass",
              owner: "시스템 관리자",
              evidence: "2개 활성 바가 준비되었습니다.",
              runbookHref: "docs/operations/pilot-runbook.md#pilot-data"
            },
            {
              id: "human-production-approval",
              label: "사람의 운영 배포 승인",
              status: "manual_required",
              owner: "오너",
              evidence: "Codex는 운영 배포를 수행하지 않고 승인 전 대기합니다.",
              runbookHref: "docs/operations/pilot-runbook.md#release-gate"
            }
          ]
        }
      ],
      runbooks: [
        { id: "pilot-runbook", label: "파일럿 운영 runbook", href: "docs/operations/pilot-runbook.md" },
        { id: "operator-training", label: "운영자 교육 문서", href: "docs/operations/operator-training.md" },
        { id: "pilot-feedback", label: "파일럿 피드백·backlog", href: "docs/operations/pilot-feedback.md" }
      ]
    },
    meta: { requestId: "test-request" }
  };
}

function auditItem(
  id: string,
  operation: string,
  actorUsername: string,
  barName: string,
  targetLabel: string,
  result: "success" | "failure",
  requestId: string,
  errorCode: string | null = null
) {
  return {
    id,
    occurredAt: "2026-06-23T00:00:00.000Z",
    requestId,
    actorUserId: actorUsername ? `user-${actorUsername.replace(/\d+$/, "")}` : null,
    actorUsername,
    barId: barName ? "bar-1" : null,
    barName,
    operation,
    result,
    targetType: operation.startsWith("order") ? "order_tab" : "target",
    targetId: id,
    targetLabel,
    errorCode,
    externalRef: null,
    metadata: { method: "POST", status: result === "success" ? 200 : 409, path: "/fixture" }
  };
}

function maintenanceRunEnvelope() {
  return {
    data: {
      run: {
        id: "maintenance-1",
        startedAt: "2026-06-23T00:00:00.000Z",
        finishedAt: "2026-06-23T00:00:01.000Z",
        actorUserId: "user-admin",
        actorUsername: "admin1",
        requestId: "req-maintenance-001",
        status: "dry_run",
        operation: "retention_cleanup",
        dryRun: true,
        result: {
          orderTerminalCutoff: "2025-06-23T00:00:00.000Z",
          dailySummaryCutoffDate: "2023-06-23",
          closedCancelledOrderTabs: 2,
          dailyOrderSummaries: 1,
          publicationHistoryOverflow: 0
        },
        errorCode: null,
        errorMessage: null
      },
      deleted: {
        orderTerminalCutoff: "2025-06-23T00:00:00.000Z",
        dailySummaryCutoffDate: "2023-06-23",
        closedCancelledOrderTabs: 2,
        dailyOrderSummaries: 1,
        publicationHistoryOverflow: 0
      }
    },
    meta: { requestId: "test-request" }
  };
}

function publicationsEnvelope() {
  return {
    data: {
      bar: {
        id: "bar-1",
        name: "Sample Bar",
        encodedSlug: "YmFyLWE3azJtOQ",
        customerPath: "/YmFyLWE3azJtOQ",
        directPublishEnabled: false
      },
      canPublish: true,
      current: {
        contentHash: "2222222222222222222222222222222222222222222222222222222222222222",
        schemaVersion: 1,
        menuPath: "public/menus/YmFyLWE3azJtOQ.json",
        triggerPath: "public/publish-triggers/YmFyLWE3azJtOQ.json",
        savedOnlyNotice: "저장된 메뉴와 설정만 발행됩니다. 현재 화면의 미저장 변경은 포함되지 않습니다."
      },
      latestSuccess: publicationSummary("pub-2", 2, "trigger", "fake-commit-0002", "success"),
      publications: [
        publicationSummary("pub-2", 2, "trigger", "fake-commit-0002", "success"),
        publicationSummary("pub-1", 1, "menu_json", "fake-commit-0001", "success")
      ],
      polling: { active: false, intervalMs: 30000, timeoutSeconds: 180 },
      editDiff: {
        hasUnpublishedChanges: false,
        latestContentHash: "2".repeat(64),
        currentContentHash: "2".repeat(64)
      }
    },
    meta: { requestId: "test-request" }
  };
}

function publicationSummary(
  id: string,
  revision: number,
  operation: "menu_json" | "trigger",
  commitSha: string,
  status: "success" | "failed"
) {
  return {
    id,
    barId: "bar-1",
    status,
    operation,
    revision,
    contentHash: `${revision}`.repeat(64),
    menuPath: "public/menus/YmFyLWE3azJtOQ.json",
    triggerPath: "public/publish-triggers/YmFyLWE3azJtOQ.json",
    publishedAt: "2026-06-23T00:00:00.000Z",
    commitSha,
    deployment: {
      adapter: "fake-cloudflare",
      deploymentId: `deploy-${id}`,
      status: "success",
      sourceCommitSha: commitSha,
      deploymentUrl: `https://fake-cloudflare.example.test/${id}`,
      startedAt: "2026-06-23T00:00:00.000Z",
      checkedAt: "2026-06-23T00:00:00.000Z",
      completedAt: "2026-06-23T00:00:00.000Z",
      skippedExternalRead: true
    },
    createdAt: "2026-06-23T00:00:00.000Z",
    completedAt: "2026-06-23T00:00:00.000Z",
    error: null,
    steps: [
      { id: "building_json", label: "저장 데이터 수집", status: "completed", at: "2026-06-23T00:00:00.000Z" },
      { id: "validating_json", label: "공개 데이터 검증", status: "completed", at: "2026-06-23T00:00:00.000Z" },
      { id: "committing_github", label: "고객 메뉴판 반영", status: "completed", at: "2026-06-23T00:00:00.000Z" },
      { id: "waiting_cloudflare", label: "고객 화면 배포 확인", status: "completed", at: "2026-06-23T00:00:00.000Z" },
      { id: "completed", label: "배포 상태 기록", status: "completed", at: "2026-06-23T00:00:00.000Z" }
    ]
  };
}

function previewEnvelope() {
  return {
    data: {
      bar: {
        id: "bar-1",
        name: "Sample Bar",
        encodedSlug: "YmFyLWE3azJtOQ",
        customerPath: "/YmFyLWE3azJtOQ"
      },
      menu: {
        schemaVersion: 1,
        status: "preparing",
        layout: { concept: "menu_book" },
        revision: 0,
        publishedAt: null,
        generatedAt: "2026-06-23T00:00:00.000Z",
        contentHash: "0000000000000000000000000000000000000000000000000000000000000000",
        encodedSlug: "YmFyLWE3azJtOQ",
        bar: {
          name: "Sample Bar",
          intro: "재즈와 싱글몰트를 위한 바",
          currency: "KRW",
          address: "서울시 마포구 와우산로 00",
          phoneNumberDisplay: "02-1234-5678",
          openingNote: "공휴일은 인스타그램 공지를 확인하세요.",
          businessHours: [],
          links: [{ label: "Instagram", url: "https://instagram.example.test/sample" }]
        },
        categories: [
          {
            id: "cat_1",
            name: "추천",
            description: "Sample Bar 추천 메뉴",
            items: [
              {
                id: "menu_1",
                name: "맥캘란 12",
                description: "셰리 오크",
                soldOut: false,
                abv: 40,
                prices: [{ label: "샷", volumeText: "30ml", amountMinor: 18000, currency: "KRW" }],
                badges: [{ label: "추천", backgroundHex: "#725A3D", textColor: "#FFFFFF" }],
                fields: [{ label: "브랜드", value: "Macallan" }]
              },
              {
                id: "menu_2",
                name: "네그로니",
                description: "비터 칵테일",
                soldOut: true,
                abv: null,
                prices: [],
                badges: [],
                fields: []
              }
            ],
            children: []
          },
          {
            id: "cat_2",
            name: "빈 카테고리",
            items: [],
            children: []
          }
        ]
      },
      scopeOptions: [
        { id: "all", label: "전체 메뉴판", type: "all" },
        { id: "cat_1", label: "카테고리: 추천", type: "category" },
        { id: "menu_1", label: "메뉴: 맥캘란 12", type: "menu", categoryId: "cat_1" }
      ],
      schema: { valid: true, schemaVersion: 1 },
      hash: {
        contentHash: "0000000000000000000000000000000000000000000000000000000000000000",
        canonicalJson: "{\"schemaVersion\":1}"
      }
    },
    meta: { requestId: "test-request" }
  };
}

function systemUserListEnvelope() {
  return {
    data: {
      summary: {
        totalUsers: 2,
        activeUsers: 2,
        inactiveUsers: 0,
        lockedUsers: 0,
        forcedPasswordUsers: 1
      },
      pagination: {
        page: 1,
        pageSize: 50,
        totalItems: 2,
        totalPages: 1
      },
      items: [
        {
          id: "user-1",
          username: "owner01",
          isSystemAdmin: false,
          status: "active",
          isActive: true,
          isLocked: false,
          forcedPasswordChange: true,
          lockedUntil: null,
          lastLoginAt: null,
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z",
          membershipsLabel: "소속 바 배정 대기"
        },
        {
          id: "user-2",
          username: "manager01",
          isSystemAdmin: false,
          status: "active",
          isActive: true,
          isLocked: false,
          forcedPasswordChange: false,
          lockedUntil: null,
          lastLoginAt: "2026-06-23T00:10:00.000Z",
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z",
          membershipsLabel: "소속 바 배정 대기"
        }
      ]
    },
    meta: { requestId: "test-request" }
  };
}

function barMembersEnvelope() {
  return {
    data: {
      bar: {
        id: "bar-1",
        name: "Sample Bar",
        status: "active"
      },
      members: [
        {
          id: "membership-1",
          barId: "bar-1",
          userId: "user-1",
          username: "owner01",
          role: "owner",
          isActive: true,
          userIsActive: true,
          joinedAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z"
        },
        {
          id: "membership-2",
          barId: "bar-1",
          userId: "user-2",
          username: "manager01",
          role: "staff",
          isActive: true,
          userIsActive: true,
          joinedAt: "2026-06-23T00:05:00.000Z",
          updatedAt: "2026-06-23T00:05:00.000Z"
        }
      ],
      rolePermissions: [
        {
          role: "owner",
          canEditMenu: true,
          canManageOrders: true,
          canAddCustomOrderItem: true,
          canApplyOrderAdjustment: true
        },
        {
          role: "manager",
          canEditMenu: true,
          canManageOrders: true,
          canAddCustomOrderItem: true,
          canApplyOrderAdjustment: true
        },
        {
          role: "staff",
          canEditMenu: false,
          canManageOrders: true,
          canAddCustomOrderItem: false,
          canApplyOrderAdjustment: false
        }
      ],
      availableUsers: [
        {
          id: "user-3",
          username: "staff01",
          status: "active",
          isActive: true,
          alreadyMember: false
        }
      ]
    },
    meta: { requestId: "test-request" }
  };
}

function itemTypesEnvelope() {
  return {
    data: {
      isSystemAdmin: true,
      templates: [
        { value: "general", label: "일반", fields: [] },
        { value: "wine", label: "와인", fields: ["생산자", "국가", "포도 품종"] },
        { value: "whisky", label: "위스키", fields: ["증류소", "지역", "숙성"] },
        { value: "spirit", label: "일반 증류주", fields: ["브랜드", "세부 유형"] },
        { value: "beer", label: "맥주", fields: ["브루어리", "스타일"] },
        { value: "cocktail", label: "칵테일", fields: ["베이스", "재료"] },
        { value: "food", label: "푸드·디저트", fields: ["주요 재료", "알레르기"] },
        { value: "cigar", label: "시가", fields: ["브랜드", "비톨라"] }
      ],
      systemTypes: [
        {
          id: "system-type-wine",
          name: "와인",
          normalizedName: "와인",
          template: "wine",
          defaultPriceLabels: ["글라스", "보틀"],
          isActive: true,
          usageCount: 0,
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z"
        },
        {
          id: "system-type-whisky",
          name: "위스키",
          normalizedName: "위스키",
          template: "whisky",
          defaultPriceLabels: ["샷", "보틀"],
          isActive: true,
          usageCount: 0,
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z"
        }
      ],
      accessibleBars: [{ id: "bar-1", name: "Sample Bar", role: "system-admin", status: "active" }]
    },
    meta: { requestId: "test-request" }
  };
}

function barItemTypesEnvelope() {
  return {
    data: {
      bar: { id: "bar-1", name: "Sample Bar" },
      templates: itemTypesEnvelope().data.templates,
      systemTypes: itemTypesEnvelope().data.systemTypes,
      overrides: [
        {
          barId: "bar-1",
          systemItemTypeId: "system-type-wine",
          isHidden: false,
          defaultPriceLabels: ["잔", "병"],
          updatedAt: "2026-06-23T00:00:00.000Z"
        }
      ],
      barTypes: [
        {
          id: "bar-type-food",
          barId: "bar-1",
          name: "하우스 푸드",
          normalizedName: "하우스 푸드",
          template: "food",
          defaultPriceLabels: ["접시"],
          isActive: true,
          usageCount: 0,
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z"
        }
      ]
    },
    meta: { requestId: "test-request" }
  };
}

function badgesEnvelope() {
  return {
    data: {
      colors: [
        {
          id: "badge-color-warm-brown",
          name: "Warm Brown",
          normalizedName: "warm brown",
          backgroundHex: "#725A3D",
          textColor: "#FFFFFF",
          isActive: true,
          usageCount: 1,
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z"
        },
        {
          id: "badge-color-forest",
          name: "Forest",
          normalizedName: "forest",
          backgroundHex: "#355B47",
          textColor: "#FFFFFF",
          isActive: true,
          usageCount: 1,
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z"
        }
      ],
      systemBadges: [
        {
          id: "system-badge-recommended",
          name: "추천",
          normalizedName: "추천",
          color: {
            id: "badge-color-warm-brown",
            name: "Warm Brown",
            backgroundHex: "#725A3D",
            textColor: "#FFFFFF",
            isActive: true
          },
          isActive: true,
          usageCount: 0,
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z"
        }
      ],
      accessibleBars: [{ id: "bar-1", name: "Sample Bar", role: "system-admin", status: "active" }]
    },
    meta: { requestId: "test-request" }
  };
}

function barBadgesEnvelope() {
  return {
    data: {
      bar: { id: "bar-1", name: "Sample Bar" },
      colors: badgesEnvelope().data.colors,
      systemBadges: [
        {
          ...badgesEnvelope().data.systemBadges[0],
          isHiddenForBar: false
        }
      ],
      barBadges: [
        {
          id: "bar-badge-today",
          barId: "bar-1",
          name: "오늘의 픽",
          normalizedName: "오늘의 픽",
          color: {
            id: "badge-color-forest",
            name: "Forest",
            backgroundHex: "#355B47",
            textColor: "#FFFFFF",
            isActive: true
          },
          isActive: true,
          usageCount: 0,
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z"
        }
      ]
    },
    meta: { requestId: "test-request" }
  };
}

function categoriesEnvelope() {
  return {
    data: {
      bar: { id: "bar-1", name: "Sample Bar" },
      categories: [
        {
          id: "category-whisky",
          barId: "bar-1",
          publicId: "cat_1",
          parentId: null,
          name: "위스키",
          normalizedName: "위스키",
          description: "위스키 상위 카테고리",
          showDescription: false,
          isVisible: true,
          sortOrder: 0,
          childCount: 2,
          menuCount: 0,
          updatedByUsername: "admin1",
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z"
        },
        {
          id: "category-single-malt",
          barId: "bar-1",
          publicId: "cat_2",
          parentId: "category-whisky",
          name: "싱글몰트",
          normalizedName: "싱글몰트",
          description: "",
          showDescription: false,
          isVisible: true,
          sortOrder: 0,
          childCount: 0,
          menuCount: 0,
          updatedByUsername: "admin1",
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z"
        },
        {
          id: "category-bourbon",
          barId: "bar-1",
          publicId: "cat_3",
          parentId: "category-whisky",
          name: "버번",
          normalizedName: "버번",
          description: "",
          showDescription: false,
          isVisible: false,
          sortOrder: 1,
          childCount: 0,
          menuCount: 0,
          updatedByUsername: "admin1",
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z"
        },
        {
          id: "category-cocktail",
          barId: "bar-1",
          publicId: "cat_4",
          parentId: null,
          name: "칵테일",
          normalizedName: "칵테일",
          description: "",
          showDescription: false,
          isVisible: true,
          sortOrder: 1,
          childCount: 0,
          menuCount: 0,
          updatedByUsername: "admin1",
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z"
        }
      ]
    },
    meta: { requestId: "test-request" }
  };
}

function menuItemsEnvelope() {
  return {
    data: {
      bar: { id: "bar-1", name: "Sample Bar" },
      canEdit: true,
      canEditInternalMemo: true,
      categories: [
        { id: "category-whisky", parentId: null, name: "위스키", path: "위스키", isLeaf: false, isVisible: true },
        {
          id: "category-single-malt",
          parentId: "category-whisky",
          name: "싱글몰트",
          path: "위스키 / 싱글몰트",
          isLeaf: true,
          isVisible: true
        },
        { id: "category-cocktail", parentId: null, name: "칵테일", path: "칵테일", isLeaf: true, isVisible: true }
      ],
      itemTypes: [
        {
          source: "system",
          id: "system-type-whisky",
          name: "위스키",
          template: "whisky",
          defaultPriceLabels: ["샷", "보틀"]
        },
        {
          source: "system",
          id: "system-type-cocktail",
          name: "칵테일",
          template: "cocktail",
          defaultPriceLabels: ["잔"]
        }
      ],
      badgeOptions: [
        {
          source: "system",
          id: "system-badge-recommended",
          name: "추천",
          color: {
            id: "badge-color-warm-brown",
            name: "Warm Brown",
            backgroundHex: "#725A3D",
            textColor: "#FFFFFF",
            isActive: true
          }
        },
        {
          source: "bar",
          id: "bar-badge-house",
          name: "하우스 픽",
          color: {
            id: "badge-color-forest",
            name: "Forest",
            backgroundHex: "#355B47",
            textColor: "#FFFFFF",
            isActive: true
          }
        }
      ],
      items: [
        {
          id: "menu-1",
          barId: "bar-1",
          publicId: "menu_1",
          categoryId: "category-single-malt",
          categoryPath: "위스키 / 싱글몰트",
          name: "맥캘란 12",
          normalizedName: "맥캘란 12",
          description: "셰리 캐스크",
          saleStatus: "available",
          isVisible: true,
          abv: 40,
          itemType: {
            source: "system",
            id: "system-type-whisky",
            name: "위스키",
            template: "whisky",
            defaultPriceLabels: ["샷", "보틀"]
          },
          prices: [
            { id: "price-1", label: "샷", normalizedLabel: "샷", volumeText: "30ml", amountMinor: 18000, displayOrder: 0 },
            { id: "price-2", label: "보틀", normalizedLabel: "보틀", volumeText: "700ml", amountMinor: 280000, displayOrder: 1 }
          ],
          badges: [
            {
              source: "system",
              id: "system-badge-recommended",
              name: "추천",
              color: {
                id: "badge-color-warm-brown",
                name: "Warm Brown",
                backgroundHex: "#725A3D",
                textColor: "#FFFFFF",
                isActive: true
              },
              displayOrder: 0
            }
          ],
          sortOrder: 0,
          updatedByUsername: "admin1",
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z"
        },
        {
          id: "menu-2",
          barId: "bar-1",
          publicId: "menu_2",
          categoryId: "category-cocktail",
          categoryPath: "칵테일",
          name: "네그로니",
          normalizedName: "네그로니",
          description: "진, 캄파리, 베르무트",
          saleStatus: "available",
          isVisible: false,
          abv: null,
          itemType: {
            source: "system",
            id: "system-type-cocktail",
            name: "칵테일",
            template: "cocktail",
            defaultPriceLabels: ["잔"]
          },
          prices: [{ id: "price-3", label: "잔", normalizedLabel: "잔", volumeText: "", amountMinor: 15000, displayOrder: 0 }],
          badges: [],
          sortOrder: 0,
          updatedByUsername: "admin1",
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z"
        }
      ]
    },
    meta: { requestId: "test-request" }
  };
}

function menuItemDetailEnvelope() {
  const envelope = menuItemsEnvelope();
  return {
    data: {
      ...envelope.data,
      item: {
        ...envelope.data.items[0],
        details: {
          template: "whisky",
          brand: "Macallan",
          country: "Scotland",
          region: "Speyside",
          classification: "Single Malt",
          ageStatement: "12Y",
          caskFinish: "Sherry",
          vintageOrDistilledYear: "",
          singleCask: false,
          caskStrength: false,
          nonChillFiltered: false
        },
        internalMemo: "owner memo",
        canEditInternalMemo: true
      }
    },
    meta: envelope.meta
  };
}

function grapeVarietiesEnvelope() {
  return {
    data: {
      varieties: [{ id: "grape-pinot", name: "피노 누아", normalizedName: "피노 누아", createdAt: "2026-06-23T00:00:00.000Z" }]
    },
    meta: { requestId: "test-request" }
  };
}

function grapeCandidatesEnvelope() {
  return {
    data: {
      candidates: [
        {
          id: "candidate-1",
          barId: "bar-1",
          proposedName: "가메",
          normalizedProposedName: "가메",
          status: "pending",
          standardName: null,
          submittedByUsername: "manager01",
          reviewedByUsername: null,
          rejectionReason: null,
          createdAt: "2026-06-23T00:20:00.000Z",
          reviewedAt: null
        }
      ]
    },
    meta: { requestId: "test-request" }
  };
}

function currentPermissionsEnvelope() {
  return {
    data: {
      barId: "bar-1",
      role: "system-admin",
      permissions: {
        canEditMenu: true,
        canManageOrders: true,
        canAddCustomOrderItem: true,
        canApplyOrderAdjustment: true
      },
      allowed: true
    },
    meta: { requestId: "test-request" }
  };
}

function barSettingsEnvelope() {
  return {
    data: {
      bar: {
        id: "bar-1",
        slug: "bar-a7k2m9",
        encodedSlug: "YmFyLWE3azJtOQ",
        customerPath: "/YmFyLWE3azJtOQ",
        status: "active",
        publicMenuStatus: "preparing",
        directPublishEnabled: false
      },
      settings: {
        name: "Sample Bar",
        description: "재즈와 싱글몰트를 위한 바",
        address: "서울시 마포구 와우산로 00",
        mapUrl: "https://maps.example.test/sample",
        phoneNumberDigits: "0212345678",
        phoneNumberDisplay: "02-1234-5678",
        openingNote: "공휴일은 인스타그램 공지를 확인하세요.",
        currency: "KRW",
        businessHours: [
          {
            id: "hours-1",
            dayOfWeek: 1,
            opensAt: "18:00",
            closesAt: "02:00",
            sortOrder: 0
          }
        ],
        links: [
          {
            id: "link-1",
            label: "Instagram",
            url: "https://instagram.example.test/sample",
            sortOrder: 0
          }
        ],
        settingsDraftHash: "abcdef0123456789",
        updatedAt: "2026-06-23T00:00:00.000Z"
      }
    },
    meta: { requestId: "test-request" }
  };
}
