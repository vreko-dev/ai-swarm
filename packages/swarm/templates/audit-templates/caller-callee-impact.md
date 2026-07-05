# Audit: Caller/Callee Impact

> Map the blast radius of changes to specific functions, methods, or types.

## Task

**Task ID:** <task-id>
**Date:** <date>

## Target Symbols

| Symbol | Type | Package |
|--------|------|---------|
| <name> | function/type/const | <pkg> |

## Callers (who calls this symbol)

| Caller | File | Line | Call pattern |
|--------|------|------|--------------|
| <name> | <path> | <line> | direct/promise/callback |

## Callees (what does this symbol call)

| Callee | File | Line |
|--------|------|------|
| <name> | <path> | <line> |

## Impact Assessment

- **Files affected:** <count>
- **Packages affected:** <count>
- **Test files affected:** <count>
- **Breaking change:** YES/NO

## Verdict

SAFE / BREAKING / NEEDS REVIEW
