#!/usr/bin/env sh
# Shared ownership helpers for install.sh / uninstall.sh (POSIX sh, sourced).
# Expects: MARKER_FILE, resolve_dir, normalize_path_for_compare defined by caller.

marker_value() {
  _mf="$1"
  _key="$2"
  tr -d '\r' < "$_mf" 2>/dev/null | sed -n "s/^${_key}=//p" | sed -n '1p'
}

file_has_exact_line() {
  tr -d '\r' < "$1" 2>/dev/null | grep -qx "$2" 2>/dev/null
}

file_has_prefix() {
  tr -d '\r' < "$1" 2>/dev/null | grep -q "^$2" 2>/dev/null
}

is_safe_relpath() {
  case "$1" in
    ""|/*|[A-Za-z]:*|*\\*|..|../*|*/..|*/../*|./*|*/./*|*/.) return 1 ;;
  esac
  return 0
}

is_valid_source_path() {
  case "/$1/" in
    */../*|*/./*) return 1 ;;
  esac
  return 0
}

# Canonical (physical) target of a symlink, empty if it does not resolve to a directory.
link_canonical_target() {
  _dest="$1"
  _raw="$(readlink "$_dest" 2>/dev/null || true)"
  [ -n "$_raw" ] || return 1
  case "$_raw" in
    /*|[A-Za-z]:/*|[A-Za-z]:\\*) _cand="$_raw" ;;
    *) _cand="$(dirname -- "$_dest")/$_raw" ;;
  esac
  if [ -d "$_cand" ]; then
    resolve_dir "$_cand"
  else
    normalize_path_for_compare "$_cand"
  fi
}

is_owned_symlink() {
  _resolved="$(link_canonical_target "$1" || true)"
  [ -n "$_resolved" ] && [ "$_resolved" = "$(normalize_path_for_compare "$2")" ]
}

has_foreign_marker() {
  for _m in "$1"/.*-script-managed; do
    [ -e "$_m" ] || [ -L "$_m" ] || continue
    [ "$(basename -- "$_m")" != "$MARKER_FILE" ] && return 0
  done
  return 1
}

# Prints allowed relative file paths (one per line): marker manifest (file=) or,
# for legacy markers, the file set of the shipped skill directory.
owned_file_list() {
  _dest="$1"
  _src="$2"
  _mf="$_dest/$MARKER_FILE"
  if file_has_prefix "$_mf" 'file='; then
    tr -d '\r' < "$_mf" | sed -n 's/^file=//p'
  else
    (cd "$_src" 2>/dev/null && find . -type f | sed 's|^\./||')
  fi
}

# Returns 0 only when DEST is a dev-principles-managed copy whose every non-directory
# entry is covered by the ownership manifest. Marker presence alone is never enough.
is_owned_copy_dir() {
  _dest="$1"
  _skill="$2"
  _src="$3"
  [ -d "$_dest" ] && [ ! -L "$_dest" ] || return 1
  _mf="$_dest/$MARKER_FILE"
  [ -f "$_mf" ] && [ ! -L "$_mf" ] || return 1
  has_foreign_marker "$_dest" && return 1
  if file_has_exact_line "$_mf" 'managed_by=install\.sh' || file_has_exact_line "$_mf" 'managed-by=install\.sh'; then :; else return 1; fi
  if file_has_prefix "$_mf" 'plugin='; then
    file_has_exact_line "$_mf" 'plugin=dev-principles' || return 1
  else
    [ -f "$_dest/SKILL.md" ] || return 1
    file_has_exact_line "$_dest/SKILL.md" "name: $_skill" || return 1
  fi
  if file_has_prefix "$_mf" 'skill='; then
    [ "$(marker_value "$_mf" skill)" = "$_skill" ] || return 1
  fi
  if file_has_prefix "$_mf" 'install_path='; then
    _ip="$(marker_value "$_mf" install_path)"
    _real="$(resolve_dir "$_dest" || true)"
    [ -n "$_real" ] && [ "$(normalize_path_for_compare "$_ip")" = "$(normalize_path_for_compare "$_real")" ] || return 1
  fi
  if file_has_prefix "$_mf" 'source_path='; then
    _sp="$(marker_value "$_mf" source_path)"
    case "$_sp" in
      /*|[A-Za-z]:/*|[A-Za-z]:\\*) : ;;
      *) return 1 ;;
    esac
    if ! is_valid_source_path "$_sp"; then
      return 1
    fi
    [ "$(normalize_path_for_compare "$_sp")" = "$(normalize_path_for_compare "$_src")" ] || return 1
  fi
  if file_has_prefix "$_mf" 'install_mode='; then
    [ "$(marker_value "$_mf" install_mode)" = "copy" ] || return 1
  fi
  _allowed="$(owned_file_list "$_dest" "$_src")"
  # every manifest entry must be a safe relative path
  _bad=0
  _oldifs="$IFS"; IFS='
'
  for _e in $_allowed; do
    is_safe_relpath "$_e" || _bad=1
  done
  IFS="$_oldifs"
  [ "$_bad" -eq 0 ] || return 1
  _bad=0
  _listing="$(find "$_dest" -mindepth 1 ! -type d 2>/dev/null)" || return 1
  _oldifs="$IFS"; IFS='
'
  for _f in $_listing; do
    _rel="${_f#"$_dest"/}"
    [ "$_rel" = "$MARKER_FILE" ] && continue
    printf '%s\n' "$_allowed" | grep -Fxq -- "$_rel" || { _bad=1; break; }
  done
  IFS="$_oldifs"
  [ "$_bad" -eq 0 ]
}

# Verifies ownership; prints reason on stderr. $1=dest $2=skill $3=expected source dir $4=action word
verify_owned_dest() {
  _dest="$1"; _skill="$2"; _src="$3"; _verb="${4:-overwrite}"
  if [ -L "$_dest" ]; then
    is_owned_symlink "$_dest" "$_src" || {
      echo "Refusing to $_verb symlink not owned by dev-principles: $_dest -> $(readlink "$_dest" 2>/dev/null || true) (expected: $_src)" >&2
      return 1
    }
  elif [ -d "$_dest" ]; then
    is_owned_copy_dir "$_dest" "$_skill" "$_src" || {
      echo "Refusing to $_verb unmanaged or modified directory: $_dest" >&2
      return 1
    }
  elif [ -e "$_dest" ]; then
    echo "Refusing to $_verb existing non-directory file: $_dest" >&2
    return 1
  fi
  return 0
}

# Verify-then-remove. Never runs rm if verification fails. Copy dirs are removed
# entry by entry (no recursive delete), symlinks only unlink the link itself.
remove_owned_dest() {
  _dest="$1"; _skill="$2"; _src="$3"
  verify_owned_dest "$_dest" "$_skill" "$_src" remove || return 1
  if [ -L "$_dest" ]; then
    rm -- "$_dest"
  elif [ -d "$_dest" ]; then
    find "$_dest" -mindepth 1 ! -type d -exec rm -- {} + || return 1
    find "$_dest" -depth -mindepth 1 -type d -exec rmdir -- {} + 2>/dev/null || true
    rmdir -- "$_dest" || { echo "Directory not empty after removing managed files: $_dest" >&2; return 1; }
  fi
}

reject_unsafe_target() {
  case "/$1/" in
    ""|"//"|*/../*|*/./*) echo "Refusing unsafe target path: $1" >&2; return 1 ;;
  esac
  return 0
}
