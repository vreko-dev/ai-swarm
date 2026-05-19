# Audit Template 2: Architecture Fence Check

**Template ID:** T-02
**Template version:** 1.0
**Phase:** Phase 1 (internal) — sub-check
**Canon reference:** §2.2, §2.3
**Used when:** Any spec whose changes could introduce a cross-package import. Always fire when the spec touches `index.ts` exports, new `import` statements, or package.json dependencies.

---

## Scope

This template governs cross-package import boundary verification. It reads the authoritative fence file and verifies that no forbidden import pattern exists (or has been introduced) in the affected packages.

**What this template covers:**
- Forbidden cross-package import directions (A → B when the fence says B must never import from A)
- New import statements introduced by the spec that cross a declared boundary
- Circular import risks flagged in the fence file
- Import pattern violations in test files (test files are not exempt)

**What this template does NOT cover:**
- External library imports (covered by Template 6)
- Internal file-level imports within the same package (not a boundary concern)
- Dev-dependency imports used only in build tooling

---

## Trigger Conditions

Fire this template when ANY of the following are true:

1. The spec adds or modifies an `import` statement in any source file
2. The spec adds a new file to a package that imports from another package
3. The spec modifies `package.json` to add a new dependency
4. The spec moves code between packages
5. The spec creates a new package
6. The Auditor is uncertain whether an import crosses a declared boundary

**Skip condition (explicit, required):** If the spec only modifies files within a single package and adds no new `import` statements, the Auditor outputs the acceptable null below rather than silently omitting this check.

---

## Fence File Location

```
.ai-swarm/docs/reference/architecture-fence.txt
```

If the fence file does not exist, output:
```
FENCE FILE ABSENT: .ai-swarm/docs/reference/architecture-fence.txt not found.
Architecture fence check SKIPPED — create the fence file to enable this check.
```

This is a WARNING, not a blocker. Do not block the spec on a missing fence file; flag it for the DevSecOps agent to create.

---

## Output Format

### Per-boundary output block

For each boundary declared in the fence file, run the grep and record exact output:

```
Boundary: <package-A> must NOT import from <package-B>
Grep command: grep -rn "from '@your-org/package-b'" packages/package-a/src/ --include="*.ts" | grep -v "node_modules|dist"
Result:
  → PASS (0 matches)

  OR

  → VIOLATION: packages/package-a/src/service.ts:42:  import { Foo } from '@your-org/package-b'
```

### Diff-scoped check (for newly introduced violations)

After checking all existing violations, also check whether the spec's diff introduces new ones:

```bash
# Extract new import lines from the diff
git diff <base>...<branch> | grep "^+" | grep -E "^\\+.*import.*from"
```

Flag any new cross-boundary import introduced by the diff as **VIOLATION (NEW — introduced by this spec)**.

### Summary block

```
Architecture fence summary:
- Fence file: PRESENT | ABSENT
- Boundaries checked: N
- PASS: N
- VIOLATION: N
  - [list each violation with file:line]
- NEW violations introduced by this diff: N

Status: PASS | VIOLATION
```

---

## Worked Example

**Fence file declares:**
```
# packages/ui must NOT import from packages/core-internals
# packages/api must NOT import from packages/ui
```

**Grep outputs:**
```
Boundary 1: packages/ui → packages/core-internals (FORBIDDEN)
grep -rn "from '@your-org/core-internals'" packages/ui/src/ --include="*.ts"
→ 0 matches — PASS

Boundary 2: packages/api → packages/ui (FORBIDDEN)
grep -rn "from '@your-org/ui'" packages/api/src/ --include="*.ts"
→ packages/api/src/routes/login.ts:7:  import { Button } from '@your-org/ui'
→ VIOLATION: packages/api/src/routes/login.ts:7
```

**Summary:**
```
Architecture fence summary:
- Fence file: PRESENT
- Boundaries checked: 2
- PASS: 1
- VIOLATION: 1
  - packages/api/src/routes/login.ts:7 (import Button from @your-org/ui)
- NEW violations introduced by this diff: 0 (pre-existing violation)

Status: VIOLATION
```

**Blocker:** Pre-existing violation must be acknowledged in the spec or resolved before implementation can proceed. Record as BLOCKER if the spec scope touches the violating file.

---

## Acceptable Null

If all boundaries pass and no new violations are introduced:

```
Architecture fence check: PASS
- Fence file: PRESENT
- Boundaries checked: N
- All PASS — no cross-boundary violations found or introduced by this spec.
```

---

## Integration with Template 1 (Internal Ground Truth)

Section 6 of Template 1 (Architecture Fence) provides a lightweight summary of this check. When Template 2 is fired as a standalone or deeper pass, its output supersedes the §6 summary. Record both and note which is authoritative:

```
Template 1 §6: PASS (shallow check)
Template 2 (full): VIOLATION — see full output above
Authoritative: Template 2 result governs.
```

---

## Retrospective Hook

After each run involving this template, the retrospective records:
- Number of boundaries checked
- Number of pre-existing violations found (separate from spec-introduced ones)
- Whether violations blocked the spec or were acknowledged as pre-existing

If violations are consistently pre-existing (never introduced by specs), the fence file may need updating or the violations need remediation tickets.
