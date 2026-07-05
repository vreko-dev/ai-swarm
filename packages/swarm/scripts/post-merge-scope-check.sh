#!/bin/sh
#
# post-merge-scope-check.sh — Verify all changed files are within spec's Owned Files.
#
# Usage:
#   bash .ai-swarm/scripts/post-merge-scope-check.sh <spec-path> [base-ref] [head-ref]
#
# Exit codes:
#   0 — all changes within scope
#   1 — out-of-scope changes detected

set -eu

SPEC_PATH="${1:-}"
BASE_REF="${2:-origin/dev}"
HEAD_REF="${3:-HEAD}"

if [ -z "$SPEC_PATH" ]; then
  echo "ERROR: usage: post-merge-scope-check.sh <spec-path> [base-ref] [head-ref]" >&2
  exit 1
fi

if [ ! -f "$SPEC_PATH" ]; then
  echo "ERROR: spec file not found: $SPEC_PATH" >&2
  exit 1
fi

echo "=== Post-Merge Scope Check ==="
echo "Spec: $SPEC_PATH"
echo "Base: $BASE_REF"
echo "Head: $HEAD_REF"
echo ""

# Extract owned file patterns from spec
OWNED_PATTERNS=$(awk '/## Owned Files/{found=1; next} /^## /{found=0} found && /^[-*] /{gsub(/^[-*] /, ""); print}' "$SPEC_PATH" 2>/dev/null || echo "")

if [ -z "$OWNED_PATTERNS" ]; then
  echo "WARN: No Owned Files section found in spec. Cannot verify scope."
  exit 0
fi

echo "Owned file patterns:"
echo "$OWNED_PATTERNS" | sed 's/^/  /'
echo ""

# Get changed files
CHANGED_FILES=$(git diff --name-only --diff-filter=ACMR "$BASE_REF...$HEAD_REF" 2>/dev/null || echo "")

if [ -z "$CHANGED_FILES" ]; then
  echo "PASS: No changed files."
  exit 0
fi

OUT_OF_SCOPE=0

echo "Checking changed files..."
for file in $CHANGED_FILES; do
  MATCHED=0
  while IFS= read -r pattern; do
    # Convert glob pattern to regex
    regex=$(echo "$pattern" | sed 's/\./\\./g; s/\*/.*/g; s/\?/./g')
    if echo "$file" | grep -qE "^${regex}$" 2>/dev/null; then
      MATCHED=1
      break
    fi
  done <<EOF
$OWNED_PATTERNS
EOF

  if [ "$MATCHED" -eq 0 ]; then
    echo "SCOPE_BREACH: $file"
    OUT_OF_SCOPE=$((OUT_OF_SCOPE + 1))
  fi
done

echo ""
echo "=== Summary ==="
TOTAL=$(echo "$CHANGED_FILES" | wc -l | tr -d ' ')
IN_SCOPE=$((TOTAL - OUT_OF_SCOPE))

echo "Total changed: $TOTAL"
echo "In scope: $IN_SCOPE"
echo "Out of scope: $OUT_OF_SCOPE"

if [ "$OUT_OF_SCOPE" -gt 0 ]; then
  echo "FAIL: $OUT_OF_SCOPE file(s) out of scope."
  exit 1
fi

echo "PASS: All changes within scope."
exit 0
