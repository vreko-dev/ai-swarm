# Audit Template 3: Ratchet Baseline Capture

**Template ID:** T-03
**Template version:** 1.0
**Phase:** Phase 1 (internal) — mandatory sub-check for any spec that modifies source
**Canon reference:** §2.2, §2.3
**Used when:** Every spec that modifies or adds source files. Skipped only for pure documentation or config-only changes that cannot affect ratchet metrics.

---

## Scope

This template captures the authoritative "before" state of all tracked degradation ratchets. Counts are taken at HEAD immediately before implementation begins and stored in `state/swarm.db`. The Adversarial Reviewer and post-merge retrospective use these counts to verify no ratchet regressed.

**Ratchets tracked (project-wide by default):**

| Key | What it measures | Count command |
|---|---|---|
| `skip_count` | Skipped/todo tests | `grep -r "it\.skip\|test\.skip\|xit\|xdescribe\|it\.todo\|test\.todo"` |
| `console_log_count` | `console.log` in non-test source | `grep -r "console\.log"` (excl. test/spec files) |
| `empty_catch_count` | Silent empty catch blocks | `grep -rn "catch\s*(.*)\s*{\s*}"` |
| `lint_error_count` | TypeScript / lint errors | `pnpm tsc --noEmit 2>&1 \| grep "error TS" \| wc -l` |

---

## Count Integrity Rules

All rules from Template 1 apply here. Additionally:

5. **Store counts in SQLite, not prose.** After recording counts in the audit report, also insert them into `state/swarm.db`:
   ```bash
   bash .ai-swarm/scripts/swarm-state.sh ratchet-set skip_count <N>
   bash .ai-swarm/scripts/swarm-state.sh ratchet-set console_log_count <N>
   bash .ai-swarm/scripts/swarm-state.sh ratchet-set empty_catch_count <N>
   bash .ai-swarm/scripts/swarm-state.sh ratchet-set lint_error_count <N>
   ```
6. **If a stored baseline already exists:** compare before overwriting. If the current count exceeds the stored baseline, flag as **RATCHET ALREADY ELEVATED** and report the delta before any implementation begins.

---

## Procedure

### Step 1: Read existing baselines from state

```bash
bash .ai-swarm/scripts/swarm-state.sh status | grep -A 20 "Ratchets"
```

If no baselines are stored yet, proceed directly to Step 2.

### Step 2: Capture current counts

Run ALL four commands. Record the command and its raw output.

```bash
# HEAD SHA (pin all counts)
HEAD_SHA=$(git rev-parse HEAD)
echo "HEAD SHA: $HEAD_SHA"

# 1. Skipped tests (project-wide)
SKIP_COUNT=$(grep -r "it\.skip\|test\.skip\|xit\|xdescribe\|it\.todo\|test\.todo" \
  apps/ packages/ --include="*.ts" --include="*.tsx" \
  2>/dev/null | grep -v "node_modules\|dist" | wc -l | tr -d ' ')
echo "skip_count: $SKIP_COUNT"

# 2. console.log in non-test source
CONSOLE_COUNT=$(grep -r "console\.log" apps/ packages/ --include="*.ts" --include="*.tsx" \
  2>/dev/null | grep -v "node_modules\|dist\|__tests__\|\.test\.\|\.spec\." | wc -l | tr -d ' ')
echo "console_log_count: $CONSOLE_COUNT"

# 3. Silent empty catch blocks
EMPTY_CATCH_COUNT=$(grep -rn "catch\s*(.*)\s*{\s*}" apps/ packages/ --include="*.ts" \
  2>/dev/null | grep -v "node_modules\|dist" | wc -l | tr -d ' ')
echo "empty_catch_count: $EMPTY_CATCH_COUNT"

# 4. TypeScript errors
LINT_ERROR_COUNT=$(pnpm tsc --noEmit 2>&1 | grep "error TS" | wc -l | tr -d ' ')
echo "lint_error_count: $LINT_ERROR_COUNT"
```

### Step 3: Compare against stored baselines

For each ratchet:

```
skip_count:
  Stored baseline: <N | "not set">
  Current count:   <M>
  Delta:           <M - N>
  Status:          PASS | RATCHET ALREADY ELEVATED (delta > 0) | NO BASELINE (first capture)
```

### Step 4: Write counts to state

```bash
bash .ai-swarm/scripts/swarm-state.sh ratchet-set skip_count "$SKIP_COUNT"
bash .ai-swarm/scripts/swarm-state.sh ratchet-set console_log_count "$CONSOLE_COUNT"
bash .ai-swarm/scripts/swarm-state.sh ratchet-set empty_catch_count "$EMPTY_CATCH_COUNT"
bash .ai-swarm/scripts/swarm-state.sh ratchet-set lint_error_count "$LINT_ERROR_COUNT"
```

Record confirmation: "4 ratchet baselines written to state/swarm.db at SHA <HEAD_SHA>."

---

## Output Format

```
Ratchet Baseline Capture
HEAD SHA: <sha>
Captured at: <ISO timestamp>

| Ratchet             | Stored | Current | Delta | Status                    |
|---------------------|--------|---------|-------|---------------------------|
| skip_count          | N      | M       | ±K    | PASS / ELEVATED / NEW     |
| console_log_count   | N      | M       | ±K    | PASS / ELEVATED / NEW     |
| empty_catch_count   | N      | M       | ±K    | PASS / ELEVATED / NEW     |
| lint_error_count    | N      | M       | ±K    | PASS / ELEVATED / NEW     |

RATCHET ALREADY ELEVATED ratchets (implementation must not increase these further):
  [list any ELEVATED ratchets]

Counts written to state/swarm.db: YES | NO (explain)
```

---

## RATCHET ALREADY ELEVATED — Protocol

If any ratchet shows ELEVATED status before implementation begins:

1. Record the violation in the audit report with the delta and the files contributing to it.
2. The spec writer must decide: (a) resolve the elevation before implementing, or (b) explicitly scope the spec to not touch the elevated ratchet files.
3. The Adversarial Reviewer will re-check counts post-implementation. A ratchet that was ELEVATED before implementation must not be further elevated after it.
4. If the spec itself resolves the elevation (e.g., removes console.log calls), record the target count as the new baseline goal.

---

## Worked Example

**Before the spec that adds a new service module:**

```
Ratchet Baseline Capture
HEAD SHA: a1b2c3d4
Captured at: 2026-05-14T09:00:00Z

| Ratchet             | Stored | Current | Delta | Status   |
|---------------------|--------|---------|-------|----------|
| skip_count          | 3      | 3       | 0     | PASS     |
| console_log_count   | 7      | 9       | +2    | ELEVATED |
| empty_catch_count   | 1      | 1       | 0     | PASS     |
| lint_error_count    | 0      | 0       | 0     | PASS     |

RATCHET ALREADY ELEVATED:
  - console_log_count: delta +2
    grep -r "console.log" apps/ packages/ --include="*.ts" | grep -v "node_modules|dist|test|spec"
    → apps/backend/src/legacy/loader.ts:88:  console.log('loading...')
    → packages/core/src/utils/debug.ts:14:  console.log('debug hit')

Counts written to state/swarm.db: YES
```

**Spec writer action required:** Acknowledge the 2 pre-existing console.log calls. Spec may not add any new ones.

---

## Acceptable Null

If all ratchets pass and no baselines are elevated:

```
Ratchet baseline capture: COMPLETE
HEAD SHA: <sha>
All 4 ratchets at or below stored baselines. Implementation may proceed.
Counts written to state/swarm.db: YES
```

---

## Retrospective Hook

The retrospective compares ratchet counts at audit time vs. post-merge:
- `skip_count` delta: should be 0 or negative (negative = tests un-skipped)
- `console_log_count` delta: should be 0 or negative
- `empty_catch_count` delta: should be 0 or negative
- `lint_error_count` delta: must be exactly 0

Any positive delta post-merge is a ratchet regression and requires a follow-up spec.
