#!/usr/bin/env bash
# swarm-doctor.sh — Health-check the swarm state database.
#
# Additional checks: open a new spec referencing this file. Do not add checks here without a spec.
#
# Usage:
#   bash .ai-swarm/scripts/swarm-doctor.sh
#
# Exit codes:
#   0 — state database present and queryable
#   1 — state database missing or unreadable

set -euo pipefail

SWARM_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_FILE="$SWARM_DIR/state/swarm.db"

if [ ! -f "$DB_FILE" ]; then
  echo "FAIL: state/swarm.db missing"
  echo "      Run: bash .ai-swarm/scripts/swarm-state.sh init"
  exit 1
fi

if ! sqlite3 "$DB_FILE" "SELECT value FROM meta WHERE key='schema_version';" > /dev/null 2>&1; then
  echo "FAIL: state/swarm.db is not a valid SQLite database or schema is corrupt"
  exit 1
fi

echo "PASS: state/swarm.db present and valid"
exit 0
