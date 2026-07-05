# Audit: Ratchet Baseline Capture

> Capture current ratchet metric counts as a baseline for regression detection.

## Task

**Task ID:** <task-id>
**Date:** <date>
**HEAD SHA:** <sha>

## Metrics

| Metric | Count | Command |
|--------|-------|---------|
| console_log | <n> | `grep -r 'console\.log' ...` |
| as_any | <n> | `grep -r 'as any' ...` |
| ts_ignore | <n> | `grep -r '@ts-ignore\|@ts-expect-error' ...` |
| skipped_tests | <n> | `grep -r 'it\.skip\|xit' ...` |
| empty_catches | <n> | `grep -rn 'catch\s*(.*)\s*{\s*}' ...` |

## Notes

- All counts pinned to HEAD SHA above
- Commands run from repo root
- node_modules, dist, __tests__ excluded

## Verdict

BASELINE CAPTURED / ERROR
