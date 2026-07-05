# Spec: Swarm Upgrade — Finding Quality

**Spec ID:** swarm-upgrade-finding-quality
**Branch:** task/swarm-upgrade-finding-quality
**Base:** dev
**Priority:** P2
**Source:** Patterns extracted from Archify repo analysis (github.com/Salah-XD/archify)

---

## Background

Three patterns from the Archify codebase address finding quality — making
agent output cleaner, more complete, and more resilient to missed changes:

1. **`impliedBy` suppression** — Archify's `techStack.ts` suppresses redundant
   detections: when Next.js is detected, React is suppressed because Next.js
   *implies* React. The adversarial reviewer can produce redundant findings
   (e.g., "missing IPC registration" and "missing type export" for the same
   root cause). An `impliedBy` relationship lets the conductor suppress
   duplicates and present a cleaner report.

2. **Resource-timing backfill with dedup** — Archify wraps `fetch`/`XHR`/`beacon`
   but also runs a `PerformanceObserver` to backfill anything the wrappers
   missed, using a `reported` Set to prevent double-counting. The harness has
   no backfill mechanism for agent actions that bypassed the normal dispatch
   path. A post-run scan comparing `git diff` against the spec's owned files —
   with dedup against already-reported changes — catches unreported
   modifications.

3. **Re-probe after state change** — Archify re-probes globals after SPA route
   changes (`setTimeout(snapshotGlobals, 400)` after `pushState`). The harness
   doesn't trigger rediscovery after merges. Adding a post-merge rediscovery
   step (re-run `hydrateContext`, re-scan architecture fence) keeps the swarm's
   model of the codebase fresh.

---

## Owned Files

```text
packages/swarm/src/finding-suppression.ts
packages/swarm/src/__tests__/finding-suppression.test.ts
packages/swarm/src/types.ts
packages/swarm/src/index.ts
packages/swarm/scripts/post-run-backfill.sh
packages/swarm/scripts/post-merge-reprobe.sh
packages/swarm/templates/agents/conductor.md
packages/swarm/templates/agents/adversarial-reviewer.md
packages/swarm/templates/agents/integrator.md
```

---

## DO NOT

- DO NOT modify product source code or CI workflows
- DO NOT suppress findings silently — every suppressed finding must be logged
  with the parent finding that caused suppression
- DO NOT make backfill a blocking operation — if backfill finds nothing, exit 0;
  if it finds unreported changes, log them as warnings but do not fail the build
- DO NOT make re-probe automatic on every merge — it must be an explicit
  subcommand the conductor or integrator calls
- DO NOT remove existing adversarial reviewer checks — suppression is additive
  to the existing Check 1–9 flow

---

## Exclusion Fence

- `.ai-swarm/agents/` (project-level agent overrides)
- `.ai-swarm/meta-canon.md`
- `packages/swarm-cli/`
- `packages/swarm/scripts/branch-check.sh`
- `packages/swarm/scripts/validate-agent-output.sh`
- `packages/swarm/scripts/drift-detect.sh`
- `packages/swarm/scripts/check-definition-of-ready.sh`
- `packages/swarm/scripts/check-mutation-rate.sh`
- `packages/swarm/scripts/install-worktree-hooks.sh`

---

## Requirements

### Phase 1 — impliedBy finding suppression

**REQ-001**: Add a `FindingSuppressionRule` type to
`packages/swarm/src/types.ts`:

```ts
export interface FindingSuppressionRule {
  childPattern: string;   // regex pattern matching child finding IDs/messages
  parentPattern: string;  // regex pattern matching parent finding IDs/messages
  reason: string;         // human-readable explanation of the implication
}
```

**Rationale:** Archify's `impliedBy` field on tech fingerprints is a declarative
way to say "if X is detected, Y is redundant." The harness needs the same
declarative structure for findings: "if 'missing IPC registration in protocol.ts'
is found, 'missing type export in types.ts' is implied and should be suppressed."

**Owned files:** `packages/swarm/src/types.ts`

**Verification:**
```bash
grep -c "FindingSuppressionRule" packages/swarm/src/types.ts
# Must return >= 1
```

---

**REQ-002**: Create `packages/swarm/src/finding-suppression.ts` exporting a
pure function `suppressImpliedFindings`:

```ts
import type { Finding, FindingSuppressionRule } from './types.js';

export function suppressImpliedFindings(
  findings: Finding[],
  rules: FindingSuppressionRule[],
): { kept: Finding[]; suppressed: { child: Finding; parent: Finding; rule: FindingSuppressionRule }[] } {
  // For each finding, check if it matches any rule's childPattern
  // AND another finding matches the corresponding parentPattern.
  // If both match: suppress the child, record the suppression.
  // Return kept findings + suppression log.
}
```

The function must be pure: same inputs → same outputs, no side effects.

**Rationale:** Archify's `detectTechnologies` does
`out.filter((d) => !(implied.get(d.name)?.some((parent) => found.has(parent))))`.
This is the same logic generalized to findings: if a parent finding exists, the
child is redundant and should be suppressed from the final report.

**Owned files:** `packages/swarm/src/finding-suppression.ts`

**Verification:**
```bash
grep -c "suppressImpliedFindings" packages/swarm/src/finding-suppression.ts
# Must return >= 1

grep -c "kept\|suppressed" packages/swarm/src/finding-suppression.ts
# Must return >= 2
```

---

**REQ-003**: Create `packages/swarm/src/__tests__/finding-suppression.test.ts`
with at least 5 test cases covering: (a) child suppressed when parent present,
(b) child kept when parent absent, (c) multiple children suppressed by one
parent, (d) no suppression when rules array is empty, (e) suppression log
records the rule and parent finding.

**Owned files:** `packages/swarm/src/__tests__/finding-suppression.test.ts`

**Verification:**
```bash
npx vitest run packages/swarm/src/__tests__/finding-suppression.test.ts 2>&1 | grep -c "passed"
# Must return >= 1
```

---

**REQ-004**: Export `suppressImpliedFindings` and `FindingSuppressionRule` from
`packages/swarm/src/index.ts`.

**Owned files:** `packages/swarm/src/index.ts`

**Verification:**
```bash
grep -c "suppressImpliedFindings\|FindingSuppressionRule" packages/swarm/src/index.ts
# Must return >= 2
```

---

**REQ-005**: Amend `packages/swarm/templates/agents/adversarial-reviewer.md` to
add **Check 10 — Implied Finding Suppression**:

```markdown
### Check 10 — Implied Finding Suppression

After running all other checks, review the findings list for implications:
- If finding A's root cause directly causes finding B, mark B as implied by A
- Use the `impliedBy` field in the structured verdict JSON:
  `"implied_by": "<parent-finding-id>"`
- The conductor will suppress implied findings from the final report
- The suppression log is preserved for retrospective analysis

Example: "Missing IPC registration in protocol.ts" (BLOCK-1) implies
"Missing type export in types.ts" (BLOCK-2). Mark BLOCK-2 with
`"implied_by": "BLOCK-1"`.
```

**Rationale:** The adversarial reviewer is the finding producer. It must tag
implied findings so the conductor can suppress them. This keeps the human-facing
report clean without losing information.

**Owned files:** `packages/swarm/templates/agents/adversarial-reviewer.md`

**Verification:**
```bash
grep -c "Check 10\|Implied Finding Suppression\|implied_by" packages/swarm/templates/agents/adversarial-reviewer.md
# Must return >= 3
```

---

**REQ-006**: Amend `packages/swarm/templates/agents/conductor.md` to add a
finding suppression step to the review processing flow:

```markdown
### Finding Suppression (post-review)
After receiving the adversarial reviewer's structured verdict:
1. Parse the `findings` array from the JSON block
2. For each finding with an `implied_by` field, suppress it from the
   human-facing report
3. Log suppressed findings to `.ai-swarm/state/suppression-log.json`
4. Present only non-suppressed findings to the human gate
5. If ALL findings are suppressed (all implied by one root cause), surface
   only the root cause finding
```

**Rationale:** The conductor is the enforcement point for suppression. It must
filter implied findings before presenting to the human gate, but preserve the
full log for retrospectives.

**Owned files:** `packages/swarm/templates/agents/conductor.md`

**Verification:**
```bash
grep -c "Finding Suppression\|suppression-log\|implied_by" packages/swarm/templates/agents/conductor.md
# Must return >= 3
```

---

### Phase 2 — Post-run backfill with dedup

**REQ-007**: Create `packages/swarm/scripts/post-run-backfill.sh` — a script
that:

1. Accepts `<spec-path> <task-branch> <base-branch>` as arguments
2. Parses the spec's "Owned Files" section (same logic as
   `post-merge-scope-check.sh`)
3. Runs `git diff --name-only <base-branch>...<task-branch>` to get actual
   changed files
4. Compares changed files against the Owned Files list
5. For each changed file NOT in the Owned Files list: prints
   `BACKFILL: <file> — not in spec's Owned Files`
6. For each changed file IN the Owned Files list: prints nothing (already
   reported)
7. Prints summary: `Backfill: <N> unreported files, <M> reported files`
8. Exits 0 always (informational, not blocking — the adversarial reviewer
   handles blocking)

The script must use a `reported` set to avoid double-reporting files that appear
in both the diff and the owned files list.

**Rationale:** Archify's `PerformanceObserver` backfills network calls that the
`fetch`/`XHR` wrappers missed, with a `reported` Set to prevent double-counting.
The harness has no backfill for agent actions that bypassed the normal dispatch
path. This script catches unreported modifications after the fact.

**Owned files:** `packages/swarm/scripts/post-run-backfill.sh`

**Verification:**
```bash
chmod +x packages/swarm/scripts/post-run-backfill.sh

# Test: unreported file detected
cat > /tmp/test-spec.md << 'EOF'
## Owned Files
src/foo.ts
EOF
echo "src/bar.ts" > /tmp/test-changed.txt
bash packages/swarm/scripts/post-run-backfill.sh /tmp/test-spec.md HEAD HEAD 2>&1 | grep -c "BACKFILL\|Backfill"
# Must return >= 1
```

---

**REQ-008**: Amend `packages/swarm/templates/agents/conductor.md` to add a
post-run backfill step:

```markdown
### Post-Run Backfill (after implementer handoff)
After receiving the implementer's handoff:
1. Run: `bash .ai-swarm/scripts/post-run-backfill.sh <spec-path> <task-branch> <base-branch>`
2. If BACKFILL lines appear: add them to the review brief for the adversarial
   reviewer as "unreported changes"
3. The adversarial reviewer must account for each BACKFILL file in its review
4. Do NOT block on BACKFILL alone — the reviewer decides if the unreported
   changes are scope breaches
```

**Rationale:** The conductor orchestrates the backfill and feeds results to the
reviewer. The reviewer makes the blocking decision; the conductor just ensures
the backfill runs.

**Owned files:** `packages/swarm/templates/agents/conductor.md`

**Verification:**
```bash
grep -c "Post-Run Backfill\|post-run-backfill\|BACKFILL" packages/swarm/templates/agents/conductor.md
# Must return >= 3
```

---

### Phase 3 — Post-merge re-probe

**REQ-009**: Create `packages/swarm/scripts/post-merge-reprobe.sh` — a script
that:

1. Accepts no arguments (runs in the repo root)
2. Re-runs `hydrateContext` by invoking the swarm CLI's hydrate command, or
   if the CLI is not available, prints a manual checklist:
   - "Re-run: pnpm swarm hydrate"
   - "Check: .ai-swarm/docs/reference/architecture-fence.txt is current"
   - "Check: .ai-swarm/docs/reference/anti-patterns.md is current"
   - "Check: .ai-swarm/docs/reference/deferred-work.md is current"
   - "Check: .ai-swarm/ratchet.json baselines match current codebase"
3. If hydrate succeeds: prints `REPROBE: context refreshed` and exits 0
4. If hydrate fails: prints `REPROBE: hydrate failed — manual check required`
   and exits 1

**Rationale:** Archify re-probes globals after SPA route changes because the
page's "globals" may have changed. The harness's equivalent: after a merge, the
codebase's exports, dependencies, and architecture may have changed. Re-running
`hydrateContext` refreshes the swarm's model of the codebase.

**Owned files:** `packages/swarm/scripts/post-merge-reprobe.sh`

**Verification:**
```bash
chmod +x packages/swarm/scripts/post-merge-reprobe.sh
bash packages/swarm/scripts/post-merge-reprobe.sh 2>&1 | grep -c "REPROBE\|Check:"
# Must return >= 1
```

---

**REQ-010**: Amend `packages/swarm/templates/agents/integrator.md` to add a
post-merge re-probe step:

```markdown
### Post-Merge Re-Probe (mandatory after every merge)
After completing the merge and worktree cleanup:
1. Run: `bash .ai-swarm/scripts/post-merge-reprobe.sh`
2. If REPROBE succeeds: confirm the refreshed context in the handoff report
3. If REPROBE fails: surface to conductor with "REPROBE FAILED — manual context
   refresh required before next spec cycle"
4. The next conductor session must use the refreshed context — do not allow
   a new spec cycle to start with stale context
```

**Rationale:** The integrator is the last agent in the pipeline before the next
cycle starts. It's the natural point to refresh the codebase model. Archify
re-probes after navigation; the harness re-probes after merge.

**Owned files:** `packages/swarm/templates/agents/integrator.md`

**Verification:**
```bash
grep -c "Post-Merge Re-Probe\|post-merge-reprobe\|REPROBE" packages/swarm/templates/agents/integrator.md
# Must return >= 3
```

---

## Completion Gate

```bash
# Phase 1
grep -c "FindingSuppressionRule" packages/swarm/src/types.ts
grep -c "suppressImpliedFindings" packages/swarm/src/finding-suppression.ts
npx vitest run packages/swarm/src/__tests__/finding-suppression.test.ts 2>&1 | grep -c "passed"
grep -c "suppressImpliedFindings\|FindingSuppressionRule" packages/swarm/src/index.ts
grep -c "Check 10\|Implied Finding Suppression\|implied_by" packages/swarm/templates/agents/adversarial-reviewer.md
grep -c "Finding Suppression\|suppression-log\|implied_by" packages/swarm/templates/agents/conductor.md

# Phase 2
chmod +x packages/swarm/scripts/post-run-backfill.sh
bash packages/swarm/scripts/post-run-backfill.sh /tmp/test-spec.md HEAD HEAD 2>&1 | grep -c "BACKFILL\|Backfill"
grep -c "Post-Run Backfill\|post-run-backfill\|BACKFILL" packages/swarm/templates/agents/conductor.md

# Phase 3
chmod +x packages/swarm/scripts/post-merge-reprobe.sh
bash packages/swarm/scripts/post-merge-reprobe.sh 2>&1 | grep -c "REPROBE\|Check:"
grep -c "Post-Merge Re-Probe\|post-merge-reprobe\|REPROBE" packages/swarm/templates/agents/integrator.md

# Build + typecheck
pnpm turbo run build --filter=@vreko-dev/swarm
pnpm turbo run typecheck --filter=@vreko-dev/swarm

# All existing tests still pass
npx vitest run packages/swarm/src/__tests__/ 2>&1 | grep -c "passed"
```

All must pass. Partial completion is NOT acceptable.

---

## R# Verification Summary

| REQ | Description | Status | Count |
|-----|-------------|--------|-------|
| REQ-001 | FindingSuppressionRule type | ? | ?/1 |
| REQ-002 | suppressImpliedFindings pure function | ? | ?/2 |
| REQ-003 | finding-suppression.test.ts test cases | ? | ?/1 |
| REQ-004 | Export from index.ts | ? | ?/2 |
| REQ-005 | AR Check 10 implied suppression | ? | ?/3 |
| REQ-006 | Conductor finding suppression step | ? | ?/3 |
| REQ-007 | post-run-backfill.sh script | ? | ?/1 |
| REQ-008 | Conductor post-run backfill step | ? | ?/3 |
| REQ-009 | post-merge-reprobe.sh script | ? | ?/1 |
| REQ-010 | Integrator post-merge re-probe step | ? | ?/3 |

---

## Rollback

| Phase | Rollback | State after |
|-------|----------|-------------|
| 1 | Revert types.ts, delete finding-suppression.ts and test, revert index.ts, revert AR + conductor prompts | All findings shown; no suppression; existing checks unchanged |
| 2 | Delete post-run-backfill.sh, revert conductor prompt | No backfill; unreported changes undetected |
| 3 | Delete post-merge-reprobe.sh, revert integrator prompt | Stale context possible after merge; no runtime side effects |

No phase introduces a dependency that blocks reverting a prior phase.
