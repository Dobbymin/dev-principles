# Repository Instructions

This repository contains the `dev-principles` multi-harness plugin, skill bundle, and zero-dependency Node 22+ utilities.

## Boundaries

- Keep all planning, PRD, SPEC, ROADMAP, and design documents outside this repository.
- Keep `skills/`, `agents/`, `commands/`, `hooks/`, and `bin/` strictly zero-dependency (Node.js 22+ standard library only) and free of personal absolute paths or Obsidian `[[wikilink]]` syntax.
- Never include a `tools:` field in `agents/*.md` frontmatter to preserve cross-harness compatibility.
- Keep `gemini-extension.json` `contextFileName` pointed at `skills/dev-principles/SKILL.md` (never `GEMINI.md` or `AGENTS.md`).

## Branch & Remote Hygiene

- Push remote branches only for active Issue/PR workflows (`{type}/{issue_number}-{summary-slug}`) so GitHub's `delete_branch_on_merge` cleans them automatically.
- Never leave temporary CI or verification branches on `origin`; if a temporary remote branch is explicitly approved for CI verification, delete it immediately after the run finishes (`git push origin --delete <branch>`).
- Keep `fetch.prune` enabled (`npm run prepare`) and delete merged local branches.

## Verification

Run `npm run check` before committing or opening a Pull Request.
