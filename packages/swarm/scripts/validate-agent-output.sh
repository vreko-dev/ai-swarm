#!/bin/sh
#
# validate-agent-output.sh — Validate agent output reports for required sections.
#
# Usage:
#   bash .ai-swarm/scripts/validate-agent-output.sh <role> <report-path>
#
# Exit codes:
#   0 — report is valid
#   1 — report is missing required sections

set -eu

ROLE="${1:-}"
REPORT_PATH="${2:-}"

if [ -z "$ROLE" ] || [ -z "$REPORT_PATH" ]; then
  echo "ERROR: usage: validate-agent-output.sh <role> <report-path>" >&2
  exit 1
fi

if [ ! -f "$REPORT_PATH" ]; then
  echo "ERROR: report file not found: $REPORT_PATH" >&2
  exit 1
fi

echo "=== Agent Output Validation ==="
echo "Role: $ROLE"
echo "Report: $REPORT_PATH"
echo ""

ERRORS=0

# Define required sections per role
check_section() {
  local section="$1"
  if ! grep -q "$section" "$REPORT_PATH" 2>/dev/null; then
    echo "FAIL: Missing required section: $section"
    ERRORS=$((ERRORS + 1))
  else
    echo "PASS: $section present."
  fi
}

case "$ROLE" in
  auditor)
    check_section "## Findings"
    check_section "## Verdict"
    check_section "HEAD SHA"
    ;;
  spec-writer)
    check_section "## Owned Files"
    check_section "## Exclusion Fence"
    check_section "## Verification"
    ;;
  implementer)
    check_section "## Phase"
    check_section "## Verification"
    ;;
  drift-detector)
    check_section "## Summary"
    ;;
  adversarial-reviewer|reviewer)
    check_section "## Build"
    check_section "## Verdict"
    check_section "Blocking Issues"
    check_section "Ratchet Delta"
    ;;
  gatekeeper)
    check_section "## Verification"
    ;;
  integrator)
    check_section "## Post-merge"
    ;;
  researcher)
    check_section "## Knowledge"
    ;;
  devsecops)
    check_section "## Changes"
    check_section "## Verification"
    ;;
  technical-writer)
    check_section "## CHANGELOG"
    check_section "## Spec disposition"
    check_section "retro_kind"
    ;;
  release-manager)
    check_section "## Readiness gate"
    check_section "## Version bump"
    ;;
  conductor|master-coordinator)
    check_section "## Status"
    ;;
  *)
    echo "FAIL: Unknown role '$ROLE'. No validation rules defined." >&2
    exit 1
    ;;
esac

echo ""
echo "=== Summary ==="
if [ "$ERRORS" -gt 0 ]; then
  echo "FAIL: $ERRORS missing section(s)."
  exit 1
fi

echo "PASS: Report is valid."
exit 0
