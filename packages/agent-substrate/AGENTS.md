# Generated from @marcelle-labs/agent-substrate@0.1.0
# checksum: sha256:2e617826f7619339c7b47c713485f78bb12ad6194095fe508f5c8033284f81d8
# DO NOT EDIT — managed by `agent-substrate sync`. Edit the canonical source
# in the substrate (templates/) or this repo's .agents/ override.

## Agent operating baseline

This file is provided by `@marcelle-labs/agent-substrate`. It establishes the
shared baseline every Marcelle Labs repo's agents operate under. Repo-specific
guidance belongs in this repo's own docs, not here.

### Ground rules

- Work from evidence. Verify claims against code, tests, or tool output before
  asserting them.
- Prefer the smallest change that satisfies the request. Do not expand scope.
- Leave the workspace clean: no stray temp files, no commented-out dead code.

### Model routing

Model selection is governed by the substrate's `BudgetController`, which reads
`routing/model-routing-table.json`. Start on the cheapest model that clears the
task's success threshold; escalate only when the policy says to.

### Generated files

Every file rendered by `agent-substrate sync` carries a managed header that
includes the substrate version, a SHA-256 checksum of the canonical source, and
a pointer to the canonical source. For example:

```
# Generated from @marcelle-labs/agent-substrate@{version}
# checksum: sha256:<hash>
# DO NOT EDIT — managed by `agent-substrate sync`. Edit the canonical source
# in the substrate (templates/) or this repo's .agents/ override.
```

JSON files embed the same metadata as `_generated` and `_checksum` keys instead.

### Updating this file

Do not hand-edit this generated file. Edit the canonical source in the substrate
(`templates/AGENTS.md`) or override it locally via this repo's `.agents/AGENTS.md`,
then re-run `agent-substrate sync`.
