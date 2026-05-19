#!/bin/bash
# Worktree cleanup script - removes merged branches and orphaned worktrees
# Usage: ./worktree-cleanup.sh [--auto|--dry-run]

set -e

AUTO_MODE=false
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --auto)
      AUTO_MODE=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "Usage: $0 [--auto|--dry-run]"
      echo "  --auto    : Run without prompts"
      echo "  --dry-run : Show what would be done without doing it"
      exit 1
      ;;
  esac
done

if [ "$DRY_RUN" = true ]; then
  echo "DRY RUN MODE - No changes will be made"
fi

echo "Cleaning up worktrees..."

# Ensure we're in the repo root
if [ ! -d ".git" ]; then
  echo "Error: Not in a git repository root"
  exit 1
fi

# Update main branch (dev or main)
MAIN_BRANCH="dev"
if ! git show-ref --verify --quiet refs/heads/dev; then
  MAIN_BRANCH="main"
fi

if [ "$DRY_RUN" = false ]; then
  echo "Updating $MAIN_BRANCH branch..."
  git checkout "$MAIN_BRANCH" >/dev/null 2>&1
  git pull origin "$MAIN_BRANCH" >/dev/null 2>&1
fi

CLEANED=0
ERRORS=0
ACTIVE=0

echo "Analyzing worktrees..."

# Get list of worktrees (excluding main branches)
WORKTREE_LIST=$(git worktree list | grep -v "bare\|main\|dev" || true)

if [ -z "$WORKTREE_LIST" ]; then
  echo "No worktrees to clean up"
else
  # Use process substitution (not pipe) so counter variables survive the loop.
  # A pipe runs the loop body in a subshell; CLEANED/ERRORS/ACTIVE would reset
  # to 0 on subshell exit and the final report would always show "Removed: 0".
  while IFS= read -r line; do
    # Parse worktree list output: /path/to/worktree commit [branch]
    WORKTREE_PATH=$(echo "$line" | awk '{print $1}')
    BRANCH_NAME=$(echo "$line" | grep -o '\[.*\]' | tr -d '[]' 2>/dev/null || echo "")

    if [ -z "$BRANCH_NAME" ]; then
      echo "Skipping worktree with no branch: $WORKTREE_PATH"
      continue
    fi

    # Check if branch is merged into main branch
    if git branch --merged "$MAIN_BRANCH" | grep -q "^[[:space:]]*$BRANCH_NAME$"; then
      if [ "$DRY_RUN" = true ]; then
        echo "Would remove merged worktree: $WORKTREE_PATH ($BRANCH_NAME)"
      else
        echo "Removing merged worktree: $WORKTREE_PATH ($BRANCH_NAME)"

        if git worktree remove "$WORKTREE_PATH" 2>/dev/null; then
          git branch -d "$BRANCH_NAME" 2>/dev/null || echo "   Branch already deleted"
          CLEANED=$((CLEANED + 1))
        else
          echo "Failed to remove worktree: $WORKTREE_PATH"
          ERRORS=$((ERRORS + 1))
        fi
      fi
    else
      echo "Active worktree: $WORKTREE_PATH ($BRANCH_NAME) - not merged"
      ACTIVE=$((ACTIVE + 1))
    fi
  done < <(echo "$WORKTREE_LIST")
fi

# Check for orphaned worktree directories
if [ -d ".worktrees" ]; then
  echo "Checking for orphaned directories..."

  find .worktrees -maxdepth 1 -type d ! -name ".worktrees" | while read -r dir; do
    if [ ! -d "$dir" ]; then continue; fi

    if ! git worktree list | grep -q "$dir"; then
      if [ "$DRY_RUN" = true ]; then
        echo "Would remove orphaned directory: $dir"
      elif [ "$AUTO_MODE" = true ]; then
        echo "Removing orphaned directory: $dir"
        rm -rf "$dir"
      else
        echo "Orphaned directory found: $dir"
        read -p "Remove orphaned directory $dir? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
          rm -rf "$dir"
          echo "   Removed: $dir"
        fi
      fi
    fi
  done
fi

if [ "$DRY_RUN" = false ]; then
  echo "Cleanup complete:"
  echo "   Removed: $CLEANED worktrees"
  echo "   Active: $ACTIVE worktrees"
  echo "   Errors: $ERRORS"
else
  echo "Dry run complete - no changes made"
fi

# Show remaining worktrees
REMAINING=$(git worktree list | grep -v "bare\|main\|dev" | wc -l)
if [ "$REMAINING" -gt 0 ]; then
  echo ""
  echo "Remaining active worktrees:"
  git worktree list | grep -v "bare\|main\|dev"

  if [ "$REMAINING" -gt 3 ]; then
    echo ""
    echo "WARNING: $REMAINING active worktrees detected"
    echo "   Consider using sequential worktree workflow to avoid conflicts"
  fi
fi
