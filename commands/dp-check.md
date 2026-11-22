---
description: Run zero-dependency static principle checks (secrets, XSS sinks, auth token storage, any usage, raw fetch, circular deps, preset boundaries).
argument-hint: "[target path] [--preset auto|feature-based|fsd|next-app-router] [--rule ID] [--staged] [--changed] [--strict] [--json]"
---

Run `dev-principles` static checks:

`$ARGUMENTS`

Steps:

1. Run `node bin/dev-principles.mjs check $ARGUMENTS`.
2. Group any findings by severity (`MUST` vs `SHOULD`) and Rule ID with exact `file:line`, `Why`, and remediation guidance.
3. If `0` findings are reported, note that `manual` rules still require contextual review via `/dp-review`.
