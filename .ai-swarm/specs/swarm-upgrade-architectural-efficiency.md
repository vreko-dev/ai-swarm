# Spec: Swarm Upgrade — Architectural Efficiency

**Spec ID:** swarm-upgrade-architectural-efficiency
**Branch:** task/swarm-upgrade-architectural-efficiency
**Base:** dev
**Priority:** P1
**Source:** Patterns extracted from Archify repo analysis (github.com/Salah-XD/archify)

---

## Background

Four patterns from the Archify codebase address architectural efficiency —
making the harness faster, more maintainable, and more resilient to context
loss:

1. **Pure function isolation** — Archify enforces a strict separation: `src/engine/`
   contains pure functions (signals→result) that are unit-tested with fixture
   objects; `src/content/` and `src/entrypoints/` contain the side-effectful
   runtime that feeds them. The harness mixes decision logic with side effects
   in `dispatch.ts` and `hooks.ts`, making them untestable without SDK mocking.

2. **Carry-across-navigation with TTL** — Archify parks in-progress flow state in
   `chrome.storage.session` with a 10-second TTL. When the page reloads (context
   destroyed), the fresh page claims it back. The harness has no equivalent:
   when an agent's context is compacted or the session restarts, in-progress
   state (current phase, spec path, completed steps) is lost.

3. **Bounded stores with shift eviction** — Archify's `SignalStore` caps each
   signal list at 800 entries with `if (this.net.length > CAP) this.net.shift()`.
   The harness's state management accumulates without eviction.

4. **Monotonic counter for deterministic IDs** — Archify uses `++interactionCounter`
   for interaction IDs. The spec explicitly states: "no `Date.now()`/random
   needed; an incrementing integer is fine." The harness uses spec paths and
   branch names as identifiers but doesn't enforce deterministic ID generation.

---

## Owned Files

```text
packages/swarm/src/dispatch.ts
packages/swarm/src/decisions.ts
packages/swarm/src/hooks.ts
packages/swarm/src/hook-decisions.ts
packages/swarm/src/state-park.ts
packages/swarm/src/types.ts
packages/swarm/src/index.ts
packages/swarm/src/__tests__/decisions.test.ts
packages/swarm/src/__tests__/hook-decisions.test.ts
packages/swarm/src/__tests__/state-park.test.ts
packages/swarm/scripts/swarm-state.sh
```

---

## DO NOT

- DO NOT modify product source code or CI workflows
- DO NOT remove or rename existing exported functions — refactor by extracting,
  not by breaking the public API
- DO NOT change the SDK call mechanism in `dispatch.ts` — only extract the
  decision logic that runs before the SDK call
- DO NOT make state parking a blocking operation — if park/claim fails, the
  agent continues without recovered state (fail-open)
- DO NOT add a database or persistent store for state parking — use the
  existing `.ai-swarm/state/` directory with JSON files

---

## Exclusion Fence

- `.ai-swarm/agents/` (project-level agent overrides)
- `.ai-swarm/meta-canon.md`
- `packages/swarm-cli/`
- `packages/swarm/templates/` (agent prompt templates)
- `packages/swarm/scripts/branch-check.sh`
- `packages/swarm/scripts/validate-agent-output.sh`
- `packages/swarm/scripts/drift-detect.sh`
- `packages/swarm/scripts/check-definition-of-ready.sh`

---

## Requirements

### Phase 1 — Pure function isolation: dispatch decisions

**REQ-001**: Create `packages/swarm/src/decisions.ts` exporting pure functions
extracted from `dispatch.ts`:

```ts
import type { Role, SwarmContext, AgentDefinition } from './types.js';

export function resolveTools(role: Role, context: SwarmContext, override?: string[]): string[] {
  // Pure: given a role and context, return the tool list.
  // No SDK calls, no file reads, no side effects.
}

export function resolveModel(role: Role, context: SwarmContext): string {
  // Pure: given a role and context model tiers, return the model string.
}

export function buildSystemPrompt(
  role: Role,
  context: SwarmContext,
  agentDefinition: AgentDefinition,
): string {
  // Pure: assemble the system prompt from context + agent definition.
  // No SDK calls.
}
```

These functions must be pure: same inputs → same outputs, no side effects, no
I/O, no SDK imports.

**Rationale:** Archify's `src/engine/` contains only pure functions tested with
fixture objects. The harness's `dispatch.ts` mixes tool resolution, model
selection, prompt assembly, file reads, and SDK calls in one function. Extracting
the decision logic makes it unit-testable without mocking the Claude SDK.

**Owned files:** `packages/swarm/src/decisions.ts`

**Verification:**
```bash
grep -c "resolveTools\|resolveModel\|buildSystemPrompt" packages/swarm/src/decisions.ts
# Must return >= 3

# Confirm no SDK import in decisions.ts
grep -c "claude-agent-sdk\|@anthropic-ai" packages/swarm/src/decisions.ts
# Must return 0
```

---

**REQ-002**: Refactor `packages/swarm/src/dispatch.ts` to import and use the
pure functions from `decisions.ts`. The `dispatchRole` function must call
`resolveTools`, `resolveModel`, and `buildSystemPrompt` instead of inlining
that logic. The public API (`dispatchRole`, `ROLE_TOOLS`) must remain unchanged.

**Rationale:** The refactor must not break existing consumers. The public API
stays; only the internal implementation changes to use the extracted pure
functions.

**Owned files:** `packages/swarm/src/dispatch.ts`

**Verification:**
```bash
grep -c "from.*decisions" packages/swarm/src/dispatch.ts
# Must return >= 1

# Public API still exported
grep -c "export.*dispatchRole\|export.*ROLE_TOOLS" packages/swarm/src/dispatch.ts
# Must return >= 2

# Existing dispatch tests still pass
npx vitest run packages/swarm/src/__tests__/dispatch.test.ts 2>&1 | grep -c "passed"
# Must return >= 1
```

---

**REQ-003**: Create `packages/swarm/src/__tests__/decisions.test.ts` with at
least 5 test cases covering: (a) `resolveTools` returns correct tools per role,
(b) `resolveTools` respects override, (c) `resolveModel` returns correct model
per tier, (d) `buildSystemPrompt` assembles context correctly, (e)
`resolveTools` throws for unknown role.

**Rationale:** Pure functions are testable without SDK mocking. These tests
prove the extracted logic is correct and will catch regressions when the
dispatch path is modified.

**Owned files:** `packages/swarm/src/__tests__/decisions.test.ts`

**Verification:**
```bash
npx vitest run packages/swarm/src/__tests__/decisions.test.ts 2>&1 | grep -c "passed"
# Must return >= 1
```

---

### Phase 2 — Pure function isolation: hook decisions

**REQ-004**: Create `packages/swarm/src/hook-decisions.ts` exporting pure
functions extracted from `hooks.ts`:

```ts
import type { HookEvent, SwarmHookConfig, Role } from './types.js';

export function shouldEnableHook(
  event: HookEvent,
  config: SwarmHookConfig,
): boolean {
  // Pure: given an event and config, return whether the hook is enabled.
}

export function resolveHookScript(
  event: HookEvent,
  role: Role,
  config: SwarmHookConfig,
): string | null {
  // Pure: given an event, role, and config, return the script path to run
  // or null if no script applies.
}

export function buildHookMatcher(
  event: HookEvent,
  toolName: string | undefined,
): string | undefined {
  // Pure: given an event and optional tool name, return the matcher pattern.
}
```

**Rationale:** `hooks.ts` mixes hook configuration, script path resolution, and
script execution. Extracting the decision logic makes it testable without
spawning shell processes.

**Owned files:** `packages/swarm/src/hook-decisions.ts`

**Verification:**
```bash
grep -c "shouldEnableHook\|resolveHookScript\|buildHookMatcher" packages/swarm/src/hook-decisions.ts
# Must return >= 3

# Confirm no child_process import in hook-decisions.ts
grep -c "child_process\|execSync\|spawn" packages/swarm/src/hook-decisions.ts
# Must return 0
```

---

**REQ-005**: Refactor `packages/swarm/src/hooks.ts` to import and use the pure
functions from `hook-decisions.ts`. The public API (`createSwarmHooks`,
`createDefaultHookConfig`) must remain unchanged.

**Owned files:** `packages/swarm/src/hooks.ts`

**Verification:**
```bash
grep -c "from.*hook-decisions" packages/swarm/src/hooks.ts
# Must return >= 1

grep -c "export.*createSwarmHooks\|export.*createDefaultHookConfig" packages/swarm/src/hooks.ts
# Must return >= 2

npx vitest run packages/swarm/src/__tests__/hooks.test.ts 2>&1 | grep -c "passed"
# Must return >= 1
```

---

**REQ-006**: Create `packages/swarm/src/__tests__/hook-decisions.test.ts` with
at least 4 test cases covering: (a) `shouldEnableHook` returns true for
configured events, (b) `shouldEnableHook` returns false for unconfigured events,
(c) `resolveHookScript` returns correct path per event, (d)
`resolveHookScript` returns null for events with no script.

**Owned files:** `packages/swarm/src/__tests__/hook-decisions.test.ts`

**Verification:**
```bash
npx vitest run packages/swarm/src/__tests__/hook-decisions.test.ts 2>&1 | grep -c "passed"
# Must return >= 1
```

---

### Phase 3 — State parking with TTL (carry-across-context)

**REQ-007**: Create `packages/swarm/src/state-park.ts` exporting functions to
park and claim agent state across context compaction or session restart:

```ts
export interface ParkedState {
  taskId: string;
  phase: string;
  specPath: string;
  completedSteps: string[];
  savedAt: number; // Date.now() at park time
}

export const STATE_PARK_TTL_MS = 300_000; // 5 minutes

export function parkState(
  stateDir: string,
  state: Omit<ParkedState, 'savedAt'>,
): void {
  // Write state to `${stateDir}/parked-${state.taskId}.json`
  // with savedAt = Date.now()
}

export function claimState(
  stateDir: string,
  taskId: string,
  now: number = Date.now(),
): ParkedState | null {
  // Read `${stateDir}/parked-${taskId}.json`
  // If missing: return null
  // If expired (now - savedAt > STATE_PARK_TTL_MS): delete file, return null
  // If fresh: return the state (do NOT delete — caller may need to re-park)
}

export function clearParkedState(stateDir: string, taskId: string): void {
  // Delete the parked state file if it exists.
}
```

The functions must be fail-open: if park fails (disk full, permissions), log a
warning but do not throw. If claim fails (corrupt JSON), return null.

**Rationale:** Archify's `carry.ts` parks in-progress flow state with a TTL so
the next page load can reclaim it. The harness needs the same: when an agent's
context is compacted, the next session can claim the parked state and resume
from the last completed step instead of starting over.

**Owned files:** `packages/swarm/src/state-park.ts`

**Verification:**
```bash
grep -c "parkState\|claimState\|clearParkedState" packages/swarm/src/state-park.ts
# Must return >= 3

grep -c "STATE_PARK_TTL_MS" packages/swarm/src/state-park.ts
# Must return >= 1
```

---

**REQ-008**: Create `packages/swarm/src/__tests__/state-park.test.ts` with at
least 5 test cases covering: (a) park then claim returns the state, (b) claim
after TTL returns null and deletes file, (c) claim with missing file returns
null, (d) clearParkedState removes the file, (e) park with invalid path does
not throw (fail-open).

**Owned files:** `packages/swarm/src/__tests__/state-park.test.ts`

**Verification:**
```bash
npx vitest run packages/swarm/src/__tests__/state-park.test.ts 2>&1 | grep -c "passed"
# Must return >= 1
```

---

**REQ-009**: Export `parkState`, `claimState`, `clearParkedState`,
`ParkedState`, and `STATE_PARK_TTL_MS` from `packages/swarm/src/index.ts`.

**Owned files:** `packages/swarm/src/index.ts`

**Verification:**
```bash
grep -c "parkState\|claimState\|ParkedState" packages/swarm/src/index.ts
# Must return >= 3
```

---

### Phase 4 — Bounded state with eviction in swarm-state.sh

**REQ-010**: Amend `packages/swarm/scripts/swarm-state.sh` to add a
`cmd_evict_stale` function that removes worktree entries and spec entries older
than a configurable threshold (default: 7 days). The function:

1. Reads the state file
2. For worktree entries: removes any whose `last_active` timestamp is older than
   the threshold
3. For spec entries: removes any in `completed` status older than the threshold
4. Logs each eviction: `EVICTED: <type> <id> (stale <N> days)`
5. Prints summary: `Evicted <N> stale entries (<M> worktrees, <K> specs)`
6. Exits 0

Add a `evict` subcommand to the script's case statement that calls
`cmd_evict_stale`.

**Rationale:** Archify's `SignalStore` caps lists at 800 entries with shift
eviction. The harness's state file accumulates without bound. Stale worktree
and spec entries pollute `swarm-state status` and slow down state operations.

**Owned files:** `packages/swarm/scripts/swarm-state.sh`

**Verification:**
```bash
grep -c "cmd_evict_stale\|evict" packages/swarm/scripts/swarm-state.sh
# Must return >= 2

grep -c "EVICTED\|stale" packages/swarm/scripts/swarm-state.sh
# Must return >= 2
```

---

### Phase 5 — Monotonic counter for task IDs

**REQ-011**: Add a `cmd_next_id` function to
`packages/swarm/scripts/swarm-state.sh` that:

1. Reads `${SWARM_DIR}/state/counter` (a single integer)
2. Increments it by 1
3. Writes the new value back
4. Prints the new value to stdout
5. If the file doesn't exist, initializes to 1

The function must be atomic: use `flock` (or `mkdir`-based locking on systems
without `flock`) to prevent concurrent agents from getting the same ID.

**Rationale:** Archify uses `++interactionCounter` for deterministic, sortable
IDs. The harness uses spec paths as identifiers, which are descriptive but not
sortable or unique across concurrent swarms. A monotonic counter gives stable,
testable, collision-free IDs.

**Owned files:** `packages/swarm/scripts/swarm-state.sh`

**Verification:**
```bash
grep -c "cmd_next_id\|next_id\|counter" packages/swarm/scripts/swarm-state.sh
# Must return >= 2

# Functional test: two calls produce sequential IDs
bash packages/swarm/scripts/swarm-state.sh next_id
ID1=$(bash packages/swarm/scripts/swarm-state.sh next_id)
ID2=$(bash packages/swarm/scripts/swarm-state.sh next_id)
test "$((ID2 - ID1))" -eq 1 && echo "PASS" || echo "FAIL"
# Must print PASS
```

---

## Completion Gate

```bash
# Phase 1
grep -c "resolveTools\|resolveModel\|buildSystemPrompt" packages/swarm/src/decisions.ts
grep -c "claude-agent-sdk\|@anthropic-ai" packages/swarm/src/decisions.ts
grep -c "from.*decisions" packages/swarm/src/dispatch.ts
npx vitest run packages/swarm/src/__tests__/decisions.test.ts 2>&1 | grep -c "passed"
npx vitest run packages/swarm/src/__tests__/dispatch.test.ts 2>&1 | grep -c "passed"

# Phase 2
grep -c "shouldEnableHook\|resolveHookScript\|buildHookMatcher" packages/swarm/src/hook-decisions.ts
grep -c "child_process\|execSync\|spawn" packages/swarm/src/hook-decisions.ts
grep -c "from.*hook-decisions" packages/swarm/src/hooks.ts
npx vitest run packages/swarm/src/__tests__/hook-decisions.test.ts 2>&1 | grep -c "passed"
npx vitest run packages/swarm/src/__tests__/hooks.test.ts 2>&1 | grep -c "passed"

# Phase 3
grep -c "parkState\|claimState\|clearParkedState" packages/swarm/src/state-park.ts
npx vitest run packages/swarm/src/__tests__/state-park.test.ts 2>&1 | grep -c "passed"
grep -c "parkState\|claimState\|ParkedState" packages/swarm/src/index.ts

# Phase 4
grep -c "cmd_evict_stale\|evict" packages/swarm/scripts/swarm-state.sh

# Phase 5
grep -c "cmd_next_id\|next_id\|counter" packages/swarm/scripts/swarm-state.sh

# Build + typecheck
pnpm turbo run build --filter=@vreko-dev/swarm
pnpm turbo run typecheck --filter=@vreko-dev/swarm

# All existing tests still pass
npx vitest run packages/swarm/src/__tests__/ 2>&1 | grep -c "passed"
```

All must pass. Partial completion is NOT acceptable.

---

## R# Verification Summary

| REQ | Description | Status | Count |
|-----|-------------|--------|-------|
| REQ-001 | decisions.ts pure functions | ? | ?/3 |
| REQ-002 | dispatch.ts uses decisions.ts | ? | ?/3 |
| REQ-003 | decisions.test.ts test cases | ? | ?/1 |
| REQ-004 | hook-decisions.ts pure functions | ? | ?/3 |
| REQ-005 | hooks.ts uses hook-decisions.ts | ? | ?/3 |
| REQ-006 | hook-decisions.test.ts test cases | ? | ?/1 |
| REQ-007 | state-park.ts park/claim/clear | ? | ?/3 |
| REQ-008 | state-park.test.ts test cases | ? | ?/1 |
| REQ-009 | Export state-park from index.ts | ? | ?/3 |
| REQ-010 | swarm-state.sh eviction | ? | ?/2 |
| REQ-011 | swarm-state.sh monotonic counter | ? | ?/2 |

---

## Rollback

| Phase | Rollback | State after |
|-------|----------|-------------|
| 1–2 | Revert dispatch.ts, delete decisions.ts | Original inline logic resumes; tests unaffected |
| 3 | Revert hooks.ts, delete hook-decisions.ts | Original inline hook logic resumes |
| 4 | Delete state-park.ts and test, revert index.ts | No state parking; agents start fresh on restart |
| 5 | Revert swarm-state.sh eviction addition | State accumulates; no runtime side effects |
| 6 | Revert swarm-state.sh counter addition | IDs revert to path-based; no runtime side effects |

No phase introduces a dependency that blocks reverting a prior phase.
