# Meta Canon — Engineering Swarm

**Version:** 1.1
**Authoritative record for:** swarm roles, behavioral patterns, pipeline shape, and operational vocabulary.
**Conflict rule:** This file wins all conflicts. If any agent file, spec, or workflow description contradicts a canon section, this file is correct.

---

## Table of Contents

- [§1 Roles and Capability](#1-roles-and-capability)
  - [§1.1 Role Roster](#11-role-roster)
  - [§1.2 Capability Matrix](#12-capability-matrix)
  - [§1.3 Role Boundaries](#13-role-boundaries)
  - [§1.4 Role Split Criteria](#14-role-split-criteria)
- [§2 Audit-First Pattern](#2-audit-first-pattern)
  - [§2.1 Principle](#21-principle)
  - [§2.2 Two-Phase Audit Protocol](#22-two-phase-audit-protocol)
  - [§2.3 Canonical Audit Prompts](#23-canonical-audit-prompts)
- [§3 Behavioral Primitives and Refusal Modes](#3-behavioral-primitives-and-refusal-modes)
  - [§3.1 Instrumentation Pipeline](#31-instrumentation-pipeline)
  - [§3.2 Vocabulary](#32-vocabulary)
  - [§3.3 Primitive Combinations](#33-primitive-combinations)
  - [§3.4 Refusal Modes (general)](#34-refusal-modes-general)
  - [§3.5 External-Assumption Refusal Mode](#35-external-assumption-refusal-mode)
- [§4 Dispatch and Gating](#4-dispatch-and-gating)
  - [§4.1 Pipeline Shape](#41-pipeline-shape)
  - [§4.2 Gate Types](#42-gate-types)
  - [§4.3 Gate Protocol](#43-gate-protocol)
  - [§4.4 Worktree Lifecycle](#44-worktree-lifecycle)
  - [§4.5 State Authority](#45-state-authority)
  - [§4.6 Priority Ordering](#46-priority-ordering)
  - [§4.7 GSD Heuristic and External Research Gating](#47-gsd-heuristic-and-external-research-gating)
- [§5 Retrospective Protocol](#5-retrospective-protocol)
  - [§5.1 Retrospective Artifacts](#51-retrospective-artifacts)
- [§6 Architecture Invariants](#6-architecture-invariants)
- [§7 Open Questions](#7-open-questions)
- [§8 Extractability Covenant](#8-extractability-covenant)

---

## §1 Roles and Capability

### §1.1 Role Roster

Thirteen roles. No new roles added without retrospective evidence of persistent bottleneck at a specific pipeline stage.

| Role | Trigger | Never Does |
|---|---|---|
| Conductor | Session start, every dispatch decision | Implements code |
| Auditor | Pre-spec, pre-implementation | Implements, reviews own findings |
| Spec Writer | After audit; before implementation | Implements |
| Implementer | After spec; in isolated worktree | Reviews own work |
| Drift Detector | Post-implementation; 5 checks; loops once | Merges |
| Adversarial Reviewer | After Drift Detector; semantic compliance | Performs external research |
| Gatekeeper | Post-review; runs test suite | Implements |
| Integrator | Post-merge; verifies, archives, cleans | Reviews |
| Researcher | Standalone knowledge bootstrapping | Participates in main pipeline |
| DevSecOps | Security, CI, ratchet enforcement | Product decisions |
| Technical Writer | Post-merge documentation | Implements |
| Release Manager | Pre-release verification | Pipeline dispatch |
| Master Coordinator | Multi-swarm coordination | Single-task implementation |

### §1.2 Capability Matrix

Tool access is domain-scoped. Adding tools to a role is a canon change requiring a versioned commit.

| Role | Tools | External Research |
|---|---|---|
| Conductor | Read, Grep, Glob, Bash | None |
| Auditor | Read, Grep, Glob, Bash, **web_search, library/docs MCP, GitHub search** | Phase 2 (external) of two-phase audit protocol |
| Spec Writer | Read, Grep, Glob, Bash, **web_search, library/docs MCP, GitHub search (prior art only)** | Prior art search for thin prompts |
| Implementer | Read, Write, Edit, Grep, Glob, Bash | **Never** — if Implementer needs research mid-task, the spec failed to surface the assumption |
| Drift Detector | Read, Grep, Glob, Bash | None |
| Adversarial Reviewer | Read, Grep, Glob, Bash | Verification only (checks citations resolve; does not perform research) |
| Gatekeeper | Read, Bash | None |
| Integrator | Read, Bash | None |
| Researcher | Read, Grep, Glob, Bash, web_search, all MCP servers | Full — standalone sessions only |
| DevSecOps | Read, Grep, Glob, Bash | None |
| Technical Writer | Read, Write, Edit, Bash | None |
| Release Manager | Read, Grep, Glob, Bash | None |
| Master Coordinator | All | Delegates to Researcher role |

### §1.3 Role Boundaries

- **Implementer does not research.** If implementation requires resolving an external assumption, the spec is incomplete. Return to Spec Writer phase.
- **Adversarial Reviewer does not research.** AR verifies that citations in the audit output exist and resolve to the claimed content. Research happened upstream.
- **Conductor does not implement.** Conductor dispatches and gates; all code changes go through Implementer in a worktree.

### §1.4 Role Split Criteria

A capability on an existing role becomes a new role when retrospective data shows:
1. The capability consistently causes pipeline stage latency > 2× baseline, AND
2. The capability has materially different failure modes from the host role's core function, AND
3. Three or more swarm runs confirm the pattern.

Until all three criteria are met, capability stays on the existing role.

---

## §2 Audit-First Pattern

### §2.1 Principle

No implementation task begins without an audit establishing verified ground truth. Agents that build on assumptions instead of grep output create duplicate implementations, phantom methods, and architecture violations. The audit phase is not optional regardless of urgency. The two-phase protocol (internal then external) applies to every dispatch.

### §2.2 Two-Phase Audit Protocol

Every audit runs two sequential phases. Phase 1 completes and closes before Phase 2 begins. Phase 2 is optional for thick prompts (see §4.7).

**phase 1: internal** — grep-based ground truth

Run the full diagnostic battery against the local codebase:
- Symbol existence: grep for methods, exports, types, imports the spec touches
- Caller/callee analysis for any method being added, modified, or removed
- Test inventory: count, skip count, flaky markers
- Architecture fence: no forbidden cross-package imports
- Deferred work: spec does not implement deferred features
- Ratchet baseline: counts for console.log, skipped tests, linter diagnostics

All counts pinned to HEAD SHA. Every count shows the command that produced it. No transcribed counts from other agent outputs — re-run the grep.

**phase 2: external** — assumption surfacing and citation

Run after Phase 1 closes. Fires only when the spec contains non-trivial assumptions about external system behavior (see §3.5 for trigger criteria).

Steps:
1. Enumerate non-trivial external assumptions in the spec (library semantics, API surfaces, breaking change behavior, undocumented limits).
2. For each assumption: search, retrieve, and record a citation using the four-field format in §3.5.
3. If no non-trivial external assumptions exist: output explicit declaration — see §3.5 acceptable null.
4. Silent omission of the external-findings section is a protocol violation regardless of assumption count.

**Phase ordering constraint:** phase 1 findings may reveal that Phase 2 is unnecessary (no external dependencies in scope). Phase 2 findings never invalidate Phase 1 results — they are additive.

### §2.3 Canonical Audit Prompts

Six templates. Each template is versioned; changes require a canon commit.

| # | Template | File | When Used |
|---|---|---|---|
| 1 | Internal Ground Truth | `.ai-swarm/audit-templates/internal-ground-truth.md` | Every audit, Phase 1 |
| 2 | Architecture Fence Check | `.ai-swarm/audit-templates/architecture-fence-check.md` | Specs touching cross-package imports |
| 3 | Ratchet Baseline Capture | `.ai-swarm/audit-templates/ratchet-baseline-capture.md` | Before any ratchet-affecting change |
| 4 | Caller/Callee Impact | `.ai-swarm/audit-templates/caller-callee-impact.md` | Any method signature change |
| 5 | Test Inventory | `.ai-swarm/audit-templates/test-inventory.md` | Specs adding or removing tests |
| 6 | External Dependency Assumption Enumeration | `.ai-swarm/audit-templates/external-dependency-enumeration.md` | Phase 2 audit; thin prompts; any spec depending on external system behavior |

**Anti-pattern table — external research:**

| WRONG | RIGHT |
|---|---|
| External research happens after spec is written, as a Reviewer check. | Research happens during audit (Phase 2, assumption surfacing) and spec writing (approach selection). Reviewer only verifies citations exist and resolve. |
| Every external claim requires N independent sources. | Refusal mode triggers on *non-trivial* assumptions about external system behavior. Quantity heuristic creates noise, not signal. |
| Add web_search to every role to be safe. | Scoped to Auditor + Spec Writer per §1.2. Implementer staying out of research is a *feature* — forces upstream rigor. |
| Run external research before every spec, even thick R#-driven ones. | Gated by §4.7 thick/thin heuristic. Thick R#-driven specs skip Phase 2; thin exploratory work fires it. |
| Cite the source URL only. | Cite URL + relevant excerpt + date-accessed. URLs rot; excerpts survive. |
| Treat absence of external research as Auditor failure. | Auditor declares "no non-trivial external assumptions identified" explicitly. Silent skipping is the failure. |

---

## §3 Behavioral Primitives and Refusal Modes

### §3.1 Instrumentation Pipeline

Agent events may be routed through an observability pipeline. The operator chooses the tooling; this section describes the vocabulary and event structure.

**Recommended approach:**

Route swarm-internal agent telemetry through an OTel-compatible pipeline (e.g., OTel Collector → your preferred observability backend). The specific backend (Langfuse, Honeycomb, Grafana, etc.) is an operator decision and not part of this framework.

**Environment variables (if observability is wired):**

- `OTLP_ENDPOINT` — OTel Collector OTLP/HTTP endpoint (e.g., `http://localhost:4318/v1/traces`)
- Backend-specific auth keys as required by your observability provider

**If observability is not wired:** agents run without telemetry. Retrospective data is collected from transcript grep as a fallback.

### Hook Composition Rule

Any observability hook added to the swarm MUST use a **shallow-merge pattern** that preserves all host tool attributes. The hook adds project-specific attributes; it **never replaces** the host emission.

**Correct (RIGHT):** Merge project attributes into the host span/event:
```js
// shallow-merge: preserve all gen_ai.usage.* and host attributes
const attrs = { ...hostSpan.attributes, ...projectAttrs };
```

**Anti-pattern (WRONG):** Replace the host emission with a project-specific one:
```js
// WRONG — drops gen_ai.usage.input_tokens, gen_ai.usage.output_tokens, etc.
span.setAttributes(projectAttrs);  // clobbers host attributes
```

Violations of this rule cause silent loss of `gen_ai.usage.*` billing and tracing attributes. This is a canon rule — it governs how operators wire observability, not what tooling they use.

### §3.2 Vocabulary

Approximately 20-40 verbs describe agent actions. If wiring observability, emit these as event type attributes for all tool calls. The vocabulary is intentionally compact — new verbs require a canon commit.

**Core verbs:**

| Verb | Meaning |
|---|---|
| READ | Read a file or resource |
| GREP | Search codebase for a pattern |
| WRITE | Create or overwrite a file |
| EDIT | Modify an existing file |
| COMMIT | Git commit in a worktree |
| GATE_OPEN | Open a human gate |
| GATE_CLOSE | Close a human gate |
| DISPATCH | Assign a spec to a worktree |
| MERGE | Record a branch merge |
| VERIFY | Run a gate verification command |
| AUDIT | Run Phase 1 internal audit |
| SPEC | Author a specification |
| REVIEW | Run adversarial review pass |
| SEARCH_EXTERNAL | Perform an external web or GitHub search |
| FETCH_DOCS | Retrieve library or API documentation via MCP |
| CITE | Record a citation in the external-findings section |

**Notes:**
- `SEARCH_EXTERNAL`, `FETCH_DOCS`, and `CITE` are emitted only by Auditor and Spec Writer roles. Implementer events using these verbs are anomalies — flag in retrospective.

### §3.3 Primitive Combinations

Common two-verb sequences:

- `AUDIT → SPEC` — standard pipeline start
- `GREP → VERIFY` — gate verification pattern
- `SEARCH_EXTERNAL → CITE` — external assumption resolution
- `FETCH_DOCS → CITE` — documentation-sourced citation
- `DISPATCH → COMMIT` — worktree execution pattern

### §3.4 Refusal Modes (general)

Agents refuse to proceed when proceeding would violate a canon invariant. Refusals are surfaced to the Conductor immediately with the exact invariant violated and the action that would violate it.

General refusal triggers:
- Gate is open and the action would commit to a gated branch
- Branch mismatch between worktree and spec Branch field
- Spec scope touches deferred-work.md items
- Architecture fence would be violated

### §3.5 External-Assumption Refusal Mode

**Applies to:** Auditor (Phase 2), Spec Writer (approach selection)

Auditor or Spec Writer **must produce a citation** when the spec depends on any of the following:

1. **Library version semantics** — what version X.Y of a dependency does or does not do
2. **Third-party API surface** — endpoint shape, auth pattern, rate limits, retry semantics
3. **Native module behavior** — anything crossing the JS/C++ boundary, anything with platform-specific behavior
4. **Breaking changes between versions** — especially silent ones
5. **Undocumented or under-documented limits** — quota, timeout, payload size
6. **Behavioral claims about external systems** not personally verified in the past 30 days

**Trigger criteria (precise):** Any spec statement of the form "X does Y" or "X supports Y" where X is outside the project codebase and Y is non-trivially verifiable.

**Citation format (required four fields):**
```yaml
- claim: "Stripe webhook retries use exponential backoff up to 3 days"
  source: https://stripe.com/docs/webhooks#retries
  excerpt: "Stripe will attempt to deliver your webhooks for up to three days..."
  date-accessed: 2026-05-13
```

**Acceptable null:** `external-findings: "no non-trivial external assumptions identified — all dependencies internal or version-pinned and locally verified"`.

**Unacceptable:** silently omitting the external-findings section. Silent omission is a protocol violation regardless of whether any assumptions exist.

---

## §4 Dispatch and Gating

### §4.1 Pipeline Shape

Every task flows through every stage. Urgency is not a reason to skip any stage.

```
audit → spec → implement → drift-detect → review → adversarial-review → gatekeeper → [gate] → merge → integrator → technical-writer → release-manager
```

### §4.2 Gate Types

| Type | Who opens | Who closes | Blocks what |
|---|---|---|---|
| Human (Gate 1) | Conductor | Operator approval | All new dispatches; commits to gated branch |
| Human (Gate 2) | Conductor | Operator approval | PR open |
| Human (Gate 3) | CI green | Operator merges in GitHub | Release |

### §4.3 Gate Protocol

While any Gate 1 or Gate 2 lockfile exists: zero commits to the gated branch, zero new dispatches to any branch. The pre-commit hook enforces mechanically; do not work around it.

### §4.4 Worktree Lifecycle

`create → dispatch → implement → drift-detect → review → gate → PR → merge → remove`

**Branch model (enforced):**
- Worktrees are ALWAYS created off `dev`: `git worktree add .worktrees/<spec-id> -b task/<spec-id> dev`
- PRs ALWAYS target `dev`: `gh pr create --base dev --head task/<spec-id>`
- `git checkout -b` in the main working tree is FORBIDDEN — creates untracked feature branches outside the swarm state model
- Only the release manager opens PRs targeting `main` (dev → main promotion)

Full agent rules: `.ai-swarm/docs/reference/branch-model.md` § "Agent Rules"

Worktrees not in `current.json.worktrees[]` but present in `git worktree list` are orphaned. Conductor investigates before proceeding. If orphan content is confirmed on `dev`, remove the worktree. If content is not on `dev`, surface to operator.

### §4.5 State Authority

`.ai-swarm/state/current.json` is the authoritative record of swarm state. Conductor reads it at session start without exception. `swarm-state.sh` commands are the only sanctioned write interface — no manual JSON edits.

### §4.6 Priority Ordering

1. Human gate pending → surface to operator, no new work
2. Merge-ready worktree → open PR
3. P0 idle spec, no blocker, no spec written → dispatch Spec Writer
4. P0 idle spec, no blocker, spec exists → dispatch worktree
5. P0 blocked by dependency → work on the dependency
6. P1 idle → only if no P0 work exists

### §4.7 GSD Heuristic and External Research Gating

**Thick prompt** (R#-driven, file-and-line-enumerated): spec provides exact file paths, line numbers, and change instructions. Minimal ambiguity. External research is unnecessary — the spec author has already resolved external assumptions.

**Thin prompt** (exploratory, approach-open): spec describes desired behavior without prescribing exact implementation. Approach selection involves external knowledge (library capabilities, API patterns, best practices).

**Decision rule:**
- Thick prompt → Phase 2 external audit SKIPPED. Running it is latency tax on mechanical work. Auditor declares skip explicitly with reason.
- Thin prompt → Phase 2 external audit FIRES. Auditor runs external-dependency-enumeration template before spec is written.
- Ambiguous thickness → default to firing Phase 2. The cost of a false positive (unnecessary research) is lower than the cost of a false negative (assumption baked into shipped spec).

---

## §5 Retrospective Protocol

### §5.1 Retrospective Artifacts

After every merged spec, the retrospective produces the following artifacts:

**Artifact 1: audit-gaps**

Enumeration of facts the spec assumed but the audit failed to surface. Gaps are categorized:

- **internal-miss**: The fact was discoverable by Phase 1 (grep, file read, test inventory) but the audit did not find it.
- **external-miss**: The fact required Phase 2 (external search, docs retrieval) and was either not attempted or the citation did not resolve correctly.

Both categories must appear in every retrospective. Zero items in a category is recorded as "0 internal-miss gaps found" — not omitted.

**Artifact 2: ratchet delta**

Before/after counts for all tracked ratchets. Flag any that increased.

**Artifact 3: spec-outcome**

One of: `spec-followed` / `spec-diverged` / `spec-abandoned`. If diverged or abandoned, reason stated.

**Artifact 4: gate-events**

List of gates opened and closed, with durations. Flag any gate open > 24h.

**Artifact 5: external-research metrics** (if Phase 2 fired)

- Count of SEARCH_EXTERNAL events per role
- Citation-resolve rate at retrospective time (are source URLs still live)
- Citations that materially changed the spec vs. citations that confirmed existing assumptions (high latter rate = research too defensive)

**Retrospective data source:** If observability is wired, query gate events and tool decisions from your observability backend. If not wired, use transcript grep as the primary source.

---

## §6 Architecture Invariants

Add your project's architecture invariants here. These are the project-specific rules that all agents must not violate.

Example format:
- **ARCH-01**: The client is a thin projection client. All business logic lives in the server layer. Client communicates only via the official API/IPC layer.
- **ARCH-02**: All shared types live in `packages/contracts`. No inline type redefinition.

If your project has a canonical architecture document (e.g., `CANON.md`), point to it here. Meta canon does not duplicate ARCH invariants; it extends them with swarm-behavioral rules. If a swarm behavior would violate an ARCH invariant, the invariant wins.

---

## §7 Open Questions

Questions deferred from active implementation. Each is assigned a status. "Wait for evidence" means the question reopens only when the specified observable occurs.

| ID | Question | Status |
|---|---|---|
| Q1 | Should Drift Detector's 5-check loop be extended to 7 checks? | Wait for 3 false-negative escapes in retrospective data |
| Q2 | Should Adversarial Reviewer have a time-boxed "challenge budget" to prevent infinite loops? | Wait for 2 documented loop cases in retrospective data |
| Q3 | Should Gate 1 be eliminated for Meta-scope specs? | Wait for evidence of gate bottleneck rate > 30% on Meta specs |
| Q4 | Should the Spec Writer have a formal "approach selection" sub-phase separate from spec authoring? | Wait for thin-prompt failure rate data from Phase 2 retrospectives |
| Q5 | Should external research output be persisted in a knowledge base accessible to future sessions? | Wait for citation-reuse rate data from 5+ retrospectives |
| Q6 | When does external research split from Auditor/Spec Writer into a dedicated role? | **Wait for retrospective evidence.** Trigger criteria per §1.4: persistent latency > 2×, materially different failure modes, 3+ swarm runs confirming. |

---

## §8 Extractability Covenant

Meta artifacts — this canon, audit templates, role prompts — must remain extractable from any host project and reusable in any engineering swarm context. Implementation requirements:

1. No project-specific package names, import paths, or schema types in canon sections
2. No hardcoded repository paths outside examples (examples may use `your-monorepo/` as a placeholder)
3. Project-specific ratchet values, package counts, and SHAs belong in `state/current.json` — not in canon
4. Role prompts in `agents/` are generic; project-specific extensions go in separate amendment files
5. Audit templates use placeholder package names that the operator fills in at instantiation time

This covenant exists because the swarm methodology has value beyond any single project. Coupling it to project internals reduces that value.
