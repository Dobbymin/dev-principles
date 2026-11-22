# 자동화 및 정적 검사 가이드 (`automation-guide`)

AI에게 규칙을 프롬프트로 알려주는 것과 실제 코드베이스에서 규칙 위반을 결정론적으로 차단하는 것은 다르다. `dev-principles`는 모든 Rule ID를 아래 4단계 자동화 수준으로 분류한다.

| 분류 | 의미 | 실행 주체 |
| --- | --- | --- |
| `static` | AST/패턴/의존성 그래프 분석으로 결정론적 검출 가능 | `dev-principles check`, ESLint, TypeScript, `dependency-cruiser` |
| `automated` | 테스트/타입체크/빌드/링크 스크립트 실행으로 검증 가능 | `tsc`, `npm test`, `npm run build`, `validate`/`garden` |
| `hybrid` | 정적 1차 후보 추출 후 AI/리뷰어가 문맥·예외를 판정 | `dev-principles check` + `*-reviewer` 서브에이전트 |
| `manual` | 설계 의도·추상화·비즈니스 경계 등 사람의 맥락 판단 필요 | `principles-reviewer`, `architecture-reviewer`, 코드 리뷰 |

## 1. 내장 무의존성 정적 검사기 (`dev-principles check`)

외부 npm 패키지 설치 없이 Node.js 22+ 표준 라이브러리만으로 핵심 위반을 즉시 검출한다.

```bash
node bin/dev-principles.mjs check
node bin/dev-principles.mjs check src/features --preset fsd --strict
node bin/dev-principles.mjs check --staged
node bin/dev-principles.mjs check --changed
node bin/dev-principles.mjs check --rule TS-02 --json
```

- **경로 별칭 자동 해석**: `tsconfig.json` / `jsconfig.json`의 `baseUrl`, `paths`, 로컬 `extends`(JSONC 주석 및 trailing comma 포함)를 자동으로 읽어 `SOC-04`와 프리셋 경계 검사를 수행한다.
- **Git 변경 범위 검사 (`--staged` / `--changed`)**: `pre-commit` 훅이나 로컬 리뷰 시 스테이징된 파일(`--staged`) 또는 작업 트리 변경 파일(`--changed`)만 빠르게 검사한다(`SOC-04` 순환 참조는 전체 그래프에서 변경 파일이 관여한 사이클만 보고).

### 내장 검사기 검출 항목
- **보안 불변 (`SEC-01`, `SEC-02`, `DQ-04`)**: 시크릿 패턴 하드코딩, `dangerouslySetInnerHTML`/`eval`/`new Function`, 인증 토큰 키의 `localStorage`/`sessionStorage` 저장
- **타입·API 경계 (`TS-02`, `DQ-02`)**: 프로덕션 코드의 `any` / `as any` (`import as` 및 테스트 픽스처 제외), UI/feature 내 raw `fetch`/`axios` 직접 호출 (`api-client`/`*.server.*` 제외)
- **의존성 & 프리셋 경계 (`SOC-04`, `FB-*`, `FSD-*`, `NEXT-*`)**: 로컬 ESM 순환 참조(`SOC-04`), `feature-based` 역방향/교차/내부 경로(`FB-01`, `FB-02`, `FB-04`), `fsd` 레이어/슬라이스/Public API(`FSD-01`, `FSD-02`, `FSD-03`), `next-app-router` 레이아웃 `'use client'` 및 클라이언트 번들 서버 모듈 import(`NEXT-01`, `NEXT-04`)

## 2. 외부 정적 도구 선택 연동 (`DEP-01` 승인 후 도입)

프로젝트 규모가 커져 IDE 실시간 피드백이나 완전한 TypeScript 모듈 해석 그래프가 필요할 때는 아래 도구를 선택 연동한다.

### A. `eslint-plugin-boundaries` (Flat Config FSD/레이어 차단)
```js
import boundaries from "eslint-plugin-boundaries";

export default [
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "src/app/**" },
        { type: "pages", pattern: "src/pages/**" },
        { type: "widgets", pattern: "src/widgets/**" },
        { type: "features", pattern: "src/features/**" },
        { type: "entities", pattern: "src/entities/**" },
        { type: "shared", pattern: "src/shared/**" },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            { from: { element: { type: "app" } }, allow: { to: { element: { type: ["pages", "widgets", "features", "entities", "shared"] } } } },
            { from: { element: { type: "pages" } }, allow: { to: { element: { type: ["widgets", "features", "entities", "shared"] } } } },
            { from: { element: { type: "widgets" } }, allow: { to: { element: { type: ["features", "entities", "shared"] } } } },
            { from: { element: { type: "features" } }, allow: { to: { element: { type: ["entities", "shared"] } } } },
            { from: { element: { type: "entities" } }, allow: { to: { element: { type: "shared" } } } },
          ],
        },
      ],
    },
  },
];
```

### B. `dependency-cruiser` (`.dependency-cruiser.cjs` 순환·교차 차단)
```js
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    {
      name: "feature-isolation",
      severity: "error",
      from: { path: "^src/features/([^/]+)" },
      to: { path: "^src/features/([^/]+)", pathNot: "^src/features/$1" },
    },
  ],
};
```

### C. CI 파이프라인 권장 순서
1. `node bin/dev-principles.mjs doctor`
2. `node bin/dev-principles.mjs check`
3. 프로젝트 `tsc --noEmit` → 린트(`eslint`/`biome`) → 테스트 → 빌드
