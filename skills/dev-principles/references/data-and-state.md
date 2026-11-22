# 데이터·상태·API 원칙 (`DQ-*`)

### `DQ-01` 서버 상태와 클라이언트 UI 상태의 분리
- **강도**: `SHOULD`
- **적용 범위**: 프론트엔드 상태 관리 전반
- **규칙**: 서버가 원본을 소유하는 비동기 데이터(목록, 상세, 사용자 프로필 등)를 Redux/Zustand 같은 클라이언트 전역 스토어에 수동 복사·동기화하지 않는다. 서버 상태는 TanStack Query/SWR 또는 프레임워크 서버 데이터 계층으로 관리하고, 클라이언트 스토어는 UI 상호작용 상태(모달 열림, 선택 탭, 필터 입력)에 집중한다.
- **이유 (Why)**: 서버 데이터는 캐싱·재시도·무효화·동시성 동기화가 필수이며 클라이언트 스토어로 수동 관리하면 동기화 버그가 폭증한다.

### `DQ-02` API Client 단일 진입점 및 일관된 에러 계약
- **강도**: `MUST`
- **적용 범위**: 모든 HTTP 요청 및 기능 API 모듈
- **규칙**: 공통 HTTP 클라이언트(`api-client.ts`)를 단일 진입점으로 두고, 기능 API 모듈이나 UI 컴포넌트에서 `fetch`/`axios`를 직접 호출하지 않는다. 기능 API 함수(`*.api.ts`)는 React 훅을 모르는 순수 비동기 함수로 작성하며 동사 접두어(`list`, `get`, `create`, `update`, `delete`, `refresh`)와 `URLSearchParams`를 사용한다. `FormData` 전송 시 `Content-Type`을 수동 지정하지 않고 실패 시 일관되게 `Error`를 `throw`한다.
- **이유 (Why)**: 인증 헤더, credentials, 에러 파싱, 리프레시 재시도 로직이 분산되면 엔드포인트마다 동작이 달라지고 보안/장애 대응이 어려워진다.

### `DQ-03` TanStack Query Key 중앙화 및 v5 `queryOptions` 패턴
- **강도**: `SHOULD`
- **적용 범위**: TanStack Query 사용 프로젝트
- **규칙**: Query key는 도메인 모델 계층에 Query Key Factory(`all`, `list(filters)`, `detail(id)`) 또는 TanStack Query v5 `queryOptions` 팩토리로 중앙화한다. UI 컴포넌트 안에서 query key 배열을 직접 하드코딩하지 않는다. v5에서는 `queryOptions`와 `skipToken`으로 타입 안전성을 유지한다.
- **이유 (Why)**: 키 문자열이 흩어지면 캐시 무효화 누락과 오타 버그가 빈번해진다.
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
- **적용 범위**: 웹 인증 세션 및 API 인터셉터 (보안 불변 항목)
- **규칙**: Access token은 `localStorage`/`sessionStorage`에 저장하지 않고 메모리에 보관한다(보안 불변). Refresh token은 `httpOnly` + `Secure` 쿠키를 사용한다. 401 응답 시 단일 비행(single-flight) 토큰 리프레시 후 원 요청을 최대 1회만 재시도하며, 로그인·회원가입·리프레시 요청에는 `skipAuthRefresh: true`를 적용해 무한 재귀 루프를 차단한다. 로그아웃 시 메모리 토큰과 인증 쿼리 캐시를 함께 정리한다.
- **이유 (Why)**: XSS 토큰 탈취와 401 무한 리프레시 루프는 프론트엔드 인증에서 가장 치명적인 반복 장애다.

### `DQ-05` Mutation 훅의 캐시 무효화(`invalidateQueries`) 자가 관리
- **강도**: `SHOULD`
- **적용 범위**: 서버 데이터 변경(생성/수정/삭제) 훅
- **규칙**: `useMutation` 커스텀 훅이 성공 시 관련 목록(`all`/`list`) 및 상세(`detail(id)`) 쿼리 무효화 정책을 직접 책임진다. UI 컴포넌트는 `mutate`/`mutateAsync`, `isPending`, `error`만 소비하며 캐시 키 구조를 알지 않게 한다.
- **이유 (Why)**: 무효화 책임을 호출부에 떠넘기면 같은 mutation을 다른 화면에서 재사용할 때 캐시 갱신이 누락된다.
