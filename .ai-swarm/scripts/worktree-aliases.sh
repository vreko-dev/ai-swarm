#!/bin/bash
# Swarm worktree management aliases
# Source this file: source .ai-swarm/scripts/worktree-aliases.sh

alias worktree-cleanup=".ai-swarm/scripts/worktree-cleanup.sh"
alias worktree-status="git worktree list | grep -v bare"

echo "Swarm worktree aliases loaded:"
echo "   worktree-cleanup  - Clean up merged worktrees"
echo "   worktree-status   - Show all worktrees"
