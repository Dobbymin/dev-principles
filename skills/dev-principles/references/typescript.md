# TypeScript 설계 원칙 (`TS-*`)

### `TS-01` 타입 추론 우선, 경계에는 명시적 계약
- **강도**: `SHOULD`
- **자동화**: `manual` — 공개 경계 타입 누락 및 지역 변수 중복 표기 리뷰
- **적용 범위**: 모든 TypeScript 코드
- **규칙**: 초기화 값이나 문맥으로 컴파일러가 정확히 추론하는 지역 변수에는 중복 타입 표기를 생략한다. 반면 모듈 공개 경계(API 응답/요청 DTO, 외부 export 함수 매개변수·반환값, 컴포넌트 Props)에는 명시적 타입을 선언해 계약을 고정한다.
- **이유 (Why)**: 지역 변수 중복 표기는 노이즈만 늘리고, 공개 경계 미표기는 내부 구현 변경이 의도치 않게 외부 계약을 깨뜨린다.
- **예외 / 오탐 방지**: 빈 배열(`const items: Item[] = []`)이나 넓은 리터럴을 좁혀야 하는 지역 변수는 명시적 타입 표기를 허용한다.
- **Before / After**:
```ts
// Bad: 지역 변수는 중복 표기하고 export 함수 반환 타입은 생략
const count: number = 0;
export function buildUserSummary(user) { return { name: user.name }; }

// Good: 지역 변수는 추론, 공개 경계는 계약 고정
const count = 0;
export function buildUserSummary(user: User): UserSummary {
  return { name: user.name };
}
```

### `TS-02` `any` 금지 및 `as` 타입 단언 최소화 (`unknown` + 좁히기 우선)
- **강도**: `MUST`
- **자동화**: `static` — `dev-principles check` 및 `@typescript-eslint/no-explicit-any` 검사
- **적용 범위**: 모든 TypeScript 프로덕션 코드
- **규칙**: `any` 사용을 금지한다. 외부 입력(JSON, `catch (error)`, MDX metadata, 서드파티 응답)은 `unknown`으로 받고 `typeof`/`instanceof`/`in`/타입 가드/스키마 검증으로 좁힌다. DOM 결과도 `as HTMLElement` 대신 `instanceof HTMLElement`로 좁힌다. 서드파티 `.d.ts` 결함은 여러 UI에 `as any`를 복제하지 말고 `shared/`의 단일 어댑터 래퍼 1곳에만 격리한다.
- **이유 (Why)**: `any`와 무분별한 `as` 단언은 컴파일 타임 검증을 꺼버려 런타임 버그를 통과시킨다.
- **예외 / 오탐 방지**: `import { A as B }` / `export { A as B }` 모듈 별칭은 타입 단언이 아니다. `*.d.ts` 선언 파일, `*.test.*`/`*.spec.*` 테스트 픽스처, `as const` 리터럴 고정은 제외한다.
- **Before / After**:
```ts
// Bad
function getErrorMessage(err: any): string { return err.message; }
const active = document.activeElement as HTMLElement | null;

// Good
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "알 수 없는 오류가 발생했습니다.";
}
const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
```

### `TS-03` 상태·분기는 판별 유니언(Discriminated Union)과 완전성 검사로 모델링
- **강도**: `SHOULD`
- **자동화**: `hybrid` — ESLint `@typescript-eslint/switch-exhaustiveness-check` + 상태 모델링 리뷰
- **적용 범위**: 비동기 상태, 폼/결제/워크플로 상태, 모달/액션 분기
- **규칙**: 상호 배타적인 상태를 여러 boolean/optional 조합으로 흩어놓지 말고 공통 판별자(`status` / `kind` / `type`)를 가진 판별 유니언으로 모델링한다. 분기 처리 시 `switch`와 `never` 체크로 누락 케이스를 컴파일 타임에 잡는다.
- **이유 (Why)**: 불가능한 상태 조합(`isLoading: true`이면서 `error`와 `data` 동시 존재)을 타입 수준에서 원천 제거한다.
- **예외 / 오탐 방지**: 서로 독립적으로 동시에 참이 될 수 있는 다중 플래그(`isDirty`, `isTouched`)는 boolean으로 유지한다.
- **Before / After**:
```ts
// Bad: 불가능한 조합이 허용되는 구조
type AsyncState<T> = { isLoading: boolean; data?: T; error?: Error };

// Good: 판별 유니언으로 불가능한 상태 차단
type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };
```

### `TS-04` 단일 원천 타입 파생 (유틸리티 타입 · `as const` · `satisfies`)
- **강도**: `SHOULD`
- **자동화**: `manual` — 중복 인터페이스 선언 및 상수 매핑 타입 검증 리뷰
- **적용 범위**: DTO, 폼 Payload, 설정/매핑 객체, 상수 집합
- **규칙**: 동일 도메인 모델의 변형 타입을 수동 복사하지 말고 `Pick`, `Omit`, `Partial`, `Required`, `Record`, `Readonly`, `ReturnType`, `Parameters`로 원천 타입에서 파생한다. 상수 맵/설정 객체는 `as const` 또는 `satisfies`로 리터럴 추론과 계약 검증을 동시에 유지한다.
- **이유 (Why)**: 중복 선언된 타입은 스키마 변경 시 반드시 드리프트가 발생한다.
- **예외 / 오탐 방지**: 도메인 개념 자체가 분리되어 독립적으로 진화해야 하는 두 계층(예: DB 엔티티와 공개 API 응답)은 의도적 분리로 허용한다.
- **Before / After**:
```ts
// Bad: User와 CreateUserInput 필드를 수동 복제
interface CreateUserInput { name: string; email: string; }

// Good: 원천 타입에서 파생 + satisfies로 상수 맵 계약 유지
type CreateUserInput = Pick<User, "name" | "email">;
const ROLE_LABELS = { admin: "관리자", member: "일반" } as const satisfies Record<Role, string>;
```

### `TS-05` 목적 있는 제네릭과 최소 `extends` 제약조건
- **강도**: `SHOULD`
- **자동화**: `manual` — 무의미한 단일 사용 제네릭 리뷰
- **적용 범위**: 공용 유틸리티 함수, 커스텀 훅, API Client, 컨테이너 컴포넌트
- **규칙**: 제네릭 타입 매개변수는 입력과 출력(또는 두 매개변수) 사이의 타입 관계를 연결할 때만 사용한다. 한 번만 등장하고 반환 타입과 무관한 제네릭을 만들지 않으며, 특정 속성에 의존하면 `extends` 제약조건을 명시한다.
- **이유 (Why)**: 불필요한 제네릭은 가독성과 에러 메시지를 악화시키고, 제약 없는 제네릭은 내부에서 불안전한 단언을 유도한다.
- **예외 / 오탐 방지**: 호출자가 명시적으로 반환 타입을 지정해야 하는 팩토리/파서 함수(`createStore<State>()`)는 단일 타입 파라미터라도 허용한다.
- **Before / After**:
```ts
// Bad: T가 반환 타입이나 다른 인자와 연결되지 않음
function logItem<T>(item: T): void { console.log(item); }

// Good: 관계가 없으면 구체 타입/unknown 사용, 관계가 있으면 extends 명시
function pluckId<T extends { id: string }>(item: T): string { return item.id; }
```

### `TS-06` React 표준 유틸리티 타입 활용 (`ComponentProps`, `PropsWithChildren`)
- **강도**: `PREFER`
- **자동화**: `manual` — HTML 래퍼 컴포넌트 props 정의 리뷰
- **적용 범위**: React / Next.js UI 컴포넌트
- **규칙**: 네이티브 HTML 요소나 기존 컴포넌트를 감싸는 래퍼 컴포넌트는 속성을 다시 적지 말고 React 버전에 맞는 표준 유틸리티 타입으로 확장한다. React 19 이상에서는 `ComponentProps<"button">`(ref prop 포함)을 사용하고, React 18 이하에서 `ref`를 전달하지 않는다면 `ComponentPropsWithoutRef<"button">`을 사용한다. `children` 래퍼는 `PropsWithChildren<P>`를 사용한다.
- **이유 (Why)**: 표준 접근성 속성(`aria-*`, `disabled`, `type`) 누락을 막고 컴포넌트 인터페이스를 간결하게 유지한다.
- **예외 / 오탐 방지**: 래퍼가 의도적으로 네이티브 속성의 일부만 노출해야 하는 디자인 시스템 제한 컴포넌트는 명시적 `Pick` 인터페이스를 허용한다.
- **Before / After**:
```tsx
// Bad: 네이티브 button 속성을 수동으로 재선언해 aria-* 누락
interface ButtonProps { onClick?: () => void; disabled?: boolean; children: ReactNode; }

// Good: React 표준 유틸리티 타입으로 확장 (React 19 기준)
type ButtonProps = ComponentProps<"button"> & { variant?: "primary" | "ghost" };
```
