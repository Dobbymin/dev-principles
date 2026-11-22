# 클린 코드 & 네이밍 원칙 (`CC-*`)

### `CC-01` 같은 함수·훅 내부의 추상화 레벨 정렬
- **강도**: `SHOULD`
- **자동화**: `manual` — 함수/훅 내부의 상위 흐름과 저수준 구현 혼재 여부 리뷰
- **적용 범위**: React 커스텀 훅, 비즈니스 함수, 페이지/위젯 컴포넌트
- **규칙**: 하나의 함수나 커스텀 훅 안에서는 같은 수준의 추상화끼리 조합한다. 상위 흐름(무엇을 하는가) 안에 `Set` 중복 제거, `try/catch/finally` 로딩 토글, query string 조립 같은 저수준 구현(어떻게 하는가)을 섞지 말고 단일 책임 하위 함수/훅으로 분리한다.
- **이유 (Why)**: 추상화 레벨이 뒤섞이면 독자가 상위 의도와 저수준 세부 구현을 계속 오르내려야 해 인지 부하와 변경 영향이 커진다.
- **예외 / 오탐 방지**: 15줄 내외의 단순 단일 목적 헬퍼나 더 쪼개면 오히려 가독성이 떨어지는 일회성 변환은 분리하지 않는다.
- **Before / After**:
```tsx
// Bad: 상위 조합 훅 안에 저수준 상태·중복제거·에러 처리 혼재
function useThemeInfiniteScroll(themeId: string) {
  const [items, setItems] = useState<Product[]>([]);
  const fetchNext = async () => { /* setLoading(true), API 호출, new Set() 중복 제거... */ };
  useIntersectionObserver(ref, fetchNext);
}

// Good: 같은 레벨의 단일 책임 훅을 조합
function useThemeInfiniteScroll(themeId: string) {
  const initial = useInitialThemeProducts(themeId);
  const list = useThemeProductsState(initial.data);
  const next = useNextThemeProducts(themeId, list.cursor);
  useIntersectionObserver({ onIntersect: () => list.fetchNext(next.refetch) });
  return { ...list };
}
```

### `CC-02` 이벤트(`on*`) · 실행 함수(동사) · 핸들러(`handle*`) 구분
- **강도**: `SHOULD`
- **자동화**: `manual` — 이벤트 props/핸들러/실행 함수 네이밍 및 호출 방향 리뷰
- **적용 범위**: React 컴포넌트 props 및 내부 함수 네이밍
- **규칙**: 이벤트 props(`on*`)는 내부에서 발생한 사실(알림), 실행 함수(동사/동사구)는 실제 동작(`closeDialog`, `submitOrder`), 이벤트 핸들러(`handle*`)는 `event.preventDefault()` 등 특정 이벤트 객체에 반응하는 어댑터에만 한정한다.
- **이유 (Why)**: `handleConfirmClick` 내부에서 `handleCancelClick()`을 호출하는 식의 어색한 결합을 막고 재사용성을 높인다.
- **예외 / 오탐 방지**: HTML 네이티브 이벤트 속성을 그대로 위임받는 얇은 래퍼나 기존 코드베이스가 `handle*` 일관 네이밍을 채택한 경우는 프로젝트 관례를 우선한다.
- **Before / After**:
```tsx
// Bad
const handleCancelClick = () => setOpen(false);
const handleConfirmClick = async () => { await save(); handleCancelClick(); };

// Good
const close = () => setOpen(false);
const confirm = async () => { await save(); close(); };
```

### `CC-03` 컴포넌트 관점(사건 알림)과 호출자 관점(동작 결정) 분리
- **강도**: `SHOULD`
- **자동화**: `manual` — 재사용 컴포넌트 props와 내부 부수효과 결합 여부 리뷰
- **적용 범위**: 재사용 UI 컴포넌트 및 모달/다이얼로그/헤더 설계
- **규칙**: 컴포넌트는 자신의 경계 안에서 실제로 발생한 일만 알고 외부로 알린다. 닫기·삭제·리다이렉트·토스트 같은 후속 비즈니스 결정은 호출자가 맡는다. 상태를 직접 소유하지 않으면 `onClose` 대신 `onCloseClick`/`onCancelClick`으로 의도를 명확히 한다.
- **이유 (Why)**: 컴포넌트가 사건을 알리는 역할인지 외부 함수를 대리 실행하는 역할인지 모호해지는 것을 막고 Headless 경계를 선명하게 유지한다.
- **예외 / 오탐 방지**: 특정 도메인 워크플로에 종속된 Feature 액션 컴포넌트(예: `DeleteAccountDialog`)가 자체 확인 후 닫힘까지 책임지는 경우는 허용한다.
- **Before / After**:
```tsx
// Bad: 범용 ConfirmDialog 내부에서 router.push("/orders") 직접 호출
<ConfirmDialog onConfirm={saveOrder} />

// Good: 다이얼로그는 클릭 사실만 알리고 후속 내비게이션은 호출자가 결정
<ConfirmDialog onConfirmClick={async () => { await saveOrder(); router.push("/orders"); }} />
```

### `CC-04` 예측 가능한 파일명 suffix 및 컴포넌트 export 일관성
- **강도**: `PREFER`
- **자동화**: `manual` — 파일명 접미사 및 export 스타일 일관성 점검
- **적용 범위**: TypeScript / React 프로젝트 파일명 및 export 스타일 (프로젝트 기존 규칙 우선)
- **규칙**: 역할이 명확한 파일은 예측 가능한 suffix와 `kebab-case`를 사용한다(`*.api.ts`, `useHookName.ts`, `*.types.ts`, `*.mock.ts`). 라우트 진입 페이지는 `export default function`, 그 외 컴포넌트는 `export const Component = () => {}` named export를 기본으로 한다.
- **이유 (Why)**: 파일명과 export 형태가 일관되면 자동 import, 리팩터링, 코드 탐색 비용이 줄어든다.
- **예외 / 오탐 방지**: 프레임워크가 default export를 요구하는 라우트/설정 파일(`page.tsx`, `layout.tsx`, `vite.config.ts`) 및 기존 레포의 PascalCase 컴포넌트 파일명 관례는 예외로 존중한다.
- **Before / After**:
```ts
// Bad: 혼재된 파일명과 불일치한 export
// api/userFetcher.ts -> export default function UserApi() {}

// Good: 역할이 드러나는 suffix와 일관된 named export
// api/user.api.ts -> export const getUserProfile = ...
// ui/UserBadge.tsx -> export const UserBadge = () => { ... }
```

### `CC-05` 겉모양이 비슷한 도메인 컴포넌트의 성급한 통합 금지
- **강도**: `SHOULD`
- **자동화**: `manual` — 과도한 boolean/variant 플래그 분기 컴포넌트 리뷰
- **적용 범위**: 도메인 컴포넌트 설계 (카드, 리스트, 폼, 게시판 등)
- **규칙**: UI 모양이 비슷하다는 이유만으로 서로 다른 비즈니스 맥락(예: 상품 목록 카드 vs 장바구니 아이템 vs 관리자 상품 행)을 `variant`/`showPrice`/`isEditable` boolean 플래그가 가득한 하나의 만능 컴포넌트로 합치지 않는다. 공통 시각 골격만 Compound Component나 순수 UI 슬롯(`children`)으로 추출하고 도메인 컴포넌트는 독립 유지한다.
- **이유 (Why)**: 변경 이유가 다른 요구사항을 한 컴포넌트에 합치면 분기문이 늘어나 한쪽 수정이 다른 화면을 깨뜨린다.
- **예외 / 오탐 방지**: 버튼 크기(`sm`/`md`/`lg`)나 의도(`primary`/`secondary`)처럼 순수 디자인 시스템 토큰 변형만 다루는 UI 프리미티브는 통합을 유지한다.
- **Before / After**:
```tsx
// Bad: boolean 플래그 조합으로 서로 다른 도메인 화면을 한 컴포넌트에 억지 통합
<ProductCard isCartMode showAdminActions hidePrice={isPreview} />

// Good: 공통 시각 프리미티브를 합성해 도메인별 명시적 컴포넌트로 분리
<CartProductItem product={product} onRemove={...} />
<AdminProductRow product={product} actions={<EditButton />} />
```
