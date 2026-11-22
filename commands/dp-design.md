---
description: Design and implement a feature or module following dev-principles Rule IDs, Context7 verification, and SoC boundaries.
argument-hint: "<feature or module description>"
---

Run `dev-principles` in `design / implement` mode for:

`$ARGUMENTS`

Steps:

1. Read `skills/dev-principles/SKILL.md` and inspect `.dev-principles.yaml`, `AGENTS.md`, `package.json`, and directory structure (delegate read-only discovery to `agents/structure-analyzer.md` if helpful).
2. If version-sensitive APIs (React 19, Next.js App Router, TanStack Query v5, TypeScript 5.x) are involved, query Context7 MCP (`resolve-library-id` -> `query-docs`) first (`AI-05`).
3. Propose concise file placement, responsibility boundaries (`SOC-*`), and type contracts (`TS-*`) before editing, asking if requirements are ambiguous (`AI-01`).
4. Implement minimally (`AI-02`, `AI-03`) and verify with `tsc`/lint/tests (`AI-04`).
