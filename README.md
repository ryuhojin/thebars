# Bar Menu Operations v1.0 — 최종 개발 워크스페이스

이 패키지는 실제 소규모 바에서 운영할 메뉴 관리·고객 메뉴판·간이 주문/정산 시스템을 Codex로 업무 단위별 구현하기 위한 기준 문서와 반응형 UI 와이어프레임을 포함한다.

## 문서 우선순위

1. `요구사항.md`
2. `설계.md`
3. `개발계획.md`
4. `wireframes/화면맵.md`와 `wireframes/index.html`
5. `진행상태.md`
6. 기존 코드 관행

와이어프레임은 승인된 정보 구조와 상호작용 기준이다. 색상·타이포그래피 같은 시각 스타일은 저충실도 예시이며 요구사항·설계와 충돌하면 상위 문서를 따른다.

## 시작 방법

1. 저장소 루트에 이 문서들을 둔다.
2. 브라우저에서 `wireframes/index.html`을 연다.
3. `AGENTS.md`를 Codex가 읽게 한다.
4. `진행상태.md`에서 가장 앞선 미완료 업무 하나만 구현한다.
5. 현재 업무에 연결된 와이어프레임 화면을 확인한 뒤 DB·백엔드·프론트엔드·세 화면 폭 테스트를 완결한다.

## 포함 파일

```text
요구사항.md
설계.md
개발계획.md
AGENTS.md
진행상태.md
변경내역.md
wireframes/
  README.md
  화면맵.md
  index.html
  styles.css
  app.js
```

## 와이어프레임 검증 화면 폭

- Compact: 390×844
- Medium: 768×1024
- Wide: 1440×900

기기별 URL은 만들지 않는다. 같은 업무는 같은 제품 URL을 유지하며 레이아웃과 상호작용 표현만 적응한다.

## D00 기반 코드 실행

D00은 제품 기능을 선행 구현하지 않고 두 앱의 실행·검증 기반만 만든다.

```bash
npm install
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

- 관리자 앱: `admin-menu-manager` / Vite 기본 포트 `5173`
- 고객 앱: `customer-menu-board` / Vite 기본 포트 `5174`
- Playwright screenshot 산출물: 각 앱의 `test-results/`
- D1은 `admin-menu-manager/db/migrations/0000_d00_foundation.sql`부터 순차 migration을 시작한다.
- GitHub/Cloudflare 연동은 D00에서 fake adapter interface만 제공하며 실제 외부 쓰기를 수행하지 않는다.

## D01 로컬 인증 확인

관리자 로컬 서버:

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/setup`
- `http://127.0.0.1:5173/login`
- `http://127.0.0.1:5173/change-password`
- `http://127.0.0.1:5173/recovery`

로컬 dev server에는 production에 포함되지 않는 `/__dev/reset-auth` 초기화 경로와 forced password fixture가 있다.

- 아이디: `forced1`
- 임시 비밀번호: `<local-fixture-password>`
- 변경 예시: `<local-fixture-password>`

실제 setup/recovery secret은 `.env.example`의 변수 이름만 문서화하며 저장소에 넣지 않는다.

## D02 로컬 대시보드 확인

같은 관리자 로컬 서버에서 `/dashboard`를 확인한다.

- URL: `http://127.0.0.1:5173/dashboard`
- 시스템 관리자 fixture: `admin1` / `<local-fixture-password>`
- 바 사용자 fixture: `staff1` / `<local-fixture-password>`
- 강제 비밀번호 변경 fixture: `forced1` / `<local-fixture-password>`

D02는 D03의 바 schema를 선행 구현하지 않는다. 따라서 접근 가능한 바 목록은 비어 있고, 바·발행·주문 위젯은 명시적인 `unavailable` 상태와 후속 업무 사유를 표시한다.

## D03 로컬 바 관리 확인

같은 관리자 로컬 서버에서 바 목록, 새 바 등록, 바 상세를 확인한다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/bars`
- `http://127.0.0.1:5173/bars/new`
- `http://127.0.0.1:5173/bars/{barId}`
- `http://127.0.0.1:5173/dashboard`

로컬 fixture:

- 시스템 관리자: `admin1` / `<local-fixture-password>`
- 바 사용자: `staff1` / `<local-fixture-password>`

D03은 system-admin만 바를 생성·조회할 수 있다. 생성 시 내부 `slug`와 고객 메뉴판 `encodedSlug`는 서버에서 자동 생성되며, 고객 메뉴판은 `preparing` 상태로 시작한다. D15 발행 전까지 실제 GitHub/Cloudflare 쓰기는 수행하지 않는다.

## D04 로컬 사용자 관리 확인

같은 관리자 로컬 서버에서 시스템 사용자 계정을 관리한다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/system/users`
- `http://127.0.0.1:5173/dashboard`

로컬 fixture:

- 시스템 관리자: `admin1` / `<local-fixture-password>`
- 일반 사용자: `staff1` / `<local-fixture-password>`

D04는 system-admin만 일반 사용자 계정을 생성·활성화·비활성화·잠금 해제·비밀번호 초기화할 수 있다. 임시 비밀번호는 생성 또는 초기화 응답 직후 한 번만 화면에 표시되며 목록·상세 응답에는 포함되지 않는다. 사용자를 비활성화하면 기존 active session은 즉시 revoke된다.

## D05 로컬 바 회원·권한 확인

같은 관리자 로컬 서버에서 바별 회원과 역할 권한을 관리한다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/bars`
- `http://127.0.0.1:5173/bars/{barId}/members`
- `http://127.0.0.1:5173/dashboard`

로컬 fixture:

- 시스템 관리자: `admin1` / `<local-fixture-password>`
- 일반 사용자: `staff1` / `<local-fixture-password>`

D05는 system-admin만 바 회원을 추가·역할 변경·비활성화하고 역할별 권한 matrix를 저장할 수 있다. 신규 바 생성 시 owner/manager/staff 기본 권한이 함께 seed되며, 일반 사용자는 active membership이 있는 바만 대시보드와 바 상세에서 접근할 수 있다. 실제 메뉴 편집·주문 권한 사용은 D10 이후 메뉴와 D18 이후 주문 업무에서 연결한다.

## D06 로컬 바 기본 정보 확인

같은 관리자 로컬 서버에서 고객 공개용 바 정보, 영업시간, 외부 링크, 통화를 관리한다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/bars`
- `http://127.0.0.1:5173/bars/{barId}/settings`
- `http://127.0.0.1:5173/bars/{barId}`

로컬 fixture:

- 시스템 관리자: `admin1` / `<local-fixture-password>`
- 일반 사용자: `staff1` / `<local-fixture-password>`

D06은 system-admin 또는 해당 바의 `canEditMenu` 권한이 있는 active member가 바 공개 profile, 영업시간, 외부 링크를 저장할 수 있다. 통화 변경은 system-admin만 가능하며 기존 금액 숫자를 변환하지 않는다. 저장은 draft hash 기반 미발행 변경만 갱신하고, D15 발행 전까지 고객 JSON은 유지된다.

## D07 로컬 품목 유형·포도 품종 확인

같은 관리자 로컬 서버에서 공통 품목 유형, 바 전용 유형, 포도 품종 후보 승인 흐름을 관리한다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/system/item-types`
- `http://127.0.0.1:5173/bars`

로컬 fixture:

- 시스템 관리자: `admin1` / `<local-fixture-password>`
- 일반 사용자: `staff1` / `<local-fixture-password>`

D07은 fixed template union을 코드와 contract로 고정하고 admin UI에서 template schema 자체는 편집하지 않는다. system-admin은 시스템 공통 유형과 포도 품종 후보 승인 큐를 관리할 수 있고, system-admin 또는 해당 바 owner는 바 전용 유형과 공통 유형 숨김·기본 가격 label override를 관리할 수 있다. 포도 품종 후보는 `canEditMenu` 권한으로 제출할 수 있지만 승인 전까지 승인 품종 목록에 노출되지 않는다.

## D08 로컬 배지·색상 확인

같은 관리자 로컬 서버에서 배지 색상, 시스템 공통 배지, 바 전용 배지와 바별 공통 배지 표시 상태를 관리한다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/system/badges`
- `http://127.0.0.1:5173/bars`

로컬 fixture:

- 시스템 관리자: `admin1` / `<local-fixture-password>`
- 일반 사용자: `staff1` / `<local-fixture-password>`

D08은 공통 색상 팔레트를 `#RRGGBB` 또는 `#RRGGBBAA`로 검증하고, 배지 preview에는 서버와 프론트가 공유하는 대비 계산을 사용한다. 새 공통 배지는 기존/신규 바에서 기본 숨김이며, 바별 표시 전환은 `/system/badges` 같은 route 내부에서 처리한다. 사용 중인 색상 비활성화는 대체 색상이 필요하고, 사용 중인 배지 비활성화·삭제는 영향 메뉴 수 확인 후 메뉴 배지 연결을 제거한다. D12 전까지 실제 메뉴 편집 화면에는 배지 assignment UI를 연결하지 않고, D08에서는 DB/API 준비와 관리 화면까지만 완료한다.

## D09 로컬 카테고리 관리 확인

같은 관리자 로컬 서버에서 바별 2단계 카테고리를 관리한다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/bars`
- `http://127.0.0.1:5173/bars/{barId}`
- `http://127.0.0.1:5173/bars/{barId}/categories`

로컬 fixture:

- 시스템 관리자: `admin1` / `<local-fixture-password>`
- 일반 사용자: `staff1` / `<local-fixture-password>`

D09는 system-admin 또는 해당 바의 `canEditMenu` 권한이 있는 active member가 카테고리를 생성·수정·정렬·상위 이동·삭제할 수 있다. 카테고리는 최대 2단계이며 같은 단계 이름은 중복될 수 없다. 메뉴가 직접 연결된 카테고리는 삭제할 수 없고, 메뉴가 없는 하위 카테고리만 확인 checkbox 후 cascade 삭제된다. D10 전까지 실제 메뉴 CRUD는 아직 없으므로 menu usage count는 향후 `menu_items` 연결 지점만 준비한다.

## D10 로컬 메뉴 기본 CRUD 확인

같은 관리자 로컬 서버에서 바별 메뉴 기본 정보를 관리한다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/bars`
- `http://127.0.0.1:5173/bars/{barId}/categories`
- `http://127.0.0.1:5173/bars/{barId}/menus`
- `http://127.0.0.1:5173/bars/{barId}/menus/new`
- `http://127.0.0.1:5173/bars/{barId}/menus/{menuItemId}`

로컬 fixture:

- 시스템 관리자: `admin1` / `<local-fixture-password>`
- 일반 사용자: `staff1` / `<local-fixture-password>`

D10은 system-admin 또는 해당 바의 `canEditMenu` 권한이 있는 active member가 메뉴 이름, 설명, 카테고리, 선택 품목 유형, 판매 상태, 노출 상태, ABV를 생성·수정·삭제할 수 있다. 메뉴는 leaf 카테고리에만 직접 배치되며, 카테고리 변경 시 대상 카테고리 최상단으로 이동한다. 같은 바 안의 메뉴 이름은 정규화 기준으로 중복될 수 없다. 삭제는 영구 삭제이며 D08의 `menu_item_badges` 참조를 정리한다. 가격, 상세 템플릿 필드, 내부 메모, 배지 일괄 편집은 D11/D12 범위로 남긴다.

## D11 로컬 가격·상세 템플릿·내부 메모 확인

같은 관리자 로컬 서버에서 기존 메뉴 상세 URL을 사용한다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/bars/{barId}/menus/new`
- `http://127.0.0.1:5173/bars/{barId}/menus/{menuItemId}`

로컬 fixture:

- 시스템 관리자: `admin1` / `<local-fixture-password>`
- 일반 사용자: `staff1` / `<local-fixture-password>`

D11은 같은 메뉴 상세 URL에서 가격 0~10개, 고정 상세 템플릿 필드, 내부 메모를 저장한다. 가격 금액은 정수이며 같은 메뉴 안의 가격 label은 정규화 기준으로 중복될 수 없다. 품목 유형을 선택하면 기본 가격 label이 새 메뉴 form에 자동 채워지고, 유형 변경으로 상세 템플릿이 달라질 때는 기존 상세값 삭제 확인이 필요하다. 내부 메모는 active bar member가 읽을 수 있지만 수정은 system-admin 또는 owner만 가능하며 public JSON에는 포함하지 않는다. compact·medium·wide는 같은 route와 form state를 공유하고 resize로 가격 순서, 상세 입력, 내부 메모 draft가 사라지지 않는다.

## D12 로컬 메뉴 목록·일괄 수정·배지 확인

같은 관리자 로컬 서버에서 기존 메뉴 목록 URL을 사용한다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/bars/{barId}/menus`
- `http://127.0.0.1:5173/bars/{barId}/menus/new`
- `http://127.0.0.1:5173/system/badges`

로컬 fixture:

- 시스템 관리자: `admin1` / `<local-fixture-password>`
- 일반 사용자: `staff1` / `<local-fixture-password>`

D12는 `/bars/{barId}/menus` 같은 URL에서 전체 목록과 카테고리 보기를 제공하고, 검색·카테고리·품목 유형·판매 상태·노출·배지 필터를 같은 query/selection state로 처리한다. wide는 table, compact는 card와 하단 bulk action으로 적응하지만 선택, quick edit, bulk draft, 저장 mutation은 공유한다. 일괄 변경은 판매 상태, 노출, 카테고리 이동, 배지 교체/제거를 저장 전 초안으로 적용한 뒤 최종 저장하며, 메뉴당 배지는 최대 3개이고 순서 변경 버튼을 제공한다. `sold_out` 메뉴에 저장된 배지는 admin 목록에서는 보이지만 public JSON에서는 D13에서 숨김 처리해야 한다.

## D13 로컬 public DTO·미리보기 확인

같은 관리자 로컬 서버에서 public JSON 변환 결과와 고객 메뉴판 렌더링을 미리 본다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/dashboard`
- `http://127.0.0.1:5173/bars/{barId}/preview`
- `http://127.0.0.1:5173/bars/{barId}/menus`
- `http://127.0.0.1:5174/YmFyLWE3azJtOQ`

화면 확인용 full fixture:

- 초기화: `POST http://127.0.0.1:5173/__dev/reset-auth?fixtures=full`
- 시스템 관리자: `admin1` / `<local-fixture-password>`
- 바 owner: `owner1` / `<local-fixture-password>`
- 바 manager: `manager1` / `<local-fixture-password>`
- 바 staff: `staff1` / `<local-fixture-password>`
- 더미 바: `Sample Bar`, `Whisky Lab`

D13은 `/api/bars/{barId}/preview`에서 저장된 바·카테고리·메뉴·가격·상세·배지를 public DTO로 변환하고 Zod schema와 canonical content hash를 검증한다. 내부 ID, 사용자 정보, 내부 메모, token 계열 field는 public JSON에 포함하지 않는다. hidden 카테고리·메뉴는 제외하고, `sold_out` 메뉴는 이름·설명·ABV만 공개하며 가격·용량·배지는 숨긴다. 관리자 header에는 접근 가능한 바를 고르는 `현재 작업 바` selector가 있고, sidebar는 system-admin/owner/manager/staff 권한에 맞는 메뉴만 노출한다. full fixture는 두 개 바를 제공하므로 manager/owner가 selector로 바를 바꾸고 카테고리·메뉴 화면으로 이동하는 흐름을 바로 확인할 수 있다. 미리보기는 WF-17의 같은 `/bars/{barId}/preview` URL에서 compact·medium·wide layout만 전환하며 범위 선택, 검색어, 현재 작업 바 선택은 resize 후 유지된다. 실제 GitHub 발행은 D15 범위라 D13에서는 수행하지 않는다.

## D14 로컬 고객 메뉴판 확인

고객 앱은 정적 public JSON만 읽고 `/{encodedSlug}` 단일 URL에서 메뉴판을 렌더링한다.

```bash
cd customer-menu-board
npm run dev -- --port 5174
```

확인 URL:

- `http://127.0.0.1:5174/YmFyLWE3azJtOQ`
- 정적 JSON: `http://127.0.0.1:5174/menus/YmFyLWE3azJtOQ.json`

D14는 `GET /menus/{encodedSlug}.json`만 사용한다. 관리자 API, D1, 주문, 결제, 로그인 링크를 호출하거나 노출하지 않는다. public JSON fetch는 `cache: "no-cache"`, `credentials: "omit"`로 요청하며 React dev StrictMode에서도 같은 slug의 동시 in-flight 요청을 하나로 합친다. 고객 화면은 바 정보 접기/펼치기, 검색, 카테고리 탐색, 메뉴 상세 펼침, 가격·ABV·배지·템플릿 상세, 품절/빈 카테고리, preparing, 404, schema/network 오류를 처리한다. 5분 idle reset은 검색·선택·펼침 같은 UI 상태만 초기화하고 URL은 유지한다.

## D15 로컬 GitHub 발행 확인

관리자 로컬 서버에서 미리보기 또는 메뉴 목록의 발행 액션으로 같은 발행 화면에 진입한다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/dashboard`
- `http://127.0.0.1:5173/bars/{barId}/preview`
- `http://127.0.0.1:5173/bars/{barId}/menus`
- `http://127.0.0.1:5173/bars/{barId}/publications`

화면 확인용 full fixture:

- 초기화: `POST http://127.0.0.1:5173/__dev/reset-auth?fixtures=full`
- 시스템 관리자: `admin1` / `<local-fixture-password>`
- 바 owner: `owner1` / `<local-fixture-password>`
- 바 manager: `manager1` / `<local-fixture-password>`
- 바 staff: `staff1` / `<local-fixture-password>`

D15는 `/api/bars/{barId}/publications`에서 현재 저장본을 public JSON으로 변환·검증한 뒤 운영 D1 런타임에서는 GitHub Contents API로 고객 저장소의 `public/menus/{encodedSlug}.json`을 커밋한다. 현재 GitHub 저장소는 monorepo이므로 운영 Pages에는 `CUSTOMER_REPO_ROOT=customer-menu-board`를 함께 설정해 실제 쓰기 경로를 `customer-menu-board/public/menus/{encodedSlug}.json`로 맞춘다. 로컬/test에서 D1 binding 없이 실행할 때만 fake GitHub adapter를 사용한다. 운영 Pages에는 `CUSTOMER_REPO_OWNER`, `CUSTOMER_REPO_NAME`, `CUSTOMER_REPO_BRANCH`, `CUSTOMER_REPO_ROOT`, `GITHUB_FINE_GRAINED_PAT`를 설정해야 하며, D1이 붙은 런타임에서 GitHub 설정이 누락되면 fake 성공으로 기록하지 않고 `GITHUB_PUBLICATION_NOT_CONFIGURED`로 실패한다. 최초 또는 내용 변경 발행은 `public/menus/{encodedSlug}.json`을 쓰고, 동일 내용 재발행은 `public/publish-triggers/{encodedSlug}.json`만 갱신한다. 바별 발행 lock과 고객 repo 전역 commit lock을 분리하며, schema 검증 실패는 GitHub 쓰기 없이 422로 종료한다. 발행 화면은 WF-18의 같은 `/bars/{barId}/publications` URL에서 확인 panel, 진행 단계, 이력, 스냅샷 상세를 compact·medium·wide layout으로만 전환하고 확인 상태와 선택 이력은 resize 후 유지된다. GitHub commit 이후 고객 Pages 빌드 요청과 배포 확인은 D16 범위다.

## D16 로컬 Cloudflare 배포 상태·발행 이력 확인

D16도 같은 발행 URL을 사용한다. 별도 배포 화면이나 기기별 URL을 만들지 않는다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/dashboard`
- `http://127.0.0.1:5173/bars/{barId}/publications`

화면 확인용 full fixture:

- 초기화: `POST http://127.0.0.1:5173/__dev/reset-auth?fixtures=full`
- 시스템 관리자: `admin1` / `<local-fixture-password>`
- 바 owner: `owner1` / `<local-fixture-password>`
- 바 manager: `manager1` / `<local-fixture-password>`
- 바 staff: `staff1` / `<local-fixture-password>`

D16은 GitHub commit 이후 운영 D1 런타임에서 Cloudflare Pages API로 고객 프로젝트의 새 deployment를 요청하고, Pages deployment 목록에서 대상 commit SHA와 일치하는 deployment만 성공으로 인정한다. 로컬/test에서 D1 binding 없이 실행할 때만 fake Cloudflare adapter를 사용한다. 운영 Pages에는 `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CUSTOMER_PAGES_PROJECT_NAME=thebars`를 설정해야 하며, D1이 붙은 런타임에서 Cloudflare 설정이 누락되면 fake 성공으로 기록하지 않고 `CLOUDFLARE_DEPLOYMENT_NOT_CONFIGURED`로 실패한다. 발행 row는 `waiting_cloudflare`를 거쳐 `success`, `failed`, `timeout_unknown` 중 하나로 종료된다. 관리자 화면은 30초 polling metadata를 사용하고 재진입 시 같은 API가 대기 중 deployment를 다시 조정한다. 3분 안에 대상 SHA의 성공/실패를 확인하지 못하면 `timeout_unknown`으로 기록하며 성공으로 거짓 표시하지 않는다. 성공 publication/snapshot은 최근 100건, 실패·확인 불가 row는 최근 100건만 보관한다.

## D17 로컬 과거 재발행·바 수명주기 확인

D17도 기존 바 상세와 발행 이력 URL을 그대로 사용한다. 과거 snapshot 재발행은 `/bars/{barId}/publications`, active/inactive 전환은 `/bars/{barId}`에서 처리하며, 별도 recovery URL이나 기기별 화면 트리를 만들지 않는다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/dashboard`
- `http://127.0.0.1:5173/bars/{barId}`
- `http://127.0.0.1:5173/bars/{barId}/publications`

화면 확인용 full fixture:

- 초기화: `POST http://127.0.0.1:5173/__dev/reset-auth?fixtures=full`
- 시스템 관리자: `admin1` / `<local-fixture-password>`
- 바 owner: `owner1` / `<local-fixture-password>`
- 바 manager: `manager1` / `<local-fixture-password>`
- 바 staff: `staff1` / `<local-fixture-password>`

D17은 성공 publication snapshot을 새 commit으로 재발행하되 현재 D1 편집 데이터는 변경하지 않는다. 바 비활성화는 fake GitHub adapter에서 `public/menus/{encodedSlug}.json` 삭제 commit을 만들고 성공 deployment 확인 후 바를 inactive/preparing으로 바꾼다. 재활성화는 마지막 성공 snapshot이 있으면 public JSON으로 복원하고, 없으면 `preparing` JSON을 복원한다. lifecycle 이벤트는 바 상세에 남기며 실제 GitHub/Cloudflare secret, remote push, production deploy는 사용하지 않는다. D13에서 추가한 헤더 바 선택과 권한별 sidebar는 D17 전체 E2E에서도 회귀 검증된다.

## D18 로컬 주문 탭 확인

D18은 기존 관리자 셸을 그대로 사용한다. 헤더의 현재 작업 바 selector로 바를 선택하고, 권한이 있는 사용자에게만 sidebar의 주문 탭 메뉴가 노출된다. 주문 화면은 `/bars/{barId}/orders`와 `/bars/{barId}/orders/{orderTabId}` URL을 사용하며 기기별 URL이나 resize redirect를 만들지 않는다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/dashboard`
- `http://127.0.0.1:5173/bars/{barId}/orders`
- `http://127.0.0.1:5173/bars/{barId}/orders/{orderTabId}`

화면 확인용 full fixture:

- 초기화: `POST http://127.0.0.1:5173/__dev/reset-auth?fixtures=full`
- 시스템 관리자: `admin1` / `<local-fixture-password>`
- 바 owner: `owner1` / `<local-fixture-password>`
- 바 manager: `manager1` / `<local-fixture-password>`
- 바 staff: `staff1` / `<local-fixture-password>`
- 주문 탭 seed: `A1` open, `Bar 3` open, `B2` checkout_requested

D18은 주문 탭 생성, 상태별 목록, 상세 조회, 손님 표시/메모 수정만 구현한다. 모든 bar-scoped 접근은 active membership과 `can_manage_orders` 권한을 검사하며, 수정은 `expectedVersion`으로 stale update 409를 반환한다. staff full fixture는 주문 탭에는 접근할 수 있지만 메뉴, 카테고리, 회원, 사용자 관리 메뉴는 sidebar에서 보이지 않는다. 메뉴 주문 라인, 수량, void, 기타 항목, 금액 조정, 계산 요청 처리, 정산, 취소, 일별 요약은 D19~D21 범위다.

## D19 로컬 메뉴 주문 라인·수량·void 확인

D19도 기존 주문 상세 URL을 그대로 사용한다. 주문 라인 추가, 수량 변경, void는 `/bars/{barId}/orders/{orderTabId}`에서 처리하며 기기별 URL이나 resize redirect를 만들지 않는다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/dashboard`
- `http://127.0.0.1:5173/bars/{barId}/orders`
- `http://127.0.0.1:5173/bars/{barId}/orders/{orderTabId}`

화면 확인용 full fixture:

- 초기화: `POST http://127.0.0.1:5173/__dev/reset-auth?fixtures=full`
- 시스템 관리자: `admin1` / `<local-fixture-password>`
- 바 owner: `owner1` / `<local-fixture-password>`
- 바 manager: `manager1` / `<local-fixture-password>`
- 바 staff: `staff1` / `<local-fixture-password>`
- 주문 라인 seed: `A1`에 맥캘란 샷 1개, `Bar 3`에 하우스 하이볼 2개

D19는 메뉴 가격을 선택해 주문 라인을 추가할 때 이름, public id, 가격 label, 용량, 단가, 통화, line total을 생성 시점 snapshot으로 저장한다. 같은 idempotency key와 같은 payload의 재시도는 같은 결과를 반환하고, 같은 key를 다른 payload로 재사용하면 409를 반환한다. 수량 변경과 void는 주문 탭 `expectedVersion`과 라인 `itemExpectedVersion`을 함께 검사해 stale update를 차단한다. 서버는 active 라인만 합산하고 void 라인은 삭제하지 않으며 reason과 event를 남긴다. `closed`/`cancelled` 주문 탭 mutation은 409로 차단된다. 기타 주문 항목, 금액 조정, 계산 요청, 정산, 취소, 일별 요약은 D20~D21 범위다.

## D20 로컬 기타 주문 항목·금액 조정 확인

D20도 주문 상세 URL 하나만 사용한다. 기타 항목과 할인·추가금은 `/bars/{barId}/orders/{orderTabId}`에서 처리하며, 화면 폭에 따라 form 배치만 바뀐다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/dashboard`
- `http://127.0.0.1:5173/bars/{barId}/orders`
- `http://127.0.0.1:5173/bars/{barId}/orders/{orderTabId}`

화면 확인용 full fixture:

- 초기화: `POST http://127.0.0.1:5173/__dev/reset-auth?fixtures=full`
- 바 manager: `manager1` / `<local-fixture-password>` — 기타 항목과 금액 조정 action 표시
- 바 staff: `staff1` / `<local-fixture-password>` — 주문 운영은 가능하지만 기타 항목과 금액 조정 action 숨김
- D20 seed: `Bar 3`에 하우스 하이볼 2개, 커버차지 2개, 단골 할인 1개

D20은 custom 라인과 adjustment 라인을 주문 라인으로 저장한다. custom은 항목명, 단가, 수량, 사유를 요구하고 adjustment는 조정명, 0이 아닌 signed 금액, 사유를 요구한다. 음수 adjustment는 할인, 양수 adjustment는 추가금으로 active 합계에 반영된다. 같은 idempotency key의 같은 payload 재시도는 같은 응답을 반환하고 다른 payload 재사용은 409다. staff 기본 권한은 서버에서 `ORDER_CUSTOM_ITEM_PERMISSION_REQUIRED` 또는 `ORDER_ADJUSTMENT_PERMISSION_REQUIRED` 403으로 차단하며 UI action도 렌더링하지 않는다. 계산 요청, 정산, 취소, 일별 요약은 D21 범위다.

## D21 로컬 계산 요청·정산·취소·일별 요약 확인

D21도 주문 URL 하나만 사용한다. 계산 요청 큐와 일별 정산 요약은 `/bars/{barId}/orders`, 정산·취소·재오픈은 `/bars/{barId}/orders/{orderTabId}`에서 처리하며, compact에서는 같은 state를 공유하는 하단 sticky 총액·정산 action으로 적응한다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/dashboard`
- `http://127.0.0.1:5173/bars/{barId}/orders`
- `http://127.0.0.1:5173/bars/{barId}/orders/{orderTabId}`

화면 확인용 full fixture:

- 초기화: `POST http://127.0.0.1:5173/__dev/reset-auth?fixtures=full`
- 바 manager: `manager1` / `<local-fixture-password>` — 주문 라인, 기타 항목, 금액 조정, 계산 요청, 정산, 취소 action 표시
- 바 staff: `staff1` / `<local-fixture-password>` — 주문 운영과 정산은 가능하지만 기타 항목과 금액 조정 action 숨김
- D21 seed: `B2` 계산 요청 대기, `C4` 정산 완료, `D1` 취소 샘플, `Bar 3` open 라인/조정 샘플

D21은 `open -> checkout_requested`, `checkout_requested -> open`, `open|checkout_requested -> closed`, `open|checkout_requested -> cancelled` 전이를 구현한다. 정산은 계좌이체 확인을 요구하고 active 라인 합계를 서버에서 다시 계산해 `finalTotalAmountMinor`로 고정한다. 같은 settle idempotency key와 같은 payload 재시도는 closed 상태에서도 저장된 응답을 반환하며, 다른 key로 이미 닫힌 탭을 다시 정산하면 409 `ORDER_TAB_IMMUTABLE`이다. 취소는 주문 라인이 없거나 모든 라인이 void인 탭만 허용하고, active 라인이 남으면 409 `ORDER_TAB_CANCEL_NOT_EMPTY`를 반환한다. 일별 요약은 정산 완료 건수/금액/라인 수와 취소 건수를 rebuild/upsert한다.

## D22 로컬 감사 로그·보관 작업 확인

D22는 시스템 관리자 전용 `/system/audit` 단일 URL을 사용한다. 별도 운영 앱, 기기별 URL, viewport redirect를 만들지 않는다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/dashboard`
- `http://127.0.0.1:5173/system/audit`

화면 확인용 full fixture:

- 초기화: `POST http://127.0.0.1:5173/__dev/reset-auth?fixtures=full`
- 시스템 관리자: `admin1` / `<local-fixture-password>` — 감사 로그와 보관 작업 접근 가능
- 바 manager: `manager1` / `<local-fixture-password>` — 일반 운영 화면은 권한에 따라 접근, 감사 로그 접근 불가
- 바 staff: `staff1` / `<local-fixture-password>` — sidebar에 감사 로그 메뉴 없음
- 감사 로그 seed: 발행 요청, 주문 정산, 사용자 잠금 해제, Cloudflare 확인 필요 실패 샘플

D22는 `audit_logs`와 `maintenance_runs`를 추가하고, 로그인 실패, 사용자·권한·바 상태·발행·주문 정산/취소/void/조정·카테고리/메뉴/배지/품목 유형 변경 같은 중요 작업을 request ID, actor, bar, operation, result와 함께 기록한다. 비밀번호, 세션, CSRF, token, secret, 내부 메모, 설명 원문, raw body는 audit metadata에 저장하지 않는다. 보관 작업은 system-admin 명령으로만 실행되며 자동 스케줄러는 만들지 않았다. dry-run은 삭제 없이 대상 수만 계산하고, 실행은 365일 이전 closed/cancelled 주문 탭, 3년 이전 일별 정산 요약, 바별 성공/실패 발행 이력 100건 초과분만 정리한다. `/system/audit` 화면은 actor/bar/operation/result/date/search 필터, safe metadata 상세, maintenance dry-run/execute 결과를 같은 component state로 유지하며 compact·medium·wide resize 후 필터와 선택, 실행 결과가 유지된다.

## D23 로컬 보안·접근성·성능 확인

D23은 파일럿 전 품질 gate 강화 업무다. 새 기능 route는 추가하지 않고 기존 관리자·고객 URL을 유지한다. 헤더의 `현재 작업 바` selector, 권한별 sidebar, 전체 주요 route의 compact·medium·wide 동작, rate limit, mutation CSRF, session/security header, focus trap, 성능 budget을 검증한다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/dashboard`
- `http://127.0.0.1:5173/bars/{barId}/categories`
- `http://127.0.0.1:5173/bars/{barId}/menus`
- `http://127.0.0.1:5173/bars/{barId}/orders`
- `http://127.0.0.1:5173/system/audit`

화면 확인용 full fixture:

- 초기화: `POST http://127.0.0.1:5173/__dev/reset-auth?fixtures=full`
- 시스템 관리자: `admin1` / `<local-fixture-password>`
- 바 owner: `owner1` / `<local-fixture-password>`
- 바 manager: `manager1` / `<local-fixture-password>`
- 바 staff: `staff1` / `<local-fixture-password>`
- 바 seed: `Sample Bar`, `Whisky Lab`

D23 기준으로 `admin1`, `owner1`, `manager1`, `staff1` 모두 헤더에서 `Sample Bar`와 `Whisky Lab`을 선택할 수 있다. sidebar는 권한 응답과 현재 선택 바가 일치할 때만 계산되며, manager는 카테고리·메뉴·주문 화면에 접근할 수 있고 staff는 미리보기·주문 등 허용 메뉴만 본다. `__dev/reset-auth?fixtures=full`은 더미 데이터와 함께 dev rate limit bucket도 초기화하므로 반복 화면 테스트에서 이전 login 시도가 남지 않는다.

D23은 `rate_limit_buckets`를 추가하고 setup/recovery/login/publish/settle에 rate limit을 적용한다. bucket key는 SHA-256 hash로 저장해 username/IP/token 원문을 저장하지 않는다. settle idempotency 재시도는 기존 저장 응답을 먼저 반환하므로 rate limit이 주문 idempotency 불변식을 깨지 않는다. 관리자 route는 lazy loading으로 분리되어 build 후 performance budget을 통과한다. 고객 메뉴판은 같은 `/{encodedSlug}` URL에서 resize 중 public JSON을 중복 요청하지 않는다.

## D24 로컬 파일럿 준비 확인

D24는 production secret 생성, remote push, production deploy를 수행하지 않는다. 대신 실제 2개 바 파일럿을 사람이 승인하기 전에 필요한 readiness API, 운영 runbook, 교육 문서, 피드백·backlog 문서, 파일럿 데이터 fixture, 전체 인수 gate를 제공한다.

```bash
cd admin-menu-manager
npm run dev -- --port 5173
```

확인 URL:

- `http://127.0.0.1:5173/system/audit`
- `http://127.0.0.1:5173/dashboard`
- `http://127.0.0.1:5173/bars/{barId}/publications`
- `http://127.0.0.1:5173/bars/{barId}/orders`

화면 확인용 full fixture:

- 초기화: `POST http://127.0.0.1:5173/__dev/reset-auth?fixtures=full`
- 시스템 관리자: `admin1` / `<local-fixture-password>`
- 바 owner: `owner1` / `<local-fixture-password>`
- 바 manager: `manager1` / `<local-fixture-password>`
- 바 staff: `staff1` / `<local-fixture-password>`
- 바 seed: `Sample Bar`, `Whisky Lab`
- 대표 메뉴 seed: wine, whisky, cocktail, food, cigar
- 주문 seed: open, checkout requested, closed, cancelled

운영 문서:

- `docs/operations/pilot-runbook.md`
- `docs/operations/operator-training.md`
- `docs/operations/pilot-feedback.md`

`/system/audit`에는 D24 `파일럿 준비` 패널이 추가되어 system-admin에게만 표시된다. 이 패널은 `GET /api/system/pilot-readiness`를 통해 active 바 2개, owner/manager/staff 권한 coverage, 대표 메뉴 template coverage, 주문 시나리오 seed, runbook gate를 보여준다. 실제 기기 인수, backup/restore 리허설, 보안 승인, 마지막 성공 고객 메뉴판 보존 확인, production 배포 승인은 사람 확인 상태로 유지한다.

D24 검증용 root script는 다음과 같다.

```bash
npm run verify:pilot
```

이 script는 D24 운영 문서, readiness contract/service/UI, production secret 원문 미포함, 파일럿 피드백의 P0/P1 open 0건 문구를 확인한다.

## Cloudflare D1 원격 환경

현재 관리자 Pages 운영 설정은 production-only D1을 기준으로 한다. Public repository에는 실제 D1 database name/id를 기록하지 않는다.

- production: `<production-d1-name>` (`<production-d1-id>`)

Cloudflare Pages `thebars-admin` production Functions binding은 `DB` 이름으로 production D1에 연결한다. Preview D1은 필수가 아니며 현재 운영에서는 사용하지 않는다. 2026-06-24 기준 production 원격 DB에는 `0000_d00_foundation.sql`부터 `0020_menu_item_representative_prices.sql`까지 21개 migration 적용을 확인했다. 이후 production migration은 export/checksum 기록과 사람 승인 후 별도 실행한다.

로컬 Wrangler 작업이 필요하면 `admin-menu-manager/wrangler.example.toml`을 `admin-menu-manager/wrangler.toml`로 복사한 뒤 실제 값을 채운다. 실제 `wrangler.toml`은 `.gitignore`에 포함되어 커밋하지 않는다. Cloudflare Pages 배포 환경의 D1 binding은 Pages project 설정에서 관리한다.

향후 production migration 명령:

```bash
npm run verify:migrations
cd admin-menu-manager
mkdir -p "$HOME/thebar-d1-backups"
npx wrangler d1 export <production-d1-name> --remote --output "$HOME/thebar-d1-backups/<production-d1-name>-before-$(date +%Y%m%d-%H%M%S).sql"
npx wrangler d1 migrations apply <production-d1-name> --remote
npx wrangler d1 execute <production-d1-name> --remote --command "SELECT COUNT(*) AS applied_migrations FROM d1_migrations;"
```

## Cloudflare Pages 앱 설정

관리자와 고객 메뉴판 Pages project는 같은 GitHub monorepo에서 각각 다른 root directory를 빌드한다.

관리자 Pages project:

- GitHub repository: `ryuhojin/thebars`
- Root directory: `admin-menu-manager`
- Build command: `npm run build`
- Output directory: `dist`
- Production D1 binding: `DB`
- Production publication env/secrets: `CUSTOMER_REPO_OWNER`, `CUSTOMER_REPO_NAME`, `CUSTOMER_REPO_BRANCH`, `CUSTOMER_REPO_ROOT`, `GITHUB_FINE_GRAINED_PAT`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CUSTOMER_PAGES_PROJECT_NAME`

고객 메뉴판 Pages project:

- GitHub repository: `ryuhojin/thebars`
- Root directory: `customer-menu-board`
- Build command: `npm run build`
- Output directory: `dist`
- 관리자 발행 service가 GitHub commit 후 이 고객 Pages project의 deployment build를 API로 요청한다.

각 앱의 production build는 `tsconfig.build.json`을 사용한다. admin은 `src`, `server`, `functions`, `contracts`, `db`, `shared`, `vite.config.ts`만 typecheck하고, customer는 `src`, `contracts`, `shared`, `vite.config.ts`만 typecheck한다. `tests/e2e`, `vitest.config.ts`, `playwright.config.ts`는 로컬 검증용 `npm run typecheck`/`npm run test:e2e`에서만 검사한다. Cloudflare Pages가 각 앱 root directory에서만 `npm install`을 실행해도 production build가 `@playwright/test`에 의존하지 않도록 분리한 구조다.
