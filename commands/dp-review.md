---
description: Audit a PR, diff, file, or directory against dev-principles Rule IDs and output a structured review report.
argument-hint: "[target path, PR number, or git range]"
---

Run `dev-principles` in `review / audit` mode for:

`$ARGUMENTS`

Steps:

1. Read `skills/dev-principles/SKILL.md` and `skills/dev-principles/references/review-checklist.md`.
2. Delegate read-only audit to `agents/principles-reviewer.md` when helpful, loading only the reference modules matching the changed files.
3. Apply false-positive filters (ignore untouched vendor UI, `import as` aliases, and non-auth `localStorage`).
4. Output the standard Rule ID report (`MUST` / `SHOULD` / `PREFER` with `file:line`, `Why`, and concrete fix).
