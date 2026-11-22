---
description: Run read-only diagnostics on .dev-principles.yaml, Rule ID overrides, security invariants, and local convention conflicts.
argument-hint: "[--json]"
---

Run `dev-principles` diagnostics in read-only mode:

`$ARGUMENTS`

Steps:

1. Run `node bin/dev-principles.mjs doctor $ARGUMENTS`.
2. Report schema validity, unknown keys or Rule IDs, security invariant checks (`DQ-04`), detected architecture preset, and any local `AGENTS.md`/`CLAUDE.md`/linter conflicts without modifying files.
