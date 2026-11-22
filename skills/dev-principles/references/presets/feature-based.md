# Preset: `feature-based`

React + Vite 등 CSR 프로젝트나 중소~중대형 프론트엔드에서 FSD 6계층 오버헤드 없이 기능 응집도와 단방향 의존성을 확보하기 위한 opt-in 프리셋이다.

## 1. 표준 디렉터리 레이아웃

```text
src/
├── app/          # 전역 Provider, Router, 전역 스타일
├── pages/        # URL 라우트별 얇은 화면 조립층 (직접 API/mutation 금지)
├── features/     # 비즈니스 기능별 응집 단위 (api/, model/, types/, ui/, index.ts)
└── shared/       # 도메인을 모르는 공통 기반 (api/, ui/, lib/, config/)
```

> 작은 feature는 `api/`, `model/`, `ui/` 폴더를 억지로 만들지 않고 평탄하게 시작한 뒤 파일이 5~6개를 넘을 때 세그먼트로 나눈다.

## 2. 규칙 상세 (`FB-01` ~ `FB-04`)

### `FB-01` 하위 `shared` 계층의 상위 역의존 금지
- **강도**: `MUST`
- **자동화**: `static` — `dev-principles check` 및 `eslint-plugin-boundaries`로 `shared → features/pages/app` import 차단
- **적용 범위**: `feature-based` 프리셋의 `shared/` 디렉터리
- **규칙**: `shared`는 `features`, `pages`, `app`을 import할 수 없다.
- **이유 (Why)**: 공용 계층이 특정 기능이나 페이지에 의존하면 순환 참조가 생기고 재사용이 불가능해진다.
- **예외 / 오탐 방지**: `shared` 내부 하위 폴더 간 참조(`shared/lib` → `shared/config`)는 정상 허용한다.
- **Before / After**:
```ts
// Bad: shared/api/client.ts에서 features/auth/model을 직접 import
import { useAuthStore } from "@/features/auth";

// Good: shared는 토큰/콜백 인터페이스를 받고 app/features에서 주입
export function configureAuthToken(getter: () => string | null) { /* ... */ }
```

### `FB-02` `features` 슬라이스 간 직접 교차 참조 금지
- **강도**: `MUST`
- **자동화**: `static` — `dev-principles check`로 `features/<A> → features/<B>` 직접 import 차단
- **적용 범위**: `feature-based` 프리셋의 `features/` 디렉터리
- **규칙**: `features/<A>`에서 다른 `features/<B>`의 파일을 직접 import하지 않는다. 공유가 필요하면 공통 도메인 타입·순수 로직을 `shared`로 내리거나 상위 `pages/`에서 조립한다.
- **이유 (Why)**: 기능 모듈끼리 직접 얽히면 한 기능을 수정·제거할 때 다른 기능이 연쇄 파손된다.
- **예외 / 오탐 방지**: 동일 feature 내부 파일 간 상대 경로 import(`./model/helper`)는 허용한다.
- **Before / After**:
```ts
// Bad: features/checkout/ui/CheckoutButton.tsx -> features/cart/model/useCart
import { useCart } from "@/features/cart";

// Good: 공통 타입/유틸은 shared로 내리거나 pages/CheckoutPage에서 두 feature를 조립
```

### `FB-03` `pages/` 라우트 계층의 얇은 조립 유지
- **강도**: `SHOULD`
- **자동화**: `manual` — `pages/` 내 원시 HTTP 호출·복잡한 비즈니스 계산 리뷰
- **적용 범위**: `feature-based` 프리셋의 `pages/` 디렉터리
- **규칙**: `pages/` 컴포넌트는 라우트 파라미터 추출과 `features/` UI 조립만 담당한다. 원시 `fetch`, 복잡한 상태 병합, 비즈니스 계산을 `pages/`에 두지 않는다.
- **이유 (Why)**: 페이지 파일이 비즈니스 로직을 직접 품으면 재사용과 단위 테스트가 어려워진다.
- **예외 / 오탐 방지**: 단일 페이지에서만 1회 쓰이는 30줄 이하 단순 UI 토글은 `pages/` 내부에 둘 수 있다.
- **Before / After**:
```tsx
// Bad: pages/OrderPage.tsx 안에 가격 계산, 유효성 검증, API mutation 직접 작성

// Good: pages/OrderPage.tsx는 useParams()와 <OrderForm /> 조립만 담당
```

### `FB-04` `features/<name>` Public API(`index.ts`) 경유 참조
- **강도**: `SHOULD`
- **자동화**: `static` — `dev-principles check`로 `features/<name>/<internal>` 직접 참조 검출
- **적용 범위**: `feature-based` 프리셋에서 외부 레이어가 `features/`를 import할 때
- **규칙**: 외부(`pages/`, `app/`)에서 `features/<name>`을 참조할 때는 반드시 `features/<name>/index.ts` Public API를 통한다(`SOC-05`).
- **이유 (Why)**: 내부 폴더 구조 변경이 외부 import 경로 전체를 깨뜨리는 것을 막는다.
- **예외 / 오탐 방지**: 동일 `features/<name>` 내부 파일끼리의 참조는 상대 경로를 사용한다.
- **Before / After**:
```ts
// Bad: pages/HomePage.tsx에서 feature 내부 구현 직접 import
import { LoginForm } from "@/features/auth/ui/LoginForm";

// Good: Public API 진입점 사용
import { LoginForm } from "@/features/auth";
```
