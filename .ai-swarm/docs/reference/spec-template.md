# Spec Template

Use this template for every new spec. All sections marked **MANDATORY** must be present.
Specs missing any mandatory section are considered incomplete by the Spec Writer and will be
returned before dispatch.

---

# Spec: <Title>

**Spec ID:** `<kebab-case-id>`
**Branch:** `task/<spec-id>`
**Base:** `dev`
**Priority:** `P0` | `P1` | `P2`

---

## Background

<!-- MANDATORY -->
<!-- 2–5 sentences: what problem this solves, why now, why this scope. -->

---

## Owned Files

<!-- MANDATORY — list every file this spec may create or modify, one per line. -->
<!-- Globs using ** are allowed (e.g. src/utils/**). -->
<!-- Any file touched that is NOT listed here is a scope breach (caught by post-merge-scope-check.sh). -->

```
path/to/file-a.ts
path/to/file-b.ts
.ai-swarm/scripts/new-script.sh   ← new file
```

No other files may be touched. If the Implementer determines a change is required outside this
list, surface to Conductor before proceeding — that is a spec gap, not an implementation decision.

---

## DO NOT

<!-- MANDATORY — at minimum list: -->
- DO NOT modify product source code outside the Owned Files list
- DO NOT add project-specific logic to shared/framework files
- DO NOT mark this spec complete without an R# verification table showing concrete n/m counts for every REQ

---

## Exclusion Fence

<!-- Files and directories that MUST NOT be touched: -->
- `.ai-swarm/` (except files listed in Owned Files above)
- `.claude/`
- `package.json`, `package-lock.json`, `pnpm-lock.yaml` (unless explicitly in Owned Files)

---

## Deferred Items Check

<!-- Grep deferred-work.md for related items before writing phases. -->
<!-- If found: "D[N] is related but explicitly deferred. Do not implement." -->

---

## Architecture Constraints

<!-- Import boundaries from architecture-fence.txt that apply to this spec. -->
<!-- Registration points that must be updated together. -->

---

## Requirements

<!-- MANDATORY — use REQ-NNN format, zero-padded, sequential. -->

### Phase 1 — <Phase Name>

#### REQ-001: <One-line requirement statement>

**Rationale:** Why this requirement exists.
**Owned files:** Explicit list of every file this requirement touches.
**Verification:**
```bash
# Copy-pasteable shell command that proves this requirement is met.
# No substitutions required. Must return a literal string or exit 0.
```
Expected output: `<exact string or "exit 0">`

**Anti-pattern (WRONG):**
```
<!-- Concrete example of what NOT to do -->
```

**Correct (RIGHT):**
```
<!-- Concrete example of what TO do -->
```

---

#### Phase 1 Gate
```bash
# Run all REQ-001..REQ-NNN verifications for this phase.
# All must exit 0 before proceeding to Phase 2.
```

---

### Phase 2 — <Phase Name>

<!-- Add more phases as needed, same structure. -->

---

## R# Verification Summary (Implementer handoff requirement)

<!-- MANDATORY — the Implementer's completion message MUST include this table filled in. -->
<!-- A message claiming completion without this table is a REQ-001 (Conductor) violation. -->

| REQ | Description | Status | Count |
|-----|-------------|--------|-------|
| REQ-001 | <description> | ? | ?/? |

---

## Rollback

| Phase | Rollback | State after |
|-------|----------|-------------|
| 1 | `git revert <commit>` | Prior behavior resumes |

No phase should introduce a dependency that blocks reverting a prior phase.
