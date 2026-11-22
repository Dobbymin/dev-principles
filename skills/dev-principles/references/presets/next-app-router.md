# Preset: `next-app-router` (Next.js App Router 표준 · 비-FSD)

FSD 6계층을 도입하지 않는 표준 Next.js App Router 프로젝트에서 파일 시스템 라우팅·RSC 경계와 `SOC-*` 원칙을 결합하기 위한 opt-in 프리셋이다.

## 1. 표준 디렉터리 레이아웃

```text
src/ (또는 프로젝트 루트)
├── app/            # 라우팅·레이아웃·서버 진입점, 라우트 전용 _components/, _lib/, Route Group (group)
├── features/       # 2개 이상 라우트 공유 또는 로직이 큰 기능 단위 (api/, model/, types/, ui/, index.ts)
├── components/     # 앱 공용 순수 UI (ui/) 및 공통 레이아웃 조각 (layout/)
├── lib/            # 공용 인프라 (api-client, server-api-client, query-client, utils)
└── styles/         # 전역 스타일·토큰
```

> 기존 레포가 `libs/`, `hooks/`, `utils/` 등 합의된 디렉터리 명명을 이미 사용 중이라면 강제 전환하지 않고 `[Conflict]` 보고 후 기존 구조를 유지한다 (`SOC-06`).

## 2. Server / Client Component 경계 규칙 (`NEXT-01` ~ `NEXT-06`)

| 규칙 ID | 강도 | 세부 기준 |
| --- | :---: | --- |
| `NEXT-01` | `MUST` | **Server Component 기본, `'use client'`는 말단(Leaf)으로 최소화**: `layout.tsx`나 `page.tsx` 최상단에 습관적으로 `'use client'`를 붙이지 않고 인터랙션이 필요한 최소 하위 컴포넌트만 클라이언트 경계로 분리한다. |
| `NEXT-02` | `MUST` | **Server → Client 경계 직렬화 및 `*Action` 명명**: Server Component에서 Client Component로 전달하는 props는 JSON 직렬화 가능해야 하며 일반 함수를 넘기지 않는다. `'use server'` Server Function props는 `action` 또는 `*Action`으로 명명한다. |
| `NEXT-03` | `SHOULD` | **Composition Slot (`children`)**: Client Component 내부에 서버 렌더링 영역이 필요하면 서버 컴포넌트를 직접 import하지 말고 부모 Server Component에서 `children` 또는 JSX prop 슬롯으로 주입한다. |
| `NEXT-04` | `MUST` | **서버 전용 모듈 격리**: 비밀 키, DB 클라이언트, `cookies()`/`headers()` 의존 서버 로더에는 `import "server-only"`를 선언하거나 `*.server.ts` 경계를 명확히 해 클라이언트 번들 유입을 차단한다. |
| `NEXT-05` | `SHOULD` | **비동기 라우트 API 최신 스펙 준수 (Next.js 15+)**: `page.tsx`·`layout.tsx`의 `params`, `searchParams`와 `cookies()`, `headers()`는 최신 버전 스펙(`Promise` 기반 `await`)에 맞춰 사용한다. |
| `NEXT-06` | `SHOULD` | **Route Group `(group)`과 Private Folder `_folder` 활용**: URL에 영향을 주지 않는 레이아웃 분리는 `(group)`으로, 라우트 내부 비공개 Co-location 코드는 `_components`/`_lib`로 분리한다. |
