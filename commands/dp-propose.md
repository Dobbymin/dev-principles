---
description: Propose a project-specific rule override, customPrinciples entry, or ignore pattern from observed review patterns without mutating files without approval.
argument-hint: "<observed pattern, repeated violation, or false-positive note>"
---

Draft a proposal-only `dev-principles` configuration or rule improvement for:

`$ARGUMENTS`

Steps:

1. Read `skills/dev-principles/references/workflow-guide.md` (Section 2: Proposal-Only Rule Evolution) and inspect `.dev-principles.yaml` if present.
2. Verify the observed pattern against actual repository files (`file:line` evidence) and check whether it conflicts with security invariants (`SEC-01`, `SEC-02`, `DQ-04`).
3. Output a structured proposal (`대상`, `관찰 근거`, `제안 내용`, `예상 오탐/호환성 영향`, `결정 요청`) without modifying `.dev-principles.yaml` or rule files until the user explicitly approves.
