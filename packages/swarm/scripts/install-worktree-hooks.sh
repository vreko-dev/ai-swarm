#!/bin/sh
#
# install-worktree-hooks.sh — Install git hooks for worktree management.
#
# Usage:
#   bash .ai-swarm/scripts/install-worktree-hooks.sh
#
# Installs:
#   - pre-commit hook: gate guard check before commits
#   - post-merge hook: auto-cleanup merged worktrees
#   - pre-push hook: warn about parallel worktrees

set -eu

SWARM_DIR="${SWARM_DIR:-.ai-swarm}"

echo "Installing worktree management hooks..."

if [ ! -d ".git" ]; then
  echo "ERROR: Not in a git repository root" >&2
  exit 1
fi

mkdir -p .git/hooks

# Install pre-commit hook with check-gate-guard
PRECOMMIT_HOOK=".git/hooks/pre-commit"
cat > "$PRECOMMIT_HOOK" <<EOF
#!/bin/sh
# Gate guard: prevent commits when a gate is open
SWARM_DIR="${SWARM_DIR}"
if [ -f "\${SWARM_DIR}/scripts/swarm-state.sh" ]; then
  bash "\${SWARM_DIR}/scripts/swarm-state.sh" check-gate-guard commit
fi
EOF
chmod +x "$PRECOMMIT_HOOK"
echo "Installed pre-commit hook: $PRECOMMIT_HOOK"

# Install post-merge hook
HOOK_FILE=".git/hooks/post-merge"
cat > "$HOOK_FILE" <<'EOF'
#!/bin/sh
# Auto-cleanup merged worktrees after merge to dev/main

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
if [ "$CURRENT_BRANCH" = "dev" ] || [ "$CURRENT_BRANCH" = "main" ]; then
  echo "Auto-cleaning merged worktrees..."
  git worktree prune
fi
EOF
chmod +x "$HOOK_FILE"
echo "Installed post-merge hook: $HOOK_FILE"

# Install pre-push hook
PREPUSH_HOOK=".git/hooks/pre-push"
cat > "$PREPUSH_HOOK" <<'EOF'
#!/bin/sh
# Warn about parallel worktrees before push

ACTIVE_COUNT=$(git worktree list 2>/dev/null | grep -v "bare" | wc -l | tr -d ' ')
if [ "$ACTIVE_COUNT" -gt 2 ]; then
  echo "WARNING: $ACTIVE_COUNT active worktrees detected"
  echo "  Parallel worktrees can cause merge conflicts and history tangles"
  echo ""
  git worktree list
  echo ""
fi
EOF
chmod +x "$PREPUSH_HOOK"
echo "Installed pre-push hook: $PREPUSH_HOOK"

echo ""
echo "Worktree hooks installation complete."
echo "Installed:"
echo "  - Pre-commit hook: check-gate-guard before commits"
echo "  - Post-merge hook: auto-cleanup after merging to dev/main"
echo "  - Pre-push hook: warn about parallel worktrees"
