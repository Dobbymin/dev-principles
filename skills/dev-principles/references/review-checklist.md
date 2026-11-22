# 코드 리뷰 & 원칙 감사 체크리스트 (`review / audit` 모드)

## 1. 감사 실행 절차 (5단계)

1. **사전 정적 스캔**: 가능하면 먼저 `node bin/dev-principles.mjs check`를 실행해 `static`/`hybrid` 위반 후보를 확보한다.
2. **컨텍스트 & 충돌 파악**: `.dev-principles.yaml`, `AGENTS.md`/`CLAUDE.md`, `tsconfig.json`, `package.json`, 기존 디렉터리 구조를 확인해 활성 프리셋과 오버라이드를 확정한다. 프로젝트 기존 규칙이 스킬 규칙과 충돌하면 기존 규칙을 존중하고 `[Conflict] RULE-ID ↔ 프로젝트 기존 규칙 | 원인: <충돌 원인> | 유지 사유: <기존 규칙 유지 이유>` 형식으로 기록한다.
3. **서브에이전트 라우팅 & 중복/무한위임 방지**:
   - 일반 코드·타입·테스트·성능·접근성(`AI-*`, `CC-*`, `TS-*`, `DQ-01/02/03/05`, `TEST-*`, `PERF-01/02`, `A11Y-01`, `DEP-01`) → `principles-reviewer`
   - 아키텍처·모듈 경계·순환 참조·RSC 경계(`SOC-*`, `FB-*`, `FSD-*`, `NEXT-01~03/05/06`, `PERF-03`) → `architecture-reviewer`
   - 시크릿·XSS·주입·인증 토큰·신뢰 경계(`SEC-*`, `DQ-04`, `NEXT-04`) → `security-reviewer`
   - 사전 탐색(비리뷰어) → `structure-analyzer`
   - 각 Reviewer는 타 전문 Reviewer의 Rule ID를 중복 보고하거나 임의로 재분류하지 않으며, 위임은 단일 패스만 허용한다(상호 재귀 위임 금지).
   - `github-convention` 책임(Issue AC, PR 템플릿, 브랜치/커밋 정책, CI/Check, Git 변경 권한, PR Secret Scan)과 혼합하지 않으며, 상대 플러그인이 없어도 단독 동작한다.
4. **오탐 필터 적용**:
   - 요청·diff 범위 밖의 기존 코드를 불필요하게 트집 잡지 않는다 (`AI-03`).
   - **생성/벤더 UI 제외**: `components/ui/*`, `shared/ui/*` 중 CLI 생성 원시 UI는 직접 로직을 수정한 diff가 아니면 감사에서 제외한다.
   - **`TS-02` 오탐 필터**: `import/export { A as B }` 별칭, `*.d.ts`, 테스트 픽스처는 프로덕션 단언과 구분한다.
   - **`DQ-04` 오탐 필터**: `localStorage` 금지는 인증 토큰·세션 저장에 한정한다. 테마·언어 등 비민감 UI 설정은 허용한다.
5. **표준 리포트 출력**: 근거 Rule ID가 없는 추상적 취향 지적은 제외하고, 모든 항목에 **강도 + Rule ID + 파일:라인 + Why + 개선안**을 포함한다.

## 2. 도메인별 전체 점검 매트릭스 (58개 Rule ID)

### A. 변경 범위 & 문서 탐색 (`AI-*`)
- `AI-01` (`MUST`): 모호한 요구사항을 임의 가정하지 않고 숨은 가정과 트레이드오프를 명시했는가?
- `AI-02` (`SHOULD`): 요청받지 않은 기능, 과도한 추상화, 불가능한 방어 분기가 없는가?
- `AI-03` (`MUST`): diff가 요청 범위와 직접 연결되며 무관한 파일/포맷/데드코드를 건드리지 않았는가?
- `AI-04` (`SHOULD`): 버그 수정·리팩터링에 대응하는 검증 기준과 계획이 있는가?
- `AI-05` (`MUST`): 버전 민감 API가 Context7 MCP 또는 설치 버전 스펙과 일치하는가?

### B. 클린 코드 & 네이밍 (`CC-*`)
- `CC-01` (`SHOULD`): 함수·훅 안에 고수준 조합과 저수준 구현이 뒤섞이지 않았는가?
- `CC-02` (`SHOULD`): 이벤트 props(`on*`), 실행 함수(동사), 핸들러(`handle*`)가 혼용되지 않았는가?
- `CC-03` (`SHOULD`): 재사용 컴포넌트가 사건만 알리고 후속 비즈니스 동작은 호출자에 위임했는가?
- `CC-04` (`PREFER`): 파일명 suffix(`*.api.ts`, `use*.ts`, `*.types.ts`, `*.mock.ts`)와 export 스타일이 일관되는가?
- `CC-05` (`SHOULD`): 서로 다른 비즈니스 맥락을 boolean/variant 플래그 props로 억지 통합하지 않았는가?

### C. TypeScript 설계 (`TS-*`)
- `TS-01` (`SHOULD`): 지역 변수 중복 표기를 피하고 공개 경계(API/export/Props)에 명시적 계약을 두었는가?
- `TS-02` (`MUST`): `any`가 없고 `as`/`!` 대신 `unknown` + 타입 좁히기/검증을 사용했는가?
- `TS-03` (`SHOULD`): 상호 배타적 상태가 판별 유니언과 완전성 검사로 모델링되었는가?
- `TS-04` (`SHOULD`): 유틸리티 타입(`Pick`/`Omit`/`Partial`)과 `as const`/`satisfies`로 단일 원천 파생했는가?
- `TS-05` (`SHOULD`): 불필요한 제네릭이 없고 필요한 제네릭에 `extends` 제약이 걸려 있는가?
- `TS-06` (`PREFER`): HTML 래퍼가 React 버전에 맞는 `ComponentProps`/`ComponentPropsWithoutRef`/`PropsWithChildren`을 활용하는가?

### D. 관심사 분리 & 폴더 구조 (`SOC-*`)
- `SOC-01` (`MUST`): UI 렌더링, 순수 도메인 규칙, 상호작용 상태, HTTP I/O가 한 파일에 뒤섞이지 않았는가?
- `SOC-02` (`SHOULD`): 함께 수정되는 파일이 가까이(Co-location) 배치되었는가?
- `SOC-03` (`SHOULD`): 순수 UI / 읽기 전용 도메인 UI / 행동 UI 경계가 지켜지는가?
- `SOC-04` (`MUST`): 역방향 의존성(하위→상위)이나 순환 참조가 없는가?
- `SOC-05` (`SHOULD`): 표준 역할 어휘(`ui`/`model`/`api`/`lib`/`config`)와 Public API(`index.ts`)가 유지되는가?
- `SOC-06` (`MUST`): 프로젝트에 맞지 않는 아키텍처를 강제하지 않았는가?
- `SOC-07` (`SHOULD`): 재사용·복잡한 사용자 액션·폼·mutation이 조립 블록에 몰리지 않고 독립 행동 단위로 분리되었는가?

### E. 데이터·상태·API (`DQ-*`)
- `DQ-01` (`SHOULD`): 서버 데이터를 클라이언트 전역 스토어에 수동 복제하지 않았는가?
- `DQ-02` (`MUST`): 기능 API/UI에서 `fetch`/`axios` 직접 호출 없이 단일 `apiClient`만 사용하는가?
- `DQ-03` (`SHOULD`): UI에 query key 배열을 하드코딩하지 않고 Factory 또는 `queryOptions`로 중앙화했는가?
- `DQ-04` (`MUST`): access token이 `localStorage`/`sessionStorage`에 저장되지 않고, 401 단일 리프레시 재시도(최대 1회)와 `skipAuthRefresh`가 적용되었는가?
- `DQ-05` (`SHOULD`): Mutation 훅이 관련 `invalidateQueries`를 직접 책임지는가?

### F. 보안·신뢰 경계 (`SEC-*`)
- `SEC-01` (`MUST`): 비밀정보(API Key, 토큰, 개인키)가 하드코딩되거나 로그·에러 응답에 노출되지 않았는가?
- `SEC-02` (`MUST`): `dangerouslySetInnerHTML`, `eval`, `new Function`, 원시 SQL/쉘 결합, 미검증 리다이렉트가 없는가?
- `SEC-03` (`SHOULD`): 외부 입력/응답이 런타임 검증되며 빈 `catch {}`로 에러를 삼키지 않는가?

### G. 테스트 & 검증 (`TEST-*`)
- `TEST-01` (`SHOULD`): 구현 세부 대신 관찰 가능한 동작·계약을 테스트하며 순수 로직이 분리되었는가?
- `TEST-02` (`SHOULD`): 버그 수정·핵심 도메인 로직에 재현/회귀 테스트가 포함되었는가?
- `TEST-03` (`MUST`): 마지막 수정 이후 최신 테스트·타입체크·린트·빌드 실행 근거를 확인했는가?

### H. 성능 · 접근성 · 의존성 (`PERF-*`, `A11Y-*`, `DEP-*`)
- `PERF-01` (`SHOULD`): 독립 비동기 호출을 순차 `await`하지 않고 병렬화했는가?
- `PERF-02` (`SHOULD`): 파생 상태를 `useEffect`로 동기화하지 않고 렌더 중 계산하는가?
- `PERF-03` (`SHOULD`): 대형 `export *` megabarrel이나 무거운 클라이언트 라이브러리 통째 import가 없는가?
- `A11Y-01` (`SHOULD`): 클릭 가능한 `<div>` 대신 `<button>`/`<a>`를 쓰고 아이콘 버튼에 `aria-label`이 있는가?
- `DEP-01` (`SHOULD`): 표준 API/기존 스택으로 가능한 일에 불필요한 새 패키지를 추가하지 않았는가?

### I. Opt-in 아키텍처 프리셋 (`FB-*`, `FSD-*`, `NEXT-*`)
- **`feature-based`**: `FB-01` (`MUST`), `FB-02` (`MUST`), `FB-03` (`SHOULD`), `FB-04` (`SHOULD`)
- **`fsd`**: `FSD-01` (`MUST`), `FSD-02` (`MUST`), `FSD-03` (`MUST`), `FSD-04` (`SHOULD`), `FSD-05` (`SHOULD`), `FSD-06` (`MUST`), `FSD-07` (`SHOULD`), `FSD-08` (`SHOULD`), `FSD-09` (`PREFER`)
- **`next-app-router`**: `NEXT-01` (`MUST`), `NEXT-02` (`MUST`), `NEXT-03` (`SHOULD`), `NEXT-04` (`MUST`), `NEXT-05` (`SHOULD`), `NEXT-06` (`SHOULD`)

## 3. 표준 리포트 출력 템플릿

```markdown
## Review Report (`dev-principles`)

- **대상**: `<PR / 브랜치 / 파일 목록>`
- **적용 프로필**: `preset: <auto|feature-based|fsd|next-app-router>` | 오버라이드: `<없음 또는 요약>`
- **충돌 감지**: `<없음 또는 [Conflict] RULE-ID ↔ 프로젝트 기존 규칙 | 원인: <충돌 원인> | 유지 사유: <기존 규칙 유지 이유>>`
- **정적 스캔**: `<dev-principles check 결과 요약 또는 미실행 사유>`
- **요약**: `MUST` N건 · `SHOULD` N건 · `PREFER` N건

### `MUST` (필수 수정)
1. **[RULE-ID]** `path/to/file.ts:42` — 문제 1줄 요약
   - **Why**: 위반 시 발생하는 구체적 리스크
   - **개선안**: 수정 방향 또는 짧은 After 스니펫

### `SHOULD` (기본 수정 권장)
1. **[RULE-ID]** `path/to/file.tsx:18` — ...

### `PREFER` (선택 개선)
- **[RULE-ID]** `path/to/file.ts:1` — ...

### 통과 / 프로젝트 예외 반영
- `<잘 지켜진 구조나 로컬 예외로 스킵한 규칙 1줄 기록>`
```
