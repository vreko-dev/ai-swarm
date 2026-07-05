# Audit: Internal Ground Truth

> Establish verified codebase state before any implementation work begins.
> No implementation task starts without this report.

## Task

**Task ID:** <task-id>
**Date:** <date>
**HEAD SHA:** <sha>

## Scope

**Affected packages:** <list>
**Affected files:** <list>

## Findings

### 1. Symbol existence

For each symbol, method, or import relevant to the task:

| Symbol | File | Line | Exists? |
|--------|------|------|---------|
| <name> | <path> | <line> | YES/NO |

### 2. File counts

| Package | .ts files | .test.ts files | .spec.ts files |
|---------|-----------|----------------|----------------|
| <name> | <count> | <count> | <count> |

### 3. Caller/callee analysis

For each method being added, modified, or removed:

| Method | Callers | Callees | Test coverage |
|--------|---------|---------|---------------|
| <name> | <list> | <list> | YES/NO |

### 4. Test inventory

| Package | Total tests | Skipped | Todo |
|---------|-------------|---------|------|
| <name> | <count> | <count> | <count> |

### 5. Lint status

```
<paste lint output for affected files>
```

### 6. Architecture fence violations

```
<paste grep output for forbidden imports>
```

### 7. Deferred work check

```
<paste grep output from deferred-work.md>
```

## Blockers

- [ ] None, or list specific blockers with evidence

## Verdict

READY / BLOCKED
