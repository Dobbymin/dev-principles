# Changelog

All notable changes to `dev-principles` will be documented in this file.

## [0.1.0] - 2026-11-22

### Added
- Multi-harness plugin manifests for Claude Code, Codex, Cursor, Antigravity, and Gemini CLI.
- Core skill (`skills/dev-principles/SKILL.md`) and 10 progressive-disclosure reference modules covering 47 Rule IDs (`AI-*`, `CC-*`, `TS-*`, `SOC-*`, `DQ-*`, `FB-*`, `FSD-*`, `NEXT-*`).
- Read-only subagents (`principles-reviewer`, `structure-analyzer`), 6 slash commands (`/dp-design`, `/dp-refactor`, `/dp-review`, `/dp-init`, `/dp-doctor`, `/dp-explain`), `SessionStart` hook, and `install.sh`/`uninstall.sh`.
- Zero-dependency Node 22+ utility (`bin/dev-principles.mjs`) with `init`, `doctor`, `list`, and `explain`.
- Configuration schema (`schemas/config.schema.json`), example (`.dev-principles.yaml`), validation/garden scripts, and cross-platform CI.
