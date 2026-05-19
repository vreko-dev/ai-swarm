#!/usr/bin/env bash
# post-merge-scope-check.sh — Verifies all changed files are within the spec's Owned Files scope.
#
# Usage:
#   bash .ai-swarm/scripts/post-merge-scope-check.sh <spec-file> <merge-base-sha> <head-sha>
#
# Arguments:
#   <spec-file>       Path to the spec markdown file (must contain an ## Owned Files section)
#   <merge-base-sha>  The base commit SHA (merge base, e.g. the dev branch tip before merge)
#   <head-sha>        The tip of the task branch being checked
#
# Exit codes:
#   0 — all changed files are within owned scope
#   1 — one or more scope breaches detected, or spec has no Owned Files section
#
# Output:
#   SCOPE_BREACH: <file>   for each file outside the owned scope
#   PASS: all <n> changed files within owned scope

set -euo pipefail

SPEC_FILE="${1:?Usage: post-merge-scope-check.sh <spec-file> <merge-base-sha> <head-sha>}"
BASE_SHA="${2:?Usage: post-merge-scope-check.sh <spec-file> <merge-base-sha> <head-sha>}"
HEAD_SHA="${3:?Usage: post-merge-scope-check.sh <spec-file> <merge-base-sha> <head-sha>}"

if [ ! -f "$SPEC_FILE" ]; then
  echo "ERROR: Spec file not found: $SPEC_FILE" >&2
  exit 1
fi

# ── Extract Owned Files section ───────────────────────────────────────────────
# Lines between "## Owned Files" and the next "##" heading or EOF.
# Strip code fence markers, inline comments (← ...), and blank lines.
OWNED_PATTERNS=()
in_section=0
while IFS= read -r line; do
  if [[ "$line" =~ ^##[[:space:]]+Owned[[:space:]]+Files ]]; then
    in_section=1
    continue
  fi
  if [[ $in_section -eq 1 ]] && [[ "$line" =~ ^## ]]; then
    break
  fi
  if [[ $in_section -eq 1 ]]; then
    # Strip code fence, leading/trailing whitespace, inline comments
    cleaned=$(echo "$line" \
      | sed 's/```//g' \
      | sed 's/[[:space:]]*←.*$//' \
      | sed 's/^[[:space:]]*//' \
      | sed 's/[[:space:]]*$//')
    # Skip blank lines, comment lines, and HTML comments
    if [[ -z "$cleaned" ]] || [[ "$cleaned" =~ ^# ]] || [[ "$cleaned" =~ ^\<\!-- ]]; then
      continue
    fi
    OWNED_PATTERNS+=("$cleaned")
  fi
done < "$SPEC_FILE"

if [ "${#OWNED_PATTERNS[@]}" -eq 0 ]; then
  echo "ERROR: Spec has no Owned Files section or section is empty: $SPEC_FILE" >&2
  echo "       Add a '## Owned Files' section listing all files this spec may touch." >&2
  exit 1
fi

# ── Get changed files ─────────────────────────────────────────────────────────
CHANGED_FILES=$(git diff --name-only "${BASE_SHA}..${HEAD_SHA}" 2>/dev/null || true)

if [ -z "$CHANGED_FILES" ]; then
  echo "PASS: no changed files in range ${BASE_SHA}..${HEAD_SHA}"
  exit 0
fi

# ── fnmatch-style glob matching ───────────────────────────────────────────────
# Uses bash glob matching. ** is treated as matching any path segment(s).
# Converts ** globs to a bash extglob equivalent.
matches_any_pattern() {
  local file="$1"
  local pattern
  for pattern in "${OWNED_PATTERNS[@]}"; do
    # Exact match
    if [[ "$file" == "$pattern" ]]; then
      return 0
    fi
    # Simple ** glob: convert to case pattern
    # e.g. "src/**" matches "src/foo/bar.ts"
    local glob_pattern
    glob_pattern=$(echo "$pattern" | sed 's|\*\*|*|g')
    # shellcheck disable=SC2254
    case "$file" in
      $glob_pattern) return 0 ;;
    esac
    # Allow pattern to match as a path prefix (directory ownership)
    if [[ "$file" == "$pattern/"* ]]; then
      return 0
    fi
  done
  return 1
}

# ── Check each changed file ───────────────────────────────────────────────────
BREACH_COUNT=0
TOTAL_COUNT=0

while IFS= read -r changed_file; do
  [ -z "$changed_file" ] && continue
  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  if ! matches_any_pattern "$changed_file"; then
    echo "SCOPE_BREACH: $changed_file"
    BREACH_COUNT=$((BREACH_COUNT + 1))
  fi
done <<< "$CHANGED_FILES"

# ── Result ────────────────────────────────────────────────────────────────────
if [ "$BREACH_COUNT" -gt 0 ]; then
  echo ""
  echo "FAIL: $BREACH_COUNT scope breach(es) detected in $TOTAL_COUNT changed file(s)"
  echo "      Review the spec's Owned Files section and either:"
  echo "      1. Add the breaching file to Owned Files (if intentional), or"
  echo "      2. Revert changes to the breaching file (if unintentional scope creep)"
  exit 1
fi

echo "PASS: all $TOTAL_COUNT changed file(s) within owned scope"
exit 0
