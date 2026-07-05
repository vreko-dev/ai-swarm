#!/bin/sh
#
# branch-check.sh — Verify branch isolation for swarm agents.
#
# Usage:
#   bash .ai-swarm/scripts/branch-check.sh <expected-branch>
#   bash .ai-swarm/scripts/branch-check.sh <branch1> <branch2>
#   bash .ai-swarm/scripts/branch-check.sh --not-main
#
# Exit codes:
#   0 — on an acceptable branch
#   1 — on a forbidden branch (main/dev when not allowed, or wrong task branch)

set -eu

SWARM_DIR="${SWARM_DIR:-.ai-swarm}"
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")

if [ -z "$CURRENT_BRANCH" ]; then
  echo "ERROR: Could not determine current branch. Are you in a git repository?" >&2
  exit 1
fi

MODE="${1:-}"

if [ "$MODE" = "--not-main" ]; then
  if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "dev" ]; then
    echo "ERROR: Working directly on '$CURRENT_BRANCH' is forbidden without a spec." >&2
    echo "Create a task branch or work in a worktree." >&2
    exit 1
  fi
  echo "OK: On branch '$CURRENT_BRANCH' (not main/dev)."
  exit 0
fi

if [ -z "$MODE" ]; then
  echo "ERROR: No argument provided. Usage: branch-check.sh <expected-branch> | --not-main" >&2
  exit 1
fi

# Check if current branch matches any of the provided expected branches
for expected in "$@"; do
  if [ "$CURRENT_BRANCH" = "$expected" ]; then
    echo "OK: On expected branch '$CURRENT_BRANCH'."
    exit 0
  fi
done

# Check if we're in a worktree (acceptable for task branches)
WORKTREE_LIST=$(git worktree list 2>/dev/null || echo "")
CURRENT_DIR=$(pwd 2>/dev/null || echo "")
if echo "$WORKTREE_LIST" | grep -q "$CURRENT_DIR" 2>/dev/null; then
  # We're in a worktree — check if current branch starts with common task prefixes
  case "$CURRENT_BRANCH" in
    task/*|feature/*|fix/*|chore/*|refactor/*)
      echo "OK: In worktree on task branch '$CURRENT_BRANCH'."
      exit 0
      ;;
  esac
fi

echo "ERROR: On branch '$CURRENT_BRANCH', expected one of: $*" >&2
echo "If you are in a worktree, ensure your branch name starts with task/, feature/, fix/, chore/, or refactor/." >&2
exit 1
