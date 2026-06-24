# 반응형 UI 와이어프레임 사용법

## 목적

이 폴더는 `요구사항.md`, `설계.md`, `개발계획.md`의 UI 요구를 저충실도 화면 구조로 구체화한다. Codex와 개발자는 프론트엔드 업무를 시작하기 전에 현재 업무에 연결된 화면을 확인해야 한다.

## 실행

빌드나 외부 라이브러리가 필요 없다.

```text
wireframes/index.html
```

파일을 브라우저에서 직접 열거나 정적 HTTP 서버로 제공한다.

```bash
python -m http.server 8080 --directory wireframes
```

## 화면 폭 전환

상단의 다음 버튼으로 같은 제품 URL의 적응형 표현을 확인한다.

- Compact: 390×844
- Medium: 768×1024
- Wide: 1440×900

이 버튼은 와이어프레임 검토 도구의 기능일 뿐 제품에 기기별 라우트를 만들라는 의미가 아니다.

## 구현 시 해석 우선순위

1. `요구사항.md`
2. `설계.md`
3. `개발계획.md`
4. `wireframes/화면맵.md`
5. `wireframes/index.html`

와이어프레임의 정보 구조, 핵심 액션, 상태, 반응형 전환은 구현 기준이다. 회색 계열 색상, 픽셀 단위 간격, 문구의 사소한 표현은 최종 시각 디자인이 아니다.

## 반드시 유지할 것

- 화면별 제품 URL
- 정보 계층과 주요 작업 순서
- compact에서도 권한 있는 핵심 기능 접근 가능
- table→card, sidebar→drawer, dialog→sheet 같은 적응 방식
- loading, empty, error, forbidden, conflict, dirty 상태
- 저장·발행·정산 같은 주요 액션의 접근성
- 같은 query/form/selection 상태 공유
- resize 후 URL과 작성 중 상태 보존

## 임의로 복사하면 안 되는 것

- 기기별 별도 route 또는 페이지 트리
- 화면 폭별 별도 API
- `isMobile ? MobilePage : DesktopPage` 전체 화면 분기
- 와이어프레임에 없는 미래 기능
- 회색 와이어프레임 스타일을 최종 브랜드 디자인으로 확정하는 것

## 변경 절차

구현 중 와이어프레임과 요구사항이 충돌하면 요구사항이 우선한다. 정보 구조나 주요 상호작용을 바꿔야 하면 코드를 먼저 바꾸지 말고 `진행상태.md`에 차단 사항을 기록하고 사람 결정을 받는다.
