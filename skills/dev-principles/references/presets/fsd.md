# Preset: `fsd` (Feature-Sliced Design)

중대형·장기 운영 프론트엔드에서 엄격한 6계층 단방향 의존성, 행동(`features`) 중심 분리, 도메인 슬라이스 격리, 명시적 Public API를 유지하기 위한 opt-in 프리셋이다.

## 1. 6-Layer 계층 방향

```text
app ──▶ pages (Next.js App Router 병행 시 src/views) ──▶ widgets ──▶ features ──▶ entities ──▶ shared
```

> **Next.js App Router 브리지**: 라우팅 `app/`을 루트 Route Shell로 두고, FSD `app` 레이어는 `src/app/`, FSD `pages` 레이어는 `src/views/`로 분리해 이름 충돌을 방지한다.
> **유연화**: `widgets` 조건을 충족하는 조립 블록이 없으면 `widgets/`를 생략하고 5계층으로 운용한다.

## 2. 프리셋 강제 규칙 (`FSD-01` ~ `FSD-09`)

| 규칙 ID | 강도 | 세부 기준 |
| --- | :---: | --- |
| `FSD-01` | `MUST` | 역방향 레이어 import(`shared → entities`, `entities → features` 등)를 금지한다. |
| `FSD-02` | `MUST` | 동일 레이어 슬라이스 간 직접 import를 금지한다. 불가피한 `entities` 간 도메인 연관관계에만 FSD v2.1 `@x` 전용 Public API(`entities/<target>/@x/<consumer>.ts`)를 예외 허용하며 `features`/`widgets` 교차 참조는 전면 금지한다. 여러 위젯을 감싸는 앱 셸은 `src/app/layouts` 또는 `views`에 둔다. |
| `FSD-03` | `MUST` | 외부 레이어는 슬라이스 최상위 `index.ts` Public API만 import하고 내부 경로를 직접 참조하지 않는다. 최상위 `index.ts`는 명시적 named export(`export { ... }`)를 권장한다. |
| `FSD-04` | `SHOULD` | `entities` 슬라이스는 순수 계산·도메인 타입·공용 기본 조회(GET)·읽기 전용 표시 UI에 집중하며 화면 종속 mutation이나 전역 부수효과를 두지 않는다. |
| `FSD-05` | `SHOULD` | `pages`(또는 `views`)는 화면 조립층으로 유지하며 재사용될 비즈니스 액션·mutation을 직접 품지 않는다. |
| `FSD-06` | `MUST` | **`features` 우선 추출 + `widgets` 진입 게이트**: 사용자 액션·폼·필터·mutation은 반드시 `features/`에 먼저 배치한다. 단일 페이지 1곳 전용 조합 블록은 `pages/<route>/ui/`에 두며, `widgets/`는 2개 이상 페이지 재사용 블록(또는 200줄+ 단일 페이지 분할 예외)일 때만 허용한다. `widgets/` 내부 직접 API mutation·비즈니스 로직 구현을 금지한다. |
| `FSD-07` | `SHOULD` | **API 3분할 배치**: 2개 이상 기능이 공유하는 도메인 기본 조회(GET)·`queryOptions`는 `entities/api`, 사용자 액션·CUD 및 해당 액션 종속 조회(예: Favorite GET+POST)는 `features/api`에 응집, 단일 페이지 전용 조합 조회만 예외적으로 `pages/api`에 둔다. |
| `FSD-08` | `SHOULD` | **하이브리드 배치 및 Slice Grouping**: 명확한 액션·도메인은 선분리하고 1곳 전용 경량 코드는 `pages`에서 시작해 2곳 이상 재사용 시 하향 추출한다. 동일 도메인 슬라이스가 3개 이상이면 Slice Grouping을 허용하되 그룹 간 Import Rule을 유지한다. |
| `FSD-09` | `PREFER` | **경계 린터 자동 검증**: 단방향 레이어 차단에는 ESLint `import/no-restricted-paths`(`zones`), 슬라이스·Public API 포함 전체 FSD 검증에는 Steiger(`npx steiger ./src`)를 프로젝트 성격에 맞게 선택 연동한다(새 패키지 설치는 사용자 승인 후 진행). |
