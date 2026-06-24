# AGENTS.md

## 1. 최우선 실행 규칙

이 프로젝트는 전체 구현을 한 번에 시도하지 않는다.

1. 작업 시작 시 `요구사항.md`, `설계.md`, `개발계획.md`, `wireframes/README.md`, `wireframes/화면맵.md`, `진행상태.md`를 읽는다.
2. 사용자가 업무 ID를 지정했으면 그 ID만 작업한다.
3. 지정이 없으면 `진행상태.md`에서 가장 앞선 `[ ]` 업무 하나만 선택한다.
4. 선택한 업무를 `[~]`로 바꾸고 시작한다.
5. 그 업무의 **계약/DB → 백엔드 → 백엔드 테스트 → 프론트엔드 → 반응형 검증 → E2E/인수 → 전체 검증**을 순서대로 수행한다.
6. 모든 완료 조건을 통과한 경우에만 `[x]`로 바꾼다.
7. 완료 보고 후 즉시 멈춘다. 다음 업무를 자동으로 시작하지 않는다.

Codex의 장기 목표는 전체 제품 완성이지만 한 실행의 목표는 업무 단위 하나다.

## 2. 문서 우선순위

```text
요구사항.md > 설계.md > 개발계획.md > wireframes/화면맵.md > wireframes/index.html > 진행상태.md > 코드의 기존 관행
```

제품 범위, 권한, 데이터 삭제, 금액, 발행, 주문 상태를 바꿔야 하면 `[!]`로 차단하고 사람 결정을 요청한다.

## 3. 와이어프레임 필수 참조 규칙

- 프론트엔드가 포함된 업무를 시작하기 전에 `wireframes/화면맵.md`에서 현재 업무 ID의 필수·참고 화면을 찾는다.
- `wireframes/index.html`에서 해당 화면을 Compact, Medium, Wide로 각각 확인한다.
- 와이어프레임의 제품 URL, 정보 계층, 핵심 액션, 필수 상태와 적응형 전환을 구현 기준으로 사용한다.
- 회색 계열 색상과 임시 아이콘은 저충실도 표현이며 그대로 복사하지 않는다. 최종 UI는 공통 디자인 토큰과 접근성 기준으로 구현한다.
- 요구사항과 와이어프레임이 충돌하면 요구사항이 우선이다. 충돌이나 주요 이탈은 숨기지 말고 `진행상태.md`에 기록한다.
- 와이어프레임에 없는 future feature를 추측해 추가하지 않는다.
- 완료 보고에는 참조한 와이어프레임 ID, 390·768·1440 검증 결과, 의도적 차이를 포함한다.
- 브라우저 자동화가 가능하면 각 폭의 screenshot 또는 visual snapshot을 남긴다. 단순히 CSS 코드가 있다는 이유로 반응형 완료를 주장하지 않는다.

## 4. 단일 URL 반응형 절대 규칙

- 기기 종류별 route prefix, 하위 도메인, 별도 앱을 만들지 않는다.
- 화면 폭을 감지해 URL을 변경하거나 redirect하지 않는다.
- 동일 업무는 route component 하나를 사용한다.
- 고객 메뉴판은 `/{encodedSlug}` 하나만 사용한다.
- 관리자 route에는 기기 종류를 나타내는 segment를 넣지 않는다.
- `window.innerWidth` 또는 user-agent로 페이지 전체를 완전히 다른 트리로 분기하지 않는다.
- CSS media query와 container query를 우선한다.
- JavaScript media query는 dialog/sheet 같은 상호작용 표현 선택에만 제한한다.
- wide와 compact 표현은 같은 query cache, form state, selection state, mutation을 공유한다.
- resize로 route나 핵심 feature component가 remount되어 dirty state가 사라지면 안 된다.
- 화면 폭 때문에 권한 있는 기능을 제거하지 않는다. compact에서는 단계형 폼, drawer, sheet, 카드 목록으로 적응시킨다.
- drag-and-drop에는 버튼 또는 대상 선택 fallback을 제공한다.

이 규칙과 충돌하는 기존 코드가 있으면 현재 업무 범위에서 안전하게 제거 또는 이전하고 문서에 기록한다.

## 5. 업무 단위 경계

- 현재 업무에 없는 route, 화면, table, endpoint를 미리 구현하지 않는다.
- 미래 기능을 위한 대규모 추상화, 빈 placeholder 페이지, 가짜 CRUD를 만들지 않는다.
- 현재 업무에 꼭 필요한 공통 코드는 최소 범위로 만든다.
- 백엔드만 만들고 완료라고 하지 않는다.
- 프론트만 mock 데이터로 만들고 완료라고 하지 않는다.
- 반응형 compact/medium/wide 검증 없이 프론트 업무를 완료 처리하지 않는다.
- 외부 GitHub/Cloudflare는 adapter와 fake로 테스트할 수 있으나 실제 연결 업무 이전에는 production 동작을 주장하지 않는다.

## 6. 체크리스트 상태

```text
[ ] 미착수
[~] 진행 중
[x] 구현 및 검증 완료
[!] 차단/결정 필요
[-] 범위 제외
```

`[x]`는 코드 존재가 아니라 업무의 테스트·인수·build가 모두 통과했다는 뜻이다.

## 7. 필수 구현 순서

1. contract와 업무 규칙
2. migration/schema
3. repository
4. application service/state transition
5. API route와 middleware
6. backend unit/integration tests
7. frontend route/query/form/components
8. responsive compact/medium/wide 동작
9. frontend tests
10. E2E/인수
11. lint/typecheck/test/build
12. 문서와 진행상태

DB가 필요 없는 UI 전용 업무는 1~6을 contract/parser/fixture 테스트로 대체할 수 있다.

## 8. 기술 기준

```text
TypeScript strict
React + Vite
Cloudflare Pages Functions
Hono
Cloudflare D1
Drizzle ORM + 순차 SQL migrations
Zod
Vitest
브라우저 E2E 도구는 저장소에서 한 종류로 고정
```

새 dependency는 현재 업무를 완료하는 데 필요한 경우만 추가하고 이유를 완료 보고에 적는다.

## 9. 아키텍처 불변식

### Tenant

- 모든 bar-scoped 읽기·쓰기는 `barId`와 actor의 active membership/permission을 함께 검사한다.
- 내부 ID만으로 다른 바 row를 조회하지 않는다.
- 시스템 관리자 우회는 명시적 guard에서만 허용한다.

### 인증

- 비밀번호·세션·setup/recovery/PAT 원문을 저장·로그하지 않는다.
- 계정 비활성화 시 active session을 즉시 무효화한다.
- mutation은 CSRF를 검사한다.
- forced password change 사용자는 변경 endpoint와 logout 외 보호 기능을 쓸 수 없다.

### 메뉴와 Public JSON

- 내부 DB ID, 사용자 정보, 내부 메모, 토큰은 public JSON에 포함하지 않는다.
- 금액은 정수다.
- hidden 데이터는 DTO 변환에서 제외한다.
- sold_out 공개 정렬과 정보 숨김 규칙을 지킨다.
- schema 검증 실패 JSON을 GitHub에 쓰지 않는다.

### 발행

- 바별 발행 lock과 고객 repo 전역 commit lock을 분리한다.
- 동일 내용 재발행은 trigger 파일을 바꾼다.
- 재시도는 terminal publication row를 재사용하지 않고 새 row를 만든다.
- `timeout_unknown`을 success나 failed로 거짓 표시하지 않는다.
- 과거 snapshot 재발행은 현재 편집 데이터를 바꾸지 않는다.

### 주문

- 주문 라인은 생성 당시 이름·가격 label·용량·단가·통화를 스냅샷으로 저장한다.
- 합계는 서버 정수 연산으로 계산한다.
- 라인은 삭제하지 않고 void한다.
- 주문 mutation은 version/expectedVersion으로 409 충돌을 처리한다.
- 주문 추가와 settle은 idempotency를 적용한다.
- closed/cancelled는 수정하지 않는다.

## 10. DB와 migration

- 적용된 migration 파일을 수정하지 않고 새 migration을 추가한다.
- foreign key와 unique/index를 DB에서도 강제한다.
- migration은 빈 local DB에 순서대로 적용해 검증한다.
- schema 변경은 repository/service/test와 같은 업무에서 끝낸다.
- D1 transaction을 외부 네트워크 호출 동안 열어 두지 않는다.

## 11. API와 오류

- route handler에 업무 규칙을 누적하지 않는다.
- request는 Zod로 검증한다.
- 오류는 안정적인 `error.code`, 사용자 메시지, request ID를 가진다.
- 권한 없음과 대상 없음으로 내부 정보를 누설하지 않는다.
- 409는 중복, 상태 전이, optimistic lock 충돌에 사용한다.
- 외부 API 오류는 token/응답 원문을 노출하지 않고 단계별 내부 코드로 매핑한다.

## 12. 프론트엔드 완료 기준

모든 프론트 업무에서 다음을 확인한다.

- loading, empty, error, forbidden, conflict 구분
- 저장형 form의 dirty state, 이탈 경고, 저장 성공/실패
- viewport 390×844, 768×1024, 1440×900
- 같은 URL 유지
- resize 후 form/selection/filter 유지
- 페이지 전체 불필요한 가로 스크롤 없음
- compact에서 주요 액션 접근 가능
- 44px touch target
- keyboard focus, label, 오류 요약
- table/card 또는 dialog/sheet가 같은 데이터와 mutation을 사용

기능을 wide에서만 구현하고 compact는 추후 업무로 넘기는 것을 금지한다.

## 13. 테스트

현재 업무에서 최소 다음을 작성한다.

- 정상 경로
- 400/422 입력 또는 업무 규칙 오류
- 401 미인증
- 403 권한 없음
- 404 tenant 범위 대상 없음
- 필요한 경우 409 충돌
- DB rollback/transaction 경계
- frontend loading/empty/error/success
- 세 viewport 핵심 사용자 흐름
- resize 상태 보존

완료 전 실행:

```text
npm run lint
npm run typecheck
npm run test
npm run build
```

실행하지 못한 검증은 미완료로 보고하며 `[x]`로 표시하지 않는다.

## 14. 코드 변경 규칙

- 사용자 또는 다른 작업자의 기존 변경을 덮어쓰지 않는다.
- 관련 없는 리팩터링을 하지 않는다.
- 비밀값을 생성하거나 실제 production에 push/deploy하지 않는다.
- remote push, production migration, 실제 정산 데이터 조작은 사람 승인 없이 수행하지 않는다.
- 생성 코드나 migration도 리뷰 가능한 크기로 유지한다.
- 기기별 중복 페이지를 임시 해결책으로 추가하지 않는다.

## 15. 진행상태 갱신

작업 시작:

- 현재 업무를 `[~]`로 표시
- 시작 시각, 예상 변경 영역, 차단 요소 기록

작업 종료:

- 모든 gate가 통과하면 `[x]`
- 일부만 완료면 `[~]`
- 사람 결정이 필요하면 `[!]`
- 실행한 명령과 결과, migration/env 변화, 반응형 검증 결과, 남은 위험 기록

## 16. 완료 보고

```text
현재 업무: Dxx — 이름
상태: 완료 / 진행 중 / 차단
완료 체크리스트:
변경 파일:
DB/API/환경 변화:
실행한 검증과 결과:
반응형 검증(390/768/1440):
resize 상태 보존 결과:
인수 시나리오 결과:
남은 위험 또는 사람 결정:
다음 업무 미착수 확인:
```

보고 후 다음 업무를 시작하지 않는다.
