---
description: Audit a PR, diff, file, or directory against dev-principles Rule IDs and output a structured review report.
argument-hint: "[target path, PR number, or git range]"
---

Run `dev-principles` in `review / audit` mode for:

`$ARGUMENTS`

Steps:

1. Read `skills/dev-principles/SKILL.md` and `skills/dev-principles/references/review-checklist.md`.
2. Run `node bin/dev-principles.mjs check --json` first to collect deterministic static findings.
3. Delegate read-only audit as needed by domain: `agents/principles-reviewer.md` (general), `agents/architecture-reviewer.md` (module boundaries/presets), and `agents/security-reviewer.md` (secrets/XSS/auth).
4. Apply false-positive filters (ignore untouched vendor UI, `import as` aliases, and non-auth `localStorage`).
5. Output the standard Rule ID report (`MUST` / `SHOULD` / `PREFER` with `file:line`, `Why`, and concrete fix).
