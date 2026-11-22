# dev-principles

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

TypeScript, React, Next.js 중심 프론트엔드 및 범용 소프트웨어 개발 원칙을 58개 Rule ID 체계(`AI-*`, `CC-*`, `TS-*`, `SOC-*`, `DQ-*`, `SEC-*`, `TEST-*`, `PERF-*`, `A11Y-*`, `DEP-*`)와 opt-in 아키텍처 프리셋(`feature-based`, `fsd`, `next-app-router`)으로 제공하는 멀티 하네스 플러그인·스킬입니다.

빌드나 외부 npm 패키지 설치 없이 마크다운 스킬, 읽기 전용 서브에이전트, 슬래시 커맨드, `SessionStart` 훅, 무의존성 Node 22+ 정적 검사기 및 CLI 유틸리티로 동작합니다.

---

## 설치 방법

### 1. Claude Code 마켓플레이스 설치

```text
# 단독 설치
/plugin install dev-principles --marketplace Dobbymin/dev-principles

# GitHub 워크플로우 플러그인(github-convention)과 함께 설치
/plugin install github-convention --marketplace Dobbymin/github-convention
```

### 2. 지원 하네스 루트 매니페스트 및 폴백 정책

| 하네스 | 매니페스트 | 지원 기능 및 폴백 |
| :--- | :--- | :--- |
| Claude Code | [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json), [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) | Skills, Agents, Commands, `SessionStart` Hook 전체 지원 |
| Codex | [`.codex-plugin/plugin.json`](.codex-plugin/plugin.json), [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json) | Skills, Commands, `AGENTS.md` 기반 동작 |
| Cursor | [`.cursor-plugin/plugin.json`](.cursor-plugin/plugin.json) | Skills, Commands, `SessionStart` (`additional_context`) 지원 |
| Antigravity | [`.antigravity-plugin/plugin.json`](.antigravity-plugin/plugin.json) | Skills, Agents (`tools:` 미포함), Commands 지원 |
| Gemini CLI | [`gemini-extension.json`](gemini-extension.json) | `contextFileName`으로 `skills/dev-principles/SKILL.md` 직접 주입 |

### 3. 셸 스크립트로 스킬만 설치 (`install.sh` / `uninstall.sh`)

```bash
# 변경 예정 대상 미리보기 (--dry-run)
./install.sh --scope project --dry-run
./uninstall.sh --scope project --dry-run

# 프로젝트 범위 심링크 설치
./install.sh --scope project

# 전역 복사 설치 및 제거
./install.sh --scope global --copy
./uninstall.sh --scope global
```

- **소유권 검증 및 레거시 마이그레이션**: `install.sh`와 `uninstall.sh`는 심볼릭 링크의 canonical 대상 경로와 `.dev-principles-script-managed` 메타데이터(`plugin=dev-principles`, `managed_by=install.sh`, `skill`, `install_path`, `source_path`)를 검증합니다. 타 플러그인의 심볼릭 링크·파일·디렉터리는 절대 덮어쓰거나 삭제하지 않으며, 기존 `managed-by=install.sh` 마커는 재설치 시 안전하게 마이그레이션됩니다.

---

## 협업, 우선순위 및 권한 경계

### SessionStart Progressive Disclosure & 상호 축약

- [`hooks/session-start.mjs`](hooks/session-start.mjs)는 전체 `SKILL.md`를 무조건 주입하지 않고 작업 유형별(설계/구현, 리팩터링, 일반·아키텍처·보안 리뷰) 온디맨드 로딩 경로와 핵심 가드레일만 간결하게 주입합니다.
- `github-convention`이 감지되면 **상호 축약(mutual compact)** 모드로 전환해 코드 설계·Rule ID 핵심만 주입하고 Git/PR 컨텍스트 중복을 최소화합니다. 필요 시 `DEV_PRINCIPLES_CONTEXT_MODE`(`auto` | `compact` | `full`)로 제어할 수 있습니다.

### 전문 Reviewer 분리 및 `github-convention` 경계

| 에이전트 | 담당 Rule ID / 역할 | 경계 |
| :--- | :--- | :--- |
| `principles-reviewer` | `AI-*`, `CC-*`, `TS-*`, `DQ-01/02/03/05`, `TEST-*`, `PERF-01/02`, `A11Y-01`, `DEP-01` | 읽기 전용, 중복·재분류·무한 위임 금지 |
| `architecture-reviewer` | `SOC-*`, `FB-*`, `FSD-*`, `NEXT-01~03/05/06`, `PERF-03` | 읽기 전용, 아키텍처·의존성 경계 전담 |
| `security-reviewer` | `SEC-01~03`, `DQ-04`, `NEXT-04` | 읽기 전용, 앱 보안 설계·취약점 전담 |
| `structure-analyzer` | 구조·설정·버전·충돌 사전 분석 | 비리뷰어, 읽기 전용 |

- `github-convention`(Issue AC, PR 템플릿, 브랜치/커밋 정책, CI/Check, Git 변경 권한, PR Secret Scan)과는 독립적으로 설치·실행되며, 외부 PR 컨텍스트 연동 시 `node bin/dev-principles.mjs check --format review-result --pr-context <file> --out <file>` 표준 JSON 결과를 사용할 수 있습니다.
- **우선순위**: `1. 안전·보안 불변(SEC-01/SEC-02/DQ-04)` > `2. 프로젝트 설정(.dev-principles.yaml)·공식 규칙(AGENTS.md/CLAUDE.md/tsconfig/린터)` > `3. 사용자 전역 설정` > `4. dev-principles 기본값`. 충돌 시 기존 프로젝트 규칙을 유지하고 `[Conflict] <RULE-ID> ↔ <프로젝트 기존 규칙> | 원인: ... | 유지 사유: ...`로 보고합니다.

### 오류 발생 시 복구 방법

1. **소유권 충돌 오류(`Refusing to overwrite/remove ...`)**: 대상 경로가 타 플러그인이나 사용자 파일인지 확인한 뒤, 필요 시 `--target`으로 별도 경로를 지정하거나 기존 파일을 백업 후 재실행합니다.
2. **설치 상태 점검**: `./install.sh --scope <project|global> --dry-run` 및 `./uninstall.sh --scope <project|global> --dry-run`으로 변경 예정 대상을 먼저 확인합니다.
3. **설정·충돌 진단**: `node bin/dev-principles.mjs doctor` (또는 `/dp-doctor`)로 스키마, `DQ-04`/`SEC-01`/`SEC-02`, `AGENTS.md`/`CLAUDE.md` 충돌, 동반 플러그인 감지 상태를 확인합니다.

---

## 구성 요소

### 스킬 (`skills/dev-principles/`)

- [`SKILL.md`](skills/dev-principles/SKILL.md) — 경량 코어 가드레일(150줄 이내), 적응형 Track S/M/L 워크플로, Context7 MCP 탐색 규칙
- `references/` — [`workflow-guide.md`](skills/dev-principles/references/workflow-guide.md), [`ai-workflow.md`](skills/dev-principles/references/ai-workflow.md), [`clean-code.md`](skills/dev-principles/references/clean-code.md), [`typescript.md`](skills/dev-principles/references/typescript.md), [`architecture-soc.md`](skills/dev-principles/references/architecture-soc.md), [`data-and-state.md`](skills/dev-principles/references/data-and-state.md), [`security-and-reliability.md`](skills/dev-principles/references/security-and-reliability.md), [`testing-and-verification.md`](skills/dev-principles/references/testing-and-verification.md), [`performance-and-a11y.md`](skills/dev-principles/references/performance-and-a11y.md), [`automation-guide.md`](skills/dev-principles/references/automation-guide.md), [`review-checklist.md`](skills/dev-principles/references/review-checklist.md), [`presets/`](skills/dev-principles/references/presets/README.md)

### 읽기 전용 서브에이전트 (`agents/`)

- [`structure-analyzer`](agents/structure-analyzer.md) — 저장소 구조·버전·도구·프리셋·충돌 사전 탐색
- [`principles-reviewer`](agents/principles-reviewer.md) — 일반 코드·타입·테스트·성능·접근성 원칙 감사
- [`architecture-reviewer`](agents/architecture-reviewer.md) — 모듈 경계·순환 참조·Public API·RSC 경계 감사
- [`security-reviewer`](agents/security-reviewer.md) — 시크릿 노출·XSS/주입·인증 토큰·신뢰 경계 감사

### 슬래시 커맨드 (`commands/`)

| 커맨드 | 설명 |
| :--- | :--- |
| `/dp-design` | 적응형 Track S/M/L 기반 신규 기능 설계·구현 (`AI-05` + `TEST-02`/`03`) |
| `/dp-refactor` | 동작 기준선 확보 후 추상화 정렬·관심사 분리 리팩터링 |
| `/dp-review` | `dev-principles check` + 서브에이전트 기반 PR/파일 원칙 감사 |
| `/dp-check` | 무의존성 정적 검사기(`check`) 실행 및 위반 사항 요약 |
| `/dp-init` | 저장소 구조 감지 후 `.dev-principles.yaml` 생성/미리보기 |
| `/dp-doctor` | 설정 스키마, Rule ID, 보안 불변(`DQ-04`, `SEC-01`, `SEC-02`), 로컬 충돌 진단 |
| `/dp-explain` | 특정 Rule ID의 강도, 자동화 분류, 예외, Why, Before/After 조회 |
| `/dp-propose` | 반복 패턴·예외 기반 규칙/설정 개선 제안서 작성 (승인 전 무수정) |

### 무의존성 Node 22+ 유틸리티 (`bin/dev-principles.mjs`)

```bash
node bin/dev-principles.mjs init --dry-run
node bin/dev-principles.mjs doctor --json
node bin/dev-principles.mjs list --automation static
node bin/dev-principles.mjs explain SEC-01
node bin/dev-principles.mjs check --preset fsd --strict
node bin/dev-principles.mjs check --staged
```

---

## 프로젝트 설정

프로젝트 루트에 `.dev-principles.yaml`을 두면 아키텍처 프리셋(`auto` 기본, `feature-based`, `fsd`, `next-app-router`), Context7 MCP 정책, Rule ID별 강도 오버라이드, `customPrinciples`, `ignore` 경로를 지정할 수 있습니다.

- [설정 예시 (`examples/.dev-principles.yaml`)](examples/.dev-principles.yaml)
- [설정 스키마 (`schemas/config.schema.json`)](schemas/config.schema.json)

## 저장소 검증

Node.js 22 이상 환경에서 외부 패키지 설치 없이 바로 검증할 수 있습니다.

```bash
npm run validate   # 매니페스트 버전, 스키마, 프런트매터, 예산, 58개 Rule ID 정합성 점검
npm run garden     # 깨진 마크다운 링크, wikilink·개인경로 유출, 고아 파일 점검
npm test           # 훅, 설치기, CLI, 정적 검사기, Eval 스위트 실행
npm run check      # 위 3가지 일괄 실행
```

## 라이선스

[MIT License](LICENSE)
