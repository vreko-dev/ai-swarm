#!/bin/sh
#
# check-definition-of-ready.sh — Validate that a spec is dispatch-ready.
#
# Usage:
#   bash .ai-swarm/scripts/check-definition-of-ready.sh <spec-path>
#
# Exit codes:
#   0 — spec is ready
#   1 — spec is not ready

set -eu

SPEC_PATH="${1:-}"

if [ -z "$SPEC_PATH" ]; then
  echo "ERROR: usage: check-definition-of-ready.sh <spec-path>" >&2
  exit 1
fi

if [ ! -f "$SPEC_PATH" ]; then
  echo "ERROR: spec file not found: $SPEC_PATH" >&2
  exit 1
fi

ERRORS=0

echo "=== Definition of Ready Check ==="
echo "Spec: $SPEC_PATH"
echo ""

# 1. Owned Files section
echo "--- 1. Owned Files section ---"
OWNED_COUNT=$(grep -c "## Owned Files" "$SPEC_PATH" 2>/dev/null || echo "0")
if [ "$OWNED_COUNT" -lt 1 ]; then
  echo "FAIL: Missing '## Owned Files' section."
  ERRORS=$((ERRORS + 1))
else
  echo "PASS: Owned Files section present."
fi
echo ""

# 2. Shell-verifiable gate language
echo "--- 2. Shell-verifiable gates ---"
GATE_COUNT=$(grep -cE '```bash' "$SPEC_PATH" 2>/dev/null || echo "0")
if [ "$GATE_COUNT" -lt 1 ]; then
  echo "FAIL: No bash code blocks found. Spec must have shell-verifiable gates."
  ERRORS=$((ERRORS + 1))
else
  echo "PASS: $GATE_COUNT bash code block(s) found."
fi
echo ""

# 3. REQ-NNN format
echo "--- 3. REQ-NNN format ---"
REQ_COUNT=$(grep -cE '^###\s+REQ-[0-9]+' "$SPEC_PATH" 2>/dev/null || echo "0")
if [ "$REQ_COUNT" -lt 1 ]; then
  echo "WARN: No REQ-NNN formatted requirements found."
else
  echo "PASS: $REQ_COUNT requirement(s) in REQ-NNN format."
fi
echo ""

# 4. No unreplaced template placeholders
echo "--- 4. Template placeholders ---"
PLACEHOLDERS=$(grep -oE '\{\{[A-Z_]+\}\}' "$SPEC_PATH" 2>/dev/null || echo "")
if [ -n "$PLACEHOLDERS" ]; then
  echo "FAIL: Unreplaced template placeholders found:"
  echo "$PLACEHOLDERS" | sort -u | sed 's/^/  /'
  ERRORS=$((ERRORS + 1))
else
  echo "PASS: No unreplaced placeholders."
fi
echo ""

# 5. Verification commands
echo "--- 5. Verification commands ---"
VERIFY_COUNT=$(grep -cE '(test|grep|wc|npm|pnpm|yarn|npx|tsc|eslint)' "$SPEC_PATH" 2>/dev/null || echo "0")
if [ "$VERIFY_COUNT" -lt 1 ]; then
  echo "WARN: No verification commands found in spec."
else
  echo "PASS: $VERIFY_COUNT verification command(s) found."
fi
echo ""

# Summary
echo "=== Summary ==="
if [ "$ERRORS" -gt 0 ]; then
  echo "FAIL: $ERRORS error(s) found. Spec is not dispatch-ready."
  exit 1
fi

echo "PASS: Spec is dispatch-ready."
exit 0
