# Anti-Patterns — Engineering Swarm

> Project-specific anti-patterns should be added here. The entries below are
> generic patterns that apply to most TypeScript/Node.js projects. Remove or
> adapt as needed for your project.

## AP-1: Graceful Empty Returns

**Root cause:** Functions that return empty arrays/objects/null instead of
throwing when a precondition is violated. Callers cannot distinguish "no data"
from "precondition failed."

**Rule:** If a function has a precondition (e.g., "config must be loaded"),
violating it must throw, not return an empty value.

**Detection:**
```bash
grep -rn "return \[\]\|return {}\|return null" --include="*.ts" \
  | grep -v "test\|spec\|node_modules\|dist" | wc -l
```

**Mitigation:** Replace empty returns with explicit throws. Use a custom
error class so callers can distinguish expected-empty from precondition-violation.

---

## AP-2: Inlined Constants

**Root cause:** Magic numbers and string literals embedded directly in business
logic instead of routing through a constants module or configuration service.

**Rule:** Any value used in more than one file must be extracted to a shared
constant. Any value that represents a business rule (threshold, limit, key)
must be a named constant.

**Detection:**
```bash
grep -rn "[0-9]\{4,\}\|['\"][a-z_-]*['\"]" --include="*.ts" \
  | grep -v "test\|spec\|node_modules\|dist\|const\|import\|export" | wc -l
```

**Mitigation:** Extract to a constants file. Use `{{SWARM_DIR}}/docs/reference/architecture-fence.txt`
to document the canonical location for constants.

---

## AP-3: Silent Catch Blocks

**Root cause:** Catch blocks that swallow errors without re-throwing, logging,
or handling. The error disappears and the system continues in an inconsistent
state.

**Rule:** Every catch block must either re-throw, log with context, or
explicitly handle the error. Empty catch blocks are forbidden.

**Detection:**
```bash
grep -rn "catch\s*(.*)\s*{\s*}" --include="*.ts" \
  | grep -v "node_modules\|dist" | wc -l
```

**Mitigation:** Add logging with error context, or re-throw with a wrapped
error that includes the operation that failed.

---

## AP-4: Phantom Exports

**Root cause:** Functions, types, or constants exported from a package's
index.ts but never imported by any consumer. They create a maintenance
surface with no consumers.

**Rule:** Every export must have at least one external consumer. Unused
exports should be removed or marked as `@internal`.

**Detection:**
```bash
# For each export in index.ts, check if it's imported elsewhere
grep -rn "^export" packages/*/src/index.ts \
  | while read line; do
      symbol=$(echo "$line" | sed 's/.*export.*\(function\|const\|class\|type\|interface\) \([a-zA-Z_]*\).*/\2/')
      count=$(grep -rn "$symbol" --include="*.ts" | grep -v "node_modules\|dist\|test\|spec" | grep "import" | wc -l)
      if [ "$count" -eq 0 ]; then echo "PHANTOM: $symbol"; fi
    done
```

**Mitigation:** Remove the export, or add a consumer, or mark as `@internal`.

---

## AP-5: Skipped Tests

**Root cause:** Tests marked with `.skip` or `xit` that are silently excluded
from the test suite. They accumulate and hide real test failures.

**Rule:** No skipped tests in the main branch. Skipped tests must have a
linked issue and a removal date.

**Detection:**
```bash
grep -rn "it\.skip\|xit\|test\.skip\|xdescribe" --include="*.ts" --include="*.js" \
  | grep -v "node_modules\|dist" | wc -l
```

**Mitigation:** Fix the test, or remove it, or link an issue with a removal date.

---

## AP-6: Unverified External Research

**Root cause:** Agents cite external documentation or APIs from memory without
verifying the current state. The cited API may have changed, been deprecated,
or never existed.

**Rule:** All external research must be verified by reading the actual source
(URL, package, or file) before citation. Unverifiable claims must be marked as
unresolved.

**Detection:**
```bash
grep -rn "according to\|per the docs\|from memory\|as I recall" --include="*.md" \
  | grep -v "node_modules\|dist" | wc -l
```

**Mitigation:** Replace memory-based citations with verified references. Use
the researcher role to bootstrap knowledge from primary sources.

---

## AP-7: Spec Divergence Without Amendment

**Root cause:** The implementer diverges from the spec (different approach,
different file layout, different API) without filing a spec amendment. The
spec and code drift apart, making verification impossible.

**Rule:** Any divergence from the spec requires a spec amendment (a new section
in the spec documenting the change and rationale). The spec is the definition
of done — if it doesn't match the code, the work is incomplete.

**Detection:**
```bash
# Compare spec verification commands against actual code structure
grep -rn "TODO\|FIXME\|HACK\|WORKAROUND" --include="*.ts" \
  | grep -v "node_modules\|dist\|test\|spec" | wc -l
```

**Mitigation:** File a spec amendment before diverging. Update the spec's
verification commands to match the new approach.

---

## AP-8: Gate Bypass

**Root cause:** An agent proceeds past a gate without closing it, or skips a
gate entirely. The gate discipline breaks down and unreviewed code reaches
the main branch.

**Rule:** Gates are opened before a gated phase begins and closed only after
human approval. No agent may proceed past an open gate.

**Detection:**
```bash
# Check for open gates in state file
jq '.open_gates | length' .ai-swarm/state/current.json 2>/dev/null || echo "0"
```

**Mitigation:** Always use swarm-state.sh to open and close gates. Never
proceed past an open gate without human approval.

---

## AP-9: Silent Omission in Retrospective

**Root cause:** The retrospective protocol requires five JSON blocks. When a
block has zero items, the agent omits it entirely instead of emitting an empty
block. The retrospective becomes incomplete and trends are invisible.

**Rule:** If an artifact has zero items, the block is still emitted with empty
arrays or zero counts. Silent omission is a protocol violation.

**Detection:**
```bash
# Check retrospective for all 5 required blocks
grep -c "audit_gap\|ratchet_delta\|spec_outcome\|gate_events\|external_research" \
  .ai-swarm/retrospectives/*.json 2>/dev/null || echo "0"
```

**Mitigation:** Always emit all five blocks, even when empty. Use the
technical-writer role to ensure completeness.
