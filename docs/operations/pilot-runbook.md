# D24 파일럿 운영 Runbook

이 문서는 실제 production secret, remote push, production deploy를 Codex가 수행하지 않는다는 전제에서 파일럿 시작 전 사람이 확인해야 할 절차를 고정한다.

## Production D1

- local: local D1 또는 memory repository, fake GitHub/Cloudflare adapter만 사용한다.
- production: production D1, private customer repository, production Pages project만 사용한다.
- preview D1은 필수가 아니며 현재 production-only 운영에서는 사용하지 않는다.
- production migration 전에는 D1 export 파일을 생성하고 export 파일 경로와 checksum을 release note에 기록한다.

현재 원격 D1 binding:

- production: `<production-d1-name>` (`<production-d1-id>`)

2026-06-24에 운영 정책을 production-only로 정리했다. Cloudflare Pages `thebars-admin` production Functions binding은 `DB` 이름으로 production D1에 연결한다. 같은 날 production 원격 DB에는 20개 migration(`0000_d00_foundation.sql`~`0019_d23_rate_limits.sql`) 적용을 확인했다.

실제 D1 database name/id는 public repository에 기록하지 않는다. 로컬 Wrangler용 실제 `wrangler.toml`은 untracked 파일로만 보관하고, Cloudflare Pages의 D1 binding은 Pages project 설정에서 관리한다.

## Secret Checklist

필수 secret 이름만 점검한다. 값은 문서, audit log, 브라우저, DB에 저장하지 않는다.

현재 관리자 runtime 필수 secret:

- `SETUP_TOKEN`
- `ADMIN_RECOVERY_TOKEN`

실제 GitHub/Cloudflare 발행 adapter를 연결하는 업무 전까지 다음 값은 production에 설정하지 않는다. 현재 code path는 fake publication adapter를 사용하며 이 값들을 읽지 않는다.

- `CUSTOMER_REPO_OWNER`
- `CUSTOMER_REPO_NAME`
- `CUSTOMER_REPO_BRANCH`
- `GITHUB_FINE_GRAINED_PAT`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PROJECT_NAME`

확인 기준:

- GitHub token은 고객 저장소 하나에 `Contents: write` 최소 권한만 가진다.
- Cloudflare token은 대상 Pages project와 deployment 조회에 필요한 범위만 가진다.
- token 원문은 설정 화면, audit log, public JSON, test artifact에 남지 않는다.
- token rotation 날짜와 담당자를 release note에 기록한다.

## Customer Repo Pages

private customer repository와 Cloudflare Pages 연결 절차:

1. 고객 메뉴판 repository를 private으로 생성한다.
2. Pages project를 customer repository의 지정 branch에 연결한다.
3. Pages build output은 customer app의 정적 산출물만 배포한다.
4. 관리자 repository와 고객 repository는 분리하고, 고객 repository commit은 발행 service의 전역 commit lock을 통해 직렬화한다.
5. 첫 publish 전 `public/menus/{encodedSlug}.json`과 trigger file path를 테스트 바에서 확인한다.

## Migration Backup Rollback

production migration 전:

1. 현재 D1 schema version과 적용된 migration 목록을 기록한다.
2. D1 export를 생성하고 checksum을 기록한다.
3. 로컬 빈 DB migration 검증인 `npm run verify:migrations`와 관리자 build smoke test를 통과시킨다.
4. production 적용 중 외부 GitHub/Cloudflare 호출을 D1 transaction 안에서 수행하지 않는다.

향후 production migration 명령:

```bash
npm run verify:migrations
cd admin-menu-manager
mkdir -p "$HOME/thebar-d1-backups"
npx wrangler d1 export <production-d1-name> --remote --output "$HOME/thebar-d1-backups/<production-d1-name>-before-$(date +%Y%m%d-%H%M%S).sql"
npx wrangler d1 migrations apply <production-d1-name> --remote
npx wrangler d1 execute <production-d1-name> --remote --command "SELECT COUNT(*) AS applied_migrations FROM d1_migrations;"
```

rollback 기준:

- migration 적용 중 schema 오류가 발생하면 새 배포를 중단하고 export 파일로 복구한다.
- 데이터 보정이 필요한 경우 별도 승인된 SQL만 실행한다.
- 주문 closed/cancelled, publication terminal status, audit log는 임의 수정하지 않는다.

## Token Rotation

GitHub/Cloudflare token rotation:

1. 새 token을 최소 권한으로 생성한다.
2. 로컬 fake adapter 테스트와 최소 권한 점검을 먼저 통과시킨다.
3. production secret을 교체한다.
5. 기존 token을 폐기한다.
6. audit log와 파일럿 피드백 문서에 rotation 일시와 담당자만 기록한다.

## Monitoring Incident

운영 중 장애 연락 절차:

- P0: 주문 정산 불가, 고객 메뉴판 전체 접근 불가, production secret 노출 의심. 즉시 파일럿 중단, owner와 개발 담당자에게 연락.
- P1: 발행 지연, 특정 바 운영 화면 접근 불가, 권한 오동작. 당일 조치 여부 결정.
- P2: 표시 문구, 교육 자료 보완, 경미한 화면 깨짐. 후속 backlog로 기록.

확인 채널:

- 운영자 연락 채널
- 개발 담당자 연락 채널
- 고객 바 owner 연락 채널

## Pilot Data

파일럿 시작 전 최소 데이터:

- active 바 2개
- 각 바 owner, manager, staff 활성 멤버
- 대표 메뉴: wine, whisky, cocktail, food, cigar
- 고객 메뉴판 encoded slug
- 주문 샘플: open, checkout requested, closed

테스트 바와 실제 바 등록 절차:

1. 테스트 바에서 settings, category, menu, preview, publish, order flow를 먼저 확인한다.
2. 실제 바 1을 생성하고 owner/manager/staff를 등록한다.
3. 실제 바 2를 생성하고 같은 권한 구성을 확인한다.
4. 바 selector로 각 바를 전환해 같은 URL과 권한별 sidebar를 확인한다.

## Representative Menu Data

대표 메뉴 입력 기준:

- wine: 생산자, 국가, 지역, 품종, 빈티지, 글라스/보틀 가격
- whisky: 브랜드, 국가, 지역, 분류, 숙성, 샷/보틀 가격
- cocktail: 베이스 주종, 재료, 제조 방식, 잔 가격
- food: 재료, 알레르기, 페어링, 접시 가격
- cigar: 브랜드, 원산지, 비톨라, 강도, 개비 가격

public JSON에는 내부 메모, 내부 DB ID, 사용자 정보, token, secret이 포함되지 않아야 한다.

## Publication Lifecycle

preparing to publish to republish to deactivate:

1. preparing 상태의 실제 바를 선택한다.
2. 관리자 미리보기에서 public JSON schema 통과를 확인한다.
3. publish를 실행하고 GitHub commit SHA를 기록한다.
4. 해당 SHA와 연결된 Cloudflare deployment success를 확인한다.
5. 같은 내용 republish가 trigger file 변경 commit을 남기는지 확인한다.
6. 과거 successful snapshot republish가 현재 편집 데이터를 바꾸지 않는지 확인한다.
7. deactivate가 고객 JSON 삭제 commit을 만들고 고객 URL 404 상태를 유도하는지 확인한다.
8. 마지막 successful snapshot이 보존되어 reactivate 시 복원 가능한지 확인한다.

실제 production publish/deactivate는 사람의 배포 승인 후에만 수행한다.

## Device Acceptance

실제 기기 인수는 같은 제품 URL에서 수행한다.

- 휴대폰 2종: 390 폭 자동 검증 결과와 실제 세로 화면을 비교한다.
- 태블릿 1종: 세로와 가로 회전 후 URL, form, 선택, filter 상태가 유지되는지 확인한다.
- 데스크톱 브라우저: 1440 폭에서 table/detail/action 배치와 keyboard focus를 확인한다.
- 고객 메뉴판: `/{encodedSlug}` 하나만 사용하고 검색 상태와 public JSON request 수를 확인한다.

## Network Delay

현장 네트워크 지연 확인:

- 발행: `waiting_cloudflare`, `timeout_unknown`, 실패 원인이 token 원문 없이 표시되는지 확인한다.
- 주문: version conflict와 idempotency 재시도가 사용자에게 안정적으로 표시되는지 확인한다.
- 고객 메뉴판: public JSON 로딩 실패 시 내부 데이터 없이 오류 메시지가 표시되는지 확인한다.

## Release Gate

production 배포 전 사람 승인 gate:

- P0/P1 open 결함 0건
- 보안 체크 승인
- 백업·복구 연습 완료
- 마지막 성공 고객 메뉴판 보존 확인
- 파일럿 피드백과 후속 backlog 기록
- owner의 production 배포 승인

Codex는 이 승인과 production deploy를 수행하지 않는다.
