# Spec: Swarm Observability + Anti-Failure-Mode Upgrade

**Spec ID:** swarm-upgrade-observability-prompts
**Branch:** task/swarm-upgrade-observability-prompts
**Base:** dev
**Priority:** P0

---

## Background

Seven patterns of recurring swarm failure have been identified from retrospective data:

1. **Overconfident completion reporting** — agents claim "done" / "complete" / "implemented" with no
   inline evidence; downstream agents accept the claim without verification.
2. **Adversarial Reviewer verdict ambiguity** — reviewer outputs prose verdicts ("mostly fine",
   "approved with minor comments") that are unparseable and untestable.
3. **Scope creep under pressure** — implementer touches files outside the spec's stated scope; no
   automated detection fires.
4. **Telemetry hook composition failure** — if the project wires an observability hook, the hook
   pattern tends to replace the host tool's default emission instead of composing with it, losing
   attributes.
5. **R# verifications that produce spans but skip the actual shell check** — instrumentation without
   verification.
6. **No swarm health gate on merge** — broken swarm config (missing state file, invalid workspace
   JSON) only surfaces at next conductor session start.
7. **Retrospective artifacts are prose, not structured** — cannot be queried or trended across runs.

This spec fixes all seven. It is scoped to swarm framework files only — agent prompts, spec template,
scripts, and a single CLI health-check command. It does not touch product code.

---

## Owned Files

```
.ai-swarm/agents/swarm-conductor.md
.ai-swarm/agents/swarm-adversarial-reviewer.md
.ai-swarm/agents/swarm-spec-writer.md
.ai-swarm/agents/swarm-technical-writer.md
.ai-swarm/scripts/drift-detect.sh
.ai-swarm/scripts/swarm-doctor.sh          ← new file
.ai-swarm/scripts/post-merge-scope-check.sh  ← new file
.ai-swarm/docs/reference/spec-template.md  ← new file
.ai-swarm/meta-canon.md
```

No other files may be touched. If the Implementer determines a change is needed outside this list,
it must surface to Conductor before proceeding. That is a spec gap, not an implementation decision.

---

## DO NOT

- DO NOT modify any product source code, package files, or CI workflows
- DO NOT add project-specific logic to any agent file — all changes must remain project-agnostic
- DO NOT add a `swarm-doctor` command that grows beyond the single check defined in REQ-007 — 
  expansion is intentionally deferred; add a note in the deferred-work registry instead
- DO NOT mark this spec complete without an R# verification table in the handoff message showing
  concrete counts (n/m) for every REQ below — status labels alone are a failure (see REQ-001)
- DO NOT alter the adversarial reviewer's existing Check 1–5 logic — Phase 3 is additive only

---

## Requirements

### Phase 1 — Conductor completion-claim enforcement

**REQ-001**: `swarm-conductor.md` is amended so that any message containing the words "complete",
"implemented", "done", or "finished" in reference to a spec or phase MUST be preceded in the same
message by an inline R# verification table. The table must show `n/m verified` counts, not status
labels. The amendment states explicitly that "all REQs verified" without counts is disallowed.

Verify:
```bash
grep -c "verification table\|n/m\|concrete counts" .ai-swarm/agents/swarm-conductor.md
# Must return >= 2
```

---

### Phase 2 — Adversarial Reviewer structured output

**REQ-002**: `swarm-adversarial-reviewer.md` is amended so that every review pass MUST end with a
fenced JSON block in this exact shape:

```json
{
  "verdict": "approved" | "changes_requested" | "escalate",
  "issues_raised": <integer>,
  "spec_id": "<string>"
}
```

The prose verdict "approved with comments" is explicitly disallowed. Any finding, however minor,
forces `changes_requested`. The JSON block is machine-parseable by the conductor or any wrapper
script without natural-language parsing.

Verify:
```bash
grep -cE '"approved"\|"changes_requested"\|"escalate"' .ai-swarm/agents/swarm-adversarial-reviewer.md
# Must return >= 1

grep -c "approved with comments" .ai-swarm/agents/swarm-adversarial-reviewer.md
# Must return 0
```

**REQ-003**: The adversarial reviewer is amended to compare the diff against the spec's "Owned Files"
section (see REQ-005). Any file in the diff that is not covered by the Owned Files list is a
finding (not an annotation), and forces `changes_requested` at minimum.

Verify:
```bash
grep -c "Owned Files" .ai-swarm/agents/swarm-adversarial-reviewer.md
# Must return >= 1
```

---

### Phase 3 — Spec template: Owned Files section

**REQ-004**: A canonical spec template is created at `.ai-swarm/docs/reference/spec-template.md`.
The template includes a mandatory **Owned Files** section immediately after the DO NOT list. The
section contains a literal path list (one entry per line; globs allowed using `**` syntax with
documented semantics). Specs that omit this section are considered incomplete by the Spec Writer
role.

Verify:
```bash
grep -c "Owned Files" .ai-swarm/docs/reference/spec-template.md
# Must return >= 1

grep -c "DO NOT" .ai-swarm/docs/reference/spec-template.md
# Must return >= 1
```

**REQ-005**: `swarm-spec-writer.md` is amended to list "Owned Files section" as a required section
in the spec output, alongside DO NOT and Requirements. The PF checks (pre-flight) gain a check:
"Does the spec include an Owned Files section with at least one entry?"

Verify:
```bash
grep -c "Owned Files" .ai-swarm/agents/swarm-spec-writer.md
# Must return >= 1
```

---

### Phase 4 — Telemetry hook composition rule (meta-canon)

**REQ-006**: `meta-canon.md §3.1` is amended to add a **Hook Composition Rule**: any observability
hook added to the swarm MUST use a shallow-merge pattern that preserves all host tool attributes.
The hook adds project-specific attributes; it never replaces the host emission. The anti-pattern
(hook replaces host emission, dropping `gen_ai.usage.*` or equivalent) is explicitly named. This
is a canon rule, not an implementation — it governs how operators wire observability, not what they
wire it to.

Verify:
```bash
grep -c "Hook Composition Rule\|shallow.merge\|never replaces" .ai-swarm/meta-canon.md
# Must return >= 2
```

---

### Phase 5 — Scope breach detection script

**REQ-007**: A new script `.ai-swarm/scripts/post-merge-scope-check.sh` is created. It:

1. Accepts `<spec-file> <merge-base-sha> <head-sha>` as arguments
2. Parses the "Owned Files" section from the spec file (lines after `## Owned Files` until the
   next `##` header or EOF)
3. Runs `git diff --name-only <merge-base-sha>..<head-sha>` to get the actual changed files
4. For each changed file, checks whether it matches any entry in the Owned Files list
   (exact match or glob match using `fnmatch`-style semantics)
5. Prints `SCOPE_BREACH: <file>` for each unmatched file and exits non-zero if any breach found
6. Prints `PASS: all <n> changed files within owned scope` and exits 0 if no breach

Verify:
```bash
chmod +x .ai-swarm/scripts/post-merge-scope-check.sh

# Test: breach detected when file is outside owned list
cat > /tmp/test-spec.md << 'EOF'
## Owned Files
src/foo.ts
EOF
echo "src/bar.ts" | bash -c '
  git diff --name-only HEAD~1..HEAD 2>/dev/null || echo "src/bar.ts"
'
bash .ai-swarm/scripts/post-merge-scope-check.sh /tmp/test-spec.md HEAD~1 HEAD 2>/dev/null | grep -c "SCOPE_BREACH\|PASS"
# Must return >= 1 (script runs and produces output)
```

---

### Phase 6 — Swarm doctor script

**REQ-008**: A new script `.ai-swarm/scripts/swarm-doctor.sh` is created. It performs exactly one
check in this phase: verifies that `.ai-swarm/state/current.json` exists and is valid JSON. Output:

- `PASS: state/current.json present and valid JSON` → exit 0
- `FAIL: state/current.json missing` → exit 1
- `FAIL: state/current.json is not valid JSON — <parse error>` → exit 1

No other checks in this phase. A comment at the top of the script reads:
`# Additional checks: open a new spec referencing this file. Do not add checks here without a spec.`

Verify:
```bash
chmod +x .ai-swarm/scripts/swarm-doctor.sh
bash .ai-swarm/scripts/swarm-doctor.sh
echo "exit: $?"
# Must exit 0 (state/current.json exists and is valid JSON)

# Confirm only one check in the script
grep -c "FAIL\|PASS" .ai-swarm/scripts/swarm-doctor.sh
# Must return 2 (one PASS path, one or two FAIL paths)
```

---

### Phase 7 — Retrospective structured output

**REQ-009**: `swarm-technical-writer.md` is amended so that the retrospective output (canon §5.1)
ends with five fenced JSON blocks, one per artifact type. Each block must be on its own line and
parseable independently. Format:

```json
{"retro_kind": "audit_gap", "spec_id": "<string>", "count": <int>, "items": ["..."]}
{"retro_kind": "ratchet_delta", "spec_id": "<string>", "increased": ["..."], "decreased": ["..."]}
{"retro_kind": "spec_outcome", "spec_id": "<string>", "status": "followed"|"diverged"|"abandoned", "reason": "..."}
{"retro_kind": "gate_events", "spec_id": "<string>", "gates": [{"id": "...", "duration_hours": <float>}]}
{"retro_kind": "external_research", "spec_id": "<string>", "citations": <int>, "unresolved": <int>}
```

If an artifact has zero items, the block is still emitted with empty arrays / zero counts. Silent
omission of any of the five blocks is a protocol violation.

Verify:
```bash
grep -c "retro_kind" .ai-swarm/agents/swarm-technical-writer.md
# Must return >= 5

grep -c "audit_gap\|ratchet_delta\|spec_outcome\|gate_events\|external_research" \
  .ai-swarm/agents/swarm-technical-writer.md
# Must return >= 5
```

---

## R# Verification Summary (Implementer handoff requirement)

The Implementer's completion message MUST include a table in this format:

| REQ | Description | Status | Count |
|-----|-------------|--------|-------|
| REQ-001 | Conductor completion-claim rule | ? | ?/2 |
| REQ-002 | AR structured JSON verdict | ? | ?/1 |
| REQ-003 | AR Owned Files enforcement | ? | ?/1 |
| REQ-004 | Spec template with Owned Files | ? | ?/1 |
| REQ-005 | Spec writer PF check updated | ? | ?/1 |
| REQ-006 | meta-canon hook composition rule | ? | ?/2 |
| REQ-007 | post-merge-scope-check.sh | ? | ?/1 |
| REQ-008 | swarm-doctor.sh | ? | ?/2 |
| REQ-009 | Technical writer retro JSON blocks | ? | ?/5 |

Fill in Status (PASS/FAIL) and Count (actual/required) for every row. A message claiming completion
without this table is itself a REQ-001 violation.

---

## Rollback

| Phase | Rollback | State after |
|-------|----------|-------------|
| 1–3 | `git revert` prompt amendment commits | Prior agent behavior resumes |
| 4 | `git revert` meta-canon amendment | Canon reverts; no runtime effect |
| 5–6 | Delete the new scripts | No runtime side effects |
| 7 | `git revert` technical-writer amendment | Manual retrospectives continue |

No phase introduces a dependency that blocks reverting a prior phase.
