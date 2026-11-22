---
description: Run read-only diagnostics on .dev-principles.yaml, Rule ID overrides, security invariants, customPrinciples, and local convention conflicts.
argument-hint: "[--json]"
---

Run `dev-principles` diagnostics in read-only mode:

`$ARGUMENTS`

Steps:

1. Run `node bin/dev-principles.mjs doctor $ARGUMENTS`.
2. Report schema validity, unknown keys or Rule IDs, security invariant checks (`DQ-04`, `SEC-01`, `SEC-02`), `customPrinciples` path status, detected architecture preset/tools/versions, and any local `AGENTS.md`/`CLAUDE.md`/linter conflicts without modifying files.
