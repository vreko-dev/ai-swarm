# Branch Model

## Tiers

**main** — release-tagged only. Release manager owns the only merge path here.
           Represents the last stable version deployed to all targets.
           Never commit directly. Never deploy from worktrees to main.

**dev**  — integration branch. All worktree PRs merge here.
           Always green (CI passes). Deployment targets pull from dev.

**task/<spec-id>** — one per active spec. Created as git worktree.
                     Lifespan: spec dispatch → adversarial review → PR → merge to dev → delete.
                     Never lives longer than one spec cycle.

## What no longer exists

Feature branches. Worktrees ARE the feature branches.
The state file tracks them. The conductor dispatches them.
Adding an intermediate tier between worktrees and dev creates merge debt
with no benefit at this velocity.

---

## Agent Rules — How to interact with this branch model

Every agent that touches git MUST follow these rules without exception.

### Creating a worktree

```bash
# ALWAYS branch off dev — ensures the worktree starts from latest integrated state
git worktree add .worktrees/<spec-id> -b task/<spec-id> dev
```

**Never** use `git checkout -b` in the main working tree. That creates an untracked
feature branch outside the swarm state model — the conductor cannot gate it, the
drift detector cannot scope it, and the adversarial reviewer cannot find its diff.

### Opening a PR

```bash
gh pr create --title "<title>" --base dev --head task/<spec-id> --body "<body>"
```

PRs ALWAYS target `dev`. The only exception is the release manager's dev → main
promotion, which is a separate, gated process.

### After merge

```bash
git worktree remove .worktrees/<spec-id>
git branch -d task/<spec-id>
```

The integrator handles this. No agent should delete a worktree without verifying
the merge commit is on dev.

### Branch naming

- Task branches: `task/<spec-id>` (e.g., `task/fix-session-bug-2026-05`)
- Never use generic names like `fix`, `feature`, `patch` — they collide

---

## Gate enforcement

The pre-commit hook reads `.ai-swarm/state/gates/` before allowing any commit.
If a lock file exists for the current branch, the commit is rejected.

This is mechanical enforcement — do not work around it with `--no-verify`.
