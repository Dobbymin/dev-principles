---
name: dev-principles
description: >
  Use when designing, implementing, refactoring, or auditing TypeScript, React, Next.js, or general
  engineering code. Applies Rule-ID principles (AI-*, CC-*, TS-*, SOC-*, DQ-*, SEC-*, TEST-*, PERF-*,
  A11Y-*, DEP-*), opt-in architecture presets, adaptive Track S/M/L workflows, and Context7 MCP lookup.
  Do not use for non-engineering creative writing or pure infrastructure provisioning unrelated to code.
---

# dev-principles

실무 개발 원칙을 Rule ID 체계와 opt-in 아키텍처 프리셋으로 적용한다. 특정 폴더 구조(FSD 등)를 강제하지 않고, 기존 저장소 컨벤션을 감지·존중하며 핵심 경계와 검증 원칙을 우선한다.

## 1. 강도와 우선순위

- **강도**: `MUST`(필수 준수) · `SHOULD`(기본 적용, 합당한 사유 시 예외) · `PREFER`(신규/리팩터링 시 권장)
- **우선순위**: `1. 안전·보안 불변 규칙` > `2. 프로젝트 설정(.dev-principles.yaml)·기존 공식 규칙(AGENTS.md/CLAUDE.md/tsconfig/ESLint)` > `3. 글로벌 사용자 설정` > `4. 스킬 기본값`
- **충돌 보고**: 기존 프로젝트 규칙과 충돌 시 기존 규칙을 유지하고 4항목을 1줄로 알린다.
  - `[Conflict] <RULE-ID> ↔ <프로젝트 기존 규칙> | 원인: <충돌 원인> | 유지 사유: <기존 규칙 유지 이유>`
- **타 플러그인 우선순위 경계**: `github-convention` 등 외부 워크플로우 규칙을 코드 설계 규칙의 상위 우선순위로 취급하지 않으며 책임 영역을 분리한다.
- **보안 불변(오버라이드 불가)**: `SEC-01`(비밀정보 하드코딩·노출 금지), `SEC-02`(XSS/코드 실행/주입 차단), `DQ-04`(`localStorage`/`sessionStorage` 인증 토큰 저장 금지), 파괴적 작업 암묵 실행 금지.

## 2. 상시 핵심 가드레일 (`MUST` 요약)

- `AI-01`: 모호하거나 복수 해석이 가능한 요구사항은 가정하지 말고 질문한다.
- `AI-03`: 외과적 변경. 모든 수정 줄은 요청과 직접 연결되어야 하며 무관한 코드·데드코드를 임의 수정하지 않는다.
- `AI-05`: 버전 민감 API 작업 시 Context7 MCP(`resolve-library-id` → `query-docs`)로 공식 문서를 먼저 조회한다. (폴백: `package.json` → `.d.ts` → 공식 웹 문서 → 미확인 명시)
- `TS-02`: `any` 금지. 외부 입력·에러는 `unknown` + 타입 좁히기/검증을 사용한다.
- `SOC-01` / `SOC-04` / `SOC-06`: UI/도메인/상태/I/O 분리, 단방향 의존성(순환·역참조 금지), 기존 레포 구조 우선 존중.
- `DQ-02` / `DQ-04`: 단일 `apiClient` 진입점 사용, access token 메모리 보관 + 401 단일 리프레시 재시도(`skipAuthRefresh`).
- `SEC-01` / `SEC-02`: 비밀정보 하드코딩·노출 금지 및 신뢰할 수 없는 입력의 실행·주입(`dangerouslySetInnerHTML`/`eval`) 차단.
- `TEST-03`: 완료 보고 전 마지막 수정 상태에서 `dev-principles check`, 타입체크, 린트, 테스트를 직접 실행해 최신 근거를 확인한다.

## 3. 적응형 워크플로 (`Track S / M / L`)

- **Track S (1~2파일 소수정)**: 기존 컨벤션 확인 → 재현 테스트(`TEST-02`) → 최소 수정(`AI-03`) → 최신 검증(`TEST-03`).
- **Track M (표준 기능/리팩터링)**: 모호성 질문(`AI-01`) → `structure-analyzer` + Context7(`AI-05`) → 파일 배치·계약 확정 → TDD/최소 구현 → `dev-principles check` + 테스트 + `principles-reviewer`.
- **Track L (복합 기능/아키텍처 변경)**: 요구사항·리스크 명세 → `[단계] → verify: [검증]` 분해(`AI-04`) → 읽기 전용 서브에이전트 분리 실행 → 다각도 검증(`principles-reviewer`, `architecture-reviewer`, `security-reviewer`) → 미검증 범위 명시.
- **refactor**: 기준선 테스트 확보 → Rule ID 진단(`CC-*`, `SOC-*`, `TS-02`, `PERF-02`) → Public API 보존 점진 분리.
- **review / audit**: `node bin/dev-principles.mjs check` 선행 + 오탐 필터(`components/ui/*`, `import as`, 비인증 `localStorage`) 적용 후 `[Severity] [Rule ID] 파일:라인 — 문제 → Why → 개선안` 형식으로 보고.

## 4. Progressive Disclosure (`references/` 로딩 매트릭스)

상세 규칙·예외·Before/After 예시는 작업 맥락에 맞는 모듈만 온디맨드로 읽는다.

| 작업 맥락 | 로드할 모듈 |
| --- | --- |
| 작업 규모별 트랙·제안 전용 학습 루프 | [workflow-guide.md](references/workflow-guide.md) |
| 작업 계획·모호성 판단·Context7 탐색 | [ai-workflow.md](references/ai-workflow.md) (`AI-01`~`AI-05`) |
| 컴포넌트·훅·함수 작성 및 리팩터링 | [clean-code.md](references/clean-code.md) (`CC-01`~`CC-05`), [typescript.md](references/typescript.md) (`TS-01`~`TS-06`) |
| 폴더 배치·모듈 분리·의존성 경계 | [architecture-soc.md](references/architecture-soc.md) (`SOC-01`~`SOC-07`) |
| API Client·인증·TanStack Query·상태 | [data-and-state.md](references/data-and-state.md) (`DQ-01`~`DQ-05`) |
| 보안·신뢰 경계·에러 처리 | [security-and-reliability.md](references/security-and-reliability.md) (`SEC-01`~`SEC-03`) |
| TDD·테스트 전략·완료 전 검증 | [testing-and-verification.md](references/testing-and-verification.md) (`TEST-01`~`TEST-03`) |
| 성능·웹 접근성·의존성 관리 | [performance-and-a11y.md](references/performance-and-a11y.md) (`PERF-*`, `A11Y-01`, `DEP-01`) |
| 정적 검사기·외부 경계 린터 연동 | [automation-guide.md](references/automation-guide.md) |
| PR·파일 원칙 감사 및 리포트 작성 | [review-checklist.md](references/review-checklist.md) + 해당 도메인 모듈 |
| `.dev-principles.yaml` 프리셋 활성화 시 | [presets/README.md](references/presets/README.md) · [feature-based.md](references/presets/feature-based.md) · [fsd.md](references/presets/fsd.md) · [next-app-router.md](references/presets/next-app-router.md) |

## 5. 권한 경계 및 리뷰어 역할 분리

- **읽기 전용 및 Git/GitHub 비개입**: 모든 Reviewer(`principles-reviewer`, `architecture-reviewer`, `security-reviewer`)와 `structure-analyzer`는 읽기 전용이며, 브랜치·커밋·푸시·PR·이슈·릴리스/태그를 임의로 변경하지 않는다. 코드 수정은 사용자 요청 또는 위임된 구현 범위에서만 수행한다.
- **리뷰어 영역 분리 & 무한 위임 금지**: 일반 코드(`principles-reviewer`), 아키텍처(`architecture-reviewer`), 보안(`security-reviewer`)은 담당 Rule ID를 중복 보고하거나 임의 재분류하지 않으며, 위임은 단일 패스만 허용한다.
- **독립성**: `github-convention`(Issue/PR/브랜치/커밋/CI) 없이도 단독으로 설계·구현·리팩터링·리뷰가 완결 동작한다.
