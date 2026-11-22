# Preset: `fsd` (Feature-Sliced Design)

중대형·장기 운영 프론트엔드에서 엄격한 6계층 단방향 의존성, 행동(`features`) 중심 분리, 도메인 슬라이스 격리, 명시적 Public API를 유지하기 위한 opt-in 프리셋이다.

## 1. 6-Layer 계층 방향

```text
app ──▶ pages (Next.js App Router 병행 시 src/views) ──▶ widgets ──▶ features ──▶ entities ──▶ shared
```

> **Next.js App Router 브리지**: 라우팅 `app/`을 루트 Route Shell로 두고, FSD `app` 레이어는 `src/app/`, FSD `pages` 레이어는 `src/views/`로 분리해 이름 충돌을 방지한다.
> **유연화**: `widgets` 조건을 충족하는 조립 블록이 없으면 `widgets/`를 생략하고 5계층으로 운용한다.

## 2. 규칙 상세 (`FSD-01` ~ `FSD-09`)

### `FSD-01` 6계층 역방향 레이어 import 금지
- **강도**: `MUST`
- **자동화**: `static` — `dev-principles check` 및 `eslint-plugin-boundaries`로 역방향 레이어 import 차단
- **적용 범위**: `fsd` 프리셋의 모든 레이어(`app`, `pages`/`views`, `widgets`, `features`, `entities`, `shared`)
- **규칙**: 역방향 레이어 import(`shared → entities`, `entities → features`, `features → widgets` 등)를 금지한다.
- **이유 (Why)**: FSD 계층 순서를 거스르는 순간 계층 전체가 순환 결합으로 붕괴한다.
- **예외 / 오탐 방지**: Next.js 루트 `app/`(Route Shell)이 `src/views`를 import하는 것은 브리지 진입점이므로 허용한다.
- **Before / After**:
```ts
// Bad: entities/user/model/user.ts -> features/auth/model/session
import { useSession } from "@/features/auth";

// Good: features/auth -> entities/user (상위에서 하위로 단방향 참조)
```

### `FSD-02` 동일 레이어 슬라이스 간 직접 교차 import 금지
- **강도**: `MUST`
- **자동화**: `static` — `dev-principles check`로 동일 레이어 교차 슬라이스 import 차단 (`@x` 예외 허용)
- **적용 범위**: `fsd` 프리셋의 `widgets/`, `features/`, `entities/` 슬라이스
- **규칙**: 동일 레이어 슬라이스 간 직접 import를 금지한다. 불가피한 `entities` 간 도메인 연관관계에만 FSD v2.1 `@x` 전용 Public API(`entities/<target>/@x/<consumer>.ts`)를 예외 허용하며 `features`/`widgets` 교차 참조는 전면 금지한다. 여러 위젯을 감싸는 앱 셸은 `src/app/layouts` 또는 `views`에 둔다.
- **이유 (Why)**: 슬라이스 간 수평 결합은 독립 배포·삭제·리팩터링을 불가능하게 만든다.
- **예외 / 오탐 방지**: `entities/<target>/@x/<consumer>` 명시적 크로스 엔티티 진입점 및 동일 슬라이스 내부 파일 참조는 허용한다.
- **Before / After**:
```ts
// Bad: entities/order/model/order.ts -> entities/user (직접 교차 참조)
import { User } from "@/entities/user";

// Good: entities/user/@x/order.ts 전용 공개 계약 경유
import type { UserRef } from "@/entities/user/@x/order";
```

### `FSD-03` 슬라이스 최상위 `index.ts` Public API 경유 강제
- **강도**: `MUST`
- **자동화**: `static` — `dev-principles check` 및 Steiger로 슬라이스 내부 경로 직접 import 차단
- **적용 범위**: `fsd` 프리셋에서 외부 레이어가 슬라이스를 import할 때
- **규칙**: 외부 레이어는 슬라이스 최상위 `index.ts` Public API만 import하고 내부 경로(`ui/`, `model/`, `api/`)를 직접 참조하지 않는다. 최상위 `index.ts`는 명시적 named export(`export { ... }`)를 권장한다.
- **이유 (Why)**: 슬라이스 내부 리팩터링이 외부 호출부를 깨뜨리지 않도록 캡슐화 경계를 고정한다.
- **예외 / 오탐 방지**: `entities/<target>/@x/<consumer>` 경로와 `shared` 레이어 내부 세그먼트(`@/shared/ui`, `@/shared/lib`) 직접 참조는 허용한다.
- **Before / After**:
```ts
// Bad: features/cart/ui/CartDrawer 직접 참조
import { CartDrawer } from "@/features/cart/ui/CartDrawer";

// Good: 최상위 Public API 참조
import { CartDrawer } from "@/features/cart";
```

### `FSD-04` `entities` 슬라이스의 순수 도메인·읽기 전용 집중
- **강도**: `SHOULD`
- **자동화**: `manual` — `entities/` 내 화면 종속 mutation·전역 부수효과 리뷰
- **적용 범위**: `fsd` 프리셋의 `entities/` 레이어
- **규칙**: `entities` 슬라이스는 순수 계산·도메인 타입·공용 기본 조회(GET)·읽기 전용 표시 UI에 집중하며 화면 종속 mutation이나 전역 부수효과를 두지 않는다.
- **이유 (Why)**: `entities`가 특정 화면의 액션/mutation을 품으면 다른 화면에서 안전하게 재사용할 수 없다.
- **예외 / 오탐 방지**: 도메인 자체의 불변 상태 갱신(예: 인증 세션 만료 처리)처럼 앱 전역에 단일하게 귀속되는 코어는 예외로 둘 수 있다.
- **Before / After**:
```tsx
// Bad: entities/product/ui/ProductCard 내부에 장바구니 담기 mutation 내장

// Good: entities/product는 ProductCard 표시만 담당하고 액션은 features/cart-add에서 주입
```

### `FSD-05` `pages`/`views` 화면 조립층 유지
- **강도**: `SHOULD`
- **자동화**: `manual` — `pages/`/`views/` 내 재사용 액션·mutation 집중 여부 리뷰
- **적용 범위**: `fsd` 프리셋의 `pages/` 또는 `views/` 레이어
- **규칙**: `pages`(또는 `views`)는 화면 조립층으로 유지하며 재사용될 비즈니스 액션·mutation을 직접 품지 않는다.
- **이유 (Why)**: 페이지 조립층이 액션 로직을 소유하면 다른 페이지나 위젯에서 해당 행동을 재사용할 수 없다.
- **예외 / 오탐 방지**: 단일 페이지 1곳 전용 조합 조회(`FSD-07`)와 초기 경량 코드(`FSD-08`)는 예외로 허용한다.
- **Before / After**:
```tsx
// Bad: views/ProductDetailPage.tsx에 찜하기 API 호출과 낙관적 업데이트 로직 직접 작성

// Good: features/toggle-wishlist를 조합해 화면 배치만 담당
```

### `FSD-06` `features` 우선 추출 + `widgets` 진입 게이트
- **강도**: `MUST`
- **자동화**: `manual` — `widgets/` 내 직접 mutation 금지 및 2곳 이상 재사용 게이트 리뷰
- **적용 범위**: `fsd` 프리셋의 `features/`, `widgets/`, `pages/` 설계
- **규칙**: 사용자 액션·폼·필터·mutation은 반드시 `features/`에 먼저 배치한다. 단일 페이지 1곳 전용 조합 블록은 `pages/<route>/ui/`에 두며, `widgets/`는 2개 이상 페이지 재사용 블록(또는 200줄+ 단일 페이지 분할 예외)일 때만 허용한다. `widgets/` 내부 직접 API mutation·비즈니스 로직 구현을 금지한다.
- **이유 (Why)**: `widgets/`를 무분별하게 만들면 `features/`가 비어 버리고 `widgets/`가 비대한 God Layer로 변질된다.
- **예외 / 오탐 방지**: 단일 페이지 전용 조합 블록이 200줄을 넘어 가독성 분리가 필요한 경우에만 `widgets/` 승격을 허용한다.
- **Before / After**:
```text
// Bad: 1개 페이지에서만 쓰는 필터+리스트 블록에 mutation까지 넣어 widgets/ProductSection 생성

// Good: 액션은 features/product-filter로 분리하고, 1곳 전용 조합은 pages/products/ui/로 배치
```

### `FSD-07` API 3분할 배치 (`entities` / `features` / `pages`)
- **강도**: `SHOULD`
- **자동화**: `manual` — API 파일 배치 위치(`entities/api`, `features/api`, `pages/api`) 리뷰
- **적용 범위**: `fsd` 프리셋의 데이터 페칭 및 mutation 모듈
- **규칙**: 2개 이상 기능이 공유하는 도메인 기본 조회(GET)·`queryOptions`는 `entities/api`에, 사용자 액션·CUD 및 해당 액션 종속 조회(예: Favorite GET+POST)는 `features/api`에 응집하며, 단일 페이지 전용 조합 조회만 예외적으로 `pages/api`에 둔다.
- **이유 (Why)**: API를 한 곳에 몰아넣거나 임의로 흩어놓지 않고 변경 이유와 공유 범위에 맞춰 배치한다.
- **예외 / 오탐 방지**: BFF/서버 액션 단일 엔드포인트 구조에서는 프레임워크 라우트 경계를 우선한다.
- **Before / After**:
```text
// Bad: 모든 도메인 API를 features/api 한 곳에 몰아 다른 feature가 참조하게 만듦

// Good: 공용 조회는 entities/product/api, 주문 생성 액션은 features/create-order/api에 배치
```

### `FSD-08` 하이브리드 배치 및 Slice Grouping
- **강도**: `SHOULD`
- **자동화**: `manual` — 과잉 조기 분리 및 그룹 간 Import Rule 준수 리뷰
- **적용 범위**: `fsd` 프리셋의 점진적 슬라이스 확장
- **규칙**: 명확한 액션·도메인은 선분리하고 1곳 전용 경량 코드는 `pages`에서 시작해 2곳 이상 재사용 시 하향 추출한다. 동일 도메인 슬라이스가 3개 이상이면 Slice Grouping(예: `features/auth/{login,logout,signup}`)을 허용하되 그룹 간 Import Rule을 유지한다.
- **이유 (Why)**: 초기 보일러플레이트 폭발을 막으면서도 슬라이스 수 증가 시 탐색성을 유지한다.
- **예외 / 오탐 방지**: 그룹 폴더 자체에 `index.ts`를 두어 하위 슬라이스 간 우회 통로로 악용하지 않는다.
- **Before / After**:
```text
// Bad: 그룹 폴더 features/auth/index.ts로 내부 슬라이스 간 교차 참조 우회

// Good: 그룹은 디렉터리 정리용으로만 쓰고 각 슬라이스(features/auth/login)가 독립 경계 유지
```

### `FSD-09` 경계 린터 자동 검증 연동
- **강도**: `PREFER`
- **자동화**: `automated` — ESLint `eslint-plugin-boundaries` / `import/no-restricted-paths` / Steiger 실행
- **적용 범위**: `fsd` 프리셋 프로젝트의 CI 및 로컬 린트 설정
- **규칙**: 단방향 레이어 차단에는 `eslint-plugin-boundaries` 또는 `import/no-restricted-paths`(`zones`)를, 슬라이스·Public API 포함 전체 FSD 검증에는 Steiger(`npx steiger ./src`)를 프로젝트 성격에 맞게 선택 연동한다(새 패키지 설치는 `DEP-01`에 따라 사용자 승인 후 진행).
- **이유 (Why)**: 6계층과 슬라이스 격리 규칙은 코드 리뷰만으로는 누락되기 쉬워 정적 린터로 고정해야 유지된다.
- **예외 / 오탐 방지**: 소규모/단기 프로젝트에서는 무의존성 `dev-principles check --preset fsd` 실행만으로 대체할 수 있다.
- **Before / After**:
```text
// Bad: 6계층 FSD 규칙을 문서에만 적어두고 CI 자동 검사 없음

// Good: `dev-principles check --preset fsd` 또는 `eslint-plugin-boundaries`를 CI에 연결
```
