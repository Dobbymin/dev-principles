# 보안·신뢰 경계·에러 처리 원칙 (`SEC-*`)

### `SEC-01` 비밀정보 하드코딩 및 로그·응답 노출 금지
- **강도**: `MUST`
- **자동화**: `static` — `dev-principles check`로 API 키·토큰·개인키 패턴 정적 검사
- **적용 범위**: 모든 소스 코드, 설정, 로그, 테스트 픽스처, 에러 응답 (보안 불변 항목 — `off` 오버라이드 불가)
- **규칙**: API Key, 액세스 토큰, 비밀번호, 개인키, 서명 시크릿을 소스 코드에 하드코딩하거나 클라이언트 번들(`NEXT_PUBLIC_*`, `VITE_*`), 에러 응답, 로그 출력에 노출하지 않는다. 비밀값은 서버 환경변수나 시크릿 매니저에서만 주입한다.
- **이유 (Why)**: 저장소나 클라이언트 번들에 유출된 시크릿은 즉시 악용 가능하며 로그에 남으면 2차 유출 경로가 된다.
- **예외 / 오탐 방지**: 테스트 파일(`*.test.*`, `*.spec.*`) 내부의 명백한 더미 문자열(`dummy`, `example`, `test-key`)과 `process.env.*` 참조는 오탐에서 제외한다.
- **Before / After**:
```ts
// Bad: 하드코딩된 시크릿과 원시 에러 객체 로깅
const apiKey = "sk-live-example1234567890abcdef";
console.error("Auth failed", { headers, apiKey });

// Good: 서버 환경변수 참조 및 민감 필드 마스킹
const apiKey = process.env.SERVICE_API_KEY;
if (!apiKey) throw new Error("Missing SERVICE_API_KEY configuration");
```

### `SEC-02` 신뢰할 수 없는 입력의 실행·주입 차단 (XSS · 코드 실행 · 인젝션)
- **강도**: `MUST`
- **자동화**: `hybrid` — `dev-principles check`로 `dangerouslySetInnerHTML`/`eval`/`new Function` 정적 감지 + 리뷰
- **적용 범위**: 모든 프로덕션 코드, DOM 렌더링, DB/쉘/리다이렉트 경계 (보안 불변 항목 — `off` 오버라이드 불가)
- **규칙**: 외부·사용자 입력을 `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, 원시 SQL 문자열 결합, 쉘 명령 문자열 보간에 직접 전달하지 않는다. 외부 URL 리다이렉트(`redirectTo`)는 허용된 도메인·상대 경로 화이트리스트로 검증한다.
- **이유 (Why)**: 검증 없는 실행·주입은 XSS, 임의 코드 실행, SQL/명령 인젝션, 오픈 리다이렉트 취약점으로 직결된다.
- **예외 / 오탐 방지**: `DOMPurify.sanitize(...)` 등 신뢰된 새니타이저를 거친 정적 마크다운/HTML 렌더링이나 테스트 파일은 리뷰어가 안전성을 확인한 경우 예외로 허용한다.
- **Before / After**:
```tsx
// Bad: 사용자 입력 HTML을 검증 없이 DOM에 직접 주입
<div dangerouslySetInnerHTML={{ __html: userBio }} />

// Good: 기본 텍스트 렌더링 또는 신뢰된 sanitizer 통과 후 렌더링
<div>{userBio}</div>
```

### `SEC-03` 외부 신뢰 경계 런타임 검증 및 에러 무음 삼킴 금지
- **강도**: `SHOULD`
- **자동화**: `hybrid` — 빈 `catch {}` 패턴 감지 + 스키마 검증·에러 전파 리뷰
- **적용 범위**: API 응답 파싱, URL/폼 입력, 환경변수, `try/catch` 블록
- **규칙**: 외부 경계(API 응답, URL 파라미터, `JSON.parse`, 환경변수)를 통과하는 데이터는 TypeScript 단언에 기대지 말고 스키마(`zod` 등)나 타입 가드로 런타임 검증한다. `catch` 블록에서 에러를 아무 기록·전파 없이 삼키지(`catch {}`) 않는다.
- **이유 (Why)**: 타입 단언은 런타임 스키마 불일치를 막지 못하며, 무음 `catch`는 장애 원인을 은폐해 디버깅을 마비시킨다.
- **예외 / 오탐 방지**: `clipboard`/`localStorage` 접근 실패처럼 복구 가능한 선택적 브라우저 기능 fallback에서는 의도적 무시 사유 주석을 1줄 남기면 허용한다.
- **Before / After**:
```ts
// Bad: 빈 catch와 검증 없는 JSON 단언
try {
  return JSON.parse(raw) as UserConfig;
} catch {
  return null;
}

// Good: 실패 원인 기록 또는 타입 가드/스키마 검증으로 경계 보호
try {
  const parsed: unknown = JSON.parse(raw);
  return validateUserConfig(parsed);
} catch (error) {
  logger.warn("Invalid user config payload", { error });
  return DEFAULT_USER_CONFIG;
}
```
