#!/usr/bin/env bash
# Source from Bash entrypoints before applying defaults. Values are never logged.
for mst_suffix in CONFIG PG_DSN SKILL_DIR LLM_PROVIDER LLM_MODEL LLM_BASE_URL LLM_PROXY LLM_STREAM \
  NOTIFY_ALLOW_LOCAL REPEATER_ALLOW_LOCAL BTW_MAX_OUTPUT_TOKENS SELFUPDATE_SMOKE \
  TARGET_OS TARGET_ARCH TARGETS BUILD_VERSION OUTPUT OUTPUT_DIR PACKAGE PACKAGE_DIR \
  COMPRESS UPX_ARGS SKIP_FRONTEND SKIP_NPM_CI GOSUMDB RELEASE IMAGE TAG RESET_NEWPASS; do
  mst_current="MYSTERYSECURITYTEAM_${mst_suffix}"
  mst_legacy="ARTEX_${mst_suffix}"
  if ! declare -p "$mst_current" >/dev/null 2>&1 && declare -p "$mst_legacy" >/dev/null 2>&1; then
    export "$mst_current=${!mst_legacy}"
    printf '[config] %s is deprecated; use %s\n' "$mst_legacy" "$mst_current" >&2
  fi
done
unset mst_suffix mst_current mst_legacy
