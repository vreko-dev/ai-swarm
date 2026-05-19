# Audit Template 1: Internal Ground Truth

**Template ID:** T-01
**Template version:** 1.0
**Phase:** Phase 1 (internal) of two-phase audit protocol
**Canon reference:** §2.2, §2.3
**Used when:** Every audit, without exception. Phase 1 must complete and close before Phase 2 begins.

---

## Scope

This template governs Phase 1 of the audit protocol — the internal ground truth pass. It establishes verified codebase state using grep, not memory or prior agent output.

**What this template covers:**
- Symbol existence (methods, exports, types, imports the spec touches)
- Caller/callee analysis for any method being added, modified, or removed
- Test inventory for affected packages
- Ratchet baseline capture (counts for tracked degradation metrics)
- Architecture fence compliance for affected packages
- Deferred work check

**What this template does NOT cover:**
- External library semantics (covered by Phase 2 / Template 6)
- Cross-package import boundaries in depth (covered by Template 2)
- Method signature impact analysis in depth (covered by Template 4)

---

## Count Integrity Rules (mandatory for every count in this report)

1. **Every numeric count must show the command that produced it**, immediately below:
   ```
   Export count: 42
   # grep -c '^export' packages/contracts/src/index.ts
   42
   ```
2. **Pin all counts to HEAD SHA.** Run `git rev-parse HEAD` at audit start. Every count is only valid at that SHA.
3. **UNTRUSTED marker.** Any count received from another agent's output must be labeled `UNTRUSTED` and re-verified before use.
4. **Re-run, never recall.** If you ran a grep earlier in this session, run it again. Stale counts are worse than missing counts.

---

## Section 1: Audit Header (mandatory)

```
HEAD SHA: <output of git rev-parse HEAD>
Audit started: <ISO timestamp>
Auditor: swarm-auditor
Task description: <one sentence>
Affected packages / files (preliminary): <list>
```

---

## Section 2: Symbol Existence

For every symbol the spec will add, modify, or remove, run the grep and record exact output.

```bash
# Does the target method/function/type already exist?
grep -rn "<symbol-name>" <affected-package>/src/ --include="*.ts"

# Does the export exist at the package boundary?
grep -n "^export.*<symbol-name>" <package>/src/index.ts

# Is the import used by callers?
grep -rn "import.*<symbol-name>" <repo-root> --include="*.ts" | grep -v "node_modules|dist"
```

Record:
- **EXISTS** — file path + line number
- **ABSENT** — explicit confirmation the symbol does not exist
- **AMBIGUOUS** — multiple definitions found; list all locations

If a symbol the spec assumes exists is ABSENT, this is a **BLOCKER**. Flag immediately.

---

## Section 3: Caller / Callee Analysis

For any method being added, modified, or removed, run both directions.

**Callers (who calls this method):**
```bash
grep -rn "<method-name>\|<MethodName>" <repo-root> --include="*.ts" \
  | grep -v "node_modules|dist|\.test\.|\.spec\."
```

**Callees (what this method calls):**
Read the method body and list any downstream methods/services it invokes.

Record:
- Number of call sites: N
- Files containing call sites: list
- Any call site in a test file: flag separately (test update may be required)

If N > 0 and the spec modifies a method signature: this is a **HIGH RISK** finding. Reference Template 4 for full impact analysis.

---

## Section 4: Test Inventory

Scope to the packages affected by this spec.

```bash
# Total test files
find <package>/src -name "*.test.ts" -o -name "*.spec.ts" | wc -l

# Total test cases (it/test blocks)
grep -rn "^\s*\(it\|test\)(" <package>/src --include="*.test.ts" --include="*.spec.ts" | wc -l

# Skipped tests (any skip marker)
grep -rn "it\.skip\|test\.skip\|xit\|xdescribe\|it\.todo\|test\.todo" \
  <package>/src --include="*.test.ts" --include="*.spec.ts" | wc -l

# Flaky markers
grep -rn "@flaky\|// flaky\|FLAKY" <package>/src --include="*.test.ts" | wc -l
```

Record all four counts with commands. Compare skip count against ratchet baseline if available in `state/swarm.db`.

---

## Section 5: Ratchet Baseline

Capture current counts for all tracked degradation ratchets. These become the "before" reference for the retrospective ratchet delta.

```bash
# Skipped tests (project-wide)
grep -r "it\.skip\|test\.skip\|xit\|xdescribe\|it\.todo\|test\.todo" \
  apps/ packages/ --include="*.ts" | grep -v "node_modules|dist" | wc -l

# console.log in non-test source
grep -r "console\.log" apps/ packages/ --include="*.ts" \
  | grep -v "node_modules|dist|__tests__|\.test\.|\.spec\." | wc -l

# Silent empty catch blocks
grep -rn "catch\s*(.*)\s*{\s*}" apps/ packages/ --include="*.ts" \
  | grep -v "node_modules|dist" | wc -l

# TypeScript errors
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
```

Record each count with the command. If any count exceeds the stored ratchet baseline, flag as **RATCHET ALREADY ELEVATED** before implementation begins.

---

## Section 6: Architecture Fence

Read `.ai-swarm/docs/reference/architecture-fence.txt` and run the grep checks for each relevant boundary.

For each import boundary the spec's changes could affect:

```bash
# Example: verify package A does not import from package B
grep -rn "from '@your-org/forbidden-package'" <source-package>/src/ --include="*.ts" \
  | grep -v "node_modules|dist"
```

Record:
- **PASS** — no violations found
- **VIOLATION** — file path + line number of the violation

If the spec itself would create a new cross-boundary import: flag as **ARCHITECTURE CONCERN** and require spec writer to address it.

---

## Section 7: Deferred Work Check

```bash
cat .ai-swarm/docs/reference/deferred-work.md | grep -E "^| D[0-9]"
```

For each deferred item, determine whether the spec's scope touches it. Record:
- **TOUCHING D-N** — the spec scope overlaps with a deferred item (BLOCKER unless explicitly approved)
- **CLEAR** — no overlap found

---

## Section 8: Summary and Highest-Priority Action

```
Audit summary:
- Files affected: N
- Methods found/absent: list with PRESENT/ABSENT verdict
- Test count: N tests, M skipped
- Ratchet baseline: [counts]
- Architecture fence: PASS / VIOLATION
- Deferred work: CLEAR / TOUCHING D-N

BLOCKERS (implementation cannot proceed until resolved):
1. [if any]

Single highest-priority action for the Spec Writer:
[One sentence. What the spec writer most needs to know from this audit.]
```

---

## Acceptable Null

If Phase 1 finds no blockers and all checks pass:

```
Phase 1 status: COMPLETE — no blockers found.
Counts pinned to SHA: <sha>
Single highest-priority action: Proceed to spec writing. No pre-conditions outstanding.
```

Silent omission of any section is a protocol violation. If a section produces no findings, record "0 matches" with the command that confirmed it.

---

## Worked Example

**Task:** Add a new `getWorkspaceConfig()` method to `packages/core/src/config.ts`

**Section 2 output:**
```
Symbol: getWorkspaceConfig
grep -rn "getWorkspaceConfig" packages/ --include="*.ts"
→ 0 matches (ABSENT — method does not yet exist)

Export at boundary:
grep -n "^export.*getWorkspaceConfig" packages/core/src/index.ts
→ 0 matches
```

**Section 3 output:**
```
Callers: 0 (method is new, no callers yet)
Callees: will call config.load() internally — see existing implementation at packages/core/src/config.ts:42
```

**Section 4 output:**
```
Test files in packages/core: 8
# find packages/core/src -name "*.test.ts" | wc -l → 8

Test cases: 43
# grep -rn "^\s*(it|test)(" packages/core/src --include="*.test.ts" | wc -l → 43

Skipped: 0
# grep -rn "it.skip|test.skip|xit|xdescribe" packages/core/src --include="*.test.ts" | wc -l → 0
```

**Section 8 output:**
```
Single highest-priority action: Spec may proceed. New method with 0 callers. Add export to index.ts — not currently exported.
```
