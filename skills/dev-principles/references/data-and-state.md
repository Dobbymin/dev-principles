# 데이터·상태·API 원칙 (`DQ-*`)

### `DQ-01` 서버 상태와 클라이언트 UI 상태의 분리
- **강도**: `SHOULD`
- **자동화**: `manual` — 전역 스토어 내 서버 응답 캐시 중복 보관 여부 리뷰
- **적용 범위**: 프론트엔드 상태 관리 전반
- **규칙**: 서버가 원본을 소유하는 비동기 데이터(목록, 상세, 사용자 프로필 등)를 Redux/Zustand 같은 클라이언트 전역 스토어에 수동 복사·동기화하지 않는다. 서버 상태는 TanStack Query/SWR 또는 프레임워크 서버 데이터 계층으로 관리하고, 클라이언트 스토어는 UI 상호작용 상태(모달 열림, 선택 탭, 필터 입력)에 집중한다.
- **이유 (Why)**: 서버 데이터는 캐싱·재시도·무효화·동시성 동기화가 필수이며 클라이언트 스토어로 수동 관리하면 동기화 버그가 폭증한다.
- **예외 / 오탐 방지**: 클라이언트 전용 편집 드래프트(서버 저장 전 임시 작업본)나 오프라인 큐는 초기값만 서버에서 받고 로컬 상태로 분리해 관리할 수 있다.
- **Before / After**:
```ts
// Bad: useEffect로 서버 목록을 받아 Zustand store에 수동 setProducts 복사

// Good: 서버 목록은 TanStack Query 캐시로 관리하고, Zustand는 selectedFilterIds만 보관
```

### `DQ-02` API Client 단일 진입점 및 일관된 에러 계약
- **강도**: `MUST`
- **자동화**: `hybrid` — `dev-principles check`로 UI/feature 내 raw `fetch`/`axios` 호출 정적 감지 + 네이밍 리뷰
- **적용 범위**: 모든 HTTP 요청 및 기능 API 모듈
- **규칙**: 공통 HTTP 클라이언트(`api-client.ts`)를 단일 진입점으로 두고, 기능 API 모듈이나 UI 컴포넌트에서 `fetch`/`axios`를 직접 호출하지 않는다. 기능 API 함수(`*.api.ts`)는 React 훅을 모르는 순수 비동기 함수로 작성하며 동사 접두어(`list`, `get`, `create`, `update`, `delete`, `refresh`)와 `URLSearchParams` 사용을 권장한다. `FormData` 전송 시 `Content-Type`을 수동 지정하지 않고 실패 시 일관되게 `Error`를 `throw`한다.
- **이유 (Why)**: 인증 헤더, credentials, 에러 파싱, 리프레시 재시도 로직이 분산되면 엔드포인트마다 동작이 달라지고 보안/장애 대응이 어려워진다.
- **예외 / 오탐 방지**: `api-client` 구현체 자체, Next.js `*.server.ts` / Route Handler(`app/api/**`)의 프레임워크 캐시 래퍼, 외부 웹훅/헬스체크 스크립트는 예외로 허용한다.
- **Before / After**:
```ts
// Bad: 컴포넌트나 feature에서 fetch 직접 호출 및 FormData Content-Type 수동 지정
await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "multipart/form-data" }, body: formData });

// Good: 단일 apiClient 진입점 사용 (boundary는 브라우저가 자동 설정)
export const uploadAvatar = (formData: FormData) => apiClient.post<AvatarResponse>("/api/upload", formData);
```

### `DQ-03` TanStack Query Key 중앙화 및 `queryOptions` 패턴
- **강도**: `SHOULD`
- **자동화**: `manual` — UI 컴포넌트 내 queryKey 배열 직접 하드코딩 여부 리뷰
- **적용 범위**: TanStack Query 사용 프로젝트
- **규칙**: Query key는 도메인 모델 계층에 Query Key Factory(`all`, `list(filters)`, `detail(id)`) 또는 TanStack Query v5 `queryOptions` 팩토리로 중앙화한다. UI 컴포넌트 안에서 query key 배열을 직접 하드코딩하지 않는다. v5에서는 `queryOptions`와 `skipToken`으로 타입 안전성을 유지한다.
- **이유 (Why)**: 키 문자열이 흩어지면 캐시 무효화 누락과 오타 버그가 빈번해진다.
- **예외 / 오탐 방지**: TanStack Query v4 이하를 사용 중이면 `queryOptions`/`skipToken` 대신 Key Factory + `enabled` 옵션을 유지하며, SWR/RSC 전용 프로젝트에는 적용하지 않는다.
- **Before / After**:
```ts
import { queryOptions, skipToken } from "@tanstack/react-query";
import { getJob, listJobs, type JobFilters } from "../api";

export const jobQueries = {
  all: () => ["jobs"] as const,
  list: (filters: JobFilters = {}) =>
    queryOptions({ queryKey: [...jobQueries.all(), "list", filters] as const, queryFn: () => listJobs(filters) }),
  detail: (id: string | undefined) =>
    queryOptions({ queryKey: [...jobQueries.all(), "detail", id] as const, queryFn: id ? () => getJob(id) : skipToken }),
};
```

### `DQ-04` 인증 토큰 보안 저장 및 401 단일 리프레시 재시도
- **강도**: `MUST`
- **자동화**: `static` — `dev-principles check`로 `localStorage`/`sessionStorage` 내 토큰 키 패턴 정적 검사
- **적용 범위**: 웹 인증 세션 및 API 인터셉터 (보안 불변 항목 — `off` 오버라이드 불가)
- **규칙**: Access token은 `localStorage`/`sessionStorage`에 저장하지 않고 메모리에 보관한다(보안 불변). Refresh token은 `httpOnly` + `Secure` 쿠키를 사용한다. 401 응답 시 단일 비행(single-flight) 토큰 리프레시 후 원 요청을 최대 1회만 재시도하며, 로그인·회원가입·리프레시 요청에는 `skipAuthRefresh: true`를 적용해 무한 재귀 루프를 차단한다. 로그아웃 시 메모리 토큰과 인증 쿼리 캐시를 함께 정리한다.
- **이유 (Why)**: XSS 토큰 탈취와 401 무한 리프레시 루프는 프론트엔드 인증에서 가장 치명적인 반복 장애다.
- **예외 / 오탐 방지**: `theme`, `locale`, `recentSearches` 같은 비민감 UI 설정의 `localStorage` 사용은 오탐에서 제외한다.
- **Before / After**:
```ts
// Bad: 토큰을 localStorage에 저장하고 401마다 무제한 refresh 호출
localStorage.setItem("accessToken", res.token);

// Good: 메모리 보관 + refresh 요청은 skipAuthRefresh로 무한 루프 차단
setInMemoryAccessToken(res.token);
await apiClient.post("/auth/refresh", undefined, { skipAuthRefresh: true });
```

### `DQ-05` Mutation 훅의 캐시 무효화(`invalidateQueries`) 자가 관리
- **강도**: `SHOULD`
- **자동화**: `manual` — mutation 훅 내부 `onSuccess` 무효화 정책 리뷰
- **적용 범위**: 서버 데이터 변경(생성/수정/삭제) 훅
- **규칙**: `useMutation` 커스텀 훅이 성공 시 관련 목록(`all`/`list`) 및 상세(`detail(id)`) 쿼리 무효화 정책을 직접 책임진다. UI 컴포넌트는 `mutate`/`mutateAsync`, `isPending`, `error`만 소비하며 캐시 키 구조를 알지 않게 한다.
- **이유 (Why)**: 무효화 책임을 호출부에 떠넘기면 같은 mutation을 다른 화면에서 재사용할 때 캐시 갱신이 누락된다.
- **예외 / 오탐 방지**: Optimistic Update 롤백이나 특정 화면 전용 후속 리다이렉트만 UI 콜백으로 위임하는 것은 허용한다.
- **Before / After**:
```ts
// Bad: 컴포넌트에서 mutation.mutate(data, { onSuccess: () => queryClient.invalidateQueries(...) }) 직접 처리

// Good: useUpdateJob 훅 내부 onSuccess에서 jobQueries.all() 무효화를 자가 관리
```
