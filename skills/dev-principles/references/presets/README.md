# 아키텍처 프리셋 선택 가이드 (`presets/`)

`dev-principles`의 기본값은 **`preset: auto`**다. 기존 저장소 디렉터리 구조를 자동 감지해 `SOC-01`~`SOC-07` 메타 원칙을 적용하며, 프로젝트가 특정 구조 계약을 유지하고 싶을 때만 `.dev-principles.yaml`에서 아래 프리셋 중 하나를 opt-in 한다.

## 1. 프리셋 비교 매트릭스

| 프리셋 | 추천 대상 | 핵심 구조 축 | 참고 문서 |
| --- | --- | --- | --- |
| `auto` (기본) | 기존 레포, 소규모 앱 | 기존 구조 감지 + `SOC-01`~`SOC-07` | - |
| `feature-based` | 중소~중대형 CSR/SPA | `app` → `pages` → `features/<name>` → `shared` | [feature-based.md](feature-based.md) (`FB-01`~`FB-04`) |
| `fsd` | 중대형·장기 운영 서비스 | 6계층 + Slice 격리 + Public API + API 3분할 | [fsd.md](fsd.md) (`FSD-01`~`FSD-09`) |
| `next-app-router` | 비-FSD Next.js App Router | `app/`·`_components` Co-location + `features/`·`components/`·`lib/` + RSC 경계 | [next-app-router.md](next-app-router.md) (`NEXT-01`~`NEXT-06`) |

## 2. 성장 단계별 진화 신호

- `components/` 아래 도메인 컴포넌트가 20개를 넘어 탐색이 어려움 → `feature-based`
- 여러 feature가 동일 도메인 모델·UI를 중복 참조하고 교차 import 유혹이 반복됨 → `fsd` (`entities/` 추출)
- Next.js `page.tsx` 하나에 데이터 페칭 + 인터랙션 상태 + 폼 제출이 200줄 이상 몰림 → `next-app-router`의 `_components/` 또는 `features/`로 분리

## 3. 프리셋 공통 불변 규칙

- 파일이 생기기 전에 빈 세그먼트 폴더를 미리 만들지 않는다 (`SOC-05`).
- 의존성 방향은 항상 상위 조립층 → 하위 공통층 단방향이며 순환 참조를 금지한다 (`SOC-04`).
- `preset`과 기존 레포 구조가 어긋나면 조용히 덮어쓰지 않고 `[Conflict]` 1줄로 보고한다.
