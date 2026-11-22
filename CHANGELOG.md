# Changelog

All notable changes to `dev-principles` will be documented in this file.

## [Unreleased]

### Added
- 11 new Rule IDs (`SEC-01`~`SEC-03`, `TEST-01`~`TEST-03`, `PERF-01`~`PERF-03`, `A11Y-01`, `DEP-01`), bringing the total to **58 Rule IDs**.
- 5 new reference modules: `security-and-reliability.md`, `testing-and-verification.md`, `performance-and-a11y.md`, `workflow-guide.md` (adaptive Track S/M/L & proposal-only rule evolution), and `automation-guide.md`.
- 2 new read-only specialized subagents: `architecture-reviewer` and `security-reviewer` (with explicit inter-agent boundaries and no `tools:` field).
- 2 new slash commands: `/dp-check` and `/dp-propose`.
- Zero-dependency static checker (`scripts/lib/checker.mjs`) and `dev-principles check` CLI command supporting `SEC-01`, `SEC-02`, `DQ-04`, `TS-02`, `DQ-02`, `SOC-04` cycle detection, `FSD-01`/`02`/`03`, `FB-01`/`02`/`04`, `NEXT-01`/`04`, `tsconfig.json`/`jsconfig.json` `paths` alias resolution, and `--staged`/`--changed` git-scoped checks.
- Single-source multi-harness capability matrix (`scripts/lib/harnesses.mjs`) and `ignore` configuration property in `schemas/config.schema.json`.
- True-positive, false-positive guard, override/invariant, and agent contract eval suite (`scripts/tests/checker.test.mjs`, `scripts/tests/evals.test.mjs`).

### Changed
- Unified all 58 Core and Preset rules under a single parser schema with `automation` level, `exceptions`, and `Before / After` examples.
- Adjusted `SOC-07` severity from `MUST` to `SHOULD` to align with `AI-02` and `FSD-08` (while keeping `FSD-06` `MUST` in strict FSD).
- Strengthened `validate.mjs` and `garden.mjs` with duplicate Rule ID, schema pattern, checklist severity sync, personal path leak, and orphan reference checks.
- Stripped `SKILL.md` frontmatter in `hooks/session-start.mjs` and added override/customPrinciples summary headers.

## [0.1.0] - 2026-11-22

### Added
- Multi-harness plugin manifests for Claude Code, Codex, Cursor, Antigravity, and Gemini CLI.
- Core skill (`skills/dev-principles/SKILL.md`) and 10 progressive-disclosure reference modules covering 47 Rule IDs (`AI-*`, `CC-*`, `TS-*`, `SOC-*`, `DQ-*`, `FB-*`, `FSD-*`, `NEXT-*`).
- Read-only subagents (`principles-reviewer`, `structure-analyzer`), 6 slash commands (`/dp-design`, `/dp-refactor`, `/dp-review`, `/dp-init`, `/dp-doctor`, `/dp-explain`), `SessionStart` hook, and `install.sh`/`uninstall.sh`.
- Zero-dependency Node 22+ utility (`bin/dev-principles.mjs`) with `init`, `doctor`, `list`, and `explain`.
- Configuration schema (`schemas/config.schema.json`), example (`.dev-principles.yaml`), validation/garden scripts, and cross-platform CI.
