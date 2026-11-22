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

## 2. 규칙 상세 (`NEXT-01` ~ `NEXT-06`)

### `NEXT-01` Server Component 기본 및 `'use client'` 말단(Leaf) 최소화
- **강도**: `MUST`
- **자동화**: `hybrid` — `dev-principles check`로 `layout.tsx` 최상단 `'use client'` 정적 감지 + `page.tsx` 경계 리뷰
- **적용 범위**: `next-app-router` 프리셋의 `app/` 및 컴포넌트 트리
- **규칙**: Server Component를 기본으로 두고, `layout.tsx`나 `page.tsx` 최상단에 습관적으로 `'use client'`를 붙이지 않는다. 인터랙션(`useState`, 이벤트 핸들러)이 필요한 최소 하위 말단 컴포넌트만 클라이언트 경계로 분리한다.
- **이유 (Why)**: 최상위 레이아웃/페이지에 `'use client'`를 선언하면 하위 트리 전체가 클라이언트 번들에 포함되어 RSC 이점이 사라진다.
- **예외 / 오탐 방지**: Canvas/WebGL 뷰어처럼 페이지 전체가 순수 클라이언트 인터랙션으로만 구성된 특수 라우트는 예외로 허용한다.
- **Before / After**:
```tsx
// Bad: app/dashboard/page.tsx 최상단에 'use client' 선언 후 정적 테이블까지 클라 번들화

// Good: page.tsx는 Server Component로 유지하고 검색 버튼(<SearchTrigger />)만 'use client' 말단 분리
```

### `NEXT-02` Server → Client 경계 직렬화 및 `*Action` 명명
- **강도**: `MUST`
- **자동화**: `manual` — Server → Client props 직렬화 가능 여부 및 Server Action 네이밍 리뷰
- **적용 범위**: `next-app-router` 프리셋의 RSC → Client Component 경계
- **규칙**: Server Component에서 Client Component로 전달하는 props는 JSON 직렬화 가능해야 하며 일반 함수·클래스 인스턴스·`Date` 객체를 그대로 넘기지 않는다. `'use server'` Server Function props는 `action` 또는 `*Action`으로 명명한다.
- **이유 (Why)**: 비직렬화 props는 RSC 경계 런타임 오류를 유발하며, Server Function 명명이 불명확하면 일반 클라이언트 콜백과 혼동된다.
- **예외 / 오탐 방지**: Next.js가 직렬화를 지원하는 특수 타입(`Promise` 스트리밍 등)은 설치된 Next.js 버전 스펙(`AI-05`)을 확인해 허용한다.
- **Before / After**:
```tsx
// Bad: <ClientForm onSubmit={serverAction} createdAt={new Date()} />

// Good: <ClientForm submitAction={saveProfileAction} createdAtIso={date.toISOString()} />
```

### `NEXT-03` Composition Slot (`children`)을 통한 서버 영역 주입
- **강도**: `SHOULD`
- **자동화**: `manual` — Client Component 내부의 Server Component 직접 import 여부 리뷰
- **적용 범위**: `next-app-router` 프리셋에서 Client 래퍼 내부에 서버 콘텐츠를 배치할 때
- **규칙**: Client Component 내부에 서버 렌더링 영역이 필요하면 서버 컴포넌트를 직접 import하지 말고 부모 Server Component에서 `children` 또는 JSX prop 슬롯으로 주입한다.
- **이유 (Why)**: Client Component가 Server Component를 직접 import하면 해당 서버 컴포넌트까지 클라이언트 번들로 끌려 들어간다.
- **예외 / 오탐 방지**: 슬롯 없이 순수 클라이언트 상태만 감싸는 UI는 일반 `children` 패턴을 그대로 사용한다.
- **Before / After**:
```tsx
// Bad: 'use client' Modal 안에서 ServerSidebar를 직접 import

// Good: ServerPage에서 <ClientModal>{<ServerSidebar />}</ClientModal> 형태로 슬롯 주입
```

### `NEXT-04` 서버 전용 모듈 격리 (`server-only` / `*.server.ts`)
- **강도**: `MUST`
- **자동화**: `static` — `dev-principles check`로 `'use client'` 파일 내 `server-only`/`next/headers`/`*.server` import 차단
- **적용 범위**: `next-app-router` 프리셋의 서버 비밀키·DB·세션 로더 모듈
- **규칙**: 비밀 키, DB 클라이언트, `cookies()`/`headers()` 의존 서버 로더에는 `import "server-only"`를 선언하거나 `*.server.ts` 경계를 명확히 해 클라이언트 번들 유입을 차단한다.
- **이유 (Why)**: 서버 전용 코드가 클라이언트 컴포넌트에 실수로 import되면 빌드 실패나 민감 정보 번들 노출이 발생한다.
- **예외 / 오탐 방지**: Next.js Route Handler(`app/api/**`)와 `*.server.ts` 내부에서는 서버 전용 모듈을 정상 사용한다.
- **Before / After**:
```ts
// Bad: lib/db.ts에 server-only 가드 없이 export해 클라이언트 컴포넌트에서 오인 import 가능

// Good: lib/db.server.ts 최상단에 import "server-only"; 선언으로 컴파일 타임 차단
```

### `NEXT-05` 비동기 라우트 API 최신 스펙 준수 (Next.js 15+)
- **강도**: `SHOULD`
- **자동화**: `manual` — `package.json`의 `next` 버전 확인 후 `params`/`searchParams`/`cookies`/`headers` await 리뷰
- **적용 범위**: Next.js 15 이상 App Router의 `page.tsx`, `layout.tsx`, 서버 유틸
- **규칙**: Next.js 15 이상 프로젝트에서는 `page.tsx`·`layout.tsx`의 `params`, `searchParams`와 `cookies()`, `headers()`를 `Promise` 기반 `await` 스펙에 맞춰 사용한다.
- **이유 (Why)**: Next.js 15+에서 동기 접근은 deprecation 경고 또는 런타임 타입 불일치를 일으킨다.
- **예외 / 오탐 방지**: `package.json`의 `next` 버전이 14 이하인 프로젝트에서는 기존 동기 API를 유지한다(`AI-05`).
- **Before / After**:
```tsx
// Bad (Next.js 15+): export default function Page({ params }: { params: { id: string } }) { return params.id; }

// Good (Next.js 15+):
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div>{id}</div>;
}
```

### `NEXT-06` Route Group `(group)`과 Private Folder `_folder` 활용
- **강도**: `SHOULD`
- **자동화**: `manual` — `app/` 라우트 폴더 내 비공개 Co-location 및 레이아웃 그룹 정리 리뷰
- **적용 범위**: `next-app-router` 프리셋의 `app/` 디렉터리 구성
- **규칙**: URL에 영향을 주지 않는 레이아웃 분리는 Route Group `(group)`으로, 라우트 내부 비공개 Co-location 코드는 `_components`/`_lib`로 분리한다.
- **이유 (Why)**: 라우트 진입 파일(`page.tsx`)과 라우트 전용 보조 파일이 뒤섞이지 않고 URL 구조도 깔끔하게 유지된다.
- **예외 / 오탐 방지**: 여러 라우트에서 재사용되는 컴포넌트는 `_components`가 아닌 `features/` 또는 `components/`에 둔다.
- **Before / After**:
```text
// Bad: app/dashboard/ChartCard.tsx (라우트 폴더 안에 일반 컴포넌트가 노출됨)

// Good: app/(protected)/dashboard/_components/ChartCard.tsx
```
