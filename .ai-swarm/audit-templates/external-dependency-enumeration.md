# Audit Template 6: External Dependency Assumption Enumeration

**Template ID:** T-06
**Template version:** 1.0
**Phase:** Phase 2 (external) of two-phase audit protocol
**Canon reference:** §2.2, §2.3, §3.5

---

## Scope

This template governs Phase 2 of the audit protocol — the external assumption surfacing pass. It applies when the spec contains non-trivial claims about external system behavior. It is skipped for thick (R#-driven, file-and-line-enumerated) specs per §4.7.

**What this template covers:**
- Library version semantics (what version X.Y of a dependency does or does not do)
- Third-party API surfaces (endpoint shape, auth pattern, rate limits, retry semantics)
- Native module behavior (JS/native boundary, platform-specific behavior)
- Breaking changes between versions (especially silent ones)
- Undocumented or under-documented limits (quota, timeout, payload size)
- Any behavioral claim about an external system the operator has not personally verified in the past 30 days

**What this template does NOT cover:**
- Internal codebase state (covered by Phase 1 / Template 1)
- Trivially-known facts ("TypeScript compiles to JavaScript") — no citation required
- Internal decisions fully under operator control

---

## Triggers

Fire this template when ANY of the following are true:

1. The spec references a specific library version and makes a claim about its behavior
2. The spec calls an external API or SDK and describes expected request/response shape
3. The spec depends on a third-party service's rate limits, quotas, or retry behavior
4. The spec integrates with a native Node.js module or platform-specific feature
5. The spec mentions migrating between major versions of a dependency
6. The spec describes behavior that "changed in version X" or "no longer works in version Y"
7. The spec references undocumented or recently-documented behavior
8. The Auditor is uncertain whether a claim is internally verifiable

**Skip condition (explicit, required):** If none of the above triggers apply, the Auditor outputs the acceptable null (see Output Format below) rather than silently omitting the external-findings section.

---

## Tool Access

Auditor tools during Phase 2:

| Tool | Purpose |
|---|---|
| `web_search` | Search for current documentation, changelogs, issue trackers |
| Library/docs MCP | Retrieve curated, version-specific library documentation |
| GitHub search | Find issues, PRs, or release notes confirming behavioral claims |
| Read (local) | Cross-reference pinned dependency versions in package.json |

**Constraints:**
- Do not use web_search to re-research Phase 1 findings — Phase 1 is already closed
- Citations must resolve at the time of audit; check that source URLs are live
- Prefer official documentation over community posts; note if only community sources are available
- Do not defer citation work to Spec Writer or Implementer

---

## Output Format

The Phase 2 output is the `external-findings` section. It must appear in every audit report regardless of assumption count.

### When external assumptions exist

Each assumption gets one citation block:

```yaml
external-findings:
  - claim: "<Exact statement from the spec about external system behavior>"
    source: "<Full URL to authoritative documentation>"
    excerpt: "<Verbatim quote from the source confirming the claim>"
    date-accessed: "<YYYY-MM-DD>"

  - claim: "<Second claim if applicable>"
    source: "<URL>"
    excerpt: "<Verbatim quote from the source confirming the claim>"
    date-accessed: "<YYYY-MM-DD>"
```

**Required four fields per citation:**
- `claim` — the spec statement being verified, quoted or closely paraphrased
- `source` — the authoritative URL (official docs, changelog, RFC, vendor issue tracker)
- `excerpt` — verbatim text from the source confirming the claim; this survives URL rot
- `date-accessed` — the ISO date the Auditor retrieved the source

### REFUSAL MODE — unresolvable assumption

If the Auditor searches and cannot find a citation that resolves the claim:

```yaml
external-findings:
  - claim: "<Statement from the spec>"
    source: UNRESOLVED
    excerpt: "<Describe what was searched and what was found>"
    date-accessed: "<YYYY-MM-DD>"
    action-required: "SPEC BLOCKED — non-trivial external assumption lacks citation. Return to Spec Writer."
```

A single UNRESOLVED entry blocks the spec from proceeding to implementation. The Spec Writer must either provide the citation, remove the assumption, or scope the spec to avoid the dependency.

### Acceptable null

If no non-trivial external assumptions are identified:

```yaml
external-findings: "no non-trivial external assumptions identified — all dependencies internal or version-pinned and locally verified"
```

### Unacceptable (protocol violation)

Silently omitting the `external-findings` field entirely. This is a protocol violation regardless of whether any assumptions exist. The Drift Detector checks for the field's presence in the audit report.

---

## Thickness Check (pre-Phase 2)

Before running Phase 2, confirm whether the spec is thick or thin per §4.7:

```
Thick indicators (skip Phase 2):
  - Spec enumerates exact file paths and line numbers
  - Spec is R#-driven (requirement IDs with file:line anchors)
  - No library version claims or API calls in scope
  - All assumptions are internally verifiable by grep

Thin indicators (run Phase 2):
  - Spec describes desired behavior without prescribing exact implementation
  - Approach selection is open
  - Library capabilities, API patterns, or version semantics are in scope
  - "Best practice" or "recommended approach" language present
```

Record thickness assessment in the audit report header:

```
Thickness: THICK | THIN | AMBIGUOUS
Phase 2 status: SKIPPED (thick, no external dependencies) | RUNNING | BLOCKED (unresolved assumption)
```

Ambiguous defaults to running Phase 2.

---

## Worked Example

**Spec context (fictional):** "Use Stripe's `payment_intent.succeeded` webhook event to trigger fulfillment. Stripe retries failed webhook deliveries using exponential backoff for up to 72 hours."

**Phase 2 assessment:** The 72-hour retry claim is non-trivial (a specific product behavior that could have changed). The `payment_intent.succeeded` event name is verifiable internally (it's a constant), but the retry semantics require external verification.

**Output:**

```yaml
external-findings:
  - claim: "Stripe retries failed webhook deliveries using exponential backoff for up to 72 hours"
    source: https://stripe.com/docs/webhooks#retries
    excerpt: "Stripe will attempt to deliver your webhooks for up to three days with an exponential back off."
    date-accessed: 2026-05-13

thickness-assessment:
  Thickness: THIN
  Rationale: Spec describes Stripe integration behavior; approach selection depends on retry semantics
  Phase 2 status: RUNNING
```

**Variant — if source had changed:** Suppose the Stripe docs now say "up to 7 days." The Auditor would record the current (correct) behavior and flag that the spec's claim of 72 hours is stale. The spec would require revision before proceeding.

---

## Refusal Mode Criteria (Auditor Decision Reference)

An assumption is **non-trivial** (citation required) if a reasonable senior engineer would need to check the docs before stating it with confidence:

- Specific version numbers and their behavior changes
- Rate limits and quota numbers
- Retry counts, backoff parameters, timeout values
- Whether a feature is GA or preview/beta
- Whether an API endpoint requires a specific header or auth scope
- Platform-specific behavior (Windows vs. macOS vs. Linux; Node.js version gating)

An assumption is **trivial** (no citation required) if:

- It describes stable, multi-year industry facts ("HTTP responses have status codes")
- It describes behavior the operator controls entirely (internal function signatures, project conventions)
- It restates the spec's own requirements without adding a new external claim

When in doubt, cite. A false-positive citation is a minor efficiency cost. A false-negative unresolved assumption is a spec defect that ships.

---

## Retrospective Hooks

After each run with this template active, the retrospective (§5.1 Artifact 5) records:

- Count of `CITE` events emitted during Phase 2
- Citation-resolve rate: were the source URLs still live at retrospective time?
- Citation-value rate: did the citation change the spec's approach, or only confirm an existing assumption? High confirmation rate may indicate the template is being applied too defensively.
- Any UNRESOLVED citations that blocked a spec — confirm whether the block was correct

Three runs before evaluating whether to split this capability into a dedicated Researcher sub-pipeline (§7 Q6).
