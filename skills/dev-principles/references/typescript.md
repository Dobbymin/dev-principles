# TypeScript 설계 원칙 (`TS-*`)

### `TS-01` 타입 추론 우선, 경계에는 명시적 계약
- **강도**: `SHOULD`
- **적용 범위**: 모든 TypeScript 코드
- **규칙**: 초기화 값이나 문맥으로 컴파일러가 정확히 추론하는 지역 변수에는 중복 타입 표기를 생략한다. 반면 모듈 공개 경계(API 응답/요청 DTO, 외부 export 함수 매개변수·반환값, 컴포넌트 Props)에는 명시적 타입을 선언해 계약을 고정한다.
- **이유 (Why)**: 지역 변수 중복 표기는 노이즈만 늘리고, 공개 경계 미표기는 내부 구현 변경이 의도치 않게 외부 계약을 깨뜨린다.

### `TS-02` `any` 금지 및 `as` 타입 단언 최소화 (`unknown` + 좁히기 우선)
- **강도**: `MUST`
- **적용 범위**: 모든 TypeScript 프로덕션 코드 (테스트 픽스처의 명시적 빈 배열 타입 등은 완화 허용)
- **규칙**: `any` 사용을 금지한다. 외부 입력(JSON, `catch (error)`, MDX metadata, 서드파티 응답)은 `unknown`으로 받고 `typeof`/`instanceof`/`in`/타입 가드/스키마 검증으로 좁힌다. DOM 결과도 `as HTMLElement` 대신 `instanceof HTMLElement`로 좁힌다. 서드파티 `.d.ts` 결함은 여러 UI에 `as any`를 복제하지 말고 `shared/`의 단일 어댑터 래퍼 1곳에만 격리한다.
- **이유 (Why)**: `any`와 무분별한 `as` 단언은 컴파일 타임 검증을 꺼버려 런타임 버그를 통과시킨다.
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
- **적용 범위**: 비동기 상태, 폼/결제/워크플로 상태, 모달/액션 분기
- **규칙**: 상호 배타적인 상태를 여러 boolean/optional 조합으로 흩어놓지 말고 공통 판별자(`status` / `kind` / `type`)를 가진 판별 유니언으로 모델링한다. 분기 처리 시 `switch`와 `never` 체크로 누락 케이스를 컴파일 타임에 잡는다.
- **이유 (Why)**: 불가능한 상태 조합(`isLoading: true`이면서 `error`와 `data` 동시 존재)을 타입 수준에서 원천 제거한다.

### `TS-04` 단일 원천 타입 파생 (유틸리티 타입 · `as const` · `satisfies`)
- **강도**: `SHOULD`
- **적용 범위**: DTO, 폼 Payload, 설정/매핑 객체, 상수 집합
- **규칙**: 동일 도메인 모델의 변형 타입을 수동 복사하지 말고 `Pick`, `Omit`, `Partial`, `Required`, `Record`, `Readonly`, `ReturnType`, `Parameters`로 원천 타입에서 파생한다. 상수 맵/설정 객체는 `as const` 또는 `satisfies`로 리터럴 추론과 계약 검증을 동시에 유지한다.
- **이유 (Why)**: 중복 선언된 타입은 스키마 변경 시 반드시 드리프트가 발생한다.

### `TS-05` 목적 있는 제네릭과 최소 `extends` 제약조건
- **강도**: `SHOULD`
- **적용 범위**: 공용 유틸리티 함수, 커스텀 훅, API Client, 컨테이너 컴포넌트
- **규칙**: 제네릭 타입 매개변수는 입력과 출력(또는 두 매개변수) 사이의 타입 관계를 연결할 때만 사용한다. 한 번만 등장하고 반환 타입과 무관한 제네릭을 만들지 않으며, 특정 속성에 의존하면 `extends` 제약조건을 명시한다.
- **이유 (Why)**: 불필요한 제네릭은 가독성과 에러 메시지를 악화시키고, 제약 없는 제네릭은 내부에서 불안전한 단언을 유도한다.

### `TS-06` React 표준 유틸리티 타입 활용 (`ComponentProps`, `PropsWithChildren`)
- **강도**: `PREFER`
- **적용 범위**: React / Next.js UI 컴포넌트
- **규칙**: 네이티브 HTML 요소나 기존 컴포넌트를 감싸는 래퍼 컴포넌트는 속성을 다시 적지 말고 `ComponentProps<"button">` / `ComponentPropsWithoutRef<...>`로 확장한다. `children` 래퍼는 `PropsWithChildren<P>`, 스타일 객체는 `CSSProperties`를 사용한다.
- **이유 (Why)**: 표준 접근성 속성(`aria-*`, `disabled`, `type`) 누락을 막고 컴포넌트 인터페이스를 간결하게 유지한다.
