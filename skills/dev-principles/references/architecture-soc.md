# 관심사 분리 & 폴더 구조 원칙 (`SOC-*`)

### `SOC-01` 변경 이유가 다른 관심사의 분리 (UI / 상태·도메인 / I/O / 공통 유틸)
- **강도**: `MUST`
- **자동화**: `manual` — 파일 내 UI·도메인 계산·상태·HTTP I/O 혼재 여부 리뷰
- **적용 범위**: 컴포넌트, 훅, 페이지, 모듈 설계 전반
- **규칙**: 하나의 파일이나 컴포넌트 안에 (1) 화면 렌더링/표현(UI), (2) 순수 도메인 규칙·계산(Model), (3) 상호작용 상태·부수효과(State/Feature), (4) 외부 HTTP 통신(API/I/O)을 한데 섞지 않는다.
- **이유 (Why)**: 변경 이유가 다른 코드가 얽혀 있으면 작은 정책 수정에도 UI·통신·상태를 동시에 건드려야 하고 단위 테스트가 불가능해진다.
- **예외 / 오탐 방지**: 50줄 미만의 단일 스크립트, CLI 엔트리포인트, 단순 프로토타입은 과도한 파일 쪼개기를 강제하지 않는다.
- **Before / After**:
```tsx
// Bad: 컴포넌트 내부에 fetch + 할인 계산 + 상태 + JSX가 모두 혼재
function CheckoutPage() {
  const [total, setTotal] = useState(0);
  useEffect(() => { fetch("/api/cart").then(/* 할인율 계산 후 setTotal */); }, []);
  return <div>{total}</div>;
}

// Good: API(fetchCart), 순수 모델(calculateDiscountedTotal), UI(CheckoutView)로 분리
```

### `SOC-02` 변경 축 기반 Co-location (함께 바뀌는 코드는 가까이)
- **강도**: `SHOULD`
- **자동화**: `manual` — 디렉터리 배치 및 기능 응집도 리뷰
- **적용 범위**: 디렉터리 및 모듈 배치 결정
- **규칙**: 파일 종류(`components`/`hooks`/`utils`)로만 흩어놓지 말고, 같은 기능·도메인을 수정할 때 함께 열리는 파일은 가까이(Co-location) 둔다. 재사용 범위가 넓고 변경 주기가 다른 공통 코드만 하위 공용 계층으로 내린다.
- **이유 (Why)**: 역할별 최상위 폴더만 고집하면 기능 하나를 고치기 위해 여러 폴더를 왕복하는 파편화가 발생한다.
- **예외 / 오탐 방지**: 기존 저장소가 `components/`, `hooks/` 전역 레이아웃을 일관되게 사용 중이면 `SOC-06`에 따라 강제 전환하지 않는다.
- **Before / After**:
```text
// Bad: 한 기능 수정 시 4개 최상위 폴더를 왕복
src/components/CartItem.tsx, src/hooks/useCart.ts, src/utils/cartPrice.ts

// Good: 함께 바뀌는 기능 단위로 응집
src/features/cart/{ui/CartItem.tsx, model/useCart.ts, model/cartPrice.ts, index.ts}
```

### `SOC-03` 순수 UI · 읽기 전용 도메인 UI · 행동(액션) UI의 경계 구분
- **강도**: `SHOULD`
- **자동화**: `manual` — 컴포넌트 props 및 의존성 성격 리뷰
- **적용 범위**: 프론트엔드 컴포넌트 분류 및 Props 설계
- **규칙**: 순수 UI(`Button`, `Modal`: 도메인 무관), 도메인 표시 UI(`ProductCard`: 읽기 전용, 부수효과 없음), 행동/기능 UI(`AddToCartButton`: mutation·폼 제출 연결)를 명확히 구분한다.
- **이유 (Why)**: 순수 UI에 도메인 로직이 침투하거나 읽기 전용 카드에 특정 화면의 mutation이 박히면 재사용과 재배치가 불가능해진다.
- **예외 / 오탐 방지**: 단일 화면에서만 1회 쓰이는 소규모 로컬 UI는 추상화 단계를 과도하게 늘리지 않는다.
- **Before / After**:
```tsx
// Bad: ProductCard 내부에서 useAddToCartMutation을 직접 호출해 다른 화면 재사용 불가

// Good: ProductCard는 표시만 담당하고 액션 슬롯(actionSlot={<AddToCartButton />})을 주입받음
```

### `SOC-04` 단방향 의존성 유지 (데이터·모델 → 화면, 상위 조립층 → 하위 공통층)
- **강도**: `MUST`
- **자동화**: `static` — `dev-principles check` 순환 참조 검사 + `dependency-cruiser` / `eslint-plugin-boundaries`
- **적용 범위**: 모듈 간 import 그래프
- **규칙**: 의존성은 상위 조립층(페이지/화면) → 하위층(기능/도메인/공통 기반) 한 방향으로만 흐른다. 공용(`shared`)이나 순수 도메인이 페이지에 역의존하거나 같은 레벨 독립 모듈끼리 교차·순환 참조하는 것을 금지한다. 계층이 자리 잡은 프로젝트는 `eslint-plugin-boundaries` 또는 `dependency-cruiser`로 자동 차단하는 것을 권장한다.
- **이유 (Why)**: 역방향·순환 의존성은 모듈 경계를 무너뜨리고 작은 변경에도 연쇄 파손을 일으킨다.
- **예외 / 오탐 방지**: TypeScript `import type`만 존재하는 순수 타입 참조도 가능한 한 단방향으로 유지하되, 불가피한 상호 재귀 타입은 별도 `*.types.ts`로 추출해 런타임 순환을 제거한다.
- **Before / After**:
```ts
// Bad: shared/lib/format.ts -> features/order/model.ts (하위가 상위를 역참조)

// Good: features/order/model.ts -> shared/lib/format.ts (상위가 하위를 참조)
```

### `SOC-05` 예측 가능한 역할 어휘(`ui`/`model`/`api`/`lib`/`config`)와 명시적 Public API 경계
- **강도**: `SHOULD`
- **자동화**: `hybrid` — 프리셋별 Public API 우회 정적 검사 + 폴더 역할 리뷰
- **적용 범위**: 모듈 내부 폴더 구성 및 외부 import 경로
- **규칙**: 모듈 내부는 표준 역할 어휘(`ui`, `model`, `api`, `lib`, `config`)를 일관되게 사용하되 파일이 생기기 전에 빈 폴더를 미리 만들지 않는다. 외부에서는 내부 파일 경로를 깊게 찌르지 말고 모듈 진입점(`index.ts`)만 참조하며, `index.ts`에는 `export *` 남용 대신 명시적 named export(`export { ... }`)를 권장한다(`PERF-03` 대형 배럴 방지와 균형 유지).
- **이유 (Why)**: 경로만 보고 책임을 예측할 수 있어야 탐색 비용이 줄고, 명시적 Public API가 있어야 내부 리팩터링이 외부에 격리된다.
- **예외 / 오탐 방지**: 소규모 단일 파일 모듈이나 아이콘/유틸리티 집합처럼 트리 셰이킹이 민감한 `shared/ui`는 직접 파일 경로 import를 허용할 수 있다.
- **Before / After**:
```ts
// Bad: 외부에서 내부 구현 파일 깊숙이 직접 참조
import { calculateTax } from "@/features/checkout/model/internal/tax";

// Good: 슬라이스 Public API의 명시적 named export만 참조
import { calculateTax } from "@/features/checkout";
```

### `SOC-06` 아키텍처 중립·구조 적응 우선 (특정 패턴 강제 금지 + Opt-in 프리셋)
- **강도**: `MUST`
- **자동화**: `manual` — `structure-analyzer` 사전 구조 감지 결과와 제안 비교
- **적용 범위**: 모든 프로젝트의 파일 배치·구조 제안
- **규칙**: FSD 등 특정 폴더 구조를 모든 프로젝트에 일괄 강제하지 않는다. 기존 저장소 작업 시 현재 디렉터리 구조와 `.dev-principles.yaml`/`AGENTS.md`를 먼저 감지해 그 구조 안에서 `SOC-01`~`SOC-07`을 적용한다. 세부 디렉터리 강제 규칙은 활성화된 프리셋(`feature-based` / `fsd` / `next-app-router`)에서만 적용한다.
- **이유 (Why)**: 프로젝트에 맞지 않는 아키텍처를 기계적으로 이식하면 보일러플레이트와 인지 비용만 늘어난다.
- **예외 / 오탐 방지**: 사용자가 명시적으로 아키텍처 마이그레이션을 요청한 경우에만 새 프리셋 구조로 점진 전환한다.
- **Before / After**:
```text
// Bad: 단순 Express/Next 앱에 사용자 요청 없이 src/entities, src/widgets 폴더를 일괄 생성

// Good: 기존 src/features + src/lib 구조를 감지하고 그 경계 안에서 관심사 분리 적용
```

### `SOC-07` 행동 단위(Action/Feature) 우선 분리 및 조립 블록(Widget/Section) 비대화 금지
- **강도**: `SHOULD`
- **자동화**: `manual` — 조립 블록(Page/Widget/Section) 내 mutation/폼 집중 여부 리뷰
- **적용 범위**: 화면 섹션·위젯·페이지 조립 컴포넌트 및 기능 모듈 설계 (엄격 FSD 프리셋에서는 `FSD-06` `MUST`로 승격)
- **규칙**: 여러 화면에서 재사용되거나 복잡도가 큰 사용자 인터랙션·폼 제출·필터·mutation 로직은 대형 화면 블록(Widget, Panel, Section, Page) 내부에 몰아넣지 않고 독립된 행동 단위(Feature/Action 모듈)로 먼저 분리한다. 조립 블록은 하위 도메인 표시 UI와 행동 단위를 연결하는 얇은 조합층으로 유지한다.
- **이유 (Why)**: 조립 블록에 비즈니스 액션과 API 호출을 몰아넣으면 행동 단위가 비어 버리고 God Component가 된다.
- **예외 / 오탐 방지**: 단일 페이지 1곳에서만 쓰이는 가벼운 로컬 UI 토글이나 30줄 이하 단순 폼은 성급히 `features/`로 빼지 않고 페이지 내부에 둔 뒤 재사용 시점에 추출한다(`AI-02`, `FSD-08`).
- **Before / After**:
```tsx
// Bad: HeaderWidget 내부에 로그아웃 API 호출, 에러 처리, 리다이렉트, 다중 폼 상태가 모두 혼재

// Good: LogoutButton(feature)과 SearchBar(feature)를 분리하고 HeaderWidget은 배치만 조립
```
