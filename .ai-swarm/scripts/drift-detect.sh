#!/usr/bin/env bash
set -euo pipefail

# Spec-aware drift detection — checks ONLY what CI cannot.
# CI owns: types, lint, tests, bundle, dead code, import boundaries.
# This script owns: spec exclusion fence, deferred work, AP-1/AP-2/AP-3,
#                   external-findings presence, RPC registration, completion count.
#
# Usage: ./drift-detect.sh <task-branch> <spec-file> [base-branch]
BRANCH="${1:?Usage: drift-detect.sh <task-branch> <spec-file> [base-branch]}"
SPEC="${2:?Usage: drift-detect.sh <task-branch> <spec-file> [base-branch]}"
BASE="${3:-dev}"
VIOLATIONS=0
WARNINGS=0

ANTI_PATTERNS_FILE=".ai-swarm/docs/reference/anti-patterns.md"

# ── Read anti-patterns dynamically from reference file ────────────────────────
if [ -f "$ANTI_PATTERNS_FILE" ]; then
  AP2_PATTERN=$(sed -n '/<!-- DRIFT-PATTERNS/,/-->/p' "$ANTI_PATTERNS_FILE" \
    | grep "^AP-2:" | sed 's/^AP-2: //' 2>/dev/null || true)
  AP3_PATTERN=$(sed -n '/<!-- DRIFT-PATTERNS/,/-->/p' "$ANTI_PATTERNS_FILE" \
    | grep "^AP-3:" | sed 's/^AP-3: //' 2>/dev/null || true)
fi
AP2_PATTERN="${AP2_PATTERN:-THRESHOLD|WEIGHT|LIMIT|SCALE|SCORE}"
AP3_PATTERN="${AP3_PATTERN:-catch[[:space:]]*\([^)]*\)[[:space:]]*\{[[:space:]]*\}}"

echo "=== Spec-Aware Drift Detector ==="
echo "Branch: $BRANCH  Base: $BASE  Spec: $SPEC"
echo "Anti-patterns file: ${ANTI_PATTERNS_FILE} ($([ -f "$ANTI_PATTERNS_FILE" ] && echo "FOUND" || echo "USING DEFAULTS"))"
echo ""

DIFF="git diff ${BASE}...${BRANCH}"

# ─────────────────────────────────────────────────────────────
# 1. Exclusion Fence — spec-forbidden files touched?
# ─────────────────────────────────────────────────────────────
echo "--- [1/6] Exclusion Fence ---"
FENCE_HITS=0
FORBIDDEN_FILES=$(grep -iE "(do not touch|exclusion|forbidden|off.limits)" "$SPEC" 2>/dev/null \
  | grep -oE '[a-zA-Z0-9_./-]+\.(ts|tsx|js|json|yml|yaml)' || true)
TOUCHED=$($DIFF --name-only 2>/dev/null || true)
if [ -n "$FORBIDDEN_FILES" ]; then
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if echo "$TOUCHED" | grep -qF "$f"; then
      echo "VIOLATION: $f touched (spec exclusion fence)"
      FENCE_HITS=$((FENCE_HITS + 1))
    fi
  done <<< "$FORBIDDEN_FILES"
  [ "$FENCE_HITS" -eq 0 ] && echo "PASS"
  VIOLATIONS=$((VIOLATIONS + FENCE_HITS))
else
  echo "PASS (no exclusion fence in spec)"
fi

# ─────────────────────────────────────────────────────────────
# 2. Deferred Work — implementing something explicitly blocked?
# ─────────────────────────────────────────────────────────────
echo ""
echo "--- [2/6] Deferred Work ---"
DEFERRED_FILE=".ai-swarm/docs/reference/deferred-work.md"
DEFERRED_HITS=0
if [ -f "$DEFERRED_FILE" ]; then
  DEFERRED_ITEMS=$(grep -oE 'D[0-9]+\s+[A-Za-z][-A-Za-z ]+' "$DEFERRED_FILE" 2>/dev/null \
    | sed 's/D[0-9]* //' | tr ' ' '\n' | grep -E '^[A-Za-z]{4,}' | sort -u || true)
  NEW_FILES=$($DIFF --diff-filter=A --name-only 2>/dev/null || true)
  while IFS= read -r keyword; do
    [ -z "$keyword" ] && continue
    if echo "$NEW_FILES" | grep -iqE "$keyword"; then
      echo "WARN: new file matches deferred keyword '$keyword' — verify not implementing deferred work"
      DEFERRED_HITS=$((DEFERRED_HITS + 1))
    fi
  done <<< "$DEFERRED_ITEMS"
  [ "$DEFERRED_HITS" -eq 0 ] && echo "PASS"
  WARNINGS=$((WARNINGS + DEFERRED_HITS))
else
  echo "SKIP (deferred-work.md not found)"
fi

# ─────────────────────────────────────────────────────────────
# 3. Anti-Patterns AP-1 + AP-2 + AP-3
# ─────────────────────────────────────────────────────────────
echo ""
echo "--- [3/6] Anti-Patterns (AP-1 graceful empties, AP-2 inlined constants, AP-3 silent catches) ---"

# AP-1: graceful empty returns — semantic, linters won't catch these
EMPTY_RETURNS=$($DIFF 2>/dev/null | grep "^+" \
  | grep -cE "return \[\]|return \{\}|return null" || true)
if [ "$EMPTY_RETURNS" -gt 0 ]; then
  echo "VIOLATION: $EMPTY_RETURNS graceful empty return(s) — AP-1 (masks missing capability)"
  $DIFF | grep "^+" | grep -E "return \[\]|return \{\}|return null" | grep -v "test\|spec\|mock" || true
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo "PASS (AP-1)"
fi

# AP-2: inlined constants that should route through a service layer (pattern from anti-patterns.md)
INLINED=$($DIFF 2>/dev/null | grep "^+" \
  | grep -cE "const[[:space:]]+($AP2_PATTERN)" || true)
if [ "$INLINED" -gt 0 ]; then
  echo "WARN: $INLINED possible inlined constant(s) — AP-2 (verify routing) [pattern: $AP2_PATTERN]"
  WARNINGS=$((WARNINGS + 1))
else
  echo "PASS (AP-2)"
fi

# AP-3: silent empty catch blocks (pattern from anti-patterns.md)
SILENT_CATCHES=$($DIFF 2>/dev/null | grep "^+" \
  | grep -cE "$AP3_PATTERN" || true)
if [ "$SILENT_CATCHES" -gt 0 ]; then
  echo "VIOLATION: $SILENT_CATCHES silent empty catch block(s) — AP-3 (swallows errors)"
  $DIFF | grep "^+" | grep -E "$AP3_PATTERN" | grep -v "test\|spec\|mock" || true
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo "PASS (AP-3)"
fi

# ─────────────────────────────────────────────────────────────
# 4. RPC Registration Completeness
# ─────────────────────────────────────────────────────────────
echo ""
echo "--- [4/6] RPC Registration ---"
# Customize these paths for your project's contracts and protocol files
NEW_METHODS=$($DIFF -- packages/contracts/ 2>/dev/null \
  | grep "^+" | grep -oE '"[a-z]+/[a-z][a-z/]+"' | sort -u || true)
REG_VIOLATIONS=0
if [ -n "$NEW_METHODS" ]; then
  echo "INFO: New RPC methods detected — verify registration in protocol and contracts"
  echo "$NEW_METHODS"
  # Add project-specific registration checks here:
  # while IFS= read -r method; do
  #   [ -z "$method" ] && continue
  #   CLEAN=$(echo "$method" | tr -d '"')
  #   P1=$(grep -ql "$CLEAN" <protocol-file> 2>/dev/null && echo "✓" || echo "MISSING")
  #   P2=$(grep -rql "$CLEAN" packages/contracts/ 2>/dev/null && echo "✓" || echo "MISSING")
  #   if [ "$P1" = "MISSING" ] || [ "$P2" = "MISSING" ]; then
  #     echo "VIOLATION: $method — protocol:$P1 contracts:$P2"
  #     REG_VIOLATIONS=$((REG_VIOLATIONS + 1))
  #   fi
  # done <<< "$NEW_METHODS"
  [ "$REG_VIOLATIONS" -eq 0 ] && echo "PASS (verify manually)"
  VIOLATIONS=$((VIOLATIONS + REG_VIOLATIONS))
else
  echo "PASS (no new RPC methods)"
fi

# ─────────────────────────────────────────────────────────────
# 5. Completion Count
# ─────────────────────────────────────────────────────────────
echo ""
echo "--- [5/6] Completion Count ---"
SPEC_TASKS=$(grep -cE "^- \[.?\]|^### (Task|Phase|Step)" "$SPEC" 2>/dev/null || echo "0")
echo "INFO: Spec declares $SPEC_TASKS task items — verify Implementer handoff matches"

# ─────────────────────────────────────────────────────────────
# 6. External-Findings Presence — audit report protocol compliance
# ─────────────────────────────────────────────────────────────
echo ""
echo "--- [6/6] External-Findings Presence ---"
# Derive task ID from branch name (task/<id> → <id>)
TASK_ID=$(echo "$BRANCH" | sed 's|^task/||')
AUDIT_REPORT="audit-findings/${TASK_ID}-audit.md"
if [ -f "$AUDIT_REPORT" ]; then
  if grep -q "external-findings:" "$AUDIT_REPORT"; then
    echo "PASS (external-findings field present in $AUDIT_REPORT)"
  else
    echo "VIOLATION: '$AUDIT_REPORT' is missing required 'external-findings:' field — protocol violation per canon §2.3 / Template 6"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
else
  echo "SKIP (no audit report at $AUDIT_REPORT — check audit-findings/ directory)"
fi

# ─────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────
echo ""
echo "=== SUMMARY ==="
echo "Violations: $VIOLATIONS | Warnings: $WARNINGS"
echo "Note: types/lint/tests/bundle/imports → CI. This script = spec-aware checks only."

if [ "$VIOLATIONS" -gt 0 ]; then
  echo "RESULT: FAIL — $VIOLATIONS spec-aware violation(s)"
  exit 1
else
  echo "RESULT: PASS (with $WARNINGS warning(s))"
  exit 0
fi
