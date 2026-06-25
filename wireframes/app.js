const groups = [
  {
    name: "인증",
    screens: [
      screen("setup", "WF-01", "D01", "최초 관리자 설정", "/setup", "시스템 관리자", "최초 운영자가 시스템 관리자 계정을 안전하게 생성한다.", ["설정 토큰 검증", "관리자 아이디·비밀번호 생성", "생성 후 setup 비활성화"], ["토큰 오류", "이미 설정 완료", "제출 중", "생성 성공"], "compact에서는 소개 영역을 제거하고 설정 폼에 집중한다.", "일회성 setup 상태를 서버가 검증한다. 폼 모양만 보고 setup 재개방을 허용하지 않는다."),
      screen("login", "WF-02", "D01", "로그인", "/login", "전체 사용자", "아이디와 비밀번호로 로그인한다.", ["아이디·비밀번호 입력", "로그인", "잠김·비활성 오류 안내"], ["입력 오류", "5회 실패 잠금", "강제 비밀번호 변경 이동", "로그인 중"], "compact는 단일 카드, wide는 제품 설명과 로그인 폼을 나눈다.", "로그인 성공 후 역할에 맞는 대시보드로 이동한다. 오류 메시지로 계정 존재 여부를 노출하지 않는다."),
      screen("change-password", "WF-03", "D01", "최초 비밀번호 변경", "/change-password", "임시 비밀번호 사용자", "임시 비밀번호를 실제 비밀번호로 교체한다.", ["현재 임시 비밀번호 확인", "새 비밀번호 규칙 실시간 안내", "변경 후 대시보드 이동"], ["규칙 미충족", "비밀번호 불일치", "세션 만료", "변경 성공"], "모든 폭에서 폼 우선이며 compact 하단에 변경 버튼을 고정한다.", "강제 변경 중에는 logout과 이 화면 외 보호 기능에 접근하지 못한다."),
      screen("recovery", "WF-04", "D01", "관리자 복구", "/recovery", "시스템 관리자", "복구 토큰으로 단일 시스템 관리자 비밀번호를 재설정한다.", ["복구 토큰 검증", "새 비밀번호 설정", "복구 완료 후 로그인"], ["토큰 오류", "횟수 제한", "복구 중", "완료"], "설정 화면과 같은 단일 폼 패턴을 사용한다.", "ADMIN_RECOVERY_TOKEN은 브라우저 저장소·로그·DB에 남기지 않는다.")
    ]
  },
  {
    name: "운영 개요",
    screens: [
      screen("dashboard", "WF-05", "D02", "운영 대시보드", "/dashboard", "권한별 사용자", "현재 운영 상태와 가장 긴급한 작업을 한눈에 확인한다.", ["현재 바 선택", "열린 주문·계산 요청 확인", "미발행 변경·발행 오류 확인", "빠른 작업 이동"], ["접근 바 없음", "최근 발행 없음", "발행 확인 불가", "집계 로딩 실패"], "wide는 KPI와 활동을 병렬 배치하고 compact는 긴급 카드와 빠른 작업을 먼저 쌓는다.", "카드별 데이터 출처와 권한을 분리한다. compact에서도 모든 권한 있는 작업으로 이동할 수 있어야 한다."),
      screen("bars", "WF-06", "D03", "바 목록", "/bars", "시스템 관리자", "등록된 바를 검색하고 상태를 확인한다.", ["바 검색·상태 필터", "새 바 등록", "바 상세 이동", "활성·비활성 상태 확인"], ["바 없음", "검색 결과 없음", "목록 오류", "등록 성공"], "wide 테이블은 compact에서 바 요약 카드로 바뀐다.", "같은 route와 query를 사용한다. 카드/테이블 표현이 서로 다른 데이터 요청을 만들지 않는다."),
      screen("bar-new", "WF-07", "D03", "바 등록", "/bars/new", "시스템 관리자", "새 바의 필수 정보와 통화를 입력해 생성한다.", ["바 이름·통화 입력", "자동 slug 결과 확인", "생성", "취소"], ["중복 slug 재생성", "입력 오류", "생성 중", "preparing JSON 생성 실패"], "wide는 2열 폼, compact는 단계형 1열 폼과 하단 고정 액션을 사용한다.", "slug와 encodedSlug는 서버에서 생성한다. preparing 공개 파일 생성 실패는 부분 성공으로 숨기지 않는다."),
      screen("bar-overview", "WF-08", "D03", "바 개요", "/bars/{barId}", "시스템 관리자·바 구성원", "선택한 바의 메뉴, 발행, 주문 상태와 관리 진입점을 확인한다.", ["메뉴·주문·발행 화면 이동", "미발행 변경 확인", "최근 발행 상태 확인"], ["접근 권한 없음", "비활성 바", "첫 발행 전", "집계 오류"], "compact는 요약 카드와 빠른 액션을 우선하고 보조 정보는 접는다.", "barId는 URL에서 받아도 서버가 active membership과 권한을 다시 검사한다.")
    ]
  },
  {
    name: "계정과 바 설정",
    screens: [
      screen("users", "WF-09", "D04", "사용자 계정 관리", "/system/users", "시스템 관리자", "사용자를 생성하고 잠금·비활성·비밀번호 초기화를 관리한다.", ["사용자 검색·상태 필터", "계정 생성", "잠금 해제", "비활성화", "임시 비밀번호 재발급"], ["중복 아이디", "잠긴 계정", "비활성 사용자", "초기 비밀번호 표시"], "wide 테이블은 compact 카드와 action sheet로 변환한다.", "임시 비밀번호는 생성 직후 한 번만 표시하고 서버 로그나 재조회 응답에 남기지 않는다."),
      screen("members", "WF-10", "D05", "바 회원·역할·권한", "/bars/{barId}/members", "시스템 관리자", "사용자를 바에 배정하고 역할·세부 권한을 설정한다.", ["회원 추가", "역할 변경", "권한 토글", "소속 비활성화"], ["이미 소속됨", "마지막 owner 변경 경고", "다른 바 사용자", "저장 충돌"], "compact에서는 회원 목록→전체화면 편집 흐름을 사용한다.", "권한 체크박스는 화면 편의를 위한 표현일 뿐 API guard의 source of truth가 아니다."),
      screen("bar-settings", "WF-11", "D06", "바 기본 정보·영업시간", "/bars/{barId}/settings", "시스템 관리자·권한 있는 사용자", "고객 메뉴판에 공개될 바 정보와 영업시간을 관리한다.", ["소개·주소·지도·전화 수정", "요일별 복수 영업구간", "자유 링크 최대 5개", "통화 확인·변경"], ["구간 겹침", "익일 마감", "잘못된 URL", "미발행 변경"], "wide는 정보 섹션을 2열, compact는 아코디언과 sticky 저장 버튼을 사용한다.", "입력 저장과 고객 공개는 분리한다. 저장 성공 후에도 발행 전에는 기존 고객 JSON이 유지된다."),
      screen("item-types", "WF-12", "D07", "품목 유형·템플릿", "/system/item-types", "시스템 관리자·바 owner", "공통·바 전용 품목 유형과 기본 가격 항목을 관리한다.", ["공통/바 전용 유형 전환", "정보 템플릿 연결", "기본 가격 항목 정렬", "활성·숨김 설정"], ["이름 중복", "사용 중 유형", "비활성 공통 유형", "바별 override"], "compact에서는 목록과 편집을 순차 화면으로 제공한다.", "정보 템플릿 필드 자체는 코드 고정이다. 관리 UI에서 동적 schema 편집기를 만들지 않는다."),
      screen("badges", "WF-13", "D08", "배지·색상", "/system/badges", "시스템 관리자·메뉴 편집자", "공통·바 전용 배지와 허용 색상을 관리한다.", ["배지 생성·수정", "색상 선택", "사용 메뉴 수 확인", "숨김·비활성화"], ["이름 중복", "사용 중 삭제 경고", "대체 색상 필수", "공통 배지 기본 숨김"], "색상 목록과 배지 목록을 wide에서 병렬, compact에서 탭으로 전환한다.", "색상 대비 계산은 고객 UI와 같은 유틸리티를 공유한다. 배지 제거가 메뉴에 미치는 영향을 확인창에 표시한다.")
    ]
  },
  {
    name: "메뉴 관리",
    screens: [
      screen("categories", "WF-14", "D09", "카테고리 관리", "/bars/{barId}/categories", "메뉴 편집 권한 사용자", "2단계 카테고리를 생성·정렬·이동·숨김 처리한다.", ["상위·하위 생성", "드래그·버튼 정렬", "설명 노출 설정", "삭제"], ["메뉴 포함 삭제 차단", "하위 생성 차단", "중복 이름", "저장되지 않은 순서"], "wide는 트리와 편집 패널, compact는 목록→full-screen 편집 흐름을 사용한다.", "drag-and-drop에 위·아래 버튼과 상위 선택 fallback을 반드시 제공한다."),
      screen("menus", "WF-15", "D10·D12", "메뉴 목록", "/bars/{barId}/menus", "메뉴 조회·편집 사용자", "메뉴를 검색·필터하고 품절·노출·일괄 작업을 수행한다.", ["검색·필터", "카테고리/전체 보기", "빠른 상태 수정", "일괄 카테고리·배지 변경", "메뉴 생성"], ["검색 결과 없음", "저장 전 일괄 변경", "권한 없는 조회 모드", "저장 충돌"], "wide 테이블/카테고리 분할, medium 압축 테이블, compact 카드 목록과 필터 sheet를 사용한다.", "빠른 수정은 화면 상태에만 반영 후 명시적 저장한다. 품절 변경도 발행 전에는 고객 화면에 반영되지 않는다."),
      screen("menu-editor", "WF-16", "D10·D11", "메뉴 상세 편집", "/bars/{barId}/menus/{menuItemId}", "메뉴 편집 권한 사용자", "기본 정보·가격·주종 상세·배지·내부 메모를 저장한다.", ["탭별 입력", "카테고리 이동", "가격 항목 정렬", "품목 유형 변경", "저장·삭제"], ["dirty state", "템플릿 변경 삭제 경고", "이름 중복", "가격 검증", "내부 메모 읽기 전용"], "wide는 탭과 2열 입력, compact는 1열 탭·아코디언과 하단 저장 액션을 사용한다.", "탭 이동과 resize가 form state를 초기화하면 안 된다. 모든 가격은 정수이며 내부 메모는 public DTO에서 제외한다."),
      screen("preview", "WF-17", "D13", "발행 전 미리보기", "/bars/{barId}/preview", "메뉴 조회 사용자", "저장된 편집본을 고객 메뉴판 형태로 검토한다.", ["전체·카테고리·메뉴 미리보기", "화면 폭 전환", "미발행 변경 확인", "발행 이동"], ["저장 전 입력 제외 안내", "schema 오류", "preparing", "빈 카테고리"], "동일 고객 렌더러를 감싼 미리보기이며 compact/medium/wide를 내부에서 전환한다.", "관리자 전용 mock UI를 따로 만들지 말고 고객 parser/renderer를 재사용한다."),
      screen("publications", "WF-18", "D15·D16·D17", "발행·이력·복구", "/bars/{barId}/publications", "발행 권한 사용자", "발행을 실행하고 GitHub·Cloudflare 상태와 과거 버전을 관리한다.", ["현재 저장본 발행", "30초 상태 확인", "이력 상세", "성공 snapshot 재발행", "바 비활성·재활성 상태 확인"], ["GitHub 실패", "Cloudflare 실패", "timeout_unknown", "동일 내용 재발행", "현재 편집본 불일치"], "wide는 이력 테이블+상세 drawer, compact는 카드 목록+full-screen 상세를 사용한다.", "발행 상태 머신을 UI에서 임의 보정하지 않는다. timeout_unknown은 success/failed로 표시하지 않는다.")
    ]
  },
  {
    name: "주문과 정산",
    screens: [
      screen("orders", "WF-19", "D18", "테이블 목록", "/bars/{barId}/orders", "주문 운영 권한 사용자", "현재 손님·테이블 주문 기록과 계산 요청을 빠르게 찾고 생성 화면으로 이동한다.", ["테이블 생성 화면 이동", "상태 필터", "손님 설명 검색", "계산 요청 우선 확인", "테이블 상세 이동"], ["열린 테이블 없음", "중복 테이블 라벨 허용", "계산 요청", "동기화 오류"], "wide는 보드/테이블, compact는 상태별 카드와 하단 테이블 생성 버튼을 사용한다.", "목록 화면 안에 생성 폼이나 상세 패널을 섞지 않는다. 주문 데이터는 public JSON에 포함하지 않는다."),
      screen("order-new", "WF-19", "D18", "테이블 생성", "/bars/{barId}/orders/new", "주문 운영 권한 사용자", "새 테이블 주문 기록을 만든 뒤 목록으로 돌아가 생성 결과를 확인한다.", ["테이블 라벨 입력", "손님 설명 입력", "생성", "목록으로 돌아가기"], ["입력 오류", "생성 중", "권한 없음", "생성 후 목록 표시"], "모든 폭에서 단일 생성 폼을 사용하며 compact에서도 44px 액션을 유지한다.", "생성은 기존 order-tab API를 사용하고 생성 화면은 목록·상세와 분리한다."),
      screen("order-detail", "WF-20", "D19·D20·D21", "테이블 상세·정산", "/bars/{barId}/orders/{orderTabId}", "주문 운영 권한 사용자", "메뉴 주문을 기록하고 합계를 확인해 계좌이체 정산을 마친다.", ["주문 편집 탭", "메뉴 검색·추가", "수량 변경·void", "기타 항목·금액 조정", "결제·정산 탭", "정산 완료·취소"], ["409 version 충돌", "중복 idempotency", "closed/cancelled 읽기 전용", "권한 없는 조정", "입금 확인 전"], "wide와 compact 모두 같은 상세 URL 안에서 주문 편집과 결제·정산 탭을 분리한다.", "가격·이름·용량·통화는 주문 추가 시 snapshot 저장한다. 합계를 클라이언트 값으로 확정하지 않는다."),
      screen("settlements", "WF-20", "D21", "정산 내역", "/bars/{barId}/settlements", "주문 운영 권한 사용자", "정산 완료된 테이블만 조회한다.", ["정산 완료 검색", "최종 합계 확인", "정산 시각 확인"], ["정산 완료 없음", "조회 오류", "권한 없음"], "wide는 정산 테이블, compact는 정산 카드 목록을 사용한다.", "열린 테이블 생성·메뉴 추가·정산 전이 액션은 이 화면에 두지 않는다."),
      screen("audit", "WF-21", "D22", "감사 로그·운영 도구", "/system/audit", "시스템 관리자", "중요 변경과 장애를 검색하고 보관 작업을 확인한다.", ["actor·bar·action·기간 필터", "request ID 조회", "세부 metadata 확인", "보관 작업 상태 확인"], ["로그 없음", "민감값 마스킹", "보관 실패", "대량 결과"], "wide 테이블은 compact 이벤트 카드와 상세 sheet로 변환한다.", "토큰·비밀번호·세션 원문을 기록하지 않는다. metadata는 허용 목록 기반으로 직렬화한다.")
    ]
  },
  {
    name: "고객 메뉴판",
    screens: [
      screen("customer-menu", "WF-22", "D14", "고객 메뉴판", "/{encodedSlug}", "로그인 없는 고객", "QR로 접속해 바 정보와 메뉴를 빠르게 탐색한다.", ["메뉴 검색", "카테고리 이동", "메뉴 상세 확인", "주소·전화·외부 링크 사용"], ["preparing", "404 비활성 바", "JSON 오류", "빈 카테고리", "품절 메뉴"], "같은 URL에서 wide는 카테고리 레일+2열 카드, compact는 가로 카테고리 탭+1열 카드로 적응한다.", "관리자 API·D1·주문 API를 호출하지 않는다. /menus/{encodedSlug}.json만 읽고 비공개 필드를 렌더링하지 않는다.")
    ]
  }
];

function screen(id, wireframeId, task, title, route, permission, goal, actions, states, responsive, implementation) {
  return { id, wireframeId, task, title, route, permission, goal, actions, states, responsive, implementation };
}

const allScreens = groups.flatMap(group => group.screens.map(item => ({ ...item, group: group.name })));
const screenById = new Map(allScreens.map(item => [item.id, item]));

const state = {
  screenId: readHash().screen || "dashboard",
  viewport: readHash().viewport || "wide"
};
if (!screenById.has(state.screenId)) state.screenId = "dashboard";
if (!["compact", "medium", "wide"].includes(state.viewport)) state.viewport = "wide";

const $ = selector => document.querySelector(selector);
const screenList = $("#screenList");
const screenCanvas = $("#screenCanvas");
const deviceFrame = $("#deviceFrame");
const toast = $("#toast");

function readHash() {
  const raw = location.hash.replace(/^#/, "");
  return Object.fromEntries(new URLSearchParams(raw));
}

function writeHash() {
  const params = new URLSearchParams({ screen: state.screenId, viewport: state.viewport });
  history.replaceState(null, "", `#${params.toString()}`);
}

function renderScreenList(filter = "") {
  const query = filter.trim().toLowerCase();
  screenList.innerHTML = groups.map(group => {
    const visible = group.screens.filter(item => [item.title, item.id, item.task, item.route, item.wireframeId].join(" ").toLowerCase().includes(query));
    if (!visible.length) return "";
    return `
      <div class="screen-group-title">${group.name}</div>
      ${visible.map(item => `
        <button class="screen-link ${item.id === state.screenId ? "is-active" : ""}" type="button" data-screen="${item.id}">
          <span class="screen-id">${item.wireframeId}</span>
          <span class="screen-name">${item.title}</span>
        </button>
      `).join("")}
    `;
  }).join("");
}

function render() {
  const item = screenById.get(state.screenId);
  renderScreenList($("#screenSearch").value);
  $("#taskLabel").textContent = `${item.wireframeId} · ${item.task} · ${item.permission}`;
  $("#screenTitle").textContent = item.title;
  $("#screenRoute").textContent = item.route;
  $("#browserAddress").textContent = `https://example.invalid${item.route.replace("{barId}", "bar_1").replace("{menuItemId}", "item_12").replace("{orderTabId}", "tab_24").replace("{encodedSlug}", "YmFyLWE3azJtOQ")}`;
  $("#noteGoal").textContent = item.goal;
  $("#noteActions").innerHTML = item.actions.map(value => `<li>${value}</li>`).join("");
  $("#noteStates").innerHTML = item.states.map(value => `<li>${value}</li>`).join("");
  $("#noteResponsive").textContent = item.responsive;
  $("#noteImplementation").textContent = item.implementation;
  deviceFrame.className = `device-frame is-${state.viewport}`;
  document.querySelectorAll("[data-viewport]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.viewport === state.viewport));
  });
  screenCanvas.innerHTML = renderProductScreen(item.id);
  bindProductInteractions();
  writeHash();
}

function renderProductScreen(id) {
  const renderer = renderers[id];
  return renderer ? renderer() : appShell("화면 준비 중", `<div class="wf-empty">와이어프레임을 준비 중입니다.</div>`, "dashboard");
}

const adminNav = [
  ["dashboard", "대시보드"], ["bars", "바 관리"], ["menus", "메뉴"], ["orders", "주문·정산"],
  ["users", "사용자"], ["item-types", "품목 유형"], ["badges", "배지"], ["audit", "감사 로그"]
];

function appShell(title, content, active = "dashboard", actions = "", subtitle = "운영 정보를 확인하고 필요한 작업을 수행합니다.") {
  return `
    <div class="wf-app">
      <header class="wf-topbar">
        <button class="wf-hamburger" type="button" data-toast="내비게이션 drawer">☰</button>
        <div class="wf-brand">BAR OPS</div>
        <button class="wf-bar-switch" type="button" data-toast="바 선택 목록"><span>현재 바</span><strong>Sample Bar</strong><span>⌄</span></button>
        <div class="wf-spacer"></div>
        <button class="wf-button ghost secondary-mobile-hidden" type="button" data-toast="도움말">도움말</button>
        <div class="wf-user"><div class="wf-avatar"></div><span>systemadmin</span></div>
      </header>
      <div class="wf-shell">
        <aside class="wf-sidebar">
          <div class="wf-nav-group">운영</div>
          ${adminNav.slice(0,4).map(([key,label]) => `<button class="wf-nav-item ${key === active ? "is-active" : ""}" type="button" data-nav="${key}"><span>${label}</span></button>`).join("")}
          <div class="wf-nav-group">시스템</div>
          ${adminNav.slice(4).map(([key,label]) => `<button class="wf-nav-item ${key === active ? "is-active" : ""}" type="button" data-nav="${key}"><span>${label}</span></button>`).join("")}
        </aside>
        <main class="wf-main">
          <div class="wf-page-header">
            <div>
              <div class="wf-breadcrumb">BAR OPS / ${title}</div>
              <h3>${title}</h3>
              <p>${subtitle}</p>
            </div>
            <div class="wf-actions">${actions}</div>
          </div>
          ${content}
        </main>
      </div>
    </div>`;
}

function authScreen(title, description, fields, buttonLabel, footer = "") {
  return `
    <div class="wf-auth">
      <section class="wf-auth-visual">
        <div class="wf-brand">BAR MENU OPERATIONS</div>
        <div>
          <h2>메뉴 발행부터 간이 주문 정산까지 한 곳에서 관리합니다.</h2>
          <p>실제 소규모 바 운영을 위한 관리자 시스템입니다. 권한, 공개본, 금액 기록을 분리해 안전하게 관리합니다.</p>
        </div>
        <small>v1.0 low-fidelity wireframe</small>
      </section>
      <section class="wf-auth-form-wrap">
        <form class="wf-auth-card" data-demo-form>
          <h3>${title}</h3>
          <p>${description}</p>
          <div class="wf-form">
            ${fields.map(field => `
              <label class="wf-form-group">
                <span class="wf-label">${field.label}</span>
                <input class="wf-input" type="${field.type || "text"}" placeholder="${field.placeholder || ""}" />
                ${field.help ? `<span class="wf-help">${field.help}</span>` : ""}
              </label>
            `).join("")}
            <button class="wf-button primary" type="submit">${buttonLabel}</button>
          </div>
          ${footer ? `<div class="wf-callout" style="margin-top:14px">${footer}</div>` : ""}
        </form>
      </section>
    </div>`;
}

function statCard(label, value, meta, tone = "") {
  return `<article class="wf-card"><div class="wf-kpi-meta">${label}</div><div class="wf-kpi-value ${tone}">${value}</div><div class="wf-kpi-meta">${meta}</div></article>`;
}

function statusBadge(text, tone = "") { return `<span class="wf-badge ${tone}">${text}</span>`; }
function button(label, className = "", nav = "") { return `<button class="wf-button ${className}" type="button" ${nav ? `data-nav="${nav}"` : `data-toast="${label}"`}>${label}</button>`; }
function input(label, placeholder, options = {}) {
  const fieldClass = options.full ? "wf-form-group full" : "wf-form-group";
  if (options.textarea) return `<label class="${fieldClass}"><span class="wf-label">${label}</span><textarea class="wf-textarea" placeholder="${placeholder}"></textarea>${options.help ? `<span class="wf-help">${options.help}</span>` : ""}</label>`;
  return `<label class="${fieldClass}"><span class="wf-label">${label}</span><input class="wf-input" value="${options.value || ""}" placeholder="${placeholder}" />${options.help ? `<span class="wf-help">${options.help}</span>` : ""}</label>`;
}

const renderers = {
  setup: () => authScreen("최초 관리자 설정", "시스템에 관리자가 없을 때 한 번만 수행합니다.", [
    { label: "설정 토큰", type: "password", placeholder: "SETUP_TOKEN" },
    { label: "관리자 아이디", placeholder: "영문 소문자·숫자 4~20자" },
    { label: "비밀번호", type: "password", placeholder: "10자 이상" },
    { label: "비밀번호 확인", type: "password", placeholder: "다시 입력" }
  ], "관리자 생성", "<strong>보안:</strong> 생성 완료 후 이 화면은 자동으로 비활성화됩니다."),

  login: () => authScreen("로그인", "발급받은 아이디와 비밀번호를 입력하세요.", [
    { label: "아이디", placeholder: "username" },
    { label: "비밀번호", type: "password", placeholder: "비밀번호" }
  ], "로그인", "5회 연속 실패하면 15분 동안 계정이 잠깁니다."),

  "change-password": () => authScreen("비밀번호 변경", "처음 로그인했거나 비밀번호가 초기화되었습니다.", [
    { label: "현재 임시 비밀번호", type: "password" },
    { label: "새 비밀번호", type: "password", help: "영문·숫자·특수문자를 포함해 10자 이상" },
    { label: "새 비밀번호 확인", type: "password" }
  ], "변경하고 계속", "변경을 완료하기 전에는 다른 관리자 기능을 사용할 수 없습니다."),

  recovery: () => authScreen("시스템 관리자 복구", "최상위 복구 토큰으로 관리자 비밀번호를 재설정합니다.", [
    { label: "복구 토큰", type: "password", placeholder: "ADMIN_RECOVERY_TOKEN" },
    { label: "새 비밀번호", type: "password" },
    { label: "새 비밀번호 확인", type: "password" }
  ], "비밀번호 재설정", "복구 토큰은 브라우저나 서버 로그에 저장하지 않습니다."),

  dashboard: () => appShell("대시보드", `
    <div class="wf-grid cols-4">
      ${statCard("운영 중 바", "2", "전체 2개")}
      ${statCard("열린 테이블", "7", "계산 요청 2건")}
      ${statCard("미발행 변경", "1", "Sample Bar")}
      ${statCard("발행 주의", "1", "배포 확인 불가")}
    </div>
    <div class="wf-grid cols-2 wf-section">
      <section class="wf-card">
        <div class="wf-section-header"><h4>긴급 작업</h4>${button("전체 보기", "ghost")}</div>
        <div class="wf-list">
          <div class="wf-list-item"><div class="wf-item-main"><div class="wf-item-title">B3 테이블 계산 요청</div><div class="wf-item-meta">총 42,000원 · 3분 전</div></div>${statusBadge("계산 요청", "warning")}</div>
          <div class="wf-list-item"><div class="wf-item-main"><div class="wf-item-title">메뉴판 배포 확인 불가</div><div class="wf-item-meta">Sample Bar · publication #108</div></div>${statusBadge("확인 필요", "danger")}</div>
          <div class="wf-list-item"><div class="wf-item-main"><div class="wf-item-title">계정 잠금</div><div class="wf-item-meta">staff02 · 8분 남음</div></div>${statusBadge("잠김")}</div>
        </div>
      </section>
      <section class="wf-card">
        <div class="wf-section-header"><h4>빠른 작업</h4></div>
        <div class="wf-grid cols-2">
          ${button("테이블 생성", "primary", "orders")}
          ${button("메뉴 품절 처리", "", "menus")}
          ${button("메뉴판 발행", "", "publications")}
          ${button("바 등록", "", "bar-new")}
        </div>
        <div class="wf-callout" style="margin-top:12px"><div><strong>현재 바:</strong> Sample Bar<br/>직접 발행은 owner에게 허용되어 있습니다.</div></div>
      </section>
    </div>
    <section class="wf-card wf-section">
      <div class="wf-section-header"><h4>최근 활동</h4>${button("감사 로그", "ghost", "audit")}</div>
      ${activityTable()}
    </section>
  `, "dashboard", button("테이블 생성", "primary", "orders")),

  bars: () => appShell("바 관리", `
    <div class="wf-toolbar">
      <input class="wf-search" placeholder="바 이름 검색" />
      <select class="wf-select"><option>전체 상태</option><option>활성</option><option>비활성</option></select>
      <div class="wf-spacer"></div>
      <span class="wf-kpi-meta">총 2개</span>
    </div>
    <table class="wf-table">
      <thead><tr><th>바</th><th>상태</th><th>구성원</th><th>메뉴</th><th>최근 발행</th><th></th></tr></thead>
      <tbody>
        ${barRow("Sample Bar", "bar-a7k2m9", "활성", "3명", "42개", "오늘 18:12", "bar-overview")}
        ${barRow("Cigar Room", "bar-f9q2x1", "활성", "2명", "18개", "6월 19일", "bar-overview")}
      </tbody>
    </table>
  `, "bars", button("바 등록", "primary", "bar-new")),

  "bar-new": () => appShell("새 바 등록", `
    <div class="wf-stepper"><span class="wf-step current"></span><span class="wf-step"></span><span class="wf-step"></span></div>
    <form class="wf-card wf-form" data-demo-form>
      <div class="wf-section-header"><h4>필수 정보</h4><span class="wf-kpi-meta">1 / 3</span></div>
      <div class="wf-form-grid">
        ${input("바 이름", "예: Sample Bar")}
        <label class="wf-form-group"><span class="wf-label">통화</span><select class="wf-selectbox"><option>KRW — 대한민국 원</option></select></label>
        ${input("내부 식별 slug", "서버에서 자동 생성", { value: "bar-a7k2m9", help: "생성 후 변경할 수 없습니다." })}
        ${input("고객 메뉴판 경로", "자동 생성", { value: "/YmFyLWE3azJtOQ" })}
      </div>
      <div class="wf-callout"><div><strong>생성 후:</strong> 고객 메뉴판에는 바 이름과 “메뉴 준비 중입니다”가 먼저 표시됩니다.</div></div>
      <div class="wf-actions">${button("취소", "", "bars")}${button("다음", "primary")}</div>
    </form>
    <div class="wf-sticky-actions">${button("취소", "", "bars")}${button("다음", "primary")}</div>
  `, "bars"),

  "bar-overview": () => appShell("Sample Bar", `
    <div class="wf-grid cols-4">
      ${statCard("공개 메뉴", "42", "카테고리 8개")}
      ${statCard("열린 주문", "4", "계산 요청 1건")}
      ${statCard("현재 revision", "12", "오늘 18:12 발행")}
      ${statCard("미발행 변경", "있음", "메뉴 2건 수정")}
    </div>
    <div class="wf-grid cols-3 wf-section">
      ${overviewLink("메뉴 관리", "검색·품절·가격·상세 정보", "menus")}
      ${overviewLink("주문·정산", "열린 테이블과 계좌이체 정산", "orders")}
      ${overviewLink("발행 관리", "미리보기·배포·이력·복구", "publications")}
      ${overviewLink("바 회원", "오너·매니저·직원 권한", "members")}
      ${overviewLink("바 기본 정보", "영업시간·주소·링크·통화", "bar-settings")}
      ${overviewLink("카테고리", "2단계 구조와 정렬", "categories")}
    </div>
    <section class="wf-card wf-section">
      <div class="wf-section-header"><h4>최근 발행</h4>${button("이력 보기", "ghost", "publications")}</div>
      <div class="wf-summary-bar"><div><div class="wf-kpi-meta" style="color:#ced3d8">REVISION 12</div><strong>발행 성공</strong></div><div>오늘 18:12 · systemadmin</div></div>
    </section>
  `, "bars", `${button("메뉴 미리보기", "", "preview")}${button("발행", "primary", "publications")}`),

  users: () => appShell("사용자 계정", `
    <div class="wf-toolbar"><input class="wf-search" placeholder="아이디 검색"/><select class="wf-select"><option>전체 상태</option><option>정상</option><option>잠김</option><option>비활성</option></select><div class="wf-spacer"></div><span class="wf-kpi-meta">총 5명</span></div>
    <table class="wf-table"><thead><tr><th>사용자</th><th>상태</th><th>소속 바</th><th>마지막 로그인</th><th>작업</th></tr></thead><tbody>
      ${userRow("owner01", "정상", "Sample Bar · owner", "오늘 17:45")}
      ${userRow("manager01", "정상", "Sample Bar · manager", "오늘 16:20")}
      ${userRow("staff02", "잠김", "Sample Bar · staff", "15분 전", true)}
    </tbody></table>
  `, "users", button("사용자 생성", "primary")),

  members: () => appShell("바 회원·권한", `
    <div class="wf-master-detail">
      <section class="wf-card">
        <div class="wf-section-header"><h4>Sample Bar 구성원</h4><span class="wf-kpi-meta">3명</span></div>
        <div class="wf-list">
          ${memberItem("owner01", "owner", true)}
          ${memberItem("manager01", "manager")}
          ${memberItem("staff02", "staff")}
        </div>
      </section>
      <section class="wf-card detail-pane is-secondary">
        <div class="wf-section-header"><div><h4>owner01</h4><p>Sample Bar의 역할과 권한</p></div>${statusBadge("활성", "success")}</div>
        <div class="wf-form">
          <label class="wf-form-group"><span class="wf-label">역할</span><select class="wf-selectbox"><option>owner</option><option>manager</option><option>staff</option></select></label>
          ${permissionCheck("메뉴 편집", true)}${permissionCheck("주문 운영", true)}${permissionCheck("기타 주문 항목", true)}${permissionCheck("금액 조정", true)}
          <div class="wf-actions">${button("소속 비활성화", "danger")}${button("저장", "primary")}</div>
        </div>
      </section>
    </div>
  `, "bars", button("회원 추가", "primary")),

  "bar-settings": () => appShell("바 기본 정보", `
    <div class="wf-tabs"><button class="wf-tab is-active">기본 정보</button><button class="wf-tab">영업시간</button><button class="wf-tab">외부 링크</button><button class="wf-tab">운영 설정</button></div>
    <form class="wf-form" data-demo-form>
      <section class="wf-card">
        <div class="wf-form-grid">
          ${input("바 이름", "", { value: "Sample Bar" })}
          ${input("국내 전화번호", "숫자만 입력", { value: "021234567" })}
          ${input("소개 문구", "최대 500자", { full: true, textarea: true })}
          ${input("주소", "주소 자유 입력", { full: true, value: "서울시 마포구 와우산로 00, 지하 1층" })}
          ${input("지도 링크", "https://...", { full: true })}
        </div>
      </section>
      <section class="wf-card">
        <div class="wf-section-header"><h4>영업시간</h4>${button("구간 추가")}</div>
        ${hoursRow("월", "18:00", "02:00")}${hoursRow("화", "18:00", "02:00")}${hoursRow("수", "휴무", "")}
      </section>
      <div class="wf-actions">${button("되돌리기")}${button("저장", "primary")}</div>
    </form>
    <div class="wf-sticky-actions">${button("되돌리기")}${button("저장", "primary")}</div>
  `, "bars"),

  "item-types": () => appShell("품목 유형", `
    <div class="wf-tabs"><button class="wf-tab is-active">시스템 공통</button><button class="wf-tab">Sample Bar 전용</button><button class="wf-tab">포도 품종 후보</button></div>
    <div class="wf-master-detail">
      <section class="wf-card"><div class="wf-toolbar"><input class="wf-search" placeholder="품목 유형 검색"/></div><div class="wf-list">
        ${typeItem("와인", "와인 템플릿 · 보틀", true)}${typeItem("위스키", "위스키 템플릿 · 샷", false)}${typeItem("칵테일", "칵테일 템플릿 · 잔", false)}${typeItem("시가", "시가 템플릿 · 기본 가격 없음", false)}
      </div></section>
      <section class="wf-card detail-pane is-secondary"><div class="wf-section-header"><h4>와인</h4>${statusBadge("공통", "success")}</div><div class="wf-form">
        ${input("유형 이름", "", { value: "와인" })}
        <label class="wf-form-group"><span class="wf-label">정보 템플릿</span><select class="wf-selectbox"><option>와인</option></select></label>
        <div class="wf-form-group"><span class="wf-label">기본 가격 항목</span><div class="wf-list"><div class="wf-list-item"><span>⋮⋮ 보틀</span><span>↑ ↓ ×</span></div></div></div>
        ${permissionCheck("활성", true)}<div class="wf-actions">${button("저장", "primary")}</div>
      </div></section>
    </div>
  `, "item-types", button("품목 유형 추가", "primary")),

  badges: () => appShell("배지·색상", `
    <div class="wf-tabs"><button class="wf-tab is-active">배지</button><button class="wf-tab">허용 색상</button></div>
    <div class="wf-grid cols-2">
      <section class="wf-card"><div class="wf-section-header"><h4>시스템 공통 배지</h4>${button("추가")}</div><div class="wf-list">
        ${badgeItem("추천", "#725A3D", "기존 바 기본 숨김")}${badgeItem("시그니처", "#33475B", "기존 바 기본 숨김")}${badgeItem("신메뉴", "#5E3B56", "기존 바 기본 숨김")}
      </div></section>
      <section class="wf-card"><div class="wf-section-header"><h4>Sample Bar 전용</h4>${button("추가")}</div><div class="wf-list">${badgeItem("오늘의 픽", "#355B47", "메뉴 3개 사용")}${badgeItem("한정", "#6D4437", "메뉴 1개 사용")}</div></section>
    </div>
    <section class="wf-card wf-section"><div class="wf-section-header"><h4>배지 미리보기</h4></div><div class="wf-chip-list"><span class="wf-badge">추천</span><span class="wf-badge">시그니처</span><span class="wf-badge">오늘의 픽</span></div></section>
  `, "badges"),

  categories: () => appShell("카테고리 관리", `
    <div class="wf-master-detail">
      <section class="wf-card">
        <div class="wf-section-header"><h4>카테고리 구조</h4>${button("상위 추가")}</div>
        <div class="wf-tree">
          ${treeNode("위스키", "메뉴 없음", ["싱글몰트 · 12개", "버번 · 8개"], true)}
          ${treeNode("칵테일", "메뉴 14개", [], false)}
          ${treeNode("푸드", "메뉴 없음", ["안주 · 5개", "디저트 · 3개"], false)}
        </div>
      </section>
      <section class="wf-card detail-pane is-secondary">
        <div class="wf-section-header"><h4>위스키</h4>${statusBadge("노출", "success")}</div>
        <div class="wf-form">
          ${input("카테고리 이름", "", { value: "위스키" })}
          ${input("설명", "최대 100자", { textarea: true })}
          ${permissionCheck("설명 고객 노출", false)}${permissionCheck("카테고리 노출", true)}
          <div class="wf-actions">${button("삭제", "danger")}${button("저장", "primary")}</div>
        </div>
      </section>
    </div>
  `, "menus", button("카테고리 추가", "primary")),

  menus: () => appShell("메뉴 관리", `
    <div class="wf-tabs"><button class="wf-tab is-active">전체 목록</button><button class="wf-tab">카테고리 보기</button></div>
    <div class="wf-toolbar"><input class="wf-search" placeholder="메뉴 이름 검색"/><select class="wf-select"><option>전체 카테고리</option></select><select class="wf-select"><option>전체 품목 유형</option></select><select class="wf-select"><option>판매 상태</option></select><button class="wf-button" data-toast="필터 sheet">필터 2</button></div>
    <div class="wf-callout" style="margin-bottom:10px"><div><strong>미발행 변경사항 2건</strong><br/>저장된 변경도 발행하기 전까지 고객 메뉴판에 반영되지 않습니다.</div></div>
    <table class="wf-table"><thead><tr><th><span class="wf-check"></span></th><th>메뉴</th><th>카테고리</th><th>가격</th><th>배지</th><th>판매</th><th>노출</th><th>수정</th></tr></thead><tbody>
      ${menuRow("맥캘란 12", "위스키 / 싱글몰트", "샷 18,000원", "추천", "판매 중", true, "5분 전")}
      ${menuRow("네그로니", "칵테일", "잔 18,000원", "시그니처", "품절", true, "12분 전")}
      ${menuRow("치즈 플레이트", "푸드 / 안주", "플레이트 24,000원", "", "판매 중", false, "어제")}
    </tbody></table>
    <div class="wf-sticky-actions">${button("일괄 작업")}${button("저장", "primary")}</div>
  `, "menus", `${button("일괄 작업")}${button("메뉴 등록", "primary", "menu-editor")}`),

  "menu-editor": () => appShell("메뉴 상세", `
    <div class="wf-tabs"><button class="wf-tab is-active">기본 정보</button><button class="wf-tab">가격</button><button class="wf-tab">상세 정보</button><button class="wf-tab">배지</button><button class="wf-tab">내부 메모</button></div>
    <form class="wf-form" data-demo-form>
      <section class="wf-card">
        <div class="wf-form-grid">
          ${input("메뉴 이름", "", { value: "맥캘란 12" })}
          <label class="wf-form-group"><span class="wf-label">카테고리</span><select class="wf-selectbox"><option>위스키 / 싱글몰트</option></select></label>
          <label class="wf-form-group"><span class="wf-label">품목 유형</span><select class="wf-selectbox"><option>위스키</option></select></label>
          ${input("도수 ABV", "0~100", { value: "40" })}
          ${input("메뉴 설명", "고객에게 공개되는 설명", { full: true, textarea: true })}
          <div class="wf-form-group"><span class="wf-label">상태</span><div class="wf-chip-list">${statusBadge("판매 중", "success")}${statusBadge("노출", "success")}</div></div>
        </div>
      </section>
      <section class="wf-card"><div class="wf-section-header"><h4>가격 항목</h4>${button("가격 추가")}</div>
        <div class="wf-form" style="gap:8px">
          ${priceRow("샷", "30ml", "18000")}${priceRow("보틀", "700ml", "280000")}
        </div>
      </section>
      <section class="wf-card"><div class="wf-section-header"><h4>위스키 상세 정보</h4><span class="wf-kpi-meta">선택 입력</span></div><div class="wf-form-grid">${input("브랜드·증류소", "", { value: "The Macallan" })}${input("국가", "", { value: "Scotland" })}${input("지역", "", { value: "Speyside" })}${input("숙성연수 또는 NAS", "", { value: "12" })}${input("캐스크·피니시", "", { full: true, value: "Sherry Oak" })}</div></section>
      <div class="wf-actions">${button("삭제", "danger")}${button("되돌리기")}${button("저장", "primary")}</div>
    </form>
    <div class="wf-sticky-actions">${button("되돌리기")}${button("저장", "primary")}</div>
  `, "menus"),

  preview: () => appShell("메뉴판 미리보기", `
    <div class="wf-toolbar"><select class="wf-select"><option>전체 메뉴판</option><option>카테고리: 위스키</option><option>메뉴: 맥캘란 12</option></select><div class="wf-spacer"></div><span class="wf-badge warning">미발행 변경 있음</span></div>
    <div class="wf-callout" style="margin-bottom:12px"><div>저장되지 않은 입력값은 미리보기에 반영되지 않습니다.</div></div>
    <div style="border:1px solid var(--line); border-radius:10px; overflow:hidden">${customerMenuMarkup(true)}</div>
  `, "menus", `${button("메뉴 편집", "", "menus")}${button("발행", "primary", "publications")}`),

  publications: () => appShell("발행 관리", `
    <div class="wf-grid cols-3">
      ${statCard("현재 공개 revision", "12", "오늘 18:12")}
      ${statCard("현재 편집본", "변경 있음", "content hash 불일치")}
      ${statCard("최근 배포", "성공", "Cloudflare deployment")}
    </div>
    <div class="wf-callout wf-section"><div><strong>현재 저장된 메뉴판을 발행합니다.</strong><br/>저장하지 않은 입력은 포함되지 않으며, 동일 내용 재발행도 새 배포를 생성합니다.</div></div>
    <section class="wf-card wf-section"><div class="wf-section-header"><h4>발행 이력</h4><span class="wf-kpi-meta">성공 snapshot 최근 100건</span></div>
      <table class="wf-table"><thead><tr><th>요청</th><th>상태</th><th>revision</th><th>발행자</th><th>완료</th><th></th></tr></thead><tbody>
        ${publicationRow("#108", "성공", "12", "systemadmin", "오늘 18:12", "success")}
        ${publicationRow("#107", "배포 확인 불가", "12", "owner01", "오늘 17:42", "warning")}
        ${publicationRow("#106", "GitHub 실패", "11", "systemadmin", "어제", "danger")}
      </tbody></table>
    </section>
  `, "menus", `${button("미리보기", "", "preview")}${button("발행", "primary")}`),

  orders: () => appShell("테이블 목록", `
    <div class="wf-grid cols-4">
      ${statCard("열린 테이블", "7", "현재 영업")}${statCard("계산 요청", "2", "우선 처리")}${statCard("전체 테이블", "9", "조회 결과")}${statCard("정산 내역", "별도 화면", "완료 건만 조회")}
    </div>
    <div class="wf-tabs wf-section"><button class="wf-tab is-active">열림 7</button><button class="wf-tab">계산 요청 2</button><button class="wf-tab">전체</button><button class="wf-tab">취소</button></div>
    <div class="wf-toolbar"><input class="wf-search" placeholder="테이블·손님 설명 검색"/><select class="wf-select"><option>최근 수정순</option></select></div>
    <div class="wf-grid cols-3">
      ${orderCard("B3", "남녀 2명 · 창가", "42,000원", "계산 요청", "warning")}
      ${orderCard("BAR-2", "혼자 · 위스키 문의", "36,000원", "주문 중", "success")}
      ${orderCard("A1", "4명 · 생일", "128,000원", "주문 중", "success")}
      ${orderCard("T5", "남자 3명", "72,000원", "주문 중", "success")}
    </div>
    <div class="wf-sticky-actions">${button("테이블 생성", "primary", "order-new")}</div>
  `, "orders", button("테이블 생성", "primary", "order-new")),

  "order-new": () => appShell("테이블 생성", `
    <section class="wf-card">
      <div class="wf-section-header"><div><h4>새 테이블</h4><p>테이블 라벨과 손님 설명으로 주문 기록을 시작합니다.</p></div><button class="wf-button" data-nav="orders">목록</button></div>
      <div class="wf-form-grid">
        ${input("테이블 라벨", "예: A1, Bar 3", { value: "B7" })}
        ${input("손님 설명", "예: 2명, 창가, 단골", { full: true, value: "2명 · 창가" })}
      </div>
      <div class="wf-actions">${button("취소", "", "orders")}${button("테이블 생성", "primary", "orders")}</div>
    </section>
  `, "orders", button("테이블 생성", "primary", "orders")),

  "order-detail": () => appShell("B3 테이블", `
    <div class="wf-tabs wf-section"><button class="wf-tab is-active">주문 편집</button><button class="wf-tab">결제·정산</button></div>
    <div class="wf-grid cols-2">
      <section class="wf-card">
        <div class="wf-section-header"><div><h4>B3 · 남녀 2명, 창가</h4><p>18:32 생성 · owner01</p></div>${statusBadge("계산 요청", "warning")}</div>
        <div class="wf-order-lines">
          ${orderLine("하이볼", "잔 · 12,000원", "2", "24,000원")}
          ${orderLine("맥캘란 12", "샷 · 30ml · 18,000원", "1", "18,000원")}
          ${orderLine("단골 할인", "금액 조정 · 사유 기록", "", "-5,000원")}
        </div>
        <button class="wf-button" style="width:100%;margin-top:10px" data-toast="메뉴 선택 sheet">+ 메뉴 또는 기타 항목 추가</button>
      </section>
      <aside class="wf-card">
        <h4>정산 요약</h4>
        <div class="wf-list"><div class="wf-list-item"><span>메뉴 합계</span><strong>42,000원</strong></div><div class="wf-list-item"><span>조정</span><strong>-5,000원</strong></div></div>
        <div class="wf-summary-bar" style="margin-top:12px"><span>최종 금액</span><strong>37,000원</strong></div>
        <div class="wf-callout" style="margin-top:12px"><div><strong>계좌이체 확인 후</strong> 정산 완료를 누르세요. 이 기능은 결제를 처리하지 않습니다.</div></div>
        <div class="wf-form" style="margin-top:12px">${button("계산 요청 취소")}${button("입금 확인 · 정산 완료", "primary")}${button("테이블 취소", "danger")}</div>
      </aside>
    </div>
    <details class="wf-card" style="margin-top:12px"><summary><strong>변경 히스토리</strong> · 3건</summary></details>
  `, "orders", button("메뉴 추가", "primary")),

  settlements: () => appShell("정산 내역", `
    <div class="wf-grid cols-2">
      ${statCard("오늘 정산", "486,000원", "완료 11건")}
      ${statCard("현재 조회", "11건", "정산 완료만")}
    </div>
    <div class="wf-toolbar"><input class="wf-search" placeholder="테이블·손님 설명 검색"/><button class="wf-button" data-nav="orders">테이블 목록</button></div>
    <table class="wf-table"><thead><tr><th>번호</th><th>테이블</th><th>최종 합계</th><th>정산 시각</th><th>항목</th></tr></thead><tbody>
      <tr><td>B2</td><td>바 좌석 2 · 혼자</td><td>58,000원</td><td>오늘 21:10</td><td>3개</td></tr>
      <tr><td>A1</td><td>4명 · 생일</td><td>128,000원</td><td>오늘 20:42</td><td>7개</td></tr>
      <tr><td>T5</td><td>남자 3명</td><td>72,000원</td><td>오늘 19:55</td><td>4개</td></tr>
    </tbody></table>
  `, "orders"),

  audit: () => appShell("감사 로그", `
    <div class="wf-toolbar"><input class="wf-search" placeholder="actor·request ID 검색"/><select class="wf-select"><option>전체 작업</option></select><select class="wf-select"><option>전체 바</option></select><button class="wf-button">기간</button></div>
    <table class="wf-table"><thead><tr><th>시각</th><th>actor</th><th>작업</th><th>대상</th><th>결과</th><th>request ID</th></tr></thead><tbody>
      ${auditRow("18:12:42", "systemadmin", "publication.completed", "Sample Bar", "성공", "req_01J...")}
      ${auditRow("18:03:11", "owner01", "order_tab.settled", "B2 / 58,000원", "성공", "req_01K...")}
      ${auditRow("17:52:08", "systemadmin", "user.unlocked", "staff02", "성공", "req_01L...")}
      ${auditRow("17:42:30", "owner01", "publication.timeout_unknown", "Sample Bar", "확인 필요", "req_01M...")}
    </tbody></table>
  `, "audit", button("보관 작업", "")),

  "customer-menu": () => customerMenuMarkup(false)
};

function activityTable() {
  return `<table class="wf-table"><thead><tr><th>시각</th><th>작업</th><th>대상</th><th>사용자</th></tr></thead><tbody>
    <tr><td data-label="시각">18:12</td><td data-label="작업">메뉴판 발행</td><td data-label="대상">Sample Bar rev.12</td><td data-label="사용자">systemadmin</td></tr>
    <tr><td data-label="시각">18:03</td><td data-label="작업">주문 정산</td><td data-label="대상">B2 · 58,000원</td><td data-label="사용자">manager01</td></tr>
    <tr><td data-label="시각">17:55</td><td data-label="작업">메뉴 품절</td><td data-label="대상">네그로니</td><td data-label="사용자">owner01</td></tr>
  </tbody></table>`;
}
function barRow(name, slug, status, members, menus, published, nav) { return `<tr><td data-label="바"><div class="wf-row-title">${name}</div><div class="wf-row-sub">${slug}</div></td><td data-label="상태">${statusBadge(status,"success")}</td><td data-label="구성원">${members}</td><td data-label="메뉴">${menus}</td><td data-label="최근 발행">${published}</td><td><button class="wf-button" data-nav="${nav}">열기</button></td></tr>`; }
function userRow(name, status, bars, login, locked=false) { return `<tr><td data-label="사용자"><div class="wf-row-title">${name}</div><div class="wf-row-sub">아이디 로그인</div></td><td data-label="상태">${statusBadge(status, locked?"danger":"success")}</td><td data-label="소속">${bars}</td><td data-label="최근 로그인">${login}</td><td>${button(locked?"잠금 해제":"관리")}</td></tr>`; }
function memberItem(name, role, active=false) { return `<button class="wf-list-item ${active?"is-active":""}" type="button" data-toast="${name} 권한 편집"><div class="wf-item-main"><div class="wf-item-title">${name}</div><div class="wf-item-meta">${role}</div></div><span>›</span></button>`; }
function permissionCheck(label, checked) { return `<label class="wf-check-row"><span class="wf-check" style="${checked?"background:#303640;box-shadow:inset 0 0 0 3px #fff":""}"></span><span>${label}</span></label>`; }
function hoursRow(day, open, close) { return `<div class="wf-price-row" style="grid-template-columns:60px 1fr 1fr 36px;margin-top:7px"><strong>${day}</strong><div class="wf-field">${open}</div><div class="wf-field">${close || "—"}</div><button class="wf-button wf-icon-button">×</button></div>`; }
function typeItem(name, meta, active) { return `<button class="wf-list-item ${active?"is-active":""}" type="button" data-toast="${name} 편집"><div class="wf-item-main"><div class="wf-item-title">${name}</div><div class="wf-item-meta">${meta}</div></div><span>›</span></button>`; }
function badgeItem(name, color, meta) { return `<div class="wf-list-item"><div style="display:flex;align-items:center;gap:8px"><span style="width:24px;height:24px;border-radius:6px;background:${color}"></span><div class="wf-item-main"><div class="wf-item-title">${name}</div><div class="wf-item-meta">${meta}</div></div></div>${button("편집")}</div>`; }
function treeNode(name, meta, children=[], active=false) { return `<div class="wf-tree-node ${active?"is-active":""}"><div class="node-row"><span class="wf-drag">⋮⋮</span><div class="wf-item-main"><div class="wf-item-title">${name}</div><div class="wf-item-meta">${meta}</div></div><div class="wf-spacer"></div><span>↑ ↓</span><button class="wf-button wf-icon-button">⋯</button></div>${children.length?`<div class="wf-children">${children.map(child=>`<div class="wf-list-item"><span class="wf-drag">⋮⋮</span><span class="wf-item-title">${child}</span><div class="wf-spacer"></div><span>↑ ↓</span></div>`).join("")}</div>`:""}</div>`; }
function menuRow(name, category, price, badge, sale, visible, modified) { return `<tr><td><span class="wf-check"></span></td><td data-label="메뉴"><button class="wf-button ghost" data-nav="menu-editor"><div class="wf-row-title">${name}</div></button></td><td data-label="카테고리">${category}</td><td data-label="가격">${price}</td><td data-label="배지">${badge?statusBadge(badge):"—"}</td><td data-label="판매">${statusBadge(sale,sale==="품절"?"danger":"success")}</td><td data-label="노출"><div class="wf-switch ${visible?"on":""}"></div></td><td data-label="수정">${modified}</td></tr>`; }
function priceRow(label, volume, amount) { return `<div class="wf-price-row"><input class="wf-input" value="${label}"/><input class="wf-input" value="${volume}"/><input class="wf-input" value="${amount}"/><button class="wf-button wf-icon-button">×</button></div>`; }
function publicationRow(id, status, revision, actor, completed, tone) { return `<tr><td data-label="요청"><div class="wf-row-title">${id}</div></td><td data-label="상태">${statusBadge(status,tone)}</td><td data-label="revision">${revision}</td><td data-label="발행자">${actor}</td><td data-label="완료">${completed}</td><td>${button(status==="성공"?"상세·재발행":"상세")}</td></tr>`; }
function overviewLink(title, meta, nav) { return `<button class="wf-card" type="button" data-nav="${nav}" style="text-align:left"><h4>${title} →</h4><p>${meta}</p></button>`; }
function orderCard(label, description, total, status, tone) { return `<button class="wf-card" type="button" data-nav="order-detail" style="text-align:left"><div class="wf-section-header"><h4>${label}</h4>${statusBadge(status,tone)}</div><p>${description}</p><div class="wf-kpi-value" style="font-size:20px">${total}</div><div class="wf-kpi-meta">최근 수정 2분 전</div></button>`; }
function orderLine(name, meta, qty, total) { return `<div class="wf-order-line"><div class="wf-item-main"><div class="wf-item-title">${name}</div><div class="wf-item-meta">${meta}</div></div>${qty?`<div class="wf-qty"><span>−</span><strong>${qty}</strong><span>＋</span></div>`:"<span></span>"}<strong class="line-total">${total}</strong><button class="wf-button wf-icon-button line-action">⋯</button></div>`; }
function auditRow(time, actor, action, target, result, request) { return `<tr><td data-label="시각">${time}</td><td data-label="actor">${actor}</td><td data-label="작업"><div class="wf-row-title">${action}</div></td><td data-label="대상">${target}</td><td data-label="결과">${statusBadge(result,result==="성공"?"success":"warning")}</td><td data-label="request ID"><code>${request}</code></td></tr>`; }

function customerMenuMarkup(embedded) {
  return `<div class="wf-customer">
    <header class="wf-customer-head"><h2>Sample Bar</h2><p>클래식 칵테일과 위스키, 간단한 페어링 푸드를 편안하게 즐길 수 있는 바입니다.</p><div class="wf-customer-info"><span>서울시 마포구 와우산로 00</span><span>02-123-4567</span><span>오늘 18:00–다음날 02:00</span><span>Instagram ↗</span></div></header>
    <div class="wf-customer-layout">
      <nav class="wf-customer-nav"><button class="is-active">추천</button><button>위스키</button><button>칵테일</button><button>와인</button><button>푸드</button><button>시가</button></nav>
      <main class="wf-customer-main"><input class="wf-customer-search" placeholder="메뉴 검색"/>
        <section class="wf-menu-section"><h3>추천</h3><p>Sample Bar가 추천하는 메뉴입니다.</p><div class="wf-menu-cards">
          ${customerCard("맥캘란 12", "셰리 오크의 풍부한 건과일과 스파이스", "샷 18,000원", ["추천","40% ABV","Speyside"])}
          ${customerCard("네그로니", "진, 캄파리, 스위트 베르무트", "품절", ["품절"], true)}
          ${customerCard("치즈 플레이트", "숙성 치즈 3종과 견과류", "플레이트 24,000원", ["페어링"])}
          ${customerCard("Montecristo No.4", "Medium strength · 약 45분", "1개 38,000원", ["Cuba","Petit Corona"])}
        </div></section>
        <section class="wf-menu-section"><h3>빈 카테고리</h3><p>등록된 메뉴가 없습니다.</p></section>
      </main>
    </div>
  </div>`;
}
function customerCard(name, description, price, meta, soldout=false) { return `<article class="wf-menu-card ${soldout?"is-soldout":""}"><div class="wf-menu-card-head"><h4>${name}</h4><span class="wf-menu-price">${price}</span></div><p>${description}</p><div class="wf-menu-meta">${meta.map(value=>`<span>${value}</span>`).join("")}</div></article>`; }

function bindProductInteractions() {
  screenCanvas.querySelectorAll("[data-nav]").forEach(element => element.addEventListener("click", () => {
    const target = element.dataset.nav;
    if (screenById.has(target)) { state.screenId = target; render(); document.querySelector("#preview").scrollIntoView({ behavior: "smooth", block: "start" }); }
  }));
  screenCanvas.querySelectorAll("[data-toast]").forEach(element => element.addEventListener("click", () => showToast(`${element.dataset.toast} — 실제 구현에서는 권한·상태 검증 후 동작합니다.`)));
  screenCanvas.querySelectorAll("[data-demo-form]").forEach(form => form.addEventListener("submit", event => { event.preventDefault(); showToast("와이어프레임 제출 예시입니다. 실제 API는 개발 업무에서 연결합니다."); }));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2500);
}

document.addEventListener("click", event => {
  const screenButton = event.target.closest("[data-screen]");
  if (screenButton) { state.screenId = screenButton.dataset.screen; render(); return; }
  const viewportButton = event.target.closest("[data-viewport]");
  if (viewportButton) { state.viewport = viewportButton.dataset.viewport; render(); }
});
$("#screenSearch").addEventListener("input", event => renderScreenList(event.target.value));
window.addEventListener("hashchange", () => {
  const next = readHash();
  if (screenById.has(next.screen)) state.screenId = next.screen;
  if (["compact","medium","wide"].includes(next.viewport)) state.viewport = next.viewport;
  render();
});

render();
