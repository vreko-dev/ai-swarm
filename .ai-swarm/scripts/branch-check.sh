#!/usr/bin/env bash
# branch-check.sh — Shared branch isolation guard for all swarm agents.
#
# Usage:
#   bash .ai-swarm/scripts/branch-check.sh <expected-branch>
#     → PASS if current branch matches expected-branch exactly.
#
#   bash .ai-swarm/scripts/branch-check.sh <branch-a> <branch-b> [...]
#     → PASS if current branch matches ANY of the listed branches.
#       Use for post-merge agents: branch-check.sh dev main
#
#   bash .ai-swarm/scripts/branch-check.sh --not-main
#     → PASS if current branch is NOT main.
#       Use for standalone agents (researcher, devsecops without a spec).
#
#   bash .ai-swarm/scripts/branch-check.sh   (no args)
#     → Reports current branch only. No enforcement. Exits 0.
#
# Exit codes:
#   0 — branch check passed (or no args, report-only mode)
#   1 — branch mismatch; agent must STOP immediately

set -euo pipefail

CURRENT=$(git branch --show-current 2>/dev/null || echo "DETACHED")

# ── No-arg mode: report only ─────────────────────────────────────────────────
if [ $# -eq 0 ]; then
  echo "BRANCH: $CURRENT"
  exit 0
fi

# ── --not-main mode ───────────────────────────────────────────────────────────
if [ "$1" = "--not-main" ]; then
  if [ "$CURRENT" = "main" ]; then
    echo "BRANCH GUARD FAIL: on main — never work directly on main without a spec."
    echo "STOP. Do not read, write, edit, or commit anything."
    exit 1
  fi
  echo "BRANCH OK: $CURRENT (not main — allowed)"
  exit 0
fi

# ── One-or-more expected branches: pass if current matches any ───────────────
for expected in "$@"; do
  if [ "$CURRENT" = "$expected" ]; then
    echo "BRANCH OK: $CURRENT"
    exit 0
  fi
done

# ── No match found ─────────────────────────────────────────────────────────
if [ $# -eq 1 ]; then
  echo "BRANCH MISMATCH: on '$CURRENT' expected '$1'"
else
  echo "BRANCH MISMATCH: on '$CURRENT' expected one of: $*"
fi
echo "STOP. Do not read, write, edit, or commit anything."
echo "Surface this mismatch to the conductor immediately."
exit 1
