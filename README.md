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

- **지원 셸 환경**: POSIX `sh` 호환 셸(`/bin/sh`, `dash`, `bash`, `zsh`) 및 Windows Git Bash(MSYS2)를 지원합니다. [`.gitattributes`](.gitattributes)로 `*.sh`의 LF 줄바꿈을 보장하며, 개발자 모드(심볼릭 링크 권한)가 꺼진 Windows 환경에서는 `--copy` 옵션을 사용합니다.
- **소유권 마커 스키마 (`schema_version=2`)**: `--copy` 설치 시 대상 디렉터리에 `.dev-principles-script-managed` 마커를 생성하며, 다음 필수 필드를 모두 검증합니다.
  - 필수 메타데이터: `schema_version=2`, `plugin=dev-principles`, `managed_by=install.sh`, `install_mode=copy`, `skill=<스킬명>`, `install_path=<정규화 설치 경로>`, `source_path=<정규화 원본 경로>`
  - 파일 매니페스트: `file=<상대경로>` (중복·빈 경로·절대 경로·`..` 경로 탈출·심볼릭 링크 불가)
  - 명시적 하위 호환: `schema_version=1`(전체 필수 필드 검증)과 구버전 단일 행 `managed-by=install.sh` + `SKILL.md` 이름 일치만 예외적으로 허용하며, 불완전하거나 변조·중복된 마커 및 심볼릭 링크 마커는 거부합니다.
- **무결성·보존·안전 삭제 정책**:
  - 복사 디렉터리의 실제 파일·하위 디렉터리 목록과 파일 내용이 원본과 다르면(관리 파일 수정·누락, 사용자 파일·디렉터리 추가, 내부 심볼릭 링크 존재) 소유권을 인정하지 않고 덮어쓰기·삭제를 중단합니다.
  - 삭제 시 `rm -rf`를 사용하지 않으며, 삭제 직전 소유권 재검증 후 관리 파일 개별 삭제 → 마커 별도 검증 후 삭제 → 빈 하위 디렉터리 순차 제거를 수행합니다. 오류 발생 시 남은 파일을 삭제하지 않고 즉시 중단합니다.
  - 업데이트 시 기존 소유 설치를 백업(`.<skill>.dev-principles.bak.<pid>`)으로 이동한 뒤 교체하고, 실패 시 자동 복원합니다. 타 플러그인(`github-convention` 등)의 심볼릭 링크·파일·디렉터리·Windows Junction은 절대 침범하지 않습니다.

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

1. **소유권 충돌 오류(`Refusing to overwrite/remove ...`)**:
   - `user-added file/directory detected` 또는 `managed file modified`: 사용자가 추가한 파일이나 수정 내역을 백업한 뒤, 관리 디렉터리를 정리하거나 `--target`으로 별도 경로를 지정해 재실행합니다.
   - 타 플러그인 마커·심볼릭 링크 충돌: 기존 설치를 보존한 채 `--target`으로 다른 경로를 지정합니다.
2. **부분 설치·업데이트 중단 복구**:
   - 설치/업데이트 도중 중단되어 `.<skill>.dev-principles.bak.<pid>` 백업이 남았다면 대상 경로 상태를 확인한 뒤 백업을 원래 위치로 되돌리거나 확인 후 삭제합니다. 임시 스테이징 디렉터리(`.<skill>.dev-principles.tmp.<pid>`)만 남은 경우 안전하게 삭제 후 재설치합니다.
3. **설치 상태 점검**: `./install.sh --scope <project|global> --dry-run` 및 `./uninstall.sh --scope <project|global> --dry-run`으로 변경 예정 대상을 먼저 확인합니다.
4. **설정·충돌 진단**: `node bin/dev-principles.mjs doctor` (또는 `/dp-doctor`)로 스키마, `DQ-04`/`SEC-01`/`SEC-02`, `AGENTS.md`/`CLAUDE.md` 충돌, 동반 플러그인 감지 상태를 확인합니다.

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
node bin/dev-principles.mjs check --format review-result --pr-context pr.json --out reports/review.json
```

- `doctor`는 설정 스키마와 보안 불변(`DQ-04`, `SEC-01`, `SEC-02`) 외에도 로컬 규칙 충돌(`[Conflict]`)과 동반 워크플로우 플러그인(`github-convention`) 감지 상태를 함께 진단합니다.

---

## 프로젝트 설정

프로젝트 루트에 `.dev-principles.yaml`을 두면 아키텍처 프리셋(`auto` 기본, `feature-based`, `fsd`, `next-app-router`), Context7 MCP 정책, Rule ID별 강도 오버라이드, `customPrinciples`, `ignore` 경로를 지정할 수 있습니다.

- [설정 예시 (`examples/.dev-principles.yaml`)](examples/.dev-principles.yaml)
- [설정 스키마 (`schemas/config.schema.json`)](schemas/config.schema.json)

## 저장소 검증

Node.js 22 이상 환경에서 외부 패키지 설치 없이 바로 검증할 수 있습니다.

```bash
npm run prepare    # .githooks 및 fetch.prune true 로컬 Git 설정
npm run validate   # 매니페스트 버전, 스키마, 프런트매터, 예산, 58개 Rule ID 정합성 점검
npm run garden     # 깨진 마크다운 링크, wikilink·개인경로 유출, 고아 파일 점검
npm test           # 훅, 설치기(macOS/Linux/Windows), CLI, 정적 검사기, Eval 스위트 실행
npm run check      # validate + garden + test 일괄 실행
```

- CI([`.github/workflows/ci.yml`](.github/workflows/ci.yml))는 `main` push, `pull_request`, `workflow_dispatch`에서 `ubuntu-latest`, `macos-latest`, `windows-latest` 3-OS 매트릭스로 검증합니다.

## 라이선스

[MIT License](LICENSE)
