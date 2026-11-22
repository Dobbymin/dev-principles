# dev-principles

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

TypeScript, React, Next.js 중심 프론트엔드 및 범용 소프트웨어 개발 원칙을 Rule ID 체계(`AI-*`, `CC-*`, `TS-*`, `SOC-*`, `DQ-*`)와 opt-in 아키텍처 프리셋(`feature-based`, `fsd`, `next-app-router`)으로 제공하는 멀티 하네스 플러그인·스킬입니다.

빌드나 외부 npm 패키지 설치 없이 마크다운 스킬, 읽기 전용 서브에이전트, 슬래시 커맨드, `SessionStart` 훅, Node 22+ 유틸리티로 동작합니다.

---

## 지원 하네스 매니페스트

- Claude Code: [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json), [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json)
- Codex: [`.codex-plugin/plugin.json`](.codex-plugin/plugin.json), [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json)
- Cursor: [`.cursor-plugin/plugin.json`](.cursor-plugin/plugin.json)
- Antigravity: [`.antigravity-plugin/plugin.json`](.antigravity-plugin/plugin.json)
- Gemini CLI: [`gemini-extension.json`](gemini-extension.json)

## 프로젝트 설정

프로젝트 루트에 `.dev-principles.yaml`을 두면 아키텍처 프리셋, Context7 MCP 정책, Rule ID별 강도 오버라이드를 지정할 수 있습니다.

- [설정 예시 (`examples/.dev-principles.yaml`)](examples/.dev-principles.yaml)
- [설정 스키마 (`schemas/config.schema.json`)](schemas/config.schema.json)

## 저장소 검증

Node.js 22 이상 환경에서 외부 패키지 설치 없이 바로 검증할 수 있습니다.

```bash
npm run validate   # 매니페스트 버전, 스키마, 프런트매터, 예산 점검
npm run garden     # 깨진 마크다운 링크, wikilink 유출, 고아 파일 점검
npm test           # 단위·통합 테스트
npm run check      # 위 3가지 일괄 실행
```

## 라이선스

[MIT License](LICENSE)
