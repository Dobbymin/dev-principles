---
description: Refactor existing code to align abstraction levels, separate events from functions, and enforce SoC boundaries.
argument-hint: "<file, directory, or refactor goal>"
---

Run `dev-principles` in `refactor` mode for:

`$ARGUMENTS`

Steps:

1. Read `skills/dev-principles/SKILL.md`, `skills/dev-principles/references/clean-code.md`, and `skills/dev-principles/references/architecture-soc.md`.
2. Establish behavior-preservation baseline (existing tests, `tsc --noEmit`, or verification scenario) before editing (`AI-04`).
3. Diagnose violations by Rule ID (`CC-01`, `CC-02`, `SOC-01`, `SOC-07`, `TS-02`) and refactor incrementally within requested scope while preserving public APIs (`AI-03`).
4. Re-run verification and report changes with Rule IDs.
