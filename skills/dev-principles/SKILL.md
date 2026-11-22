---
name: dev-principles
description: >
  Use when designing, implementing, refactoring, or auditing TypeScript, React, or Next.js code.
  Applies Rule-ID engineering principles (AI-*, CC-*, TS-*, SOC-*, DQ-*), opt-in architecture presets,
  and Context7 MCP doc lookup across design/implement, refactor, and review/audit workflows.
---

# dev-principles

실무 개발 원칙을 주제별 Rule ID(`AI-*`, `CC-*`, `TS-*`, `SOC-*`, `DQ-*`)와 opt-in 아키텍처 프리셋으로 적용한다.
특정 폴더 구조(FSD 등)를 강제하지 않고, 기존 저장소 컨벤션을 감지·존중하며 핵심 경계 원칙을 우선한다.

## 1. 강도와 우선순위

- **강도**: `MUST`(필수 준수) · `SHOULD`(기본 적용, 합당한 사유 시 예외) · `PREFER`(신규/리팩터링 시 권장)
- **우선순위**: `1. 안전·보안 불변 규칙` > `2. 프로젝트 설정(.dev-principles.yaml)·기존 공식 규칙(AGENTS.md/CLAUDE.md/tsconfig/ESLint)` > `3. 글로벌 사용자 설정` > `4. 스킬 기본값`
- **충돌 보고**: 기존 프로젝트 규칙이 스킬 규칙과 충돌하면 기존 프로젝트 규칙을 따르고, 작업 요약 또는 리뷰 상단에 1줄로 알린다.
  - 형식: `[Conflict] <RULE-ID> ↔ <프로젝트 기존 규칙> → 기존 프로젝트 규칙 유지`
- **불변 규칙(오버라이드 불가)**: 비밀정보 하드코딩 금지, `localStorage`/`sessionStorage`에 access token 저장 금지(`DQ-04`), 파괴적 작업 암묵 실행 금지.

## 2. 상시 핵심 가드레일 (`MUST` 요약)

- `AI-01`: 모호하거나 복수 해석이 가능한 요구사항은 임의로 가정하지 말고 질문한다.
- `AI-03`: 외과적 변경. 모든 수정 줄은 요청과 직접 연결되어야 하며 무관한 코드·포맷·기존 데드코드를 임의 수정하지 않는다.
- `AI-05`: 최신·버전 민감 API 작업 시 모델 기억에 의존하지 않고 Context7 MCP로 공식 문서를 먼저 조회한다.
- `TS-02`: `any` 금지. 외부 입력·에러는 `unknown` + 타입 좁히기/검증을 사용한다. 서드파티 `.d.ts` 결함은 단일 래퍼 1곳에만 격리한다.
- `SOC-01`: 변경 이유가 다른 관심사(UI 렌더링 / 순수 도메인 규칙 / 상호작용 상태 / HTTP I/O)를 한 파일에 섞지 않는다.
- `SOC-04`: 단방향 의존성 유지(상위 조립층 → 하위 공통층, 데이터·모델 → 화면). 역방향·순환 참조 금지.
- `SOC-06`: FSD 등 특정 구조를 강제하지 않는다. 기존 레포 구조를 먼저 감지하고, 세부 레이어 규칙은 활성화된 프리셋에서만 적용한다.
- `SOC-07`: 사용자 액션·폼·mutation은 조립 블록(Widget/Section/Page)에 몰아넣지 않고 독립된 행동 단위로 먼저 분리한다.
- `DQ-02`: 기능 API·UI에서 `fetch`/`axios` 직접 호출 금지. 단일 `apiClient` 진입점만 사용한다.
- `DQ-04`: access token은 메모리 보관(`localStorage` 금지), refresh token은 `httpOnly` 쿠키. 401 리프레시 재시도는 최대 1회, 인증/리프레시 요청은 `skipAuthRefresh`로 무한 루프 차단.

## 3. Context7 MCP 탐색 규칙 (`AI-05`)

- **트리거**: React 19, Next.js App Router, TanStack Query v5(`queryOptions`/`skipToken`), TypeScript 최신 문법 등 버전 민감 API 설계·구현·마이그레이션 또는 시그니처 불확실 시 `resolve-library-id` → `query-docs` 우선 호출.
- **폴백 순서(MCP 미연결 시)**:
  1. `package.json`에서 설치된 정확한 버전 확인
  2. `node_modules/<pkg>/**/*.d.ts`로 실제 타입 계약 확인
  3. 공식 웹 문서 탐색
  4. 확인 불가 시 추측 코드를 작성하지 않고 미확인 사실을 명시

## 4. 실행 모드

### A. `design / implement` (설계·구현)
1. `.dev-principles.yaml`, `AGENTS.md`, `package.json`, 디렉터리 구조를 확인해 구조·프리셋·충돌을 파악한다.
2. 버전 민감 API가 있으면 Context7로 확인한다(`AI-05`).
3. 구현 전 파일 배치(관심사 경계), 타입 계약, 검증 방법을 짧게 확정한다.
4. 최소 복잡도(`AI-02`)와 추상화 정렬(`CC-01`)을 지켜 구현하고 `tsc`/린트/테스트로 검증한다(`AI-04`).

### B. `refactor` (리팩터링)
1. 리팩터링 전 기존 테스트·타입체크 등 동작 보존 기준을 확보한다.
2. `CC-01`(추상화 혼재), `CC-02`(이벤트/함수 혼동), `SOC-01`(관심사 혼재), `SOC-07`(조립 블록 비대화), `TS-02`(단언 남용)를 Rule ID로 진단한다.
3. Public API 호환을 유지하며 요청 범위 안에서만 점진 분리한다(`AI-03`).

### C. `review / audit` (코드 리뷰·감사)
1. [review-checklist.md](references/review-checklist.md)와 변경 파일 성격에 해당하는 모듈을 로드한다.
2. 생성·벤더 UI(`components/ui/*` 등)는 직접 수정한 diff가 아니면 감사에서 제외한다.
3. `TS-02`에서 `import/export as` 별칭과 테스트 픽스처는 오탐 제외하고, `DQ-04`는 인증 토큰 저장에만 적용한다.
4. 출력 형식: `적용 프로필` + `충돌 감지` + `등급별 건수` + `[Severity] [Rule ID] 파일:라인 — 문제 → Why → 개선안`. 근거 Rule ID 없는 취향 지적 금지.

## 5. Progressive Disclosure (`references/` 로딩 매트릭스)

상세 규칙과 Before/After 예시는 작업 맥락에 맞는 모듈만 온디맨드로 읽는다.

| 작업 맥락 | 로드할 모듈 |
| --- | --- |
| 작업 계획·모호성 판단·검증 기준 상세 | [ai-workflow.md](references/ai-workflow.md) (`AI-01`~`AI-05`) |
| 컴포넌트·훅·함수 작성 및 리팩터링 | [clean-code.md](references/clean-code.md) (`CC-01`~`CC-05`), [typescript.md](references/typescript.md) (`TS-01`~`TS-06`) |
| 폴더 배치·모듈 분리·의존성 경계 설계 | [architecture-soc.md](references/architecture-soc.md) (`SOC-01`~`SOC-07`) |
| API Client·인증·TanStack Query·상태 | [data-and-state.md](references/data-and-state.md) (`DQ-01`~`DQ-05`) |
| PR·파일 원칙 감사 및 리포트 작성 | [review-checklist.md](references/review-checklist.md) + 해당 도메인 모듈 |
| `.dev-principles.yaml`에서 프리셋 활성화 시 | [presets/README.md](references/presets/README.md) · [feature-based.md](references/presets/feature-based.md) · [fsd.md](references/presets/fsd.md) · [next-app-router.md](references/presets/next-app-router.md) |
