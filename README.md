# ai-swarm

A structured AI agent swarm framework for engineering teams. Provides a complete pipeline for spec-driven, audited, gate-controlled software development using AI agents.

## What this is

A methodology + tooling layer that sits on top of any AI coding assistant. Instead of one agent doing everything, multiple specialized agents handle discrete pipeline stages with hard gates between them.

**Pipeline:**
```
audit → spec → implement → drift-detect → adversarial-review → [human gate] → merge → technical-writer → release-manager
```

Each stage is handled by a different agent role. Agents cannot skip stages. Human gates are mechanical (lockfiles) and cannot be bypassed.

## Structure

```
.ai-swarm/
  agents/           — Role prompt files for each agent
  audit-templates/  — Structured audit templates (6 templates)
  docs/reference/   — Branch model, anti-patterns, architecture fence, deferred work
  scripts/          — State management, drift detection, workspace intelligence
  specs/            — Your project's spec files (one per worktree)
  state/            — Live swarm state (current.json, gate lockfiles)
  meta-canon.md     — Authoritative behavioral canon (wins all conflicts)
```

## Quick start

### 1. Copy `.ai-swarm/` into your repo root

```bash
cp -r /path/to/ai-swarm/.ai-swarm /your/repo/.ai-swarm
```

### 2. Initialize swarm state

```bash
bash .ai-swarm/scripts/swarm-state.sh init
```

### 3. Customize for your project

**Architecture fence** — define your import boundaries:
```
.ai-swarm/docs/reference/architecture-fence.txt
```

**Deferred work** — list items explicitly NOT to implement yet:
```
.ai-swarm/docs/reference/deferred-work.md
```

**Meta canon §6** — add your architecture invariants:
```
.ai-swarm/meta-canon.md  (§6 Architecture Invariants)
```

### 4. Install worktree hooks (optional)

```bash
bash .ai-swarm/scripts/install-worktree-hooks.sh
```

### 5. Wire your AI assistant

Copy the agent role files into whichever agent folder your AI tooling reads from. For Claude Code:
```bash
cp .ai-swarm/agents/swarm-conductor.md .claude/agents/swarm-conductor.md
# ...repeat for other agents you want active
```

## Agent roles

| Agent | When to invoke | What it does |
|-------|---------------|--------------|
| `swarm-conductor` | Start of every session | Reads state, decides next action, dispatches work |
| `swarm-auditor` | Before any spec | Establishes ground truth via grep (Phase 1) + external research (Phase 2) |
| `swarm-spec-writer` | After audit | Writes shell-verifiable specs with REQ-NNN requirements |
| `swarm-implementer` | After spec | Executes spec in isolated worktree |
| `swarm-drift-detector` | After implementation | Checks spec compliance (5 checks) |
| `swarm-adversarial-reviewer` | After drift detection | Semantic compliance, adversarial scenarios |
| `swarm-gatekeeper` | After review | Runs full test suite |
| `swarm-integrator` | After merge | Archives spec, cleans worktree, logs metrics |
| `swarm-researcher` | Standalone | Bootstraps project knowledge |
| `swarm-devsecops` | Security/CI work | Ratchet enforcement, security audits |
| `swarm-technical-writer` | After merge | CHANGELOG, retrospective capture |
| `swarm-release-manager` | Before releases | Pre-release gate verification |
| `swarm-master-coordinator` | Multi-swarm | Cross-swarm dependency management |

## Invoking the pipeline

The canonical invocation is through the conductor:

```
Run swarm pipeline for @.ai-swarm/specs/my-task.md
```

The conductor handles all dispatch, gate management, and state transitions.

## State management

All state lives in `.ai-swarm/state/current.json`. Only `swarm-state.sh` writes to it.

```bash
# Check current state
bash .ai-swarm/scripts/swarm-state.sh status

# See what to do next
bash .ai-swarm/scripts/swarm-state.sh next

# Open/close gates
bash .ai-swarm/scripts/swarm-state.sh gate-open <spec-id> <gate-number>
bash .ai-swarm/scripts/swarm-state.sh gate-close <spec-id> <gate-number>
```

## Branch model

- **`main`** — release-tagged only, never commit directly
- **`dev`** — integration branch, all worktree PRs merge here
- **`task/<spec-id>`** — one per active spec, lives in `.worktrees/<spec-id>`

Worktrees are ALWAYS created off `dev`. PRs ALWAYS target `dev`. The release manager handles `dev → main` promotion.

See `.ai-swarm/docs/reference/branch-model.md` for full rules.

## Spec format

Specs live in `.ai-swarm/specs/<spec-id>.md`. Minimum required sections:

```markdown
# Spec: <title>
Branch: task/<spec-id>
Base: dev

## Requirements
- REQ-001: <shell-verifiable requirement>
  Verify: `<bash command that exits 0 on pass>`

## DO NOT
- <explicit exclusions>

## Phase 1: <name>
### Task 1.1
...

## Rollback
...
```

See `swarm-spec-writer` agent for the full format including pre-implementation audit table and deferred work check.

## Audit-first pattern

No implementation starts without an audit. Every audit runs two phases:

1. **Phase 1 (internal)**: grep-based ground truth — symbol existence, caller/callee analysis, ratchet baseline, architecture fence check
2. **Phase 2 (external)**: fires only for thin/exploratory specs — external assumption citation using `audit-templates/external-dependency-enumeration.md`

See `meta-canon.md §2` for the full protocol.

## Anti-patterns to avoid

The 8 named anti-patterns live in `.ai-swarm/docs/reference/anti-patterns.md`. The critical ones:

- **AP-1**: Graceful empty returns that mask missing capability
- **AP-2**: Inlined constants that should route through a service layer
- **AP-3**: Silent error swallowing in catch blocks
- **AP-7**: Committing to a gated branch

## Adapting to your project

The framework is designed to be project-agnostic. Project-specific content belongs in:

- `state/current.json` — ratchet baselines, SHAs, counts
- `docs/reference/architecture-fence.txt` — your import boundaries
- `docs/reference/deferred-work.md` — your deferred items
- `meta-canon.md §6` — your architecture invariants
- Agent files — do not add project-specific logic; keep agents generic and add amendments

See `meta-canon.md §8 Extractability Covenant` for the full contract.

## Requirements

- Git 2.x (for `git worktree`)
- `gh` CLI (for PR creation)
- `jq` (for `workspace-intel.sh`)
- An AI assistant that supports custom agent/system prompt files
