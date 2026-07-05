#!/bin/sh
#
# check-mutation-rate.sh — Count changed files for a task branch vs base.
#
# Usage:
#   bash .ai-swarm/scripts/check-mutation-rate.sh <task-branch> <threshold>
#
# Exit codes:
#   0 — file count is within threshold
#   1 — file count exceeds threshold or input is invalid

set -eu

BRANCH="${1:-}"
THRESHOLD="${2:-}"

if [ -z "$BRANCH" ] || [ -z "$THRESHOLD" ]; then
  echo "ERROR: usage: check-mutation-rate.sh <task-branch> <threshold>" >&2
  exit 1
fi

# Validate threshold is a number
case "$THRESHOLD" in
  ''|*[!0-9]*)
    echo "ERROR: threshold must be an integer, got: $THRESHOLD" >&2
    exit 1
    ;;
esac

BASE_REF="dev"
if git rev-parse --verify --quiet origin/dev >/dev/null 2>&1; then
  BASE_REF="origin/dev"
elif ! git rev-parse --verify --quiet dev >/dev/null 2>&1; then
  echo "ERROR: could not resolve dev or origin/dev" >&2
  exit 1
fi

if ! git rev-parse --verify --quiet "$BRANCH" >/dev/null 2>&1; then
  echo "ERROR: could not resolve branch: $BRANCH" >&2
  exit 1
fi

files_changed=$(
  git diff --name-only --diff-filter=ACMR "$BASE_REF...$BRANCH" 2>/dev/null | sed '/^$/d' | wc -l | tr -d ' '
)

echo "files_changed=$files_changed threshold=$THRESHOLD base=$BASE_REF branch=$BRANCH"

if [ "$files_changed" -gt "$THRESHOLD" ]; then
  echo "Mutation rate threshold exceeded: $files_changed > $THRESHOLD" >&2
  exit 1
fi

echo "Mutation rate within threshold."
