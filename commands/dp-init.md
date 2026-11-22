---
description: Detect repository structure and generate or preview a .dev-principles.yaml configuration file.
argument-hint: "[--preset auto|feature-based|fsd|next-app-router] [--dry-run]"
---

Initialize `.dev-principles.yaml` for the current repository:

`$ARGUMENTS`

Steps:

1. Run `node bin/dev-principles.mjs init $ARGUMENTS` (use `--dry-run` first if the user has not confirmed writing `.dev-principles.yaml`).
2. Inspect the detected preset, `sourceRoot`, and preferred Context7 libraries.
3. Summarize the generated or proposed `.dev-principles.yaml` and ask before overwriting any existing config.
