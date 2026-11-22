---
description: Design and implement a feature or module following dev-principles Rule IDs, adaptive Track S/M/L workflow, Context7 verification, and SoC boundaries.
argument-hint: "<feature or module description>"
---

Run `dev-principles` in `design / implement` mode for:

`$ARGUMENTS`

Authority & Scope:

- Edit files only within the user-requested or delegated implementation scope; never auto-modify unrelated project settings.
- Never implicitly create branches, commit, push, open or merge PRs, create/edit issues, or modify releases/tags; operate fully standalone when installed alone.
- Respect project-rule priority; on conflict with defaults, keep existing project rules and report `[Conflict]` with 4 fields (`Rule ID`, `프로젝트 기존 규칙`, `충돌 원인`, `유지 사유`).

Steps:

1. Read `skills/dev-principles/SKILL.md` and `skills/dev-principles/references/workflow-guide.md` to select Track S, M, or L based on task scope and risk.
2. For Track M/L, inspect `.dev-principles.yaml`, `package.json`, and directory structure (delegate read-only discovery to `agents/structure-analyzer.md` if helpful) and clarify ambiguities before coding (`AI-01`).
3. If version-sensitive APIs are involved, query Context7 MCP (`resolve-library-id` -> `query-docs`) or fall back to `package.json` and `.d.ts` (`AI-05`).
4. Propose concise file placement (`SOC-*`), type contracts (`TS-01`), and verification criteria (`AI-04`), then implement minimally (`AI-02`, `AI-03`, `TEST-02`).
5. Run `node bin/dev-principles.mjs check` and project `tsc`/lint/tests after the final edit (`TEST-03`).
