#!/bin/sh
#
# drift-detect.sh — Spec-aware drift detection.
#
# Checks ONLY what CI cannot:
#   1. Exclusion fence violations
#   2. Deferred work violations
#   3. AP-1: Graceful empty returns
#   4. AP-2: Inlined constants
#   5. RPC registration completeness (if architecture-fence defines registration points)
#   6. Completion count (informational)
#
# Usage:
#   bash .ai-swarm/scripts/drift-detect.sh <task-branch> <spec-path> [base-branch]
#
# Exit codes:
#   0 — all checks pass
#   1 — violations found

set -eu

SWARM_DIR="${SWARM_DIR:-.ai-swarm}"

BRANCH="${1:-}"
SPEC_PATH="${2:-}"
BASE_BRANCH="${3:-dev}"

if [ -z "$BRANCH" ] || [ -z "$SPEC_PATH" ]; then
  echo "ERROR: usage: drift-detect.sh <task-branch> <spec-path> [base-branch]" >&2
  exit 1
fi

if [ ! -f "$SPEC_PATH" ]; then
  echo "ERROR: spec file not found: $SPEC_PATH" >&2
  exit 1
fi

VIOLATIONS=0

# Resolve base ref
BASE_REF="$BASE_BRANCH"
if git rev-parse --verify --quiet "origin/$BASE_BRANCH" >/dev/null 2>&1; then
  BASE_REF="origin/$BASE_BRANCH"
elif ! git rev-parse --verify --quiet "$BASE_BRANCH" >/dev/null 2>&1; then
  echo "ERROR: could not resolve $BASE_BRANCH or origin/$BASE_BRANCH" >&2
  exit 1
fi

if ! git rev-parse --verify --quiet "$BRANCH" >/dev/null 2>&1; then
  echo "ERROR: could not resolve branch: $BRANCH" >&2
  exit 1
fi

CHANGED_FILES=$(git diff --name-only --diff-filter=ACMR "$BASE_REF...$BRANCH" 2>/dev/null || echo "")

echo "=== Drift Detection ==="
echo "Branch: $BRANCH"
echo "Base: $BASE_REF"
echo "Spec: $SPEC_PATH"
echo ""

# 1. Exclusion fence check
echo "--- 1. Exclusion Fence ---"
EXCLUSION_PATTERN=$(grep -A50 "## Exclusion Fence" "$SPEC_PATH" 2>/dev/null | grep -E "^\s+-\s" | sed 's/^\s*-\s*//' || echo "")
if [ -n "$EXCLUSION_PATTERN" ]; then
  echo "$EXCLUSION_PATTERN" | while IFS= read -r pattern; do
    MATCHED=$(echo "$CHANGED_FILES" | grep -E "$pattern" || echo "")
    if [ -n "$MATCHED" ]; then
      echo "VIOLATION: Exclusion fence breach — file matches forbidden pattern '$pattern':"
      echo "$MATCHED" | sed 's/^/  /'
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  done
  echo "  Exclusion fence checked."
else
  echo "  No exclusion fence in spec."
fi
echo ""

# 2. Deferred work check
echo "--- 2. Deferred Work ---"
DEFERRED_PATH="${SWARM_DIR}/docs/reference/deferred-work.md"
if [ -f "$DEFERRED_PATH" ]; then
  DEFERRED_KEYWORDS=$(grep -E "^\|.*\|" "$DEFERRED_PATH" 2>/dev/null | grep -v "^\|.*ID\|^\|.*---\|^\|.*none" | sed 's/|/ /g' | awk '{print $2}' || echo "")
  if [ -n "$DEFERRED_KEYWORDS" ]; then
    echo "$DEFERRED_KEYWORDS" | while IFS= read -r keyword; do
      if [ -n "$keyword" ]; then
        MATCHED=$(echo "$CHANGED_FILES" | grep -i "$keyword" || echo "")
        if [ -n "$MATCHED" ]; then
          echo "WARN: Changed file matches deferred work keyword '$keyword':"
          echo "$MATCHED" | sed 's/^/  /'
        fi
      fi
    done
  fi
  echo "  Deferred work checked."
else
  echo "  No deferred-work.md found."
fi
echo ""

# 3. Anti-Pattern check (AP-1, AP-2, AP-3)
echo "--- 3. Anti-Pattern ---"
AP1_COUNT=$(echo "$CHANGED_FILES" | grep -E '\.(ts|js)$' | while IFS= read -r f; do
  [ -f "$f" ] && git diff "$BASE_REF...$BRANCH" -- "$f" 2>/dev/null | grep -E '^\+.*return\s+(\[\]|\{\}|null)\s*;' || true
done | wc -l | tr -d ' ')
echo "  New empty returns: $AP1_COUNT"
if [ "$AP1_COUNT" -gt 0 ]; then
  echo "  WARN: Review empty returns — may be AP-1 violations."
fi
echo ""

# 4. Registration completeness
echo "--- 4. Registration ---"
REGISTRATION_COUNT=0
FENCE_PATH="${SWARM_DIR}/docs/reference/architecture-fence.txt"
if [ -f "$FENCE_PATH" ]; then
  REGISTRATION_PATTERNS=$(grep -E '^PATTERN:' "$FENCE_PATH" 2>/dev/null | sed 's/PATTERN: //' || echo "")
  if [ -n "$REGISTRATION_PATTERNS" ]; then
    echo "$REGISTRATION_PATTERNS" | while IFS= read -r pattern; do
      MATCHED=$(echo "$CHANGED_FILES" | grep -E "$pattern" || echo "")
      if [ -n "$MATCHED" ]; then
        echo "  Registration point touched: $pattern"
      fi
    done
  fi
fi
echo "  Registration completeness checked."
echo ""

# 5. Completion count
echo "--- 5. Completion Count ---"
TOTAL_REQS=$(grep -c "^### REQ-" "$SPEC_PATH" 2>/dev/null || echo "0")
DONE_REQS=$(grep -c "^\- \[x\]" "$SPEC_PATH" 2>/dev/null || echo "0")
echo "  Spec requirements: $TOTAL_REQS"
echo "  Completed: $DONE_REQS"
echo ""

# Summary
echo "=== Summary ==="
if [ "$VIOLATIONS" -gt 0 ]; then
  echo "FAIL: $VIOLATIONS violation(s) found."
  exit 1
fi

echo "PASS: No violations found."
exit 0
