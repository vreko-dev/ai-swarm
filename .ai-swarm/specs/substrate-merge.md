# Spec: Substrate Merge — Unify agent-substrate into ai-swarm monorepo

**Spec ID:** substrate-merge
**Branch:** task/substrate-merge
**Base:** dev
**Priority:** P1
**Source:** SOLO-FOUNDER-AGENT-OPS-01

---

## Background

Two repos have drifted representations of one system. `agent-substrate` (`/Users/user1/dev/agent-substrate`) is the sync-distribution package with `routing/`, `skills/`, `templates/`, `bin/`. `ai-swarm` (`/Users/user1/WebstormProjects/ai-swarm`) has `packages/swarm` + `packages/swarm-cli` (the mature workspace form) and a top-level `.ai-swarm/` (a consumer install sitting inside the producer repo).

The target is one repo, workspace-structured, with three package boundaries that map to the three things that are actually different: the substrate's config distribution (`packages/agent-substrate`), the swarm's methodology + pipeline (`packages/swarm`), and the CLI dispatch surface (`packages/swarm-cli`).

---

## Move Map

### Source → Destination

| Source (agent-substrate) | Destination (ai-swarm) | Type |
|---|---|---|
| `bin/agent-substrate.ts` | `packages/agent-substrate/bin/agent-substrate.ts` | source (unchanged) |
| `bin/agent-substrate-sync.ts` | `packages/agent-substrate/bin/agent-substrate-sync.ts` | source (unchanged) |
| `bin/README.md` | `packages/agent-substrate/bin/README.md` | source (unchanged) |
| `templates/` | `packages/agent-substrate/templates/` | source (unchanged) |
| `routing/` | `packages/agent-substrate/routing/` | source (unchanged) |
| `skills/` | `packages/agent-substrate/skills/` | source (unchanged) |
| `AGENTS.md` | `packages/agent-substrate/AGENTS.md` | source (unchanged) |
| `CLAUDE.md` | `packages/agent-substrate/CLAUDE.md` | source (unchanged) |
| `package.json` | `packages/agent-substrate/package.json` | source (adapted for workspace) |
| `tsconfig.json` | `packages/agent-substrate/tsconfig.json` | source (unchanged) |

### `.ai-swarm/` demotion

| Content | Action |
|---|---|
| `.ai-swarm/agents/` | Already migrated to `packages/swarm/templates/agents/` — no action |
| `.ai-swarm/audit-templates/` | Already migrated to `packages/swarm/templates/audit-templates/` — no action |
| `.ai-swarm/scripts/` | Already migrated to `packages/swarm/scripts/` — no action |
| `.ai-swarm/meta-canon.md` | Merge into `packages/swarm/templates/meta-canon.md` (see Commit b) |
| `.ai-swarm/specs/` | **Tracked** — authored input, not generated output |
| `.ai-swarm/reports/` | **Gitignored** — runtime instance data |
| `.ai-swarm/state/` | **Gitignored** — runtime instance data |
| `.ai-swarm/knowledge/` | **Gitignored** — runtime instance data |
| `.ai-swarm/docs/` | Evaluate: if templates, move to `packages/swarm/templates/`; if instance, gitignore |
| `.ai-swarm/adrs/` | Evaluate: if templates, move to `packages/swarm/templates/`; if instance, gitignore |

---

## Requirements

- **REQ-001**: `packages/agent-substrate/` exists as a workspace member with its original directory structure (`bin/`, `templates/`, `routing/`, `skills/`, `AGENTS.md`, `CLAUDE.md`, `package.json`, `tsconfig.json`)
  Verify: `test -d packages/agent-substrate/bin && test -d packages/agent-substrate/templates && test -d packages/agent-substrate/routing && test -d packages/agent-substrate/skills`

- **REQ-002**: `pnpm-workspace.yaml` includes `packages/agent-substrate`
  Verify: `grep 'agent-substrate' pnpm-workspace.yaml`

- **REQ-003**: `packages/agent-substrate/package.json` name is `@marcelle-labs/agent-substrate` with `type: "commonjs"`
  Verify: `node -e "const p=require('./packages/agent-substrate/package.json'); assert(p.name==='@marcelle-labs/agent-substrate' && p.type==='commonjs')"`

- **REQ-004**: Root `package.json` name is `@marcelle-labs/agent-substrate` (private)
  Verify: `node -e "const p=require('./package.json'); assert(p.name==='@marcelle-labs/agent-substrate' && p.private===true)"`

- **REQ-005**: `packages/swarm/package.json` name is `@marcelle-labs/swarm`
  Verify: `node -e "const p=require('./packages/swarm/package.json'); assert(p.name==='@marcelle-labs/swarm')"`

- **REQ-006**: `packages/swarm-cli/package.json` name is `@marcelle-labs/swarm-cli` and depends on `@marcelle-labs/swarm`
  Verify: `node -e "const p=require('./packages/swarm-cli/package.json'); assert(p.name==='@marcelle-labs/swarm-cli' && p.dependencies['@marcelle-labs/swarm'])"`

- **REQ-007**: No remaining `@marcellelabs/` (old scope) references in `packages/` source or config
  Verify: `! grep -r '@marcellelabs/' packages/ --include='*.ts' --include='*.json' --include='*.md' | grep -v node_modules | grep -v dist`

- **REQ-008**: `packages/swarm/templates/meta-canon.md` contains the full canon content (all 13 roles, §1–§8, Extractability Covenant, two-phase audit protocol, retrospective artifacts)
  Verify: `grep -c '## §' packages/swarm/templates/meta-canon.md` returns >= 8

- **REQ-009**: `packages/swarm/templates/meta-canon.md` has zero literal `.ai-swarm/` path references (tokenized to `{{SWARM_DIR}}`)
  Verify: `! grep '\.ai-swarm/' packages/swarm/templates/meta-canon.md`

- **REQ-010**: `packages/swarm/templates/meta-canon.md` retains literal `.ai-swarm` in prose/explanatory contexts (not over-tokenized)
  Verify: manual inspection — `{{SWARM_DIR}}` appears only in path references, not in prose

- **REQ-011**: `.gitignore` ignores `.ai-swarm/**` except `.ai-swarm/specs/`
  Verify: `grep -A2 '.ai-swarm/' .gitignore` shows ignore + negation pattern

- **REQ-012**: `clean-room.test.ts` scans all `packages/*` directories, not just `packages/swarm` and `packages/swarm-cli`
  Verify: `grep 'packages/' packages/swarm/src/__tests__/clean-room.test.ts` shows all packages

- **REQ-013**: `pnpm build` exits 0
  Verify: `pnpm build`

- **REQ-014**: `pnpm typecheck` exits 0
  Verify: `pnpm typecheck`

- **REQ-015**: `pnpm test` exits 0 (includes extended clean-room test)
  Verify: `pnpm test`

- **REQ-016**: `agent-substrate sync --dry-run` exits 0 and produces expected file list
  Verify: `cd packages/agent-substrate && npx ts-node bin/agent-substrate-sync.ts --dry-run`

- **REQ-017**: Every workspace package has non-empty `typecheck`, `lint`, and `test` scripts in its `package.json`. This closes the false-green class where `pnpm -r run <script>` silently skips packages that lack the script, reporting green by absence rather than by execution. The gate is a test (`workspace-gates.test.ts`), not a convention.
  Verify: `pnpm test -- --testNamePattern='T13'`

---

## DO NOT

- **DO NOT** touch `packages/swarm/src/dispatch.ts`, `model-tiers.ts`, `hydrate.ts`, or any BudgetController/routing-table wiring. The JSON data file `model-routing-table.json` moves as a file; the controller logic that reads it is not modified, wired, or called.
- **DO NOT** convert `packages/agent-substrate` from CommonJS to ESM. Module-format conversion is execution-adjacent surgery with its own failure surface. Note in deferred-work, do not do it here.
- **DO NOT** fix stale content in the meta-canon (§3.3 model matrix, §5.4 ratchet baselines, §8 productization framing). The canon is genericized structurally, not content-corrected. Canon-content refresh is a separate spec, deferred behind RT-01 + caching proof.
- **DO NOT** wire up the BudgetController, routing table dispatch, or any execution-layer integration. The merge is a file-and-boundary operation only.
- **DO NOT** delete `.ai-swarm/` — it is demoted from source to artifact (gitignored), not removed. `specs/` survives as tracked input.
- **DO NOT** overwrite `packages/swarm/templates/meta-canon.md` without first diffing the skeleton against the full canon. The skeleton has unique content (Model Tier column, Branch Isolation, Spec Authority, Authority Chain, Model Tier Enforcement, Tool Allowlists, No Silent Omission, Identifier Conventions) that must be merged into the full canon, not lost.

---

## Deferred Work

- **DW-001**: ESM unification of `packages/agent-substrate` CLI — deferred behind RT-01 + caching proof. The substrate stays CJS behind its own package boundary until execution-layer concerns are proven in Vreko.
- **DW-002**: BudgetController/routing-table wiring — deferred behind RT-01 + caching proof. The `model-routing-table.json` data file is relocated as a file; the controller logic that reads it is not wired, called, or modified in this merge.
- **DW-003**: Meta-canon content refresh — §3.3 model matrix (stale: references old model IDs), §5.4 ratchet baselines (stale: old counts), §8 productization framing (stale: pre-extraction "productization watch" that this repo now answers). Genericized structurally in this merge; content correction is a separate spec, deferred behind RT-01.
- **DW-004**: `sync` integration with `packages/swarm` templates — the substrate's `sync` currently distributes its own `templates/` (AGENTS.md, CLAUDE.md, .claude/settings.json). Wiring `sync` to also distribute swarm methodology templates (agents/, audit-templates/, meta-canon.md) is a separate spec after this merge lands green.
- **DW-005**: README.md refresh — the root README still instructs consumers to `cp -r .ai-swarm/` into their repo, but `.ai-swarm/` is now a gitignored sync artifact and `agent-substrate sync` is the real distribution path. The README also references deleted files (`docs/reference/branch-model.md`, `state/current.json`). A docs-refresh spec is the right vehicle, not this merge, but the staleness must be recorded so the next person doesn't onboard via the retired mechanism.
- **DW-006**: Linter wiring for `packages/agent-substrate` — the substrate has no Biome/eslint config. Its `lint` script is an honest no-op (`echo 'no linter configured' && exit 0`) labeled as unconfigured, not a silent skip. Wiring a real linter is a separate spec after this merge lands green.

---

## Phase 1: Move substrate into packages/agent-substrate (Commit a)

### Task 1.1: Copy substrate files

Copy `bin/`, `templates/`, `routing/`, `skills/`, `AGENTS.md`, `CLAUDE.md`, `tsconfig.json` from `/Users/user1/dev/agent-substrate/` into `packages/agent-substrate/` unchanged.

### Task 1.2: Adapt package.json for workspace

Create `packages/agent-substrate/package.json` based on the original, preserving:
- `name`: `@marcelle-labs/agent-substrate`
- `type`: `commonjs`
- `bin`: both bin entries
- `files`: same file list
- `scripts`: same scripts

### Task 1.3: Add to pnpm-workspace.yaml

Add `packages/agent-substrate` to the workspace packages list.

### Task 1.4: Gate

```bash
pnpm install && pnpm build && pnpm typecheck && pnpm test
```

---

## Phase 2: Merge + genericize meta-canon (Commit b)

### Task 2.1: Diff skeleton vs full canon

Compare `packages/swarm/templates/meta-canon.md` (skeleton, 127 lines) against `.ai-swarm/meta-canon.md` (full, 410 lines). Confirm skeleton content is fully subsumed OR identify unique skeleton content to merge.

**Known unique skeleton content to integrate:**
- Model Tier column in roles table
- §3.1 Branch Isolation (worktrees, `branch-check.sh`, `{{BRANCH_MAIN}}`/`{{BRANCH_DEV}}` tokens)
- §3.4 Spec Authority (spec is definition of done)
- §4.1 Authority Chain (system prompt → meta-canon → AGENTS.md → role prompt → task spec)
- §4.2 Model Tier Enforcement (dispatch layer enforces tier assignments)
- §4.3 Tool Allowlists (dispatch layer enforces tool restrictions)
- §5.2 No Silent Omission (zero items still emitted)
- §6 Refusal Modes (additional triggers: missing required sections, verification gate fails)
- §7 Identifier Conventions (file path conventions with `{{SWARM_DIR}}` tokens)
- §0 Extractability Covenant (mentions `SwarmContext` and token replacement)

### Task 2.2: Merge

Start with the full canon as base. Integrate unique skeleton content. The result is a single merged canon that has all content from both.

### Task 2.3: Genericize paths

Replace literal `.ai-swarm/` path references with `{{SWARM_DIR}}` tokens. Keep `.ai-swarm` in prose/explanatory contexts (it's the default install dir name). Add `{{BRANCH_MAIN}}` and `{{BRANCH_DEV}}` tokens where the full canon references `main`/`dev` as configurable branch names.

### Task 2.4: Verify tokenization

```bash
# Zero literal path references (must return no output):
grep -n '\.ai-swarm/' packages/swarm/templates/meta-canon.md

# Confirm prose mentions survive (should return matches in explanatory text only):
grep -n '\.ai-swarm' packages/swarm/templates/meta-canon.md | grep -v '{{SWARM_DIR}}'
```

### Task 2.5: Gate

```bash
pnpm build && pnpm typecheck && pnpm test
```

---

## Phase 3: Atomic scope rename (Commit c)

### Task 3.1: Rename package scopes

- `packages/swarm/package.json`: `@marcellelabs/swarm` → `@marcelle-labs/swarm`
- `packages/swarm-cli/package.json`: `@marcellelabs/swarm-cli` → `@marcelle-labs/swarm-cli`
- `packages/swarm-cli/package.json` dependencies: `@marcellelabs/swarm` → `@marcelle-labs/swarm`
- `packages/swarm-cli/src/index.ts` imports: `@marcellelabs/swarm` → `@marcelle-labs/swarm`
- `packages/swarm-cli/tsconfig.json` paths: `@marcellelabs/swarm` → `@marcelle-labs/swarm`
- Root `package.json`: `ai-swarm-monorepo` → `@marcelle-labs/agent-substrate` (private)

### Task 3.2: Verify no old scope remains

```bash
! grep -r '@marcellelabs/' packages/ --include='*.ts' --include='*.json' --include='*.md' | grep -v node_modules | grep -v dist
```

### Task 3.3: Gate

```bash
pnpm install && pnpm build && pnpm typecheck && pnpm test
```

---

## Phase 4: .gitignore + specs carve-out (Commit d)

### Task 4.1: Update .gitignore

Ignore `.ai-swarm/**` except `.ai-swarm/specs/`:

```
# Swarm runtime state and generated reports — .ai-swarm/ is a sync-generated install
.ai-swarm/**
!.ai-swarm/specs/
```

### Task 4.2: Gate

```bash
pnpm build && pnpm typecheck && pnpm test
```

---

## Phase 5: Extend clean-room test (Commit e)

### Task 5.1: Extend clean-room.test.ts to scan all packages/*

Modify the test to dynamically discover all `packages/*` directories and scan each one, rather than hardcoding `packages/swarm` and `packages/swarm-cli`.

### Task 5.2: Fix surfaced violations

Run `pnpm test` — if the extended scan finds forbidden references in `packages/agent-substrate`, fix them. Expected surface: the substrate's `AGENTS.md` and `CLAUDE.md` templates may contain references that need checking.

### Task 5.3: Gate

```bash
pnpm build && pnpm typecheck && pnpm test
```

---

## Phase 6: Final gate

### Task 6.1: sync --dry-run

```bash
cd packages/agent-substrate && npx ts-node bin/agent-substrate-sync.ts --dry-run
```

Confirm: exits 0, produces expected file list (AGENTS.md, CLAUDE.md, .claude/settings.json), all with valid checksum headers in the output preview.

### Task 6.2: Full gate

```bash
pnpm build && pnpm typecheck && pnpm test
```

---

## Rollback

Each commit is independently revertable. If any commit goes red:
1. `git revert <commit-sha>`
2. Re-run gate to confirm revert is clean
3. Fix and re-apply as a new commit

The five-commit sequence ensures bisectability: any red gate is traceable to exactly one concern.
