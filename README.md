# dev-principles

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

TypeScript, React, Next.js 중심 프론트엔드 및 범용 소프트웨어 개발 원칙을 Rule ID 체계(`AI-*`, `CC-*`, `TS-*`, `SOC-*`, `DQ-*`)와 opt-in 아키텍처 프리셋(`feature-based`, `fsd`, `next-app-router`)으로 제공하는 멀티 하네스 플러그인·스킬입니다.

빌드나 외부 npm 패키지 설치 없이 마크다운 스킬, 읽기 전용 서브에이전트, 슬래시 커맨드, `SessionStart` 훅, 무의존성 Node 22+ 유틸리티로 동작합니다.

---

## 설치 방법

### 1. Claude Code 마켓플레이스 설치

```text
/plugin install dev-principles --marketplace Dobbymin/dev-principles
```

### 2. 지원 하네스 루트 매니페스트

- Claude Code: [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json), [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json)
- Codex: [`.codex-plugin/plugin.json`](.codex-plugin/plugin.json), [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json)
- Cursor: [`.cursor-plugin/plugin.json`](.cursor-plugin/plugin.json)
- Antigravity: [`.antigravity-plugin/plugin.json`](.antigravity-plugin/plugin.json)
- Gemini CLI: [`gemini-extension.json`](gemini-extension.json)

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

- [`SKILL.md`](skills/dev-principles/SKILL.md) — 경량 코어 가드레일(150줄 이내), Context7 MCP 탐색 규칙, 3대 실행 모드(`design/implement`, `refactor`, `review/audit`)
- `references/` — [`ai-workflow.md`](skills/dev-principles/references/ai-workflow.md), [`clean-code.md`](skills/dev-principles/references/clean-code.md), [`typescript.md`](skills/dev-principles/references/typescript.md), [`architecture-soc.md`](skills/dev-principles/references/architecture-soc.md), [`data-and-state.md`](skills/dev-principles/references/data-and-state.md), [`review-checklist.md`](skills/dev-principles/references/review-checklist.md), [`presets/`](skills/dev-principles/references/presets/README.md)

### 서브에이전트 (`agents/`)

- [`principles-reviewer`](agents/principles-reviewer.md) — Rule ID 기반 읽기 전용 코드 리뷰 및 감사
- [`structure-analyzer`](agents/structure-analyzer.md) — 저장소 구조·프리셋·충돌 읽기 전용 분석

### 슬래시 커맨드 (`commands/`)

| 커맨드 | 설명 |
| :--- | :--- |
| `/dp-design` | 신규 기능 설계·구현 (`AI-05` Context7 확인 + SoC 경계 선설계) |
| `/dp-refactor` | 추상화 정렬·이벤트/함수 분리·관심사 분리 리팩터링 |
| `/dp-review` | PR/파일 원칙 감사 및 Rule ID 리포트 생성 |
| `/dp-init` | 저장소 구조 감지 후 `.dev-principles.yaml` 생성/미리보기 |
| `/dp-doctor` | 설정 스키마, Rule ID, 보안 불변(`DQ-04`), 로컬 충돌 진단 |
| `/dp-explain` | 특정 Rule ID의 규칙, 강도, Why, 예시 조회 |

### 무의존성 Node 22+ 유틸리티 (`bin/dev-principles.mjs`)

```bash
node bin/dev-principles.mjs init --dry-run
node bin/dev-principles.mjs doctor --json
node bin/dev-principles.mjs list --category CC
node bin/dev-principles.mjs explain FSD-06
```

---

## 프로젝트 설정

프로젝트 루트에 `.dev-principles.yaml`을 두면 아키텍처 프리셋(`auto` 기본, `feature-based`, `fsd`, `next-app-router`), Context7 MCP 정책, Rule ID별 강도 오버라이드를 지정할 수 있습니다.

- [설정 예시 (`examples/.dev-principles.yaml`)](examples/.dev-principles.yaml)
- [설정 스키마 (`schemas/config.schema.json`)](schemas/config.schema.json)

## 저장소 검증

Node.js 22 이상 환경에서 외부 패키지 설치 없이 바로 검증할 수 있습니다.

```bash
npm run validate   # 매니페스트 버전, 스키마, 프런트매터, 예산, 47개 Rule ID 점검
npm run garden     # 깨진 마크다운 링크, wikilink 유출, 고아 파일 점검
npm test           # 훅, 설치기, CLI, 검증기 단위·통합 테스트
npm run check      # 위 3가지 일괄 실행
```

## 라이선스

[MIT License](LICENSE)
