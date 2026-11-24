#!/usr/bin/env sh
# Shared ownership helpers for install.sh / uninstall.sh (POSIX sh, sourced).
# Expects: MARKER_FILE, resolve_dir, normalize_path_for_compare defined by caller.

_OWNERSHIP_ERR=""
_OWNERSHIP_TMPDIR_VERIFY=""
_OWNERSHIP_TMPDIR_REMOVE=""
_OWNERSHIP_TMPDIR_WRITE=""
_PARSED_SCHEMA_VERSION=""

strip_trailing_slashes() {
  _sts_p="$1"
  while [ "$_sts_p" != "/" ] && [ "${_sts_p%/}" != "$_sts_p" ]; do
    _sts_p="${_sts_p%/}"
  done
  printf '%s\n' "$_sts_p"
}

ownership_mktemp_dir() {
  _mkd_base="$(strip_trailing_slashes "${TMPDIR:-/tmp}")"
  [ -n "$_mkd_base" ] || _mkd_base="/tmp"
  mktemp -d "${_mkd_base}/dp-own.XXXXXX"
}

ownership_rm_tmpdir() {
  _rmt_dir="$1"
  [ -n "$_rmt_dir" ] && [ -d "$_rmt_dir" ] && [ ! -L "$_rmt_dir" ] || return 0
  rm -f -- \
    "$_rmt_dir/marker.clean" \
    "$_rmt_dir/manifest.raw" \
    "$_rmt_dir/manifest.sorted" \
    "$_rmt_dir/manifest.uniq" \
    "$_rmt_dir/actual.raw" \
    "$_rmt_dir/actual.unsorted" \
    "$_rmt_dir/actual.sorted" \
    "$_rmt_dir/src.raw" \
    "$_rmt_dir/src.unsorted" \
    "$_rmt_dir/src.sorted" \
    "$_rmt_dir/actual.dirs.raw" \
    "$_rmt_dir/actual.dirs.unsorted" \
    "$_rmt_dir/actual.dirs" \
    "$_rmt_dir/src.dirs.raw" \
    "$_rmt_dir/src.dirs.unsorted" \
    "$_rmt_dir/src.dirs" \
    "$_rmt_dir/actual.bad" \
    "$_rmt_dir/src.bad" \
    "$_rmt_dir/comm.out" \
    "$_rmt_dir/a.lf" \
    "$_rmt_dir/b.lf" \
    "$_rmt_dir/wm.raw" \
    "$_rmt_dir/wm.unsorted" \
    "$_rmt_dir/wm.files" \
    "$_rmt_dir/wm.bad" \
    "$_rmt_dir/rm.raw" \
    "$_rmt_dir/rm.unsorted" \
    "$_rmt_dir/rm.files" \
    "$_rmt_dir/rm.dirs.raw" \
    "$_rmt_dir/rm.dirs.unsorted" \
    "$_rmt_dir/rm.dirs" \
    "$_rmt_dir/rm.dirs.rev" \
    "$_rmt_dir/mf.raw" 2>/dev/null || true
  rmdir -- "$_rmt_dir" 2>/dev/null || true
}

ownership_cleanup() {
  if [ -n "$_OWNERSHIP_TMPDIR_VERIFY" ]; then
    ownership_rm_tmpdir "$_OWNERSHIP_TMPDIR_VERIFY"
    _OWNERSHIP_TMPDIR_VERIFY=""
  fi
  if [ -n "$_OWNERSHIP_TMPDIR_REMOVE" ]; then
    ownership_rm_tmpdir "$_OWNERSHIP_TMPDIR_REMOVE"
    _OWNERSHIP_TMPDIR_REMOVE=""
  fi
  if [ -n "$_OWNERSHIP_TMPDIR_WRITE" ]; then
    ownership_rm_tmpdir "$_OWNERSHIP_TMPDIR_WRITE"
    _OWNERSHIP_TMPDIR_WRITE=""
  fi
}

remove_staging_dir() {
  _rsd_dir="$1"
  [ -n "$_rsd_dir" ] && [ -d "$_rsd_dir" ] && [ ! -L "$_rsd_dir" ] || return 0
  find "$_rsd_dir" ! -path "$_rsd_dir" ! -type d -exec rm -f -- {} + 2>/dev/null || true
  find "$_rsd_dir" -depth ! -path "$_rsd_dir" -type d -exec rmdir -- {} + 2>/dev/null || true
  rmdir -- "$_rsd_dir" 2>/dev/null || true
}

is_valid_skill_name() {
  case "$1" in
    ""|"."|".."|*/*|*\\*) return 1 ;;
  esac
  return 0
}

reject_unsafe_target() {
  _rut_p="$1"
  _rut_norm="$(printf '%s\n' "$_rut_p" | tr '\\' '/')"
  case "$_rut_norm" in
    ""|"/"|"//"|"///")
      echo "Refusing unsafe target path: $_rut_p" >&2
      return 1
      ;;
  esac
  case "/$_rut_norm/" in
    ""|"//"|"///"|*/../*|*/./*)
      echo "Refusing unsafe target path: $_rut_p" >&2
      return 1
      ;;
  esac
  return 0
}

is_safe_relpath() {
  case "$1" in
    ""|"."|".."|/*|[A-Za-z]:*|*\\*|*//*|*/|../*|*/..|*/../*|./*|*/./*|*/.) return 1 ;;
  esac
  return 0
}

is_valid_abs_path() {
  case "$1" in
    /*|[A-Za-z]:/*|[A-Za-z]:\\*) : ;;
    *) return 1 ;;
  esac
  _iva_norm="$(printf '%s\n' "$1" | tr '\\' '/')"
  case "/$_iva_norm/" in
    */../*|*/./*) return 1 ;;
  esac
  return 0
}

is_valid_source_path() {
  is_valid_abs_path "$1"
}

# Canonical (physical) target of a symlink, empty if it does not resolve to a directory.
link_canonical_target() {
  _lct_dest="$1"
  _lct_raw="$(readlink -- "$_lct_dest" 2>/dev/null || true)"
  [ -n "$_lct_raw" ] || return 1
  case "$_lct_raw" in
    /*|[A-Za-z]:/*|[A-Za-z]:\\*) _lct_cand="$_lct_raw" ;;
    *) _lct_cand="$(dirname -- "$_lct_dest")/$_lct_raw" ;;
  esac
  if [ -d "$_lct_cand" ]; then
    resolve_dir "$_lct_cand"
  else
    normalize_path_for_compare "$_lct_cand"
  fi
}

is_owned_symlink() {
  _ios_resolved="$(link_canonical_target "$1" || true)"
  [ -n "$_ios_resolved" ] && [ "$_ios_resolved" = "$(normalize_path_for_compare "$2")" ]
}

has_foreign_marker() {
  _hfm_dir="$1"
  for _hfm_m in "$_hfm_dir"/.*-script-managed; do
    [ -e "$_hfm_m" ] || [ -L "$_hfm_m" ] || continue
    [ "$(basename -- "$_hfm_m")" != "$MARKER_FILE" ] && return 0
  done
  return 1
}

collect_dir_files() {
  _cf_dir="$1"
  _cf_out="$2"
  _cf_raw="$3"
  _cf_unsorted="$4"
  _cf_skip_marker="${5:-0}"
  [ -d "$_cf_dir" ] && [ ! -L "$_cf_dir" ] || {
    _OWNERSHIP_ERR="target is not a regular directory"
    return 1
  }
  if ! (cd "$_cf_dir" && find . ! -path . -type f) > "$_cf_raw" 2>/dev/null; then
    _OWNERSHIP_ERR="failed to scan directory files"
    return 1
  fi
  : > "$_cf_unsorted"
  while IFS= read -r _cf_entry || [ -n "$_cf_entry" ]; do
    case "$_cf_entry" in
      ./*) _cf_rel="${_cf_entry#./}" ;;
      *)
        _OWNERSHIP_ERR="invalid path entry from directory scan"
        return 1
        ;;
    esac
    if [ "$_cf_skip_marker" = "1" ] && [ "$_cf_rel" = "$MARKER_FILE" ]; then
      continue
    fi
    if ! is_safe_relpath "$_cf_rel"; then
      _OWNERSHIP_ERR="unsafe relative path: $_cf_rel"
      return 1
    fi
    printf '%s\n' "$_cf_rel" >> "$_cf_unsorted"
  done < "$_cf_raw"
  LC_ALL=C sort "$_cf_unsorted" > "$_cf_out"
}

collect_dir_subdirs() {
  _cd_dir="$1"
  _cd_out="$2"
  _cd_raw="$3"
  _cd_unsorted="$4"
  [ -d "$_cd_dir" ] && [ ! -L "$_cd_dir" ] || {
    _OWNERSHIP_ERR="target is not a regular directory"
    return 1
  }
  if ! (cd "$_cd_dir" && find . ! -path . -type d) > "$_cd_raw" 2>/dev/null; then
    _OWNERSHIP_ERR="failed to scan subdirectories"
    return 1
  fi
  : > "$_cd_unsorted"
  while IFS= read -r _cd_entry || [ -n "$_cd_entry" ]; do
    case "$_cd_entry" in
      ./*) _cd_rel="${_cd_entry#./}" ;;
      *)
        _OWNERSHIP_ERR="invalid subdirectory entry from scan"
        return 1
        ;;
    esac
    if ! is_safe_relpath "$_cd_rel"; then
      _OWNERSHIP_ERR="unsafe subdirectory path: $_cd_rel"
      return 1
    fi
    printf '%s\n' "$_cd_rel" >> "$_cd_unsorted"
  done < "$_cd_raw"
  LC_ALL=C sort "$_cd_unsorted" > "$_cd_out"
}

has_unexpected_entries() {
  _ue_dir="$1"
  _ue_bad="$2"
  if ! (cd "$_ue_dir" && find . ! -path . \( -type l -o \( ! -type f ! -type d \) \)) > "$_ue_bad" 2>/dev/null; then
    _OWNERSHIP_ERR="failed to scan directory for unexpected entries"
    return 0
  fi
  if [ -s "$_ue_bad" ]; then
    IFS= read -r _ue_first < "$_ue_bad" || true
    _ue_rel="${_ue_first#./}"
    if [ -L "$_ue_dir/$_ue_rel" ]; then
      _OWNERSHIP_ERR="unexpected symlink inside copy directory: $_ue_rel"
    else
      _OWNERSHIP_ERR="unexpected non-regular file inside copy directory: $_ue_rel"
    fi
    return 0
  fi
  return 1
}

write_copy_marker() {
  _wm_staging="$1"
  _wm_skill="$2"
  _wm_cdest="$3"
  _wm_csrc="$4"
  _OWNERSHIP_ERR=""
  _wm_tmp="$(ownership_mktemp_dir)" || return 1
  _OWNERSHIP_TMPDIR_WRITE="$_wm_tmp"

  if has_unexpected_entries "$_wm_staging" "$_wm_tmp/wm.bad"; then
    ownership_rm_tmpdir "$_wm_tmp"
    _OWNERSHIP_TMPDIR_WRITE=""
    echo "Refusing to write marker ($_OWNERSHIP_ERR): $_wm_staging" >&2
    return 1
  fi

  if ! collect_dir_files "$_wm_staging" "$_wm_tmp/wm.files" "$_wm_tmp/wm.raw" "$_wm_tmp/wm.unsorted" "1"; then
    ownership_rm_tmpdir "$_wm_tmp"
    _OWNERSHIP_TMPDIR_WRITE=""
    echo "Refusing to write marker ($_OWNERSHIP_ERR): $_wm_staging" >&2
    return 1
  fi

  if [ ! -s "$_wm_tmp/wm.files" ]; then
    ownership_rm_tmpdir "$_wm_tmp"
    _OWNERSHIP_TMPDIR_WRITE=""
    echo "Refusing to write empty manifest marker: $_wm_staging" >&2
    return 1
  fi

  {
    printf "schema_version=2\n"
    printf "plugin=dev-principles\n"
    printf "managed_by=install.sh\n"
    printf "managed-by=install.sh\n"
    printf "install_mode=copy\n"
    printf "skill=%s\n" "$_wm_skill"
    printf "install_path=%s\n" "$_wm_cdest"
    printf "source_path=%s\n" "$_wm_csrc"
    printf "link_target=\n"
    while IFS= read -r _wm_rel || [ -n "$_wm_rel" ]; do
      printf "file=%s\n" "$_wm_rel"
    done < "$_wm_tmp/wm.files"
  } > "$_wm_staging/$MARKER_FILE"

  ownership_rm_tmpdir "$_wm_tmp"
  _OWNERSHIP_TMPDIR_WRITE=""
  return 0
}

verify_marker_metadata() {
  _vm_dest="$1"
  _vm_skill="$2"
  _vm_src="$3"
  _vm_exp_ip_arg="$4"
  _vm_tmp="$5"
  _vm_manifest_raw="$6"
  _vm_check_skill_md="${7:-1}"

  _PARSED_SCHEMA_VERSION=""
  _vm_mf="$_vm_dest/$MARKER_FILE"

  if [ -L "$_vm_mf" ]; then
    _OWNERSHIP_ERR="marker file is a symlink"
    return 1
  fi
  if [ ! -f "$_vm_mf" ] || [ ! -r "$_vm_mf" ]; then
    _OWNERSHIP_ERR="missing ownership marker"
    return 1
  fi
  if has_foreign_marker "$_vm_dest"; then
    _OWNERSHIP_ERR="foreign plugin marker detected"
    return 1
  fi

  tr -d '\r' < "$_vm_mf" > "$_vm_tmp/marker.clean" 2>/dev/null || {
    _OWNERSHIP_ERR="cannot read ownership marker"
    return 1
  }
  if [ ! -s "$_vm_tmp/marker.clean" ]; then
    _OWNERSHIP_ERR="empty ownership marker"
    return 1
  fi

  : > "$_vm_manifest_raw"

  _vm_c_schema=0
  _vm_c_plugin=0
  _vm_c_managed_by=0
  _vm_c_managed_dash=0
  _vm_c_mode=0
  _vm_c_skill=0
  _vm_c_install_path=0
  _vm_c_source_path=0
  _vm_c_link_target=0
  _vm_c_file=0
  _vm_total=0

  _vm_v_schema=""
  _vm_v_plugin=""
  _vm_v_managed_by=""
  _vm_v_managed_dash=""
  _vm_v_mode=""
  _vm_v_skill=""
  _vm_v_install_path=""
  _vm_v_source_path=""
  _vm_v_link_target=""

  while IFS= read -r _vm_line || [ -n "$_vm_line" ]; do
    if [ -z "$_vm_line" ]; then
      _OWNERSHIP_ERR="blank line in marker"
      return 1
    fi
    case "$_vm_line" in
      *=*)
        _vm_k="${_vm_line%%=*}"
        _vm_v="${_vm_line#*=}"
        ;;
      *)
        _OWNERSHIP_ERR="malformed line in marker"
        return 1
        ;;
    esac
    _vm_total=$((_vm_total + 1))
    case "$_vm_k" in
      schema_version)
        _vm_c_schema=$((_vm_c_schema + 1))
        _vm_v_schema="$_vm_v"
        ;;
      plugin)
        _vm_c_plugin=$((_vm_c_plugin + 1))
        _vm_v_plugin="$_vm_v"
        ;;
      managed_by)
        _vm_c_managed_by=$((_vm_c_managed_by + 1))
        _vm_v_managed_by="$_vm_v"
        ;;
      managed-by)
        _vm_c_managed_dash=$((_vm_c_managed_dash + 1))
        _vm_v_managed_dash="$_vm_v"
        ;;
      install_mode)
        _vm_c_mode=$((_vm_c_mode + 1))
        _vm_v_mode="$_vm_v"
        ;;
      skill)
        _vm_c_skill=$((_vm_c_skill + 1))
        _vm_v_skill="$_vm_v"
        ;;
      install_path)
        _vm_c_install_path=$((_vm_c_install_path + 1))
        _vm_v_install_path="$_vm_v"
        ;;
      source_path)
        _vm_c_source_path=$((_vm_c_source_path + 1))
        _vm_v_source_path="$_vm_v"
        ;;
      link_target)
        _vm_c_link_target=$((_vm_c_link_target + 1))
        _vm_v_link_target="$_vm_v"
        ;;
      file)
        _vm_c_file=$((_vm_c_file + 1))
        printf '%s\n' "$_vm_v" >> "$_vm_manifest_raw"
        ;;
      *)
        _OWNERSHIP_ERR="unknown marker field: $_vm_k"
        return 1
        ;;
    esac
  done < "$_vm_tmp/marker.clean"

  [ "$_vm_c_schema" -le 1 ] || { _OWNERSHIP_ERR="duplicate required field: schema_version"; return 1; }
  [ "$_vm_c_plugin" -le 1 ] || { _OWNERSHIP_ERR="duplicate required field: plugin"; return 1; }
  [ "$_vm_c_managed_by" -le 1 ] || { _OWNERSHIP_ERR="duplicate metadata field: managed_by"; return 1; }
  [ "$_vm_c_managed_dash" -le 1 ] || { _OWNERSHIP_ERR="duplicate metadata field: managed-by"; return 1; }
  [ "$_vm_c_mode" -le 1 ] || { _OWNERSHIP_ERR="duplicate required field: install_mode"; return 1; }
  [ "$_vm_c_skill" -le 1 ] || { _OWNERSHIP_ERR="duplicate required field: skill"; return 1; }
  [ "$_vm_c_install_path" -le 1 ] || { _OWNERSHIP_ERR="duplicate required field: install_path"; return 1; }
  [ "$_vm_c_source_path" -le 1 ] || { _OWNERSHIP_ERR="duplicate required field: source_path"; return 1; }
  [ "$_vm_c_link_target" -le 1 ] || { _OWNERSHIP_ERR="duplicate metadata field: link_target"; return 1; }

  if [ -n "$_vm_exp_ip_arg" ]; then
    _vm_exp_ip="$_vm_exp_ip_arg"
  else
    _vm_exp_ip="$(resolve_dir "$_vm_dest" || true)"
  fi
  [ -n "$_vm_exp_ip" ] || { _OWNERSHIP_ERR="cannot resolve install_path"; return 1; }

  _vm_exp_sp="$(resolve_dir "$_vm_src" || true)"
  [ -n "$_vm_exp_sp" ] || { _OWNERSHIP_ERR="cannot resolve source_path"; return 1; }

  if [ "$_vm_c_schema" -eq 0 ]; then
    # Explicit legacy v0.1 support: strictly single-line `managed-by=install.sh` + SKILL.md name match
    if [ "$_vm_total" -eq 1 ] && [ "$_vm_c_managed_dash" -eq 1 ] && [ "$_vm_v_managed_dash" = "install.sh" ]; then
      if [ "$_vm_check_skill_md" = "1" ]; then
        if [ ! -f "$_vm_dest/SKILL.md" ] || [ -L "$_vm_dest/SKILL.md" ]; then
          _OWNERSHIP_ERR="legacy marker missing SKILL.md"
          return 1
        fi
        if ! tr -d '\r' < "$_vm_dest/SKILL.md" 2>/dev/null | grep -Fxq -- "name: $_vm_skill"; then
          _OWNERSHIP_ERR="legacy marker SKILL.md name mismatch"
          return 1
        fi
      fi
      _PARSED_SCHEMA_VERSION="legacy-v0.1"
      return 0
    fi
    _OWNERSHIP_ERR="missing required field: schema_version"
    return 1
  fi

  case "$_vm_v_schema" in
    2|1) : ;;
    *)
      _OWNERSHIP_ERR="unsupported schema_version: $_vm_v_schema"
      return 1
      ;;
  esac

  [ "$_vm_c_plugin" -eq 1 ] || { _OWNERSHIP_ERR="missing required field: plugin"; return 1; }
  [ "$_vm_c_skill" -eq 1 ] || { _OWNERSHIP_ERR="missing required field: skill"; return 1; }
  [ "$_vm_c_install_path" -eq 1 ] || { _OWNERSHIP_ERR="missing required field: install_path"; return 1; }
  [ "$_vm_c_source_path" -eq 1 ] || { _OWNERSHIP_ERR="missing required field: source_path"; return 1; }
  [ "$_vm_c_mode" -eq 1 ] || { _OWNERSHIP_ERR="missing required field: install_mode"; return 1; }

  if [ "$_vm_v_schema" = "2" ]; then
    [ "$_vm_c_managed_by" -eq 1 ] && [ "$_vm_v_managed_by" = "install.sh" ] || {
      _OWNERSHIP_ERR="invalid or missing managed_by field"
      return 1
    }
    if [ "$_vm_c_managed_dash" -eq 1 ] && [ "$_vm_v_managed_dash" != "install.sh" ]; then
      _OWNERSHIP_ERR="invalid managed-by field"
      return 1
    fi
  else
    if [ "$_vm_c_managed_by" -eq 1 ] && [ "$_vm_v_managed_by" = "install.sh" ]; then
      :
    elif [ "$_vm_c_managed_dash" -eq 1 ] && [ "$_vm_v_managed_dash" = "install.sh" ]; then
      :
    else
      _OWNERSHIP_ERR="invalid or missing managed_by field"
      return 1
    fi
    [ "$_vm_c_file" -eq 0 ] || {
      _OWNERSHIP_ERR="schema_version=1 does not support file= entries"
      return 1
    }
  fi

  [ "$_vm_v_plugin" = "dev-principles" ] || {
    _OWNERSHIP_ERR="plugin mismatch: $_vm_v_plugin"
    return 1
  }
  [ "$_vm_v_skill" = "$_vm_skill" ] || {
    _OWNERSHIP_ERR="skill mismatch: $_vm_v_skill"
    return 1
  }
  [ "$_vm_v_mode" = "copy" ] || {
    _OWNERSHIP_ERR="install_mode mismatch: $_vm_v_mode"
    return 1
  }

  is_valid_abs_path "$_vm_v_install_path" || {
    _OWNERSHIP_ERR="invalid install_path: $_vm_v_install_path"
    return 1
  }
  [ "$(normalize_path_for_compare "$_vm_v_install_path")" = "$(normalize_path_for_compare "$_vm_exp_ip")" ] || {
    _OWNERSHIP_ERR="install_path mismatch"
    return 1
  }

  is_valid_abs_path "$_vm_v_source_path" || {
    _OWNERSHIP_ERR="invalid source_path: $_vm_v_source_path"
    return 1
  }
  [ "$(normalize_path_for_compare "$_vm_v_source_path")" = "$(normalize_path_for_compare "$_vm_exp_sp")" ] || {
    _OWNERSHIP_ERR="source_path mismatch"
    return 1
  }

  if [ "$_vm_c_link_target" -eq 1 ] && [ -n "$_vm_v_link_target" ]; then
    _OWNERSHIP_ERR="non-empty link_target in copy marker"
    return 1
  fi

  if [ "$_vm_v_schema" = "2" ] && [ "$_vm_c_file" -lt 1 ]; then
    _OWNERSHIP_ERR="empty file list in marker"
    return 1
  fi

  _PARSED_SCHEMA_VERSION="$_vm_v_schema"
  return 0
}

# Returns 0 only when DEST is a dev-principles-managed copy whose metadata,
# directory structure, file manifest, and file contents match the source skill.
is_owned_copy_dir() {
  _oc_dest="$1"
  _oc_skill="$2"
  _oc_src="$3"
  _oc_exp_ip="${4:-}"
  _OWNERSHIP_ERR=""

  reject_unsafe_target "$_oc_dest" >/dev/null 2>&1 || {
    _OWNERSHIP_ERR="unsafe target path"
    return 1
  }
  is_valid_skill_name "$_oc_skill" || {
    _OWNERSHIP_ERR="invalid skill name"
    return 1
  }
  [ -d "$_oc_dest" ] && [ ! -L "$_oc_dest" ] || {
    _OWNERSHIP_ERR="destination is not a regular directory"
    return 1
  }
  [ -d "$_oc_src" ] || {
    _OWNERSHIP_ERR="source skill directory missing"
    return 1
  }

  _oc_tmp="$(ownership_mktemp_dir)" || {
    _OWNERSHIP_ERR="failed to create temporary workspace"
    return 1
  }
  _OWNERSHIP_TMPDIR_VERIFY="$_oc_tmp"

  if ! verify_marker_metadata "$_oc_dest" "$_oc_skill" "$_oc_src" "$_oc_exp_ip" "$_oc_tmp" "$_oc_tmp/manifest.raw" "1"; then
    ownership_rm_tmpdir "$_oc_tmp"
    _OWNERSHIP_TMPDIR_VERIFY=""
    return 1
  fi

  if has_unexpected_entries "$_oc_dest" "$_oc_tmp/actual.bad"; then
    ownership_rm_tmpdir "$_oc_tmp"
    _OWNERSHIP_TMPDIR_VERIFY=""
    return 1
  fi
  if has_unexpected_entries "$_oc_src" "$_oc_tmp/src.bad"; then
    ownership_rm_tmpdir "$_oc_tmp"
    _OWNERSHIP_TMPDIR_VERIFY=""
    return 1
  fi

  if ! collect_dir_files "$_oc_dest" "$_oc_tmp/actual.sorted" "$_oc_tmp/actual.raw" "$_oc_tmp/actual.unsorted" "1"; then
    ownership_rm_tmpdir "$_oc_tmp"
    _OWNERSHIP_TMPDIR_VERIFY=""
    return 1
  fi
  if ! collect_dir_files "$_oc_src" "$_oc_tmp/src.sorted" "$_oc_tmp/src.raw" "$_oc_tmp/src.unsorted" "0"; then
    ownership_rm_tmpdir "$_oc_tmp"
    _OWNERSHIP_TMPDIR_VERIFY=""
    return 1
  fi
  if [ ! -s "$_oc_tmp/src.sorted" ]; then
    _OWNERSHIP_ERR="source skill directory has no files"
    ownership_rm_tmpdir "$_oc_tmp"
    _OWNERSHIP_TMPDIR_VERIFY=""
    return 1
  fi

  if ! collect_dir_subdirs "$_oc_dest" "$_oc_tmp/actual.dirs" "$_oc_tmp/actual.dirs.raw" "$_oc_tmp/actual.dirs.unsorted"; then
    ownership_rm_tmpdir "$_oc_tmp"
    _OWNERSHIP_TMPDIR_VERIFY=""
    return 1
  fi
  if ! collect_dir_subdirs "$_oc_src" "$_oc_tmp/src.dirs" "$_oc_tmp/src.dirs.raw" "$_oc_tmp/src.dirs.unsorted"; then
    ownership_rm_tmpdir "$_oc_tmp"
    _OWNERSHIP_TMPDIR_VERIFY=""
    return 1
  fi

  if [ "$_PARSED_SCHEMA_VERSION" = "2" ]; then
    while IFS= read -r _oc_e || [ -n "$_oc_e" ]; do
      if ! is_safe_relpath "$_oc_e"; then
        _OWNERSHIP_ERR="unsafe relative path in marker file list: $_oc_e"
        ownership_rm_tmpdir "$_oc_tmp"
        _OWNERSHIP_TMPDIR_VERIFY=""
        return 1
      fi
      if [ "$_oc_e" = "$MARKER_FILE" ]; then
        _OWNERSHIP_ERR="marker file must not be listed in file manifest"
        ownership_rm_tmpdir "$_oc_tmp"
        _OWNERSHIP_TMPDIR_VERIFY=""
        return 1
      fi
    done < "$_oc_tmp/manifest.raw"

    LC_ALL=C sort "$_oc_tmp/manifest.raw" > "$_oc_tmp/manifest.sorted"
    LC_ALL=C sort -u "$_oc_tmp/manifest.raw" > "$_oc_tmp/manifest.uniq"
    if ! cmp -s -- "$_oc_tmp/manifest.sorted" "$_oc_tmp/manifest.uniq"; then
      _OWNERSHIP_ERR="duplicate entry in marker file list"
      ownership_rm_tmpdir "$_oc_tmp"
      _OWNERSHIP_TMPDIR_VERIFY=""
      return 1
    fi

    while IFS= read -r _oc_e || [ -n "$_oc_e" ]; do
      if [ -L "$_oc_dest/$_oc_e" ]; then
        _OWNERSHIP_ERR="unexpected symlink inside copy directory: $_oc_e"
        ownership_rm_tmpdir "$_oc_tmp"
        _OWNERSHIP_TMPDIR_VERIFY=""
        return 1
      fi
      if [ ! -f "$_oc_dest/$_oc_e" ]; then
        _OWNERSHIP_ERR="missing managed file: $_oc_e"
        ownership_rm_tmpdir "$_oc_tmp"
        _OWNERSHIP_TMPDIR_VERIFY=""
        return 1
      fi
    done < "$_oc_tmp/manifest.sorted"

    LC_ALL=C comm -23 "$_oc_tmp/actual.sorted" "$_oc_tmp/manifest.sorted" > "$_oc_tmp/comm.out"
    if [ -s "$_oc_tmp/comm.out" ]; then
      IFS= read -r _oc_first < "$_oc_tmp/comm.out" || true
      _OWNERSHIP_ERR="user-added file detected: $_oc_first"
      ownership_rm_tmpdir "$_oc_tmp"
      _OWNERSHIP_TMPDIR_VERIFY=""
      return 1
    fi

    LC_ALL=C comm -13 "$_oc_tmp/actual.sorted" "$_oc_tmp/manifest.sorted" > "$_oc_tmp/comm.out"
    if [ -s "$_oc_tmp/comm.out" ]; then
      IFS= read -r _oc_first < "$_oc_tmp/comm.out" || true
      _OWNERSHIP_ERR="missing managed file: $_oc_first"
      ownership_rm_tmpdir "$_oc_tmp"
      _OWNERSHIP_TMPDIR_VERIFY=""
      return 1
    fi

    if ! cmp -s -- "$_oc_tmp/manifest.sorted" "$_oc_tmp/src.sorted"; then
      _OWNERSHIP_ERR="source/manifest file list mismatch"
      ownership_rm_tmpdir "$_oc_tmp"
      _OWNERSHIP_TMPDIR_VERIFY=""
      return 1
    fi
  else
    LC_ALL=C comm -23 "$_oc_tmp/actual.sorted" "$_oc_tmp/src.sorted" > "$_oc_tmp/comm.out"
    if [ -s "$_oc_tmp/comm.out" ]; then
      IFS= read -r _oc_first < "$_oc_tmp/comm.out" || true
      _OWNERSHIP_ERR="user-added file detected: $_oc_first"
      ownership_rm_tmpdir "$_oc_tmp"
      _OWNERSHIP_TMPDIR_VERIFY=""
      return 1
    fi

    LC_ALL=C comm -13 "$_oc_tmp/actual.sorted" "$_oc_tmp/src.sorted" > "$_oc_tmp/comm.out"
    if [ -s "$_oc_tmp/comm.out" ]; then
      IFS= read -r _oc_first < "$_oc_tmp/comm.out" || true
      _OWNERSHIP_ERR="missing managed file: $_oc_first"
      ownership_rm_tmpdir "$_oc_tmp"
      _OWNERSHIP_TMPDIR_VERIFY=""
      return 1
    fi
  fi

  LC_ALL=C comm -23 "$_oc_tmp/actual.dirs" "$_oc_tmp/src.dirs" > "$_oc_tmp/comm.out"
  if [ -s "$_oc_tmp/comm.out" ]; then
    IFS= read -r _oc_first < "$_oc_tmp/comm.out" || true
    _OWNERSHIP_ERR="user-added directory detected: $_oc_first"
    ownership_rm_tmpdir "$_oc_tmp"
    _OWNERSHIP_TMPDIR_VERIFY=""
    return 1
  fi

  LC_ALL=C comm -13 "$_oc_tmp/actual.dirs" "$_oc_tmp/src.dirs" > "$_oc_tmp/comm.out"
  if [ -s "$_oc_tmp/comm.out" ]; then
    IFS= read -r _oc_first < "$_oc_tmp/comm.out" || true
    _OWNERSHIP_ERR="missing managed directory: $_oc_first"
    ownership_rm_tmpdir "$_oc_tmp"
    _OWNERSHIP_TMPDIR_VERIFY=""
    return 1
  fi

  while IFS= read -r _oc_rel || [ -n "$_oc_rel" ]; do
    if [ -L "$_oc_dest/$_oc_rel" ] || [ ! -f "$_oc_dest/$_oc_rel" ]; then
      _OWNERSHIP_ERR="managed entry is not a regular file: $_oc_rel"
      ownership_rm_tmpdir "$_oc_tmp"
      _OWNERSHIP_TMPDIR_VERIFY=""
      return 1
    fi
    if ! cmp -s -- "$_oc_src/$_oc_rel" "$_oc_dest/$_oc_rel"; then
      if [ "$_PARSED_SCHEMA_VERSION" = "legacy-v0.1" ]; then
        tr -d '\r' < "$_oc_src/$_oc_rel" > "$_oc_tmp/a.lf"
        tr -d '\r' < "$_oc_dest/$_oc_rel" > "$_oc_tmp/b.lf"
        if ! cmp -s -- "$_oc_tmp/a.lf" "$_oc_tmp/b.lf"; then
          _OWNERSHIP_ERR="managed file modified: $_oc_rel"
          ownership_rm_tmpdir "$_oc_tmp"
          _OWNERSHIP_TMPDIR_VERIFY=""
          return 1
        fi
      else
        _OWNERSHIP_ERR="managed file modified: $_oc_rel"
        ownership_rm_tmpdir "$_oc_tmp"
        _OWNERSHIP_TMPDIR_VERIFY=""
        return 1
      fi
    fi
  done < "$_oc_tmp/actual.sorted"

  ownership_rm_tmpdir "$_oc_tmp"
  _OWNERSHIP_TMPDIR_VERIFY=""
  return 0
}

# Verifies ownership; prints reason on stderr.
# $1=dest $2=skill $3=expected source dir $4=action word $5=optional expected install_path
verify_owned_dest() {
  _vo_dest="$1"
  _vo_skill="$2"
  _vo_src="$3"
  _vo_verb="${4:-overwrite}"
  _vo_exp_ip="${5:-}"
  _OWNERSHIP_ERR=""

  if ! reject_unsafe_target "$_vo_dest"; then
    return 1
  fi
  if ! is_valid_skill_name "$_vo_skill"; then
    echo "Refusing to $_vo_verb invalid skill name: $_vo_skill" >&2
    return 1
  fi
  if [ ! -d "$_vo_src" ]; then
    echo "Refusing to $_vo_verb with missing source directory: $_vo_src" >&2
    return 1
  fi

  if [ -L "$_vo_dest" ]; then
    if ! is_owned_symlink "$_vo_dest" "$_vo_src"; then
      echo "Refusing to $_vo_verb symlink not owned by dev-principles: $_vo_dest -> $(readlink -- "$_vo_dest" 2>/dev/null || true) (expected: $_vo_src)" >&2
      return 1
    fi
  elif [ -d "$_vo_dest" ]; then
    if ! is_owned_copy_dir "$_vo_dest" "$_vo_skill" "$_vo_src" "$_vo_exp_ip"; then
      echo "Refusing to $_vo_verb unmanaged or modified directory (${_OWNERSHIP_ERR:-ownership check failed}): $_vo_dest" >&2
      return 1
    fi
  elif [ -e "$_vo_dest" ]; then
    echo "Refusing to $_vo_verb existing non-directory file: $_vo_dest" >&2
    return 1
  fi
  return 0
}

# Verify-then-remove. Never runs rm if verification fails. Copy dirs are removed
# entry by entry (no recursive delete), symlinks only unlink the link itself.
# $1=dest $2=skill $3=expected source dir $4=optional expected install_path
remove_owned_dest() {
  _rm_dest="$1"
  _rm_skill="$2"
  _rm_src="$3"
  _rm_exp_ip="${4:-}"

  if ! reject_unsafe_target "$_rm_dest"; then
    return 1
  fi
  if ! is_valid_skill_name "$_rm_skill"; then
    echo "Refusing to remove invalid skill name: $_rm_skill" >&2
    return 1
  fi
  if [ ! -d "$_rm_src" ]; then
    echo "Refusing to remove with missing source directory: $_rm_src" >&2
    return 1
  fi
  if ! verify_owned_dest "$_rm_dest" "$_rm_skill" "$_rm_src" remove "$_rm_exp_ip"; then
    return 1
  fi

  if [ -L "$_rm_dest" ]; then
    if ! is_owned_symlink "$_rm_dest" "$_rm_src"; then
      echo "Refusing to remove symlink that failed pre-delete re-verification: $_rm_dest" >&2
      return 1
    fi
    rm -- "$_rm_dest"
    return $?
  fi

  if [ -d "$_rm_dest" ]; then
    _rm_tmp="$(ownership_mktemp_dir)" || {
      echo "Failed to create temporary workspace for safe removal: $_rm_dest" >&2
      return 1
    }
    _OWNERSHIP_TMPDIR_REMOVE="$_rm_tmp"

    if ! collect_dir_files "$_rm_dest" "$_rm_tmp/rm.files" "$_rm_tmp/rm.raw" "$_rm_tmp/rm.unsorted" "1"; then
      ownership_rm_tmpdir "$_rm_tmp"
      _OWNERSHIP_TMPDIR_REMOVE=""
      echo "Aborting removal ($_OWNERSHIP_ERR): $_rm_dest" >&2
      return 1
    fi
    if ! collect_dir_subdirs "$_rm_dest" "$_rm_tmp/rm.dirs" "$_rm_tmp/rm.dirs.raw" "$_rm_tmp/rm.dirs.unsorted"; then
      ownership_rm_tmpdir "$_rm_tmp"
      _OWNERSHIP_TMPDIR_REMOVE=""
      echo "Aborting removal ($_OWNERSHIP_ERR): $_rm_dest" >&2
      return 1
    fi

    # Re-verify full directory ownership immediately before deleting the first managed file
    if ! is_owned_copy_dir "$_rm_dest" "$_rm_skill" "$_rm_src" "$_rm_exp_ip"; then
      ownership_rm_tmpdir "$_rm_tmp"
      _OWNERSHIP_TMPDIR_REMOVE=""
      echo "Aborting removal on pre-delete re-verification (${_OWNERSHIP_ERR:-ownership check failed}): $_rm_dest" >&2
      return 1
    fi

    while IFS= read -r _rm_rel || [ -n "$_rm_rel" ]; do
      if ! is_safe_relpath "$_rm_rel" || [ "$_rm_rel" = "$MARKER_FILE" ]; then
        ownership_rm_tmpdir "$_rm_tmp"
        _OWNERSHIP_TMPDIR_REMOVE=""
        echo "Aborting removal due to unsafe managed file path: $_rm_rel" >&2
        return 1
      fi
      if [ -L "$_rm_dest/$_rm_rel" ] || [ ! -f "$_rm_dest/$_rm_rel" ]; then
        ownership_rm_tmpdir "$_rm_tmp"
        _OWNERSHIP_TMPDIR_REMOVE=""
        echo "Aborting removal; target entry is missing or symlink: $_rm_dest/$_rm_rel" >&2
        return 1
      fi
      if ! rm -- "$_rm_dest/$_rm_rel"; then
        ownership_rm_tmpdir "$_rm_tmp"
        _OWNERSHIP_TMPDIR_REMOVE=""
        echo "Aborting removal after error deleting file: $_rm_dest/$_rm_rel" >&2
        return 1
      fi
    done < "$_rm_tmp/rm.files"

    # Separately verify manifest/marker ownership before unlinking the marker itself
    if ! verify_marker_metadata "$_rm_dest" "$_rm_skill" "$_rm_src" "$_rm_exp_ip" "$_rm_tmp" "$_rm_tmp/mf.raw" "0"; then
      ownership_rm_tmpdir "$_rm_tmp"
      _OWNERSHIP_TMPDIR_REMOVE=""
      echo "Aborting marker removal (${_OWNERSHIP_ERR:-marker verification failed}): $_rm_dest/$MARKER_FILE" >&2
      return 1
    fi
    if [ -L "$_rm_dest/$MARKER_FILE" ] || [ ! -f "$_rm_dest/$MARKER_FILE" ]; then
      ownership_rm_tmpdir "$_rm_tmp"
      _OWNERSHIP_TMPDIR_REMOVE=""
      echo "Aborting marker removal; marker missing or symlink: $_rm_dest/$MARKER_FILE" >&2
      return 1
    fi
    if ! rm -- "$_rm_dest/$MARKER_FILE"; then
      ownership_rm_tmpdir "$_rm_tmp"
      _OWNERSHIP_TMPDIR_REMOVE=""
      echo "Aborting removal after error deleting marker: $_rm_dest/$MARKER_FILE" >&2
      return 1
    fi

    LC_ALL=C sort -r "$_rm_tmp/rm.dirs" > "$_rm_tmp/rm.dirs.rev"
    while IFS= read -r _rm_d || [ -n "$_rm_d" ]; do
      if ! is_safe_relpath "$_rm_d"; then
        ownership_rm_tmpdir "$_rm_tmp"
        _OWNERSHIP_TMPDIR_REMOVE=""
        echo "Aborting directory removal due to unsafe path: $_rm_d" >&2
        return 1
      fi
      if [ -L "$_rm_dest/$_rm_d" ] || [ ! -d "$_rm_dest/$_rm_d" ]; then
        ownership_rm_tmpdir "$_rm_tmp"
        _OWNERSHIP_TMPDIR_REMOVE=""
        echo "Aborting directory removal; target is missing or symlink: $_rm_dest/$_rm_d" >&2
        return 1
      fi
      if ! rmdir -- "$_rm_dest/$_rm_d"; then
        ownership_rm_tmpdir "$_rm_tmp"
        _OWNERSHIP_TMPDIR_REMOVE=""
        echo "Directory not empty or could not be removed: $_rm_dest/$_rm_d" >&2
        return 1
      fi
    done < "$_rm_tmp/rm.dirs.rev"

    if [ -L "$_rm_dest" ] || [ ! -d "$_rm_dest" ]; then
      ownership_rm_tmpdir "$_rm_tmp"
      _OWNERSHIP_TMPDIR_REMOVE=""
      echo "Aborting root removal; target is missing or symlink: $_rm_dest" >&2
      return 1
    fi
    if ! rmdir -- "$_rm_dest"; then
      ownership_rm_tmpdir "$_rm_tmp"
      _OWNERSHIP_TMPDIR_REMOVE=""
      echo "Directory not empty or could not be removed after removing managed files: $_rm_dest" >&2
      return 1
    fi

    ownership_rm_tmpdir "$_rm_tmp"
    _OWNERSHIP_TMPDIR_REMOVE=""
  fi
  return 0
}
