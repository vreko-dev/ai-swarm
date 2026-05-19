#!/bin/bash
# Install worktree maintenance hooks and aliases

set -e

echo "Installing swarm worktree management hooks..."

# Ensure we're in git repo root
if [ ! -d ".git" ]; then
  echo "Error: Not in a git repository root"
  exit 1
fi

# Create hooks directory if it doesn't exist
mkdir -p .git/hooks

# Install post-merge hook for automatic cleanup
HOOK_FILE=".git/hooks/post-merge"
cat > "$HOOK_FILE" << 'EOF'
#!/bin/bash
# Swarm: Auto-cleanup merged worktrees after merge to dev/main

# Only run on main branches
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" = "dev" ] || [ "$CURRENT_BRANCH" = "main" ]; then
  echo "Swarm: Auto-cleaning merged worktrees..."

  if [ -f ".ai-swarm/scripts/worktree-cleanup.sh" ]; then
    .ai-swarm/scripts/worktree-cleanup.sh --auto
  else
    echo "Warning: Cleanup script not found at .ai-swarm/scripts/worktree-cleanup.sh"
  fi
fi
EOF

chmod +x "$HOOK_FILE"
echo "Installed post-merge hook: $HOOK_FILE"

# Install pre-push hook to warn about parallel worktrees
PREPUSH_HOOK=".git/hooks/pre-push"
cat > "$PREPUSH_HOOK" << 'EOF'
#!/bin/bash
# Swarm: Warn about parallel worktrees before push

# Count active worktrees (excluding main branches)
ACTIVE_COUNT=$(git worktree list | grep -v "bare\|main\|dev" | wc -l)

if [ "$ACTIVE_COUNT" -gt 1 ]; then
  echo "Warning: $ACTIVE_COUNT active worktrees detected"
  echo "   Parallel worktrees can cause merge conflicts and history tangles"
  echo "   Consider sequential workflow for cleaner git history"
  echo ""
  echo "Active worktrees:"
  git worktree list | grep -v "bare\|main\|dev"
  echo ""
  echo "Continue push? (y/N)"
  read -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Push cancelled"
    exit 1
  fi
fi
EOF

chmod +x "$PREPUSH_HOOK"
echo "Installed pre-push hook: $PREPUSH_HOOK"

# Add shell aliases
ALIAS_CLEANUP='alias worktree-cleanup=".ai-swarm/scripts/worktree-cleanup.sh"'
ALIAS_STATUS='alias worktree-status="git worktree list | grep -v bare"'

# Function to add aliases to shell profile
add_aliases_to_profile() {
  local PROFILE="$1"
  local ADDED=false

  if [ -f "$PROFILE" ]; then
    if ! grep -q "worktree-cleanup" "$PROFILE" 2>/dev/null; then
      echo "" >> "$PROFILE"
      echo "# Swarm worktree management aliases" >> "$PROFILE"
      echo "$ALIAS_CLEANUP" >> "$PROFILE"
      echo "$ALIAS_STATUS" >> "$PROFILE"
      ADDED=true
    fi
  fi

  echo "$ADDED"
}

# Try to add to shell profiles
PROFILES_UPDATED=0

for PROFILE in ~/.zshrc ~/.bashrc ~/.bash_profile; do
  if ADDED=$(add_aliases_to_profile "$PROFILE"); then
    if [ "$ADDED" = "true" ]; then
      echo "Added aliases to $PROFILE"
      PROFILES_UPDATED=$((PROFILES_UPDATED + 1))
    fi
  fi
done

if [ "$PROFILES_UPDATED" -eq 0 ]; then
  echo "No shell profiles updated (aliases may already exist)"
else
  echo "Updated $PROFILES_UPDATED shell profile(s)"
fi

# Create a local alias file for immediate use
ALIAS_FILE=".ai-swarm/scripts/worktree-aliases.sh"
cat > "$ALIAS_FILE" << EOF
#!/bin/bash
# Swarm worktree management aliases
# Source this file: source .ai-swarm/scripts/worktree-aliases.sh

$ALIAS_CLEANUP
$ALIAS_STATUS

echo "Swarm worktree aliases loaded:"
echo "   worktree-cleanup  - Clean up merged worktrees"
echo "   worktree-status   - Show all worktrees"
EOF

chmod +x "$ALIAS_FILE"
echo "Created alias file: $ALIAS_FILE"

# Test the cleanup script
echo ""
echo "Testing cleanup script..."
if .ai-swarm/scripts/worktree-cleanup.sh --dry-run; then
  echo "Cleanup script test passed"
else
  echo "Cleanup script test failed"
  exit 1
fi

echo ""
echo "Swarm worktree management installation complete!"
echo ""
echo "What was installed:"
echo "   Post-merge hook: Auto-cleanup after merging to dev/main"
echo "   Pre-push hook: Warn about parallel worktrees"
echo "   Shell aliases: worktree-cleanup, worktree-status"
echo ""
echo "Next steps:"
echo "   1. Restart your shell or run: source ~/.zshrc"
echo "   2. Test with: worktree-cleanup --dry-run"
echo "   3. Configure repo for squash-only merges"
echo ""
echo "Usage:"
echo "   worktree-cleanup           # Interactive cleanup"
echo "   worktree-cleanup --auto    # Automatic cleanup"
echo "   worktree-status            # Show all worktrees"
