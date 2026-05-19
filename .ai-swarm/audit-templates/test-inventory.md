# Audit Template 5: Test Inventory

**Template ID:** T-05
**Template version:** 1.0
**Phase:** Phase 1 (internal) — sub-check
**Canon reference:** §2.2, §2.3
**Used when:** Any spec that adds, removes, or modifies test files, or whose implementation scope touches files that have associated tests. Always fire when the spec explicitly mentions "tests" or "test coverage."

---

## Scope

This template counts and categorizes tests scoped to the packages affected by the spec. It establishes the baseline test health picture so the Adversarial Reviewer can verify test count did not regress post-implementation.

**What this template covers:**
- Total test files per affected package
- Total test cases (it/test/describe blocks) per affected package
- Skipped tests and their reason markers
- Flaky test markers
- Test files that cover the specific symbols the spec touches

**What this template does NOT cover:**
- Whether tests are correct (that is the Reviewer's job)
- E2E or integration test suites outside the package boundary (flag separately if relevant)

---

## Trigger Conditions

**Always fire** when the spec:
1. Adds a new method, class, or module (new tests should be required)
2. Removes a method, class, or module (tests covering removed code must be deleted or updated)
3. Modifies behavior of an existing method (existing tests may need updates)
4. Explicitly states "add tests for X" or "update tests for Y"
5. Adds a new package
6. Touches a file that has `>0` associated test files

**Skip condition (explicit, required):** If the spec scope is purely documentation, configuration, or CI tooling with no source changes, output the acceptable null rather than silently omitting.

---

## Procedure

### Step 1: Identify affected packages

Determine which packages the spec touches based on its file scope. List each package explicitly.

### Step 2: Per-package test counts

For EACH affected package, run ALL four commands:

```bash
PACKAGE="<package-path>"  # e.g., packages/core or apps/api

# Test file count
TEST_FILE_COUNT=$(find "$PACKAGE/src" -name "*.test.ts" -o -name "*.spec.ts" \
  -o -name "*.test.tsx" -o -name "*.spec.tsx" 2>/dev/null | wc -l | tr -d ' ')
echo "Test files in $PACKAGE: $TEST_FILE_COUNT"

# Total test cases (it/test blocks)
TEST_CASE_COUNT=$(grep -rn "^\s*\(it\|test\)(" "$PACKAGE/src" \
  --include="*.test.ts" --include="*.spec.ts" --include="*.test.tsx" --include="*.spec.tsx" \
  2>/dev/null | wc -l | tr -d ' ')
echo "Test cases in $PACKAGE: $TEST_CASE_COUNT"

# Skipped tests
SKIP_COUNT=$(grep -rn "it\.skip\|test\.skip\|xit\|xdescribe\|it\.todo\|test\.todo" \
  "$PACKAGE/src" --include="*.test.ts" --include="*.spec.ts" \
  2>/dev/null | wc -l | tr -d ' ')
echo "Skipped in $PACKAGE: $SKIP_COUNT"

# Flaky markers
FLAKY_COUNT=$(grep -rn "@flaky\|// flaky\|FLAKY\|\.only(" \
  "$PACKAGE/src" --include="*.test.ts" --include="*.spec.ts" \
  2>/dev/null | grep -iv "node_modules\|dist" | wc -l | tr -d ' ')
echo "Flaky markers in $PACKAGE: $FLAKY_COUNT"
```

### Step 3: Locate tests for specific symbols

For each symbol the spec will change, find its test coverage:

```bash
grep -rn "<symbol-name>" <package>/src \
  --include="*.test.ts" --include="*.spec.ts"
```

Record whether dedicated tests exist. If a symbol has 0 test coverage and the spec modifies it, flag as **COVERAGE GAP**.

### Step 4: List skip markers with context

For any skipped test found in Step 2, list each one with its reason marker:

```bash
grep -rn "it\.skip\|test\.skip\|xit\|xdescribe\|it\.todo\|test\.todo" \
  <package>/src --include="*.test.ts" --include="*.spec.ts" -A 1
```

Record: file, line, skip marker type, and any inline reason comment.

---

## Output Format

```
Test Inventory
HEAD SHA: <sha>
Affected packages: <list>

Per-package breakdown:
┌─ <package-name>
│  Test files:   N
│  Test cases:   N
│  Skipped:      N
│  Flaky:        N
│
│  Symbol coverage:
│    <symbol-1>: N test(s) found [files...]
│    <symbol-2>: 0 tests — COVERAGE GAP
│
│  Skip detail:
│    <file>:<line> — <marker> — "<reason or NO_REASON>"
└─ [end package]

Aggregate (all affected packages):
  Total test files:  N
  Total test cases:  N
  Total skipped:     N (compare: ratchet baseline = <stored-value>)
  Total flaky:       N

COVERAGE GAPS (symbol has 0 test coverage and spec modifies it):
  - [list]

SKIP INCREASE WARNING: If this spec adds any skip, it must include a resolution plan.
```

---

## Coverage Gap Protocol

When a **COVERAGE GAP** is found (symbol modified by spec has 0 test coverage):

1. Record the gap in the audit output.
2. The Spec Writer must decide: (a) include test addition in the spec scope, or (b) explicitly exclude it with a recorded rationale.
3. The Adversarial Reviewer verifies that gaps were intentional, not accidental.

A coverage gap is not a BLOCKER by default. It becomes a BLOCKER only if:
- The spec removes the only test file for a package (leaves package with 0 tests), OR
- The symbol being modified is in a contract interface with no tests at all.

---

## Worked Example

**Spec:** Add `validateWorkspaceConfig(config: WorkspaceConfig): ValidationResult` to `packages/core`.

```
Test Inventory
HEAD SHA: b2c3d4e5
Affected packages: packages/core

┌─ packages/core
│  Test files:   12
│  # find packages/core/src -name "*.test.ts" | wc -l → 12
│
│  Test cases:   67
│  # grep -rn "^\s*(it|test)(" packages/core/src --include="*.test.ts" | wc -l → 67
│
│  Skipped:      2
│  # grep -rn "it.skip|test.skip|xit|xdescribe" packages/core/src --include="*.test.ts" | wc -l → 2
│
│  Flaky:        0
│  # grep -rn "@flaky|// flaky|FLAKY" packages/core/src --include="*.test.ts" | wc -l → 0
│
│  Symbol coverage:
│    validateWorkspaceConfig: 0 tests — COVERAGE GAP (new method, must be added by spec)
│    WorkspaceConfig (type): 3 tests in packages/core/src/__tests__/config.test.ts
│
│  Skip detail:
│    packages/core/src/__tests__/loader.test.ts:88 — it.skip — "TODO: implement after v2 migration"
│    packages/core/src/__tests__/loader.test.ts:102 — it.skip — "TODO: same"
└─ [end packages/core]

Aggregate:
  Total test files:  12
  Total test cases:  67
  Total skipped:     2 (ratchet baseline = 2 — PASS)
  Total flaky:       0

COVERAGE GAP:
  - validateWorkspaceConfig: new method; spec must include at least one test.
```

---

## Acceptable Null

If no test gaps are found and no skip regressions are introduced:

```
Test inventory: COMPLETE
Affected packages: <list>
All symbols have existing test coverage.
Skipped count: N (matches ratchet baseline — PASS)
Spec may add or modify tests for affected symbols as scoped.
No coverage gaps. No skip increase.
```

---

## Retrospective Hook

Post-merge, the retrospective records:
- Did the spec add the required tests for COVERAGE GAP symbols?
- Was skip count unchanged or reduced?
- Were any flaky markers added (even temporarily)?

A skip increase that wasn't in the audit pre-approval is a protocol violation requiring a follow-up spec.
