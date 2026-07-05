# Spec: Swarm Upgrade — Agent Accuracy

**Spec ID:** swarm-upgrade-agent-accuracy
**Branch:** task/swarm-upgrade-agent-accuracy
**Base:** dev
**Priority:** P1
**Source:** Patterns extracted from Archify repo analysis (github.com/Salah-XD/archify)

---

## Background

Five patterns from the Archify codebase address agent accuracy — making agent
output measurably correct rather than asserted correct:

1. **Fixture-based accuracy tracking** — Archify's `tests/accuracy.test.ts` loads
   JSON fixtures (curated input→expected-output pairs) and runs the pure engine
   against them, printing a tracked score per group. Agent accuracy becomes a
   tracked number in CI, not a vibe.

2. **Confidence scores on every finding** — every Archify detection carries a
   0–100 confidence score. The conductor currently dispatches on binary
   verdicts; scored findings enable tiered dispatch.

3. **Gated globals** — Archify doesn't just check if a global exists; it gates on
   whether the global is actually registered (renderers for React, apps for Vue).
   The harness's pre-flight checks verify export existence but not usage.

4. **Spec coverage matrix** — Archify plans end with a self-review mapping every
   spec section to the task that implements it, plus a placeholder scan. The
   harness has no such coverage enforcement.

5. **"Honesty over coverage" guardrail** — Archify's CONTRIBUTING.md forbids
   fabricating detections. The harness has no equivalent anti-pattern for
   fabricated verification claims.

---

## Owned Files

```
packages/swarm/src/accuracy.ts
packages/swarm/src/__tests__/accuracy.test.ts
packages/swarm/src/types.ts
packages/swarm/src/index.ts
packages/swarm/src/dispatch.ts
packages/swarm/src/hydrate.ts
packages/swarm/templates/agents/conductor.md
packages/swarm/templates/agents/swarm-spec-writer.md
packages/swarm/templates/agents/swarm-adversarial-reviewer.md
packages/swarm/templates/anti-patterns.template.md
packages/swarm/scripts/check-spec-coverage.sh
.ai-swarm/fixtures/auditor/.gitkeep
.ai-swarm/fixtures/drift-detector/.gitkeep
.ai-swarm/fixtures/adversarial-reviewer/.gitkeep
```

---

## DO NOT

- DO NOT modify product source code or CI workflows
- DO NOT add project-specific fixtures to the swarm package — fixtures live in
  the project's `.ai-swarm/fixtures/` directory, not in the npm package
- DO NOT make confidence scores a blocking gate in this phase — they are
  informational first; the conductor may use them for dispatch decisions but
  must not reject findings below a threshold yet
- DO NOT remove the existing binary verdict system — confidence scores are
  additive, not a replacement

---

## Exclusion Fence

- `.ai-swarm/agents/` (project-level agent overrides)
- `.ai-swarm/meta-canon.md`
- `packages/swarm-cli/`
- `packages/swarm/scripts/swarm-state.sh`
- `packages/swarm/scripts/branch-check.sh`
- `packages/swarm/scripts/drift-detect.sh`
- `packages/swarm/scripts/validate-agent-output.sh`

---

## Requirements

### Phase 1 — Fixture-based accuracy tracking infrastructure

**REQ-001**: Create `packages/swarm/src/accuracy.ts` exporting a pure function
`runAccuracyFixtures` that loads JSON fixtures from a directory, runs a provided
evaluator function against each, and returns a structured score report.

```ts
export interface AccuracyFixture<TInput, TExpected> {
  name: string;
  input: TInput;
  expect: TExpected;
}

export interface AccuracyResult {
  group: string;
  total: number;
  passed: number;
  score: string; // "n/m"
  failures: { name: string; expected: unknown; actual: unknown }[];
}

export function runAccuracyFixtures<TInput, TExpected>(
  fixturesDir: string,
  evaluator: (input: TInput) => TExpected,
  isEqual: (actual: TExpected, expected: TExpected) => boolean,
): AccuracyResult[];
```

The function reads `*.json` files from subdirectories of `fixturesDir` (each
subdirectory = one group), parses each as `AccuracyFixture<TInput, TExpected>`,
runs `evaluator(fixture.input)`, compares via `isEqual`, and returns one
`AccuracyResult` per group.

**Rationale:** Agent accuracy is currently unmeasurable. A pure fixture runner
lets projects curate input→output pairs and track accuracy in CI.

**Owned files:** `packages/swarm/src/accuracy.ts`, `packages/swarm/src/types.ts`

**Verification:**
```bash
grep -c "runAccuracyFixtures" packages/swarm/src/accuracy.ts
# Must return >= 1

grep -c "AccuracyResult" packages/swarm/src/accuracy.ts
# Must return >= 1
```

---

**REQ-002**: Create `packages/swarm/src/__tests__/accuracy.test.ts` with at least
3 test cases covering: (a) all fixtures pass, (b) some fixtures fail and
failures are reported, (c) empty fixture directory returns zero-score result.

**Rationale:** The accuracy runner itself must be tested — it is the trust
foundation for all downstream accuracy tracking.

**Owned files:** `packages/swarm/src/__tests__/accuracy.test.ts`

**Verification:**
```bash
npx vitest run packages/swarm/src/__tests__/accuracy.test.ts 2>&1 | grep -c "passed\|PASS"
# Must return >= 1
```

---

**REQ-003**: Export `runAccuracyFixtures` and its types from
`packages/swarm/src/index.ts`.

**Rationale:** The accuracy runner must be importable by projects using the
swarm package.

**Owned files:** `packages/swarm/src/index.ts`

**Verification:**
```bash
grep -c "runAccuracyFixtures" packages/swarm/src/index.ts
# Must return >= 1
```

---

**REQ-004**: Create fixture directory scaffolding at `.ai-swarm/fixtures/` with
subdirectories for `auditor/`, `drift-detector/`, and `adversarial-reviewer/`,
each containing a `.gitkeep` and a `README.md` explaining the fixture format:

```json
{
  "name": "human description",
  "input": { "role": "auditor", "context": { ... } },
  "expect": { "findings": [...], "verdict": "..." }
}
```

**Rationale:** Projects need a clear place to put curated agent input→output
pairs. The README prevents format drift.

**Owned files:** `.ai-swarm/fixtures/auditor/.gitkeep`,
`.ai-swarm/fixtures/drift-detector/.gitkeep`,
`.ai-swarm/fixtures/adversarial-reviewer/.gitkeep`

**Verification:**
```bash
test -d .ai-swarm/fixtures/auditor && echo "PASS" || echo "FAIL"
test -d .ai-swarm/fixtures/drift-detector && echo "PASS" || echo "FAIL"
test -d .ai-swarm/fixtures/adversarial-reviewer && echo "PASS" || echo "FAIL"
# All must print PASS
```

---

### Phase 2 — Confidence scores on agent findings

**REQ-005**: Add a `ConfidenceScore` type and `Finding` interface to
`packages/swarm/src/types.ts`:

```ts
export type ConfidenceScore = number; // 0–100

export interface Finding {
  id: string;
  severity: 'block' | 'warning' | 'info';
  confidence: ConfidenceScore;
  message: string;
  evidence: string[];
  location?: string;
}
```

**Rationale:** Agent findings currently lack quantified confidence. The
conductor cannot distinguish a 95%-certain missing-registration from a 40%-guess.
This type enables tiered dispatch without changing the existing verdict system.

**Owned files:** `packages/swarm/src/types.ts`

**Verification:**
```bash
grep -c "ConfidenceScore" packages/swarm/src/types.ts
# Must return >= 1

grep -c "interface Finding" packages/swarm/src/types.ts
# Must return >= 1
```

---

**REQ-006**: Export `ConfidenceScore` and `Finding` from
`packages/swarm/src/index.ts`.

**Owned files:** `packages/swarm/src/index.ts`

**Verification:**
```bash
grep -c "ConfidenceScore\|Finding" packages/swarm/src/index.ts
# Must return >= 1
```

---

**REQ-007**: Amend `packages/swarm/templates/agents/adversarial-reviewer.md` to
require a `confidence` field (0–100) on every finding in the structured verdict
JSON block. The JSON shape extends to:

```json
{
  "verdict": "approved" | "changes_requested" | "escalate",
  "issues_raised": <integer>,
  "spec_id": "<string>",
  "findings": [
    {
      "id": "<string>",
      "severity": "block" | "warning" | "info",
      "confidence": <0-100>,
      "message": "<string>",
      "evidence": ["<string>"]
    }
  ]
}
```

The agent prompt must state: *"Confidence reflects the strength of evidence, not
severity. A missing registration with grep proof = 95+. A suspected pattern
without grep = 40–60. A hunch = <30."*

**Rationale:** The adversarial reviewer already produces structured JSON. Adding
confidence to findings lets the conductor route high-confidence blocks
automatically and surface low-confidence ones for human review.

**Owned files:** `packages/swarm/templates/agents/adversarial-reviewer.md`

**Verification:**
```bash
grep -c "confidence" packages/swarm/templates/agents/adversarial-reviewer.md
# Must return >= 2

grep -c '"confidence"' packages/swarm/templates/agents/adversarial-reviewer.md
# Must return >= 1
```

---

### Phase 3 — Gated globals (verify registration, not just existence)

**REQ-008**: Amend `packages/swarm/templates/agents/spec-writer.md` to add
pre-flight check **PF-12: Export usage verification**:

```markdown
**PF-12: Export usage verification (not just existence)**
Before naming any function, type, or constant imported from another package,
verify it is actually used somewhere outside its own index.ts:
```bash
grep -rn "<exported-name>" --include="*.ts" packages/ apps/ src/ \
  | grep -v "node_modules\|dist\|index.ts\|\.test\.\|\.spec\." \
  | grep -v "^Binary" | wc -l
```
Must return >= 1. Zero = the export exists but is dead — treat as a dependency
gap, not a real import target.
```

**Rationale:** Archify gates `__REACT_DEVTOOLS_GLOBAL_HOOK__` on
`renderers.size > 0`, not just existence. The harness's PF-1 checks `grep -n
"^export"` which proves the export exists but not that it's used. Dead exports
look like real dependencies to the spec writer.

**Owned files:** `packages/swarm/templates/agents/spec-writer.md`

**Verification:**
```bash
grep -c "PF-12" packages/swarm/templates/agents/spec-writer.md
# Must return >= 1

grep -c "usage verification" packages/swarm/templates/agents/spec-writer.md
# Must return >= 1
```

---

### Phase 4 — Spec coverage matrix

**REQ-009**: Create `packages/swarm/scripts/check-spec-coverage.sh` — a script
that:

1. Accepts `<spec-path> <plan-path>` as arguments
2. Extracts all `REQ-NNN` identifiers from the spec
3. Extracts all `REQ-NNN` references from the plan
4. Reports any REQ-NNN in the spec that is NOT referenced in the plan as
   `UNCOVERED: REQ-NNN`
5. Exits 0 if all requirements are covered, exits 1 if any are uncovered

**Rationale:** Archify's waitlist plan ends with a self-review mapping every spec
section to its implementing task. Without this, a spec requirement can silently
go unimplemented. The script makes coverage mechanically verifiable.

**Owned files:** `packages/swarm/scripts/check-spec-coverage.sh`

**Verification:**
```bash
chmod +x packages/swarm/scripts/check-spec-coverage.sh

# Test: uncovered requirement detected
echo '### REQ-001: Do thing A' > /tmp/test-spec.md
echo '### REQ-002: Do thing B' >> /tmp/test-spec.md
echo 'REQ-001 is handled in Task 1' > /tmp/test-plan.md
bash packages/swarm/scripts/check-spec-coverage.sh /tmp/test-spec.md /tmp/test-plan.md 2>&1 | grep -c "UNCOVERED"
# Must return >= 1 (REQ-002 is uncovered)

# Test: all covered
echo 'REQ-001 and REQ-002 are handled' > /tmp/test-plan2.md
bash packages/swarm/scripts/check-spec-coverage.sh /tmp/test-spec.md /tmp/test-plan2.md 2>&1 | grep -c "PASS"
# Must return >= 1
```

---

**REQ-010**: Amend `packages/swarm/templates/agents/spec-writer.md` to require
that any implementation plan produced alongside a spec MUST include a "Spec
Coverage" section mapping each `REQ-NNN` to the task/phase that implements it.
Add to the SPEC STRUCTURE section:

```markdown
### 9. Spec Coverage Matrix (mandatory when a plan accompanies the spec)
For each REQ-NNN in the spec, the plan must reference it:
| REQ | Implementing Task | Verification Step |
|-----|-------------------|-------------------|
| REQ-001 | Task 1, Step 3 | Task 1, Step 4 |
```

**Rationale:** The coverage matrix is the plan-side enforcement. The script
(REQ-009) checks it mechanically; the prompt amendment makes the spec writer
produce it.

**Owned files:** `packages/swarm/templates/agents/spec-writer.md`

**Verification:**
```bash
grep -c "Spec Coverage Matrix\|coverage" packages/swarm/templates/agents/spec-writer.md
# Must return >= 2
```

---

### Phase 5 — "Honesty over coverage" anti-pattern

**REQ-011**: Add a new anti-pattern entry to
`packages/swarm/templates/anti-patterns.template.md`:

```markdown
## AP-6: Fabricated Verification

**Description:** An agent claims a verification gate passed without including the
actual command output. The report says "PASS" or "verified" but contains no
shell output excerpt.

**Root cause:** Agents optimize for appearing complete rather than being
complete. Without a mechanical check for output evidence, fabricated
verification propagates downstream.

**Rule:** Every verification claim in an agent report MUST be accompanied by at
least one line of actual command output. "PASS" alone is not evidence — the
command and its output must be present.

**Detection:**
```bash
# Check for verification claims without command output in agent reports
grep -c "PASS\|verified\|green\|✓" <report-file>
# If > 0, check for corresponding ```bash blocks:
grep -c '```bash\|```sh' <report-file>
# If verification claims > 0 and bash blocks == 0 → AP-6 violation
```

**Mitigation:** The conductor rejects any handoff message that claims
verification without inline command output. The adversarial reviewer flags
reports with "PASS" but no shell output as AP-6.
```

**Rationale:** Archify's CONTRIBUTING.md states "Never fabricate a detection."
The harness needs the equivalent: "Never fabricate a verification." This is a
semantic guardrail that acts as a test gate on agent output.

**Owned files:** `packages/swarm/templates/anti-patterns.template.md`

**Verification:**
```bash
grep -c "AP-6\|Fabricated Verification" packages/swarm/templates/anti-patterns.template.md
# Must return >= 2
```

---

**REQ-012**: Amend `packages/swarm/templates/agents/conductor.md` to add a
completion-claim check: before accepting any agent handoff that claims
"complete", "verified", or "pass", the conductor must verify the handoff
contains at least one fenced code block with shell output. Add to the OUTPUT
FORMAT section:

```markdown
### Verification Evidence Check
Before accepting any handoff claiming completion:
1. Check the handoff for fenced code blocks (```bash or ```sh)
2. If verification claims are present but no code blocks exist: REJECT
   with "AP-6: Fabricated Verification — no command output in handoff"
3. This check is mechanical, not semantic — grep for the pattern, don't
   read the prose
```

**Rationale:** The conductor is the enforcement point. Without a mechanical
check, fabricated verification propagates to merge.

**Owned files:** `packages/swarm/templates/agents/conductor.md`

**Verification:**
```bash
grep -c "AP-6\|Fabricated Verification\|Verification Evidence Check" packages/swarm/templates/agents/conductor.md
# Must return >= 2
```

---

## Completion Gate

```bash
# Phase 1
grep -c "runAccuracyFixtures" packages/swarm/src/accuracy.ts
npx vitest run packages/swarm/src/__tests__/accuracy.test.ts 2>&1 | grep -c "passed"
grep -c "runAccuracyFixtures" packages/swarm/src/index.ts
test -d .ai-swarm/fixtures/auditor && echo "PASS" || echo "FAIL"

# Phase 2
grep -c "ConfidenceScore" packages/swarm/src/types.ts
grep -c "ConfidenceScore\|Finding" packages/swarm/src/index.ts
grep -c "confidence" packages/swarm/templates/agents/adversarial-reviewer.md

# Phase 3
grep -c "PF-12" packages/swarm/templates/agents/spec-writer.md

# Phase 4
chmod +x packages/swarm/scripts/check-spec-coverage.sh
bash packages/swarm/scripts/check-spec-coverage.sh /tmp/test-spec.md /tmp/test-plan.md 2>&1 | grep -c "UNCOVERED"
grep -c "Spec Coverage Matrix" packages/swarm/templates/agents/spec-writer.md

# Phase 5
grep -c "AP-6" packages/swarm/templates/anti-patterns.template.md
grep -c "AP-6\|Verification Evidence Check" packages/swarm/templates/agents/conductor.md

# Build + typecheck
pnpm turbo run build --filter=@vreko-dev/swarm
pnpm turbo run typecheck --filter=@vreko-dev/swarm
```

All must pass. Partial completion is NOT acceptable.

---

## R# Verification Summary

| REQ | Description | Status | Count |
|-----|-------------|--------|-------|
| REQ-001 | accuracy.ts pure function | ? | ?/2 |
| REQ-002 | accuracy.test.ts test cases | ? | ?/1 |
| REQ-003 | Export from index.ts | ? | ?/1 |
| REQ-004 | Fixture directory scaffolding | ? | ?/3 |
| REQ-005 | ConfidenceScore + Finding types | ? | ?/2 |
| REQ-006 | Export types from index.ts | ? | ?/1 |
| REQ-007 | AR confidence in JSON verdict | ? | ?/2 |
| REQ-008 | PF-12 export usage check | ? | ?/2 |
| REQ-009 | check-spec-coverage.sh script | ? | ?/2 |
| REQ-010 | Spec coverage matrix in spec-writer | ? | ?/2 |
| REQ-011 | AP-6 anti-pattern entry | ? | ?/2 |
| REQ-012 | Conductor verification evidence check | ? | ?/2 |

---

## Rollback

| Phase | Rollback | State after |
|-------|----------|-------------|
| 1 | Delete accuracy.ts, test, fixtures dir | No accuracy tracking; existing tests unaffected |
| 2 | Revert types.ts additions, index.ts export, AR prompt | Binary verdicts resume; no runtime effect |
| 3 | Revert spec-writer PF-12 addition | PF-1 through PF-11 remain; no runtime effect |
| 4 | Delete check-spec-coverage.sh, revert spec-writer amendment | No coverage enforcement; existing specs unaffected |
| 5 | Revert anti-patterns template, conductor amendment | Existing AP-1 through AP-5 remain; no runtime effect |

No phase introduces a dependency that blocks reverting a prior phase.
