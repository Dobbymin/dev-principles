---
description: Refactor existing code to align abstraction levels, separate events from functions, and enforce SoC boundaries with baseline verification.
argument-hint: "<file, directory, or refactor goal>"
---

Run `dev-principles` in `refactor` mode for:

`$ARGUMENTS`

Authority & Scope:

- Edit files only within the user-requested or delegated refactor scope; never auto-modify unrelated project settings.
- Never implicitly create branches, commit, push, open or merge PRs, create/edit issues, or modify releases/tags; operate fully standalone when installed alone.
- Respect project-rule priority; on conflict with defaults, keep existing project rules and report `[Conflict]` with 4 fields (`Rule ID`, `프로젝트 기존 규칙`, `충돌 원인`, `유지 사유`).

Steps:

1. Read `skills/dev-principles/SKILL.md`, `skills/dev-principles/references/clean-code.md`, and `skills/dev-principles/references/architecture-soc.md`.
2. Establish a behavior-preservation baseline (existing tests, `tsc --noEmit`, or verification scenario) before editing (`AI-04`, `TEST-03`).
3. Run `node bin/dev-principles.mjs check` and diagnose violations by Rule ID (`CC-01`, `CC-02`, `CC-05`, `SOC-01`, `SOC-07`, `TS-02`, `PERF-02`).
4. Refactor incrementally within the requested scope while preserving public APIs (`AI-03`).
5. Re-run `node bin/dev-principles.mjs check` and all verification commands after the final edit (`TEST-03`), then report changes with Rule IDs.
