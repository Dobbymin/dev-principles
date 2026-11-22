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

## 2. 의존성 규칙 (`app` → `pages` → `features` → `shared`)

| 규칙 ID | 강도 | 세부 기준 |
| --- | :---: | --- |
| `FB-01` | `MUST` | `shared`는 `features`, `pages`, `app`을 import할 수 없다. |
| `FB-02` | `MUST` | `features/<A>`에서 다른 `features/<B>`의 내부 구현 파일을 직접 import하지 않는다. 공유가 필요하면 공통 도메인 타입·순수 로직을 `shared`로 내리거나 상위 `pages/`에서 조립한다. |
| `FB-03` | `SHOULD` | `pages/` 컴포넌트는 라우트 파라미터 추출과 `features/` UI 조립만 담당한다. 원시 `fetch`, 복잡한 상태 병합, 비즈니스 계산을 `pages/`에 두지 않는다. |
| `FB-04` | `SHOULD` | 외부에서 `features/<name>`을 참조할 때는 반드시 `features/<name>/index.ts` Public API를 통한다 (`SOC-05`). |
