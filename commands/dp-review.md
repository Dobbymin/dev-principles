---
description: Audit a PR, diff, file, or directory against dev-principles Rule IDs and output a structured review report.
argument-hint: "[target path, PR number, or git range]"
---

Run `dev-principles` in `review / audit` mode for:

`$ARGUMENTS`

Authority & Scope:

- Strictly read-only: never edit files, create branches, commit, push, open or merge PRs, create/edit issues, or modify releases/tags.
- Operate fully standalone when no external GitHub plugin is installed; if external PR context is provided, pass `--pr-context <file>` or `--format review-result` without duplicating PR template/branch/commit/CI checks.

Steps:

1. Read `skills/dev-principles/SKILL.md` and `skills/dev-principles/references/review-checklist.md`.
2. Run `node bin/dev-principles.mjs check --json` (or `--format review-result`) first to collect deterministic static findings.
3. Delegate read-only audit as needed by domain without duplicate Rule ID reporting or recursive delegation: `agents/principles-reviewer.md` (general), `agents/architecture-reviewer.md` (module boundaries/presets), and `agents/security-reviewer.md` (secrets/XSS/auth).
4. Apply false-positive filters (ignore untouched vendor UI, `import as` aliases, and non-auth `localStorage`).
5. Output the standard Rule ID report (`MUST` / `SHOULD` / `PREFER` with `file:line`, `Why`, and concrete fix) or standard Review Result JSON.
