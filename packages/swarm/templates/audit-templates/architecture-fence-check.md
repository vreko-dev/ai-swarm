# Audit: Architecture Fence Check

> Verify that all imports in affected packages comply with the architecture fence.

## Task

**Task ID:** <task-id>
**Date:** <date>

## Fence Reference

Source: `.ai-swarm/docs/reference/architecture-fence.txt`

## Check Methodology

For each affected package, grep for imports and verify against fence rules.

## Findings

### Package: <name>

| Import | From | Allowed? | Rule |
|--------|------|----------|------|
| <import> | <file> | YES/NO | <rule> |

## Violations

- [ ] None, or list each violation with file:line and the fence rule it violates

## Verdict

PASS / FAIL
