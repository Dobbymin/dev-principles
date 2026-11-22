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

cleanup() {
  if [ -n "$STAGING_DIR" ] && [ -e "$STAGING_DIR" ]; then
    rm -rf "$STAGING_DIR"
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

is_owned_symlink() {
  _dest="$1"
  _expected="$2"
  _raw_target="$(readlink "$_dest" 2>/dev/null || true)"
  [ -n "$_raw_target" ] || return 1
  case "$_raw_target" in
    /*|[A-Za-z]:/*|[A-Za-z]:\\*) _candidate="$_raw_target" ;;
    *) _candidate="$(dirname -- "$_dest")/$_raw_target" ;;
  esac
  if [ -d "$_candidate" ]; then
    _resolved="$(resolve_dir "$_candidate" || true)"
    [ -n "$_resolved" ] && [ "$_resolved" = "$_expected" ]
    return $?
  fi
  _norm_candidate="$(normalize_path_for_compare "$_candidate")"
  _norm_expected="$(normalize_path_for_compare "$_expected")"
  [ "$_norm_candidate" = "$_norm_expected" ]
}

has_foreign_marker() {
  _dest="$1"
  for _m in "$_dest"/.*-script-managed; do
    [ -e "$_m" ] || [ -L "$_m" ] || continue
    if [ "$(basename -- "$_m")" != "$MARKER_FILE" ]; then
      return 0
    fi
  done
  return 1
}

file_has_exact_line() {
  _file="$1"
  _line="$2"
  tr -d '\r' < "$_file" 2>/dev/null | grep -qx "$_line" 2>/dev/null
}

file_has_prefix() {
  _file="$1"
  _prefix="$2"
  tr -d '\r' < "$_file" 2>/dev/null | grep -q "^$_prefix" 2>/dev/null
}

is_owned_copy_dir() {
  _dest="$1"
  _skill_name="$2"
  [ -d "$_dest" ] && [ ! -L "$_dest" ] || return 1
  [ -f "$_dest/$MARKER_FILE" ] && [ ! -L "$_dest/$MARKER_FILE" ] || return 1
  if has_foreign_marker "$_dest"; then
    return 1
  fi
  if file_has_exact_line "$_dest/$MARKER_FILE" 'managed_by=install\.sh' ||
     file_has_exact_line "$_dest/$MARKER_FILE" 'managed-by=install\.sh'; then
    :
  else
    return 1
  fi
  if file_has_prefix "$_dest/$MARKER_FILE" 'plugin='; then
    file_has_exact_line "$_dest/$MARKER_FILE" 'plugin=dev-principles' || return 1
  else
    # Legacy v0.1 marker migration: require SKILL.md frontmatter name match
    [ -f "$_dest/SKILL.md" ] || return 1
    file_has_exact_line "$_dest/SKILL.md" "name: $_skill_name" || return 1
  fi
  if file_has_prefix "$_dest/$MARKER_FILE" 'skill='; then
    file_has_exact_line "$_dest/$MARKER_FILE" "skill=$_skill_name" || return 1
  fi
  return 0
}

verify_dest_ownership() {
  _dest="$1"
  _skill_name="$2"
  _expected="$3"

  if [ -L "$_dest" ]; then
    if ! is_owned_symlink "$_dest" "$_expected"; then
      _link_target="$(readlink "$_dest" 2>/dev/null || true)"
      echo "Refusing to overwrite symlink not owned by dev-principles: $_dest -> $_link_target (expected: $_expected)" >&2
      return 1
    fi
  elif [ -d "$_dest" ]; then
    if ! is_owned_copy_dir "$_dest" "$_skill_name"; then
      echo "Refusing to overwrite unmanaged directory: $_dest" >&2
      return 1
    fi
  elif [ -e "$_dest" ]; then
    echo "Refusing to overwrite existing non-directory file: $_dest" >&2
    return 1
  fi
  return 0
}

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

  verify_dest_ownership "$DEST" "$SKILL_NAME" "$CANONICAL_SKILL_DIR" || exit 1
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
  CANONICAL_DEST="$CANONICAL_TARGET/$SKILL_NAME"

  if [ "$MODE" = "symlink" ]; then
    verify_dest_ownership "$DEST" "$SKILL_NAME" "$CANONICAL_SKILL_DIR" || exit 1
    if [ -L "$DEST" ]; then
      rm "$DEST"
    elif [ -d "$DEST" ]; then
      rm -rf "$DEST"
    fi
    if is_windows_shell; then
      if ! MSYS="winsymlinks:nativestrict" ln -s "$CANONICAL_SKILL_DIR" "$DEST" 2>/dev/null || [ ! -L "$DEST" ]; then
        if [ -e "$DEST" ] && [ ! -L "$DEST" ]; then
          rm -rf "$DEST"
        fi
        echo "Symlink creation failed on Windows; enable Developer Mode or pass --copy." >&2
        exit 1
      fi
    else
      ln -s "$CANONICAL_SKILL_DIR" "$DEST"
    fi
    echo "Installed symlink: $DEST -> $CANONICAL_SKILL_DIR"
  else
    STAGING_DIR="$TARGET/.${SKILL_NAME}.dev-principles.tmp.$$"
    rm -rf "$STAGING_DIR"
    mkdir -p "$STAGING_DIR"
    cp -R "$CANONICAL_SKILL_DIR"/. "$STAGING_DIR"/
    {
      printf "schema_version=1\n"
      printf "plugin=dev-principles\n"
      printf "managed_by=install.sh\n"
      printf "managed-by=install.sh\n"
      printf "install_mode=copy\n"
      printf "skill=%s\n" "$SKILL_NAME"
      printf "install_path=%s\n" "$CANONICAL_DEST"
      printf "source_path=%s\n" "$CANONICAL_SKILL_DIR"
      printf "link_target=\n"
    } > "$STAGING_DIR/$MARKER_FILE"

    verify_dest_ownership "$DEST" "$SKILL_NAME" "$CANONICAL_SKILL_DIR" || exit 1
    if [ -L "$DEST" ]; then
      rm "$DEST"
    elif [ -d "$DEST" ]; then
      rm -rf "$DEST"
    fi
    mv "$STAGING_DIR" "$DEST"
    STAGING_DIR=""
    echo "Installed copy: $DEST"
  fi
done
