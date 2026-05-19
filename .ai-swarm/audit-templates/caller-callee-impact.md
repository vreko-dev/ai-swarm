# Audit Template 4: Caller / Callee Impact Analysis

**Template ID:** T-04
**Template version:** 1.0
**Phase:** Phase 1 (internal) — mandatory when any method signature changes
**Canon reference:** §2.2, §2.3
**Used when:** Any spec that adds, modifies, or removes a method, function, class, or exported type. Mandatory for signature changes. Optional (but recommended) for pure implementation changes with no interface effect.

---

## Scope

This template enumerates callers and callees for any method being changed. It establishes the blast radius of a signature change before implementation begins, so the Implementer knows which files need simultaneous updates.

**What this template covers:**
- Direct callers: all call sites in the codebase that invoke the target method
- Indirect callers: callers-of-callers one hop away when the direct caller count is >0
- Callees: downstream methods and services invoked by the target method body
- Test callers: call sites in test files (flagged separately — test updates may be required)
- Type callers: places where the method's return type or parameter type is referenced

**What this template does NOT cover:**
- Dynamic dispatch through string keys (flag as UNVERIFIABLE if suspected)
- Methods called only through reflection or eval
- External consumer callers outside the repository

---

## Trigger Conditions

**Mandatory** — fire this template when the spec describes ANY of:
1. Modifying a method signature (parameter types, return type, parameter count)
2. Renaming a method
3. Removing a method or export
4. Adding a new required parameter to an existing method
5. Changing a function from sync to async (or vice versa)
6. Changing a method's visibility (public ↔ private ↔ protected)

**Optional but recommended:**
7. Adding a new method that has callers in stubs or mocks
8. Adding an overload to an existing method

**Skip condition (explicit, required):** If the spec adds only a brand-new method with zero existing call sites, this template reduces to confirming zero callers and recording it. Output the "new method, zero callers" acceptable null below.

---

## Caller Discovery

### Step 1: Direct callers

```bash
# Replace <MethodName> with the exact method/function name
# Replace <repo-root> with the repository root path (usually ".")

grep -rn "<MethodName>\|<methodName>" <repo-root> \
  --include="*.ts" --include="*.tsx" \
  | grep -v "node_modules\|dist\|\.d\.ts" \
  | grep -v "^Binary"
```

Categorize each result:
- **DEFINITION** — where the method is defined (should be exactly 1)
- **CALL SITE** — an invocation of the method
- **TYPE REFERENCE** — a reference in a type annotation or interface
- **TEST CALL SITE** — a call site in a `*.test.ts` or `*.spec.ts` file
- **MOCK/STUB** — a mock or stub of the method

### Step 2: Callers-of-callers (one hop) — only if direct call count > 3

For each file containing a direct call site, check who calls the function that calls the target:

```bash
CALLER_FN="<functionNameContainingDirectCallSite>"
grep -rn "$CALLER_FN" <repo-root> --include="*.ts" \
  | grep -v "node_modules\|dist\|\.d\.ts\|definition"
```

Record hop-1 caller count. Do not recurse further — deeper blast radius analysis is out of scope.

### Step 3: Callee enumeration

Read the method body and list every downstream call:

```bash
# Read the method body
grep -n -A 50 "function <methodName>\|<methodName>.*{" <file>
```

For each callee:
- Name of called method
- File containing the callee definition
- Whether the callee signature is affected by the spec

---

## Impact Classification

After enumeration, classify the overall change:

```
SAFE — 0 call sites, new method or dead code removal
LOW — 1–3 call sites in non-critical paths, all in same package
MEDIUM — 4–10 call sites, or call sites span multiple packages
HIGH — 10+ call sites, or call sites in public API / external consumers
CRITICAL — call sites in released contract interfaces or SDK exports
```

---

## Output Format

```
Caller / Callee Impact Analysis
Target: <MethodName> in <file>:<line>
Change type: ADD | MODIFY_SIGNATURE | MODIFY_IMPL_ONLY | RENAME | REMOVE
HEAD SHA: <sha>

CALLERS:
  Direct call sites: N
    - <file>:<line> — <CALL SITE | TEST CALL SITE | TYPE REFERENCE | MOCK>
    [...]
  Test call sites: N (test files require update if signature changes)
  Type references: N

  Callers-of-callers (1 hop): N (only enumerated when direct > 3)
    [...]

CALLEES:
  - <called-method> at <file>:<line>
  - <called-method> at <file>:<line> (AFFECTED if spec changes this too)

IMPACT CLASSIFICATION: SAFE | LOW | MEDIUM | HIGH | CRITICAL
Rationale: [one sentence]

FILES REQUIRING SIMULTANEOUS UPDATE (if signature changes):
  - [list each call-site file that must be updated at the same time]
  Total: N files

BLOCKERS:
  - [any CRITICAL call site that makes this change too risky without a migration plan]
```

---

## Worked Example

**Spec:** Rename `getUserById(id: string)` → `getUserById(id: UserId)` (type narrowing)

**Step 1 output:**
```
grep -rn "getUserById" . --include="*.ts" | grep -v "node_modules|dist"
→ packages/core/src/user/user.service.ts:42:  async getUserById(id: string): Promise<User>
→ packages/core/src/user/user.service.ts:56:  return this.getUserById(user.id)
→ apps/api/src/handlers/user.handler.ts:18:  const user = await userService.getUserById(req.params.id)
→ apps/api/src/handlers/admin.handler.ts:34:  const user = await userService.getUserById(adminId)
→ packages/core/src/user/__tests__/user.service.test.ts:15:  await service.getUserById('user-123')
→ packages/core/src/user/__tests__/user.service.test.ts:28:  await service.getUserById(testUserId)
```

**Classification:**
```
CALLERS:
  Direct call sites: 3 (excluding definition and internal self-call)
    - apps/api/src/handlers/user.handler.ts:18 — CALL SITE
    - apps/api/src/handlers/admin.handler.ts:34 — CALL SITE
    - packages/core/src/user/__tests__/user.service.test.ts:15 — TEST CALL SITE
    - packages/core/src/user/__tests__/user.service.test.ts:28 — TEST CALL SITE
  Test call sites: 2

IMPACT CLASSIFICATION: MEDIUM
Rationale: 2 production call sites + 2 test call sites across 3 files; spans 2 packages.

FILES REQUIRING SIMULTANEOUS UPDATE:
  - apps/api/src/handlers/user.handler.ts (req.params.id must be cast to UserId)
  - apps/api/src/handlers/admin.handler.ts (adminId must be typed as UserId)
  - packages/core/src/user/__tests__/user.service.test.ts (test strings must be UserId)
  Total: 3 files
```

---

## Acceptable Null (new method, zero callers)

```
Caller / Callee Impact Analysis
Target: <MethodName> (NEW — not yet defined)
Change type: ADD (new method)

CALLERS: 0 — method does not yet exist. No call sites to enumerate.
CALLEES: [list any downstream calls from the new method body if spec describes it]
IMPACT CLASSIFICATION: SAFE
Files requiring simultaneous update: 0

No caller/callee impact. Spec may proceed.
```

---

## Retrospective Hook

After each run:
- Record how many call sites required simultaneous update
- Note whether any were missed (discovered during implementation)
- If >20% of call sites were missed, the template needs a broader grep strategy (e.g., search by class name, not just method name)
