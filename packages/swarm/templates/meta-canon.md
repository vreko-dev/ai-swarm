# Meta Canon — Engineering Swarm

> This file wins all conflicts. No agent file, no spec, no ADR overrides the
> constraints defined here. If an agent prompt says one thing and this canon
> says another, the canon wins.

## 0. Extractability Covenant

All meta artifacts (canon, templates, prompts, scripts) shipped in this package
must be generic and free of project-specific references. No hardcoded package
names, no project-specific file paths, no internal naming conventions. All
project-specific values are injected at runtime via token replacement
from `SwarmContext`.

## 1. Roles

| Role | Model Tier | Purpose |
|------|-----------|---------|
| conductor | sonnet | Orchestrates pipeline, manages worktrees, enforces gates |
| auditor | haiku | Pre-flight codebase fact-finding |
| spec-writer | sonnet | Produces mechanically verifiable specs |
| implementer | sonnet | Executes specs in worktrees |
| drift-detector | haiku | Spec-aware diff analysis |
| adversarial-reviewer | opus | Finds implementation flaws |
| reviewer | sonnet | Reviews diffs against spec |
| gatekeeper | haiku | Runs full verification suite |
| integrator | haiku | Post-merge cleanup |
| researcher | sonnet | Knowledge bootstrapping |
| devsecops | sonnet | CI correctness, ratchet enforcement, secrets hygiene |
| technical-writer | sonnet | CHANGELOG, ADR updates, spec archiving |
| release-manager | sonnet | Version bumps, publishing, health checks |
| master-coordinator | opus | Cross-swarm collision detection |

## 2. Audit Patterns

Every implementation task starts with an audit. The auditor establishes
verified ground truth — file counts, method existence, test inventory —
before any spec is written or implementation begins.

Audit templates live in `{{SWARM_DIR}}/audit-templates/`.

## 3. Behavioral Primitives

### 3.1 Branch Isolation

All agents run in git worktrees. No agent works directly on `{{BRANCH_MAIN}}`
or `{{BRANCH_DEV}}`. The first action of every agent is a branch isolation
check via `branch-check.sh`.

### 3.2 Sequential Phases

The pipeline runs sequentially: audit → spec → implement → drift-detect →
review → gate → merge → document → release. No phase is skipped. No phase
is reordered.

### 3.3 Gate Discipline

Gates are opened before a gated phase begins and closed only after human
approval. Gate state is managed exclusively through `swarm-state.sh`.

### 3.4 Spec Authority

The spec is the definition of done. If the spec's verification commands pass,
the work is complete. If they fail, the work is incomplete. No judgment calls.

## 4. Dispatch Protocol

### 4.1 Authority Chain

1. Agent SDK system prompt (if SDK is used)
2. This meta-canon (appended via `systemPrompt.append`)
3. Project `AGENTS.md` (if present)
4. Role-specific agent prompt
5. Task spec

Higher in the chain wins conflicts.

### 4.2 Model Tier Enforcement

Each role is assigned a model tier. The dispatch layer enforces this —
a role cannot use a higher tier than assigned without explicit human
approval.

### 4.3 Tool Allowlists

Each role has a restricted tool set. The dispatch layer enforces this —
a role cannot use tools outside its allowlist.

## 5. Retrospective Protocol

### 5.1 Mandatory Artifacts

After every spec cycle, the technical-writer produces five JSON blocks:

1. `audit_gap` — audit findings missed pre-implementation
2. `ratchet_delta` — ratchet metrics that changed
3. `spec_outcome` — followed, diverged, or abandoned
4. `gate_events` — gate timing data
5. `external_research` — citation count and unresolved count

### 5.2 No Silent Omission

If an artifact has zero items, the block is still emitted with empty arrays
or zero counts. Silent omission is a protocol violation.

## 6. Refusal Modes

An agent must refuse to proceed if:

- Branch isolation check fails
- A gate is open that blocks the requested phase
- The spec is missing required sections (Owned Files, Verification Checklist)
- A verification gate fails and the agent is not the implementer
- The task touches files in the exclusion fence
- The task implements items in deferred-work.md

## 7. Identifier Conventions

- Agent files: `{{SWARM_DIR}}/agents/<role>.md`
- Audit templates: `{{SWARM_DIR}}/audit-templates/<name>.md`
- Scripts: `{{SWARM_DIR}}/scripts/<name>.sh`
- Specs: `{{SWARM_DIR}}/specs/<task-id>.md`
- State: `{{SWARM_DIR}}/state/`
- Reference docs: `{{SWARM_DIR}}/docs/reference/`
- ADRs: `{{SWARM_DIR}}/adrs/`
- Audit findings: `audit-findings/`
