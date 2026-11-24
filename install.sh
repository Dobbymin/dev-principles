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
MODE="symlink"
DRY_RUN=0
STAGING_DIR=""
BACKUP_DIR=""
BACKUP_ORIGIN=""

cleanup() {
  ownership_cleanup
  if [ -n "$BACKUP_DIR" ] && [ -n "$BACKUP_ORIGIN" ] && { [ -e "$BACKUP_DIR" ] || [ -L "$BACKUP_DIR" ]; }; then
    if [ ! -e "$BACKUP_ORIGIN" ] && [ ! -L "$BACKUP_ORIGIN" ]; then
      mv -- "$BACKUP_DIR" "$BACKUP_ORIGIN" 2>/dev/null || true
    fi
  fi
  if [ -n "$STAGING_DIR" ] && { [ -e "$STAGING_DIR" ] || [ -L "$STAGING_DIR" ]; }; then
    remove_staging_dir "$STAGING_DIR"
  fi
}

trap cleanup EXIT INT TERM

usage() {
  cat <<'EOF'
Usage: install.sh [options]

Install all dev-principles skills into an agent skills directory.

Options:
  --scope <project|global>  Target scope (default: project)
  --target <dir>            Explicit target parent directory for skills
  --copy                    Copy files instead of creating symlinks
  --dry-run                 Preview actions without modifying files
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
    --copy)
      MODE="copy"
      shift
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

if [ -e "$TARGET" ] && [ ! -d "$TARGET" ]; then
  echo "Target parent path is not a directory: $TARGET" >&2
  exit 1
fi

SKILL_COUNT=0

# Pre-flight ownership and conflict checks before any filesystem mutation
for SKILL_DIR in "$SKILLS_ROOT"/*; do
  [ -d "$SKILL_DIR" ] || continue
  [ -f "$SKILL_DIR/SKILL.md" ] || continue

  CANONICAL_SKILL_DIR="$(resolve_dir "$SKILL_DIR")"
  SKILL_NAME="$(basename "$CANONICAL_SKILL_DIR")"
  validate_skill_name "$SKILL_NAME"
  DEST="$TARGET/$SKILL_NAME"
  SKILL_COUNT=$((SKILL_COUNT + 1))

  if ! verify_owned_dest "$DEST" "$SKILL_NAME" "$CANONICAL_SKILL_DIR" overwrite; then
    exit 1
  fi
done

if [ "$SKILL_COUNT" -eq 0 ]; then
  echo "No skills found under $SKILLS_ROOT" >&2
  exit 1
fi

for SKILL_DIR in "$SKILLS_ROOT"/*; do
  [ -d "$SKILL_DIR" ] || continue
  [ -f "$SKILL_DIR/SKILL.md" ] || continue

  CANONICAL_SKILL_DIR="$(resolve_dir "$SKILL_DIR")"
  SKILL_NAME="$(basename "$CANONICAL_SKILL_DIR")"
  DEST="$TARGET/$SKILL_NAME"

  if [ "$DRY_RUN" -eq 1 ]; then
    if [ -L "$DEST" ]; then
      echo "[dry-run] Would refresh owned symlink ($MODE): $DEST -> $CANONICAL_SKILL_DIR"
    elif [ -d "$DEST" ]; then
      echo "[dry-run] Would replace owned copy directory ($MODE): $DEST"
    else
      echo "[dry-run] Would install ($MODE): $CANONICAL_SKILL_DIR -> $DEST"
    fi
    continue
  fi

  mkdir -p "$TARGET"
  CANONICAL_TARGET="$(resolve_dir "$TARGET")"
  if [ -z "$CANONICAL_TARGET" ] || [ "$CANONICAL_TARGET" = "/" ]; then
    echo "Refusing unsafe canonical target directory: $CANONICAL_TARGET" >&2
    exit 1
  fi
  CANONICAL_DEST="$CANONICAL_TARGET/$SKILL_NAME"

  if [ "$MODE" = "symlink" ]; then
    if ! verify_owned_dest "$DEST" "$SKILL_NAME" "$CANONICAL_SKILL_DIR" overwrite; then
      exit 1
    fi
    BACKUP_DIR=""
    BACKUP_ORIGIN=""
    if [ -L "$DEST" ] || [ -d "$DEST" ]; then
      BACKUP_DIR="$TARGET/.${SKILL_NAME}.dev-principles.bak.$$"
      if [ -e "$BACKUP_DIR" ] || [ -L "$BACKUP_DIR" ]; then
        echo "Backup path already exists: $BACKUP_DIR" >&2
        BACKUP_DIR=""
        exit 1
      fi
      BACKUP_ORIGIN="$DEST"
      if ! mv -- "$DEST" "$BACKUP_DIR"; then
        echo "Failed to stage existing installation for update: $DEST" >&2
        BACKUP_DIR=""
        BACKUP_ORIGIN=""
        exit 1
      fi
    fi

    if is_windows_shell; then
      if ! MSYS="winsymlinks:nativestrict" ln -s "$CANONICAL_SKILL_DIR" "$DEST" 2>/dev/null || [ ! -L "$DEST" ]; then
        if [ -L "$DEST" ]; then
          rm -- "$DEST" 2>/dev/null || true
        fi
        if [ -n "$BACKUP_DIR" ] && { [ -e "$BACKUP_DIR" ] || [ -L "$BACKUP_DIR" ]; }; then
          mv -- "$BACKUP_DIR" "$DEST" 2>/dev/null || true
          BACKUP_DIR=""
          BACKUP_ORIGIN=""
        fi
        echo "Symlink creation failed on Windows; enable Developer Mode or pass --copy." >&2
        exit 1
      fi
    else
      if ! ln -s "$CANONICAL_SKILL_DIR" "$DEST"; then
        if [ -n "$BACKUP_DIR" ] && { [ -e "$BACKUP_DIR" ] || [ -L "$BACKUP_DIR" ]; }; then
          mv -- "$BACKUP_DIR" "$DEST" 2>/dev/null || true
          BACKUP_DIR=""
          BACKUP_ORIGIN=""
        fi
        echo "Symlink creation failed: $DEST" >&2
        exit 1
      fi
    fi

    if [ -n "$BACKUP_DIR" ]; then
      if ! remove_owned_dest "$BACKUP_DIR" "$SKILL_NAME" "$CANONICAL_SKILL_DIR" "$CANONICAL_DEST"; then
        echo "Updated symlink, but failed to clean backup at $BACKUP_DIR. Remove it manually after verifying $DEST." >&2
        BACKUP_DIR=""
        BACKUP_ORIGIN=""
        exit 1
      fi
      BACKUP_DIR=""
      BACKUP_ORIGIN=""
    fi
    echo "Installed symlink: $DEST -> $CANONICAL_SKILL_DIR"
  else
    STAGING_DIR="$TARGET/.${SKILL_NAME}.dev-principles.tmp.$$"
    if [ -e "$STAGING_DIR" ] || [ -L "$STAGING_DIR" ]; then
      echo "Staging path already exists: $STAGING_DIR" >&2
      STAGING_DIR=""
      exit 1
    fi
    mkdir -p "$STAGING_DIR"
    cp -R "$CANONICAL_SKILL_DIR"/. "$STAGING_DIR"/
    if ! write_copy_marker "$STAGING_DIR" "$SKILL_NAME" "$CANONICAL_DEST" "$CANONICAL_SKILL_DIR"; then
      exit 1
    fi

    if ! verify_owned_dest "$DEST" "$SKILL_NAME" "$CANONICAL_SKILL_DIR" overwrite; then
      exit 1
    fi

    BACKUP_DIR=""
    BACKUP_ORIGIN=""
    if [ -L "$DEST" ] || [ -d "$DEST" ]; then
      BACKUP_DIR="$TARGET/.${SKILL_NAME}.dev-principles.bak.$$"
      if [ -e "$BACKUP_DIR" ] || [ -L "$BACKUP_DIR" ]; then
        echo "Backup path already exists: $BACKUP_DIR" >&2
        BACKUP_DIR=""
        exit 1
      fi
      BACKUP_ORIGIN="$DEST"
      if ! mv -- "$DEST" "$BACKUP_DIR"; then
        echo "Failed to stage existing installation for update: $DEST" >&2
        BACKUP_DIR=""
        BACKUP_ORIGIN=""
        exit 1
      fi
    fi

    if ! mv -- "$STAGING_DIR" "$DEST"; then
      if [ -n "$BACKUP_DIR" ] && { [ -e "$BACKUP_DIR" ] || [ -L "$BACKUP_DIR" ]; }; then
        if mv -- "$BACKUP_DIR" "$DEST" 2>/dev/null; then
          echo "Update failed; restored previous installation at $DEST" >&2
        else
          echo "Update failed and automatic restore failed. Recover manually from $BACKUP_DIR to $DEST" >&2
        fi
        BACKUP_DIR=""
        BACKUP_ORIGIN=""
      fi
      exit 1
    fi
    STAGING_DIR=""

    if [ -n "$BACKUP_DIR" ]; then
      if ! remove_owned_dest "$BACKUP_DIR" "$SKILL_NAME" "$CANONICAL_SKILL_DIR" "$CANONICAL_DEST"; then
        echo "Updated installation at $DEST, but failed to clean backup at $BACKUP_DIR. Remove it manually after verifying $DEST." >&2
        BACKUP_DIR=""
        BACKUP_ORIGIN=""
        exit 1
      fi
      BACKUP_DIR=""
      BACKUP_ORIGIN=""
    fi
    echo "Installed copy: $DEST"
  fi
done
