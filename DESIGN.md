# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-06-24
- Primary product surfaces: 관리자 시스템, 고객 메뉴판, 파일럿 운영 점검 화면
- Evidence reviewed: `요구사항.md`, `설계.md`, `개발계획.md`, `wireframes/README.md`, `wireframes/화면맵.md`, `진행상태.md`, `admin-menu-manager/src`, `admin-menu-manager/server`, Playwright 화면 테스트

## Brand
- Personality: THE BAR는 실제 소규모 바 운영자가 매일 쓰는 조용하고 신뢰할 수 있는 백오피스다.
- Trust signals: 로그인 전 보호, 권한별 메뉴 노출, 바 선택 컨텍스트, 저장/발행/주문 상태의 명확한 피드백, 한국어 업무 용어.
- Avoid: Bar Ops, Dxx/WF/done 같은 개발 표식, raw role/status enum, 내부 ID 중심 화면, 과도한 히어로 장식, 한 가지 색만 반복되는 팔레트.

## Product goals
- Goals: 바별 메뉴, 발행, 주문, 감사 업무를 같은 URL과 같은 데이터 상태로 안정적으로 운영한다.
- Non-goals: 기기별 페이지 트리, 화면 폭 기반 redirect, 미완성 업무 placeholder를 상용 메뉴처럼 노출.
- Success signals: 로그인하지 않으면 보호 화면 외 접근 불가, 권한 없는 메뉴가 사이드바와 직접 URL 모두에서 차단, resize 후 선택/필터/form 상태 유지, 세 viewport에서 리스트와 액션 사용 가능.

## Personas and jobs
- Primary personas: 시스템 관리자, 바 오너, 매니저, 스태프, 고객 메뉴판 이용자.
- User jobs: 바 선택, 메뉴/카테고리/품목 유형 관리, 발행 검증, 주문 운영, 감사/파일럿 점검.
- Key contexts of use: 현장 태블릿, 데스크톱 백오피스, 휴대폰 긴급 수정, 네트워크 지연이 있는 현장.

## Information architecture
- Primary navigation: 동일 관리자 앱 셸에서 권한에 맞는 메뉴만 표시한다.
- Core routes/screens: `/dashboard`, `/bars`, `/bars/{barId}`, `/bars/{barId}/menus`, `/bars/{barId}/publications`, `/bars/{barId}/orders`, `/system/*`.
- Content hierarchy: 현재 작업 바와 계정 컨텍스트가 상단에 있고, 사이드바는 권한과 선택 바를 기준으로 최소 메뉴만 노출한다. 현장 사용성이 중요한 compact·medium에서는 주문 운영 그룹을 가장 먼저 탐색할 수 있어야 한다. 고객 메뉴판은 같은 `/{encodedSlug}` 경로에서 발행 JSON의 `layout.concept`에 따라 클래식 레일형, 현장 속도형, 큐레이션형, 메뉴북형을 표시한다.

## Design principles
- Principle 1: 운영자가 보는 문구는 업무 언어여야 한다. 코드값은 저장소와 API 계약에 남기되 기본 UI에는 표시하지 않는다.
- Principle 2: 리스트 화면은 같은 그리드 표면을 공유한다. wide는 테이블, compact는 같은 데이터의 카드 표현으로 전환한다.
- Tradeoffs: TUI Grid는 공식 Grid 제품과 React wrapper가 있으나 현재 wrapper의 React peer range가 React 16/17 기준이라 React 19 앱에 즉시 추가하지 않는다. 우선 repo-native grid/list 패턴을 통일하고, 대량 편집이 필요한 화면에서 별도 호환성 검증 후 도입한다.

## Visual language
- Color: 회색 기반 업무 배경에 녹색 accent, warning, danger를 기능 상태에만 사용한다.
- Typography: 시스템 UI 폰트, 작은 패널에는 작은 제목, 히어로급 타입은 실제 페이지 헤더에만 사용한다.
- Spacing/layout rhythm: 8px radius, 12-24px spacing, density는 백오피스 기준으로 유지한다.
- Shape/radius/elevation: 페이지 섹션과 반복 카드만 가벼운 elevation을 사용하고, 중첩 카드는 피한다.
- Motion: 필수 전환만 짧게 사용하고 reduced motion을 방해하지 않는다.
- Imagery/iconography: 관리자 시스템은 장식 이미지보다 명확한 라벨, 배지, 상태 표시를 우선한다.

## Components
- Existing components to reuse: `AppShell`, `AdaptiveDialog`, `data-table`, `data-card`, `status-badge`, `field`, `button`, `panel`, `hero-panel`.
- New/changed components: 공통 리스트 표면은 CSS token 기반 grid 스타일로 통일한다. 품목 유형 편집은 생성 시작 시 편집 패널로 스크롤/포커스한다. 고객 메뉴판 `PublicMenuRenderer`는 public JSON의 컨셉 계약을 유지하되 현재 활성 옵션은 메뉴북형만 노출한다. 관리자 미리보기는 `layoutConcept` query와 같은 renderer 스타일로 발행 전 고객 화면 컨셉을 검증하며, 메뉴북형 검색·매장 정보·메뉴 상세는 하단 확장 없이 팝업으로 처리한다.
- Variants and states: loading, empty, error, forbidden, conflict, success, disabled, selected, hover를 구분한다.
- Token/component ownership: `admin-menu-manager/src/styles/tokens.css`와 `global.css`가 현재 디자인 시스템의 소스다.

## Accessibility
- Target standard: keyboard-first 운영 가능, 44px touch target, 명시적 label과 오류 요약.
- Keyboard/focus behavior: 생성/편집 CTA는 첫 입력으로 focus 이동하거나 dialog/sheet focus를 유지한다.
- Contrast/readability: 상태 배지는 텍스트와 배경 대비를 확보하고, raw color swatch만 정보로 쓰지 않는다.
- Screen-reader semantics: tables, form labels, status/alert role, dialog aria label을 유지한다.
- Reduced motion and sensory considerations: 자동 애니메이션보다 상태 문구와 구조를 우선한다.

## Responsive behavior
- Supported breakpoints/devices: 390x844, 768x1024, 1440x900.
- Layout adaptations: 같은 route와 component를 유지하고 CSS media/container query로 table/card, drawer/sidebar, dialog/sheet 표현만 바꾼다. 모바일 drawer와 태블릿 sidebar는 주문 운영을 우선 노출하되 권한 없는 기능은 계속 숨긴다. 메뉴북형 고객 메뉴판은 compact 1열, medium 2열, wide 3열 지면형 메뉴를 사용하며 검색은 버튼 팝업으로 접는다.
- Touch/hover differences: compact에서는 주요 액션을 카드와 sticky action으로 접근 가능하게 하고, hover에만 의존하지 않는다.

## Interaction states
- Loading: 데이터가 무엇을 확인 중인지 업무 언어로 표시한다.
- Empty: 다음 가능한 업무를 안내하되 미완성 개발 상태를 노출하지 않는다.
- Error: 사용자 메시지를 우선하고 내부 error code는 기본 UI에 붙이지 않는다.
- Success: 저장, 발행, 주문 변경 후 어떤 데이터가 반영됐는지 짧게 표시한다.
- Disabled: 권한 없음, 선택 필요, 저장할 변경 없음, 진행 중을 분리한다.
- Offline/slow network, if applicable: 발행과 주문은 지연/충돌 상태를 성공이나 실패로 단정하지 않는다.

## Content voice
- Tone: 짧고 직접적인 한국어 운영 문구.
- Terminology: THE BAR, 현재 작업 바, 고객 메뉴판, 공개 데이터, 검증 번호, 반영 번호, 오너·매니저·스태프.
- Microcopy rules: `Dxx`, `WF`, `done`, `schema valid`, `commit`, `snapshot`, `preparing`, `system-admin` 같은 내부 표현을 기본 화면에 노출하지 않는다. `/recovery`는 요구사항상 유지하지만 로그인 화면의 일반 행동 버튼으로 노출하지 않는다.

## Implementation constraints
- Framework/styling system: React + Vite, Cloudflare Pages Functions, Hono, D1, Zod, Vitest, Playwright.
- Design-token constraints: 새 디자인 의사결정은 먼저 tokens/global CSS와 기존 컴포넌트를 확장한다.
- Performance constraints: 리스트 화면은 불필요한 dependency와 대형 bundle을 피하고, 대량 grid 도입은 별도 검증 후 진행한다.
- Compatibility constraints: `@toast-ui/react-grid@4.21.22`는 React 16/17 peer range라 현재 React `latest` 앱에 즉시 추가하지 않는다. 공식 Grid/Tree는 후보로 남긴다.
- Test/screenshot expectations: 390, 768, 1440에서 Playwright screenshot 또는 interaction evidence를 남긴다.

## Open questions
- [ ] 대표 운영자 기준 시각 레퍼런스 / owner / 이후 UI 고도화의 세밀한 밀도와 tone 결정
- [ ] 아이콘 라이브러리 도입 여부 / engineer / 현재 dependency 추가 금지에 따라 보류
- [ ] TUI Grid 파일럿 화면 선정 / engineer / 대량 데이터 화면에서 React 호환성 검증 후 결정
