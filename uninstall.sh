#!/usr/bin/env sh
set -eu

resolve_dir() {
  (CDPATH= cd -- "$1" 2>/dev/null && pwd -P)
}

is_windows_shell() {
  case "$(uname -s 2>/dev/null || true)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}

normalize_path_for_compare() {
  _p="$1"
  if is_windows_shell && command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$_p" 2>/dev/null || printf "%s\n" "$_p"
  else
    printf "%s\n" "$_p"
  fi
}

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
CANONICAL_SCRIPT_DIR="$(resolve_dir "$SCRIPT_DIR")"
SKILLS_ROOT="$CANONICAL_SCRIPT_DIR/skills"
MARKER_FILE=".dev-principles-script-managed"

SCOPE="project"
TARGET=""
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: uninstall.sh [options]

Uninstall all dev-principles skills installed via install.sh.

Options:
  --scope <project|global>  Target scope (default: project)
  --target <dir>            Explicit target parent directory for skills
  --dry-run                 Preview actions without removing files
  -h, --help                Show this help message
EOF
}

validate_skill_name() {
  case "$1" in
    ""|"."|".."|*/*|*\\*)
      echo "Invalid skill directory name: $1" >&2
      exit 1
      ;;
  esac
}

. "$CANONICAL_SCRIPT_DIR/scripts/lib/ownership.sh"

trap ownership_cleanup EXIT INT TERM

while [ "$#" -gt 0 ]; do
  case "$1" in
    --scope)
      [ "$#" -ge 2 ] || { echo "Missing value for --scope" >&2; exit 1; }
      SCOPE="$2"
      shift 2
      ;;
    --target)
      [ "$#" -ge 2 ] || { echo "Missing value for --target" >&2; exit 1; }
      TARGET="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ ! -d "$SKILLS_ROOT" ]; then
  echo "Skills directory not found: $SKILLS_ROOT" >&2
  exit 1
fi

if [ -z "$TARGET" ]; then
  case "$SCOPE" in
    project)
      TARGET="$(pwd)/.agents/skills"
      ;;
    global)
      GLOBAL_HOME="${HOME:-${USERPROFILE:-}}"
      if [ -z "$GLOBAL_HOME" ]; then
        echo "HOME/USERPROFILE is not set for --scope global" >&2
        exit 1
      fi
      GLOBAL_HOME="$(normalize_path_for_compare "$GLOBAL_HOME")"
      TARGET="${GLOBAL_HOME}/.agents/skills"
      ;;
    *)
      echo "Invalid --scope: $SCOPE (expected project or global)" >&2
      exit 1
      ;;
  esac
fi

if [ -z "$TARGET" ] || [ "$TARGET" = "/" ]; then
  echo "Refusing unsafe target directory: $TARGET" >&2
  exit 1
fi
reject_unsafe_target "$TARGET" || exit 1

while [ "$TARGET" != "/" ] && [ "${TARGET%/}" != "$TARGET" ]; do
  TARGET="${TARGET%/}"
done

# Pre-flight ownership verification before removing anything
for SKILL_DIR in "$SKILLS_ROOT"/*; do
  [ -d "$SKILL_DIR" ] || continue
  [ -f "$SKILL_DIR/SKILL.md" ] || continue

  CANONICAL_SKILL_DIR="$(resolve_dir "$SKILL_DIR")"
  SKILL_NAME="$(basename "$CANONICAL_SKILL_DIR")"
  validate_skill_name "$SKILL_NAME"
  DEST="$TARGET/$SKILL_NAME"

  if ! verify_owned_dest "$DEST" "$SKILL_NAME" "$CANONICAL_SKILL_DIR" remove; then
    exit 1
  fi
done

for SKILL_DIR in "$SKILLS_ROOT"/*; do
  [ -d "$SKILL_DIR" ] || continue
  [ -f "$SKILL_DIR/SKILL.md" ] || continue

  CANONICAL_SKILL_DIR="$(resolve_dir "$SKILL_DIR")"
  SKILL_NAME="$(basename "$CANONICAL_SKILL_DIR")"
  DEST="$TARGET/$SKILL_NAME"

  if [ ! -e "$DEST" ] && [ ! -L "$DEST" ]; then
    continue
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    if ! verify_owned_dest "$DEST" "$SKILL_NAME" "$CANONICAL_SKILL_DIR" remove; then
      exit 1
    fi
    if [ -L "$DEST" ]; then
      echo "[dry-run] Would remove owned symlink: $DEST"
    else
      echo "[dry-run] Would remove owned copy directory (managed files only): $DEST"
    fi
    continue
  fi

  # remove_owned_dest re-verifies ownership immediately before deleting; failure aborts via explicit check.
  _kind="directory"
  [ -L "$DEST" ] && _kind="symlink"
  if ! remove_owned_dest "$DEST" "$SKILL_NAME" "$CANONICAL_SKILL_DIR"; then
    exit 1
  fi
  echo "Removed $_kind: $DEST"
done
