#!/usr/bin/env bash
# Validates that an agent output report has required sections
# before the conductor accepts it as complete.
#
# Usage: validate-agent-output.sh <report-file> <agent-role>
# Exit 0: valid. Exit 1: invalid (missing required sections).

set -euo pipefail

REPORT="${1:-}"
ROLE="${2:-}"

[ -n "$REPORT" ] || { echo "Usage: validate-agent-output.sh <report-file> <role>"; exit 1; }
[ -f "$REPORT" ] || { echo "Report file not found: $REPORT"; exit 1; }

PASS=0
FAIL=0

check_section() {
  local label="$1"
  local pattern="$2"
  if grep -qE "$pattern" "$REPORT"; then
    echo "  v $label"
    PASS=$((PASS + 1))
  else
    echo "  x MISSING: $label"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Validating: $REPORT ==="
echo "=== Role: $ROLE ==="
echo ""

case "$ROLE" in
  adversarial-reviewer)
    check_section "Verdict (BLOCK|PASS)"           "Verdict:.*(BLOCK|PASS)"
    check_section "Blocking Issues section"         "## Blocking Issues"
    check_section "Notes section"                   "## Notes"
    check_section "Adversarial Scenarios table"     "## Adversarial Scenarios"
    check_section "Ratchet Delta table"             "## Ratchet Delta"
    check_section "HEAD SHA recorded"              "HEAD SHA|head_sha"
    check_section "Verification Commands Run"       "Verification Commands Run|VERIFICATION COMMANDS"
    ;;
  auditor)
    check_section "Pre-implementation audit table"  "## (Pre-implementation|Audit|Section|Phase [A-Z])"
    check_section "HEAD SHA recorded"              "HEAD SHA|head_sha|HEAD:"
    check_section "Verification gate"               "## Verification|PASS|FAIL"
    check_section "Single highest-priority action"  "highest.priority|Single.*action|Next"
    ;;
  spec-writer)
    check_section "Pre-implementation audit table"  "Pre-implementation audit|## Audit"
    check_section "DO NOT list"                     "DO NOT|## DO NOT"
    check_section "Phased delivery"                 "## Phase [0-9]|Phase [0-9] .."
    check_section "Shell-verifiable gate"           "Gate verification|PASS.*FAIL|\`\`\`bash"
    check_section "Rollback section"                "## Rollback|Rollback:"
    ;;
  technical-writer)
    check_section "CHANGELOG entry"                "## CHANGELOG|CHANGELOG entry"
    check_section "Spec disposition"               "## Spec disposition|ARCHIVED|KEEP ACTIVE"
    check_section "Release checklist delta"         "release checklist|pre.release checklist"
    ;;
  release-manager)
    check_section "Readiness gate"                  "readiness gate|readiness check"
    check_section "All checks present"              "PASS|HOLD"
    check_section "Overall gate verdict"            "Overall gate"
    check_section "Version bump recorded"           "Version bump|Old:.*New:"
    check_section "Post-release health"             "Post-release health"
    ;;
  *)
    echo "Unknown role: $ROLE"
    echo "Known roles: adversarial-reviewer, auditor, spec-writer, technical-writer, release-manager"
    exit 1
    ;;
esac

echo ""
echo "PASS: $PASS  FAIL: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Report is INVALID. Conductor must not accept this output."
  echo "Return to the responsible agent with the missing sections listed above."
  exit 1
fi

echo ""
echo "Report is VALID. Conductor may proceed."
exit 0
