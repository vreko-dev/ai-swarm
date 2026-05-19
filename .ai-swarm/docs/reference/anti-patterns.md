# Anti-Pattern Checklist
# Every Implementer and Reviewer MUST check against this before committing.
# Adapt the examples below to match your project's architecture.

<!-- DRIFT-PATTERNS
AP-2: THRESHOLD|WEIGHT|LIMIT|SCALE|SCORE
AP-3: catch[[:space:]]*\([^)]*\)[[:space:]]*\{[[:space:]]*\}
-->

## AP-1: Graceful Empty Return (masks missing capability)
WRONG:
```typescript
async loadTieredData(): Promise<TieredData> {
  return { hot: [], warm: [], cold: [] }; // masks missing capability — compile errors are the correct signal
}
```
CORRECT: Delete the method entirely. Compile errors are the correct signal.

## AP-2: Inlined Constants (should route through service layer)
WRONG:
```typescript
// In apps/extension/src/some-file.ts
const THRESHOLDS = { low: 0.3, medium: 0.6, high: 0.8 }; // duplicates constants from service
```
CORRECT: Route through the canonical service:
```typescript
const thresholds = await serviceClient.call('config/thresholds', { workspace });
```

## AP-3: Silent Error Swallowing
WRONG:
```typescript
try {
  const session = await service.request("session/current", { workspace });
} catch {
  await service.request("session/begin", { workspace }); // silently destroys active session
}
```
CORRECT: Distinguish connection errors from logic errors:
```typescript
try {
  const session = await service.request("session/current", { workspace });
} catch (error) {
  if (isConnectionError(error)) {
    return formatConnectionError(); // surface it
  }
  logger.warn('session/current failed, starting fresh', { error });
}
```

## AP-4: Type Duplication
WRONG: Defining `interface PayloadData` inline when `PayloadSchema` exists in schemas.ts
CORRECT: `import type { Payload } from '../schemas';`

## AP-5: Intentional Throw Removal
WRONG: Making `save()` return silently because "it was throwing an error"
CORRECT: `save()` throws when storage fails. That's the contract. Do not add a try/catch that swallows it.

## AP-6: Boolean Inversion
WRONG: `if (!isReady === false)` — double negation, always true
CORRECT: `if (isReady)` — read every negation twice

## AP-7: Committing to Gated Branch
WRONG: Committing to `task/foo` when `.ai-swarm/state/gates/task-foo.gate1.lock` exists
CORRECT: Check for gate lockfiles before any commit. The pre-commit hook enforces this, but verify manually.

## AP-8: Re-implementing Canonical Computations
WRONG: Computing a workspace hash, risk score, or other canonical value inline
CORRECT: Import from the canonical package that owns this computation. One source of truth.

---
# Add your project-specific anti-patterns below this line.
# Format: ## AP-N: Short Title
# Include WRONG and CORRECT examples with actual code from your codebase.
