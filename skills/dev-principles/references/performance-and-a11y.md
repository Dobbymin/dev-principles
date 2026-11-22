# 성능 · 웹 접근성 · 의존성 원칙 (`PERF-*`, `A11Y-*`, `DEP-*`)

### `PERF-01` 비동기 워터폴 제거 및 병렬 실행
- **강도**: `SHOULD`
- **자동화**: `manual` — 서로 독립적인 순차 `await` 체인 리뷰
- **적용 범위**: 데이터 페칭, 서버 컴포넌트, API 핸들러, 비동기 초기화 흐름
- **규칙**: 서로 의존성이 없는 비동기 I/O 호출을 순차 `await`로 직렬화하지 말고 `Promise.all` / `Promise.allSettled`로 병렬 실행한다. 특정 분기에서만 필요한 `await`는 해당 분기 내부로 늦춰(defer) 불필요한 대기를 없앤다.
- **이유 (Why)**: 독립 요청을 직렬 `await`하면 전체 응답 지연시간이 각 요청 지연의 합으로 늘어난다.
- **예외 / 오탐 방지**: 두 번째 호출이 첫 번째 결과값에 의존하거나, 외부 API 레이트 리밋/트랜잭션 순서 보장이 필요한 경우는 순차 실행을 유지한다.
- **Before / After**:
```ts
// Bad: 독립적인 두 API를 순차 대기
const user = await getUser(id);
const settings = await getSettings(id);

// Good: 독립 요청 병렬화
const [user, settings] = await Promise.all([getUser(id), getSettings(id)]);
```

### `PERF-02` 파생 상태 `useEffect` 동기화 금지 및 불필요한 리렌더 방지
- **강도**: `SHOULD`
- **자동화**: `hybrid` — ESLint `react-hooks` 규칙 + `useEffect` 내 `setState` 동기화 리뷰
- **적용 범위**: React 컴포넌트 및 커스텀 훅
- **규칙**: props나 기존 state에서 즉시 계산할 수 있는 값을 별도 `useState` + `useEffect`로 동기화하지 않고 렌더링 중 직접 계산한다. 비용이 큰 파생 계산이나 안정적 참조가 실제로 필요할 때만 메모이제이션을 사용하고, React Compiler가 활성화된 프로젝트에서는 수동 메모이제이션을 남발하지 않는다.
- **이유 (Why)**: `useEffect` 기반 파생 상태 동기화는 불필요한 추가 렌더 사이클과 일시적 스테일 UI를 유발한다.
- **예외 / 오탐 방지**: 외부 스토어 구독 콜백이나 비동기 I/O 응답을 상태에 반영하는 `useEffect`는 정상 패턴으로 허용한다.
- **Before / After**:
```tsx
// Bad: props 변경 시 useEffect로 파생 상태 동기화
const [fullName, setFullName] = useState("");
useEffect(() => { setFullName(`${first} ${last}`); }, [first, last]);

// Good: 렌더 중 직접 파생 계산
const fullName = `${first} ${last}`;
```

### `PERF-03` 번들 비대화 및 대형 Barrel Import 제어
- **강도**: `SHOULD`
- **자동화**: `hybrid` — 대형 아이콘/유틸 megabarrel `export *` 및 무거운 클라이언트 import 리뷰
- **적용 범위**: 클라이언트 번들 대상 모듈, `index.ts` 배럴 파일, 대형 서드파티 라이브러리
- **규칙**: 수십~수백 개 심볼을 `export *`로 묶는 대형 배럴(megabarrel)을 만들거나 아이콘·차트·에디터 같은 무거운 라이브러리를 초기 번들에 통째로 끌고 오지 않는다. 대형 서드파티 라이브러리는 직접 서브패스 import 또는 동적 `import()`(`lazy`)를 우선한다. (`SOC-05`의 소규모 슬라이스 명시적 named export Public API와 구분한다.)
- **이유 (Why)**: 대형 배럴 파일은 트리 셰이킹을 방해하고 초기 JS 파싱·실행 비용을 급격히 키운다.
- **예외 / 오탐 방지**: `SOC-05`에 따라 도메인 슬라이스 경계를 지키는 소규모 명시적 named export `index.ts`와 트리 셰이킹이 검증된 프레임워크 패키지는 허용한다.
- **Before / After**:
```ts
// Bad: 거대 배럴로 모든 하위 모듈을 무조건 재수출
export * from "./heavy-charts";
export * from "./icons";

// Good: 무거운 모듈은 동적 import 또는 서브패스 직접 진입
const ChartPanel = lazy(() => import("./heavy-charts/ChartPanel"));
```

### `A11Y-01` 시맨틱 인터랙티브 요소와 접근 가능한 이름 보장
- **강도**: `SHOULD`
- **자동화**: `hybrid` — `jsx-a11y` 린트 규칙 + 클릭 가능 비시맨틱 요소·아이콘 버튼 리뷰
- **적용 범위**: 모든 웹 UI 컴포넌트 및 JSX 마크업
- **규칙**: 클릭 가능한 액션에는 `<div>`/`<span>` 대신 `<button type="button">`을, 페이지 이동에는 `<a href>`/`<Link>`를 사용한다. 아이콘만 있는 버튼·링크는 반드시 `aria-label` 등 접근 가능한 이름을 제공하고, 폼 입력에는 `<label>` 또는 `aria-labelledby`를 연결한다.
- **이유 (Why)**: 비시맨틱 클릭 요소와 라벨 없는 아이콘 컨트롤은 키보드 사용자와 스크린 리더 접근성을 차단하고 UI 테스트 로케이터도 불안정하게 만든다.
- **예외 / 오탐 방지**: 복합 위젯 패턴상 `role="button"` + `tabIndex={0}` + `onKeyDown`(Enter/Space)이 완전 구현된 커스텀 프리미티브나 `components/ui/*` 원시 래퍼는 예외로 둔다.
- **Before / After**:
```tsx
// Bad: 클릭 가능한 div와 라벨 없는 아이콘 버튼
<div onClick={onSave}>저장</div>
<button onClick={onClose}><CloseIcon /></button>

// Good: 시맨틱 button과 명확한 aria-label
<button type="button" onClick={onSave}>저장</button>
<button type="button" aria-label="닫기" onClick={onClose}><CloseIcon aria-hidden="true" /></button>
```

### `DEP-01` 의존성 최소화 및 기존 스택 우선
- **강도**: `SHOULD`
- **자동화**: `manual` — `package.json` 신규 의존성 추가 및 락파일 변경 리뷰
- **적용 범위**: 패키지 설치, 유틸리티/라이브러리 선택, 락파일 관리
- **규칙**: 표준 라이브러리(Web API, Node.js 내장 API)나 프로젝트에 이미 설치된 패키지로 충분히 해결되는 문제에 새 npm 패키지를 추가하지 않는다. 새 의존성 추가나 락파일 재작성이 꼭 필요할 때는 유지보수 비용과 번들 영향을 근거로 먼저 사용자 승인을 받는다.
- **이유 (Why)**: 불필요한 의존성은 공급망 리스크, 번들 크기, 버전 충돌 및 업그레이드 비용을 누적시킨다.
- **예외 / 오탐 방지**: 사용자가 특정 라이브러리 도입을 명시적으로 요청한 경우에는 승인이 완료된 것으로 본다.
- **Before / After**:
```ts
// Bad: 단순 날짜 포맷 1곳을 위해 외부 날짜 라이브러리 신규 설치

// Good: 표준 Intl.DateTimeFormat 또는 기존 설치된 유틸리티 활용
const formatted = new Intl.DateTimeFormat("ko-KR").format(date);
```
