# dev-principles

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

TypeScript, React, Next.js 중심 프론트엔드 및 범용 소프트웨어 개발 원칙을 58개 Rule ID 체계(`AI-*`, `CC-*`, `TS-*`, `SOC-*`, `DQ-*`, `SEC-*`, `TEST-*`, `PERF-*`, `A11Y-*`, `DEP-*`)와 opt-in 아키텍처 프리셋(`feature-based`, `fsd`, `next-app-router`)으로 제공하는 멀티 하네스 플러그인·스킬입니다.

빌드나 외부 npm 패키지 설치 없이 마크다운 스킬, 읽기 전용 서브에이전트, 슬래시 커맨드, `SessionStart` 훅, 무의존성 Node 22+ 정적 검사기 및 CLI 유틸리티로 동작합니다.

---

## 설치 방법

### 1. Claude Code 마켓플레이스 설치

```text
/plugin install dev-principles --marketplace Dobbymin/dev-principles
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
# 프로젝트 범위 심링크 설치
./install.sh --scope project

# 전역 복사 설치 및 제거
./install.sh --scope global --copy
./uninstall.sh --scope global
```

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
