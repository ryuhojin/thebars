# D24 운영자 교육 문서

파일럿 전 owner, manager, staff가 같은 URL과 같은 데이터로 권한별 업무를 수행할 수 있는지 리허설한다.

## Roles

owner:

- 현재 작업 바 selector로 바를 전환한다.
- 메뉴, 카테고리, 미리보기, 발행, 주문 화면에 접근한다.
- manager와 staff 권한이 의도대로 제한되는지 확인한다.

manager:

- 메뉴와 카테고리를 수정한다.
- 주문 open, 메뉴 추가, 기타 항목, 금액 조정, 계산 요청, settle을 처리한다.
- 발행 권한이 없는 설정이면 sidebar에서 발행 메뉴가 보이지 않는지 확인한다.

staff:

- 주문 탭과 고객 메뉴판 미리보기 등 허용 메뉴만 접근한다.
- 메뉴 편집, 사용자 관리, 바 회원, 시스템 감사 로그 메뉴가 보이지 않는지 확인한다.
- 직접 URL 접근 시 권한 없음 화면이 표시되는지 확인한다.

## Bar Selector

1. 로그인 후 header의 `현재 작업 바`를 확인한다.
2. 파일럿 바 2개가 모두 표시되는지 확인한다.
3. 바를 전환하고 카테고리, 메뉴, 주문 화면 URL의 `{barId}`가 바뀌는지 확인한다.
4. resize 또는 태블릿 회전 후 선택 바가 유지되는지 확인한다.

## Menu Operations

1. 카테고리 목록에서 wine, whisky, cocktail, food, cigar 대표 카테고리를 확인한다.
2. 메뉴 목록에서 검색과 필터를 적용한다.
3. 메뉴 상세에서 가격, 품절, 공개 여부, template detail을 수정한다.
4. 저장 전 resize 후 입력값이 유지되는지 확인한다.
5. public preview에서 hidden/internal data가 보이지 않는지 확인한다.

## Publication

1. preview 화면에서 발행 대상과 public JSON schema 상태를 확인한다.
2. 발행 화면에서 publish를 실행한다.
3. commit SHA와 Cloudflare deployment target SHA가 일치하는지 확인한다.
4. 같은 내용 republish가 trigger file 변경을 남기는지 확인한다.
5. timeout_unknown은 성공/실패로 임의 확정하지 않고 후속 확인 대상으로 둔다.

## Orders

1. 주문 탭을 open으로 생성한다.
2. 메뉴 항목을 추가하고 생성 시점 이름, 가격 라벨, 용량, 단가, 통화 스냅샷을 확인한다.
3. 기타 항목과 금액 조정을 추가한다.
4. 계산 요청 상태로 전환한다.
5. 계좌이체 확인 후 settle한다.
6. closed 주문은 수정되지 않는지 확인한다.
7. 같은 idempotency key 재시도와 다른 key 재정산이 기대대로 처리되는지 확인한다.

## Incident Drill

운영자는 다음 상황에서 즉시 연락한다.

- 고객 메뉴판 전체 접근 불가
- 주문 정산 불가
- 권한 없는 메뉴 노출
- production secret 노출 의심
- 발행이 timeout_unknown 상태로 오래 지속

연락 시 포함할 정보:

- 바 이름
- 사용자 역할
- 화면 URL
- request ID 또는 감사 로그 시간
- 발생 시각
