#!/usr/bin/env bash
# compress-output.sh — context-efficient command output wrapper for swarm agents
# Location: .ai-swarm/scripts/compress-output.sh
#
# Compresses verbose command output before it reaches LLM context.
# Passes through: errors, warnings, and the final tail lines.
# Discards:       passing test lines, verbose build progress, decoration.
#
# Usage:
#   bash .ai-swarm/scripts/compress-output.sh <command> [args...]
#
# Examples:
#   bash .ai-swarm/scripts/compress-output.sh pnpm test
#   bash .ai-swarm/scripts/compress-output.sh pnpm typecheck
#   bash .ai-swarm/scripts/compress-output.sh pnpm lint
#
# Exit code: mirrors the wrapped command's exit code exactly.
# Raw output: still written to /tmp/swarm-output-<cmd>.log for human review.

set -uo pipefail

[ "${1:-}" = "" ] && { echo "Usage: compress-output.sh <command> [args...]" >&2; exit 1; }

CMD_NAME=$(basename "$1")
LOG_FILE="/tmp/swarm-output-${CMD_NAME}-$$.log"

# Capture output, preserve exit code even under set -e
OUTPUT=$("$@" 2>&1) && EXIT_CODE=0 || EXIT_CODE=$?

# Write full output to log for human inspection
echo "$OUTPUT" > "$LOG_FILE"

TOTAL_LINES=$(echo "$OUTPUT" | wc -l | tr -d ' ')

# Extract signal lines
ERROR_LINES=$(echo "$OUTPUT" \
  | grep -iE "(^|\s)(error|FAIL|failed|✗|✘|×|ERR)" \
  | grep -v "node_modules\|\.snap\|0 errors\|no errors" \
  | head -30 || true)

WARN_LINES=$(echo "$OUTPUT" \
  | grep -iE "(^|\s)(warn|warning)" \
  | grep -v "node_modules" \
  | head -10 || true)

# Summary line: test counts, error counts, etc.
SUMMARY_LINES=$(echo "$OUTPUT" \
  | grep -iE "(passed|failed|skipped|error|Test Suites|Tests:|Snapshots:|Time:)" \
  | tail -8 || true)

TAIL_LINES=$(echo "$OUTPUT" | tail -5)

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  COMPRESSED OUTPUT: $CMD_NAME"
printf "║  %-54s ║\n" "($TOTAL_LINES lines → digest below. Full: $LOG_FILE)"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  EXIT: $EXIT_CODE"
echo "╚══════════════════════════════════════════════════════════════╝"

if [ -n "$ERROR_LINES" ]; then
  echo ""
  echo "─── ERRORS / FAILURES ────────────────────────────────────────"
  echo "$ERROR_LINES"
fi

if [ -n "$WARN_LINES" ]; then
  echo ""
  echo "─── WARNINGS (first 10) ──────────────────────────────────────"
  echo "$WARN_LINES"
fi

if [ -n "$SUMMARY_LINES" ]; then
  echo ""
  echo "─── SUMMARY ──────────────────────────────────────────────────"
  echo "$SUMMARY_LINES"
elif [ -n "$TAIL_LINES" ]; then
  echo ""
  echo "─── TAIL (last 5 lines) ──────────────────────────────────────"
  echo "$TAIL_LINES"
fi

echo ""
echo "Full output saved to: $LOG_FILE"
echo "─────────────────────────────────────────────────────────────────"

exit "$EXIT_CODE"
