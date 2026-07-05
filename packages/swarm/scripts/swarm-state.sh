#!/bin/sh
#
# swarm-state.sh — Manage swarm state via JSON file.
#
# Usage:
#   bash .ai-swarm/scripts/swarm-state.sh init
#   bash .ai-swarm/scripts/swarm-state.sh sync
#   bash .ai-swarm/scripts/swarm-state.sh status
#   bash .ai-swarm/scripts/swarm-state.sh next
#   bash .ai-swarm/scripts/swarm-state.sh gate-open <branch> <gate-number>
#   bash .ai-swarm/scripts/swarm-state.sh gate-close <branch> <gate-number>
#   bash .ai-swarm/scripts/swarm-state.sh dispatch <role> <branch> <spec-path>
#   bash .ai-swarm/scripts/swarm-state.sh add-spec <spec-id> <spec-path>
#   bash .ai-swarm/scripts/swarm-state.sh add-worktree <branch> <path> <spec-id>
#
# Requires: jq

set -eu

SWARM_DIR="${SWARM_DIR:-.ai-swarm}"
STATE_FILE="${SWARM_DIR}/state/current.json"

require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "ERROR: jq is required but not installed." >&2
    exit 1
  fi
}

require_state() {
  if [ ! -f "$STATE_FILE" ]; then
    echo "ERROR: State file not found at $STATE_FILE" >&2
    echo "Run: bash ${SWARM_DIR}/scripts/swarm-state.sh init" >&2
    exit 1
  fi
}

head_sha() {
  git rev-parse HEAD 2>/dev/null || echo "unknown"
}

cmd_init() {
  mkdir -p "${SWARM_DIR}/state/gates"
  if [ ! -f "$STATE_FILE" ]; then
    cat > "$STATE_FILE" <<'EOF'
{
  "_meta": {
    "version": "1.0",
    "last_updated": null,
    "last_updated_by": "swarm-state.sh init",
    "head_sha": null
  },
  "worktrees": [],
  "idle_specs": [],
  "open_gates": [],
  "ratchets": {},
  "adr_status": {}
}
EOF
    echo "Initialized: $STATE_FILE"
  else
    echo "State file already exists: $STATE_FILE"
  fi
  cmd_sync
}

cmd_sync() {
  require_jq
  require_state

  echo "=== Syncing from live git worktree list ==="

  SHA=$(head_sha)

  WORKTREES_JSON=$(git worktree list --porcelain 2>/dev/null | awk '
    /^worktree / { wt = $2 }
    /^branch / { br = $2 }
    /^$/ { if (wt != "") { printf "{\"path\":\"%s\",\"branch\":\"%s\"}", wt, br; wt=""; br="" } }
    END { if (wt != "") { printf "{\"path\":\"%s\",\"branch\":\"%s\"}", wt, br } }
  ' | paste -sd, - | sed 's/^/[/;s/$/]/')

  if [ -z "$WORKTREES_JSON" ] || [ "$WORKTREES_JSON" = "[]" ]; then
    WORKTREES_JSON="[]"
  fi

  TMP=$(mktemp)
  jq --argjson wts "$WORKTREES_JSON" --arg sha "$SHA" \
    '._meta.last_updated = (now | todate) | ._meta.head_sha = $sha | .worktrees = $wts' \
    "$STATE_FILE" > "$TMP"
  mv "$TMP" "$STATE_FILE"

  echo "Synced. $(echo "$WORKTREES_JSON" | jq length) worktrees recorded."
}

cmd_status() {
  require_jq
  require_state

  echo "=== Swarm State ==="
  echo "HEAD: $(jq -r '._meta.head_sha // "unknown"' "$STATE_FILE")"
  echo "Updated: $(jq -r '._meta.last_updated // "never"' "$STATE_FILE")"
  echo ""

  WT_COUNT=$(jq '.worktrees | length' "$STATE_FILE")
  echo "Worktrees: $WT_COUNT"
  if [ "$WT_COUNT" -gt 0 ]; then
    jq -r '.worktrees[] | "  \(.branch // "detached") -> \(.path)"' "$STATE_FILE"
  fi
  echo ""

  SPEC_COUNT=$(jq '.idle_specs | length' "$STATE_FILE")
  echo "Idle specs: $SPEC_COUNT"
  if [ "$SPEC_COUNT" -gt 0 ]; then
    jq -r '.idle_specs[] | "  \(.id // .spec_id // "unknown"): \(.path // .spec_path // "no path")"' "$STATE_FILE"
  fi
  echo ""

  GATE_COUNT=$(jq '.open_gates | length' "$STATE_FILE")
  echo "Open gates: $GATE_COUNT"
  if [ "$GATE_COUNT" -gt 0 ]; then
    jq -r '.open_gates[] | "  Gate \(.gate_number // "?") on \(.branch // "?") — awaiting: \(.awaiting // "human approval")"' "$STATE_FILE"
  fi
}

cmd_next() {
  require_jq
  require_state

  GATE_COUNT=$(jq '.open_gates | length' "$STATE_FILE")
  if [ "$GATE_COUNT" -gt 0 ]; then
    echo "BLOCKED: $GATE_COUNT open gate(s). Close gates before dispatching new work."
    jq -r '.open_gates[] | "  Gate \(.gate_number // "?") on \(.branch // "?")"' "$STATE_FILE"
    exit 0
  fi

  SPEC_COUNT=$(jq '.idle_specs | length' "$STATE_FILE")
  if [ "$SPEC_COUNT" -gt 0 ]; then
    FIRST=$(jq -r '.idle_specs[0]' "$STATE_FILE")
    echo "NEXT: Dispatch idle spec: $FIRST"
    exit 0
  fi

  echo "NEXT: No idle specs or open gates. Ready for new spec creation."
}

cmd_gate_open() {
  require_jq
  require_state

  BRANCH="${1:-}"
  GATE_NUM="${2:-}"

  if [ -z "$BRANCH" ] || [ -z "$GATE_NUM" ]; then
    echo "ERROR: usage: swarm-state.sh gate-open <branch> <gate-number>" >&2
    exit 1
  fi

  TMP=$(mktemp)
  jq --arg branch "$BRANCH" --arg gate "$GATE_NUM" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '.open_gates += [{"branch": $branch, "gate_number": $gate, "awaiting": "human approval", "opened_at": $ts}]' \
    "$STATE_FILE" > "$TMP"
  mv "$TMP" "$STATE_FILE"

  echo "Gate $GATE_NUM opened on branch '$BRANCH'. Awaiting human approval."
}

cmd_gate_close() {
  require_jq
  require_state

  BRANCH="${1:-}"
  GATE_NUM="${2:-}"

  if [ -z "$BRANCH" ] || [ -z "$GATE_NUM" ]; then
    echo "ERROR: usage: swarm-state.sh gate-close <branch> <gate-number>" >&2
    exit 1
  fi

  TMP=$(mktemp)
  jq --arg branch "$BRANCH" --arg gate "$GATE_NUM" \
    '.open_gates = [.open_gates[] | select(.branch != $branch or .gate_number != $gate)]' \
    "$STATE_FILE" > "$TMP"
  mv "$TMP" "$STATE_FILE"

  echo "Gate $GATE_NUM closed on branch '$BRANCH'."
}

cmd_dispatch() {
  require_jq
  require_state

  ROLE="${1:-}"
  BRANCH="${2:-}"
  SPEC_PATH="${3:-}"

  if [ -z "$ROLE" ] || [ -z "$BRANCH" ] || [ -z "$SPEC_PATH" ]; then
    echo "ERROR: usage: swarm-state.sh dispatch <role> <branch> <spec-path>" >&2
    exit 1
  fi

  echo "DISPATCH: role=$ROLE branch=$BRANCH spec=$SPEC_PATH"
  echo "Use your agent dispatch mechanism to start the agent."
}

cmd_add_spec() {
  require_jq
  require_state

  SPEC_ID="${1:-}"
  SPEC_PATH="${2:-}"

  if [ -z "$SPEC_ID" ] || [ -z "$SPEC_PATH" ]; then
    echo "ERROR: usage: swarm-state.sh add-spec <spec-id> <spec-path>" >&2
    exit 1
  fi

  TMP=$(mktemp)
  jq --arg id "$SPEC_ID" --arg path "$SPEC_PATH" \
    '.idle_specs += [{"id": $id, "path": $path}]' \
    "$STATE_FILE" > "$TMP"
  mv "$TMP" "$STATE_FILE"

  echo "Added spec: $SPEC_ID at $SPEC_PATH"
}

cmd_add_worktree() {
  require_jq
  require_state

  BRANCH="${1:-}"
  PATH_WT="${2:-}"
  SPEC_ID="${3:-}"

  if [ -z "$BRANCH" ] || [ -z "$PATH_WT" ] || [ -z "$SPEC_ID" ]; then
    echo "ERROR: usage: swarm-state.sh add-worktree <branch> <path> <spec-id>" >&2
    exit 1
  fi

  TMP=$(mktemp)
  jq --arg branch "$BRANCH" --arg path "$PATH_WT" --arg spec "$SPEC_ID" \
    '.worktrees += [{"branch": $branch, "path": $path, "spec_id": $spec}]' \
    "$STATE_FILE" > "$TMP"
  mv "$TMP" "$STATE_FILE"

  echo "Added worktree: $BRANCH at $PATH_WT (spec: $SPEC_ID)"
}

cmd_merge() {
  require_jq
  require_state

  BRANCH="${1:-}"
  if [ -z "$BRANCH" ]; then
    echo "ERROR: usage: swarm-state.sh merge <branch>" >&2
    exit 1
  fi

  TMP=$(mktemp)
  jq --arg branch "$BRANCH" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '.worktrees = [.worktrees[] | select(.branch != $branch)] | ._meta.last_updated = $ts' \
    "$STATE_FILE" > "$TMP"
  mv "$TMP" "$STATE_FILE"

  echo "Merged and cleaned up worktree for branch: $BRANCH"
}

cmd_check_gate_guard() {
  require_jq
  require_state

  PHASE="${1:-}"
  if [ -z "$PHASE" ]; then
    echo "ERROR: usage: swarm-state.sh check-gate-guard <phase>" >&2
    exit 1
  fi

  LOCK_FILE="${SWARM_DIR}/state/gates/${PHASE}.lock"
  if [ -f "$LOCK_FILE" ]; then
    echo "BLOCKED: Gate guard lock exists for phase '$PHASE'. Another agent is already in this gated phase."
    exit 1
  fi

  GATE_COUNT=$(jq '.open_gates | length' "$STATE_FILE")
  if [ "$GATE_COUNT" -gt 0 ]; then
    BLOCKING=$(jq -r --arg phase "$PHASE" '.open_gates[] | select(.awaiting == $phase) | .gate_number' "$STATE_FILE" 2>/dev/null || echo "")
    if [ -n "$BLOCKING" ]; then
      echo "BLOCKED: Gate $BLOCKING is open and blocking phase '$PHASE'."
      exit 1
    fi
  fi

  mkdir -p "$(dirname "$LOCK_FILE")"
  echo "$$" > "$LOCK_FILE"
  trap "rm -f '$LOCK_FILE'" EXIT
  echo "OK: Gate guard acquired for phase '$PHASE'."
}

COMMAND="${1:-}"
shift || true

case "$COMMAND" in
  init) cmd_init ;;
  sync) cmd_sync ;;
  status) cmd_status ;;
  next) cmd_next ;;
  gate-open) cmd_gate_open "$@" ;;
  gate-close) cmd_gate_close "$@" ;;
  dispatch) cmd_dispatch "$@" ;;
  add-spec) cmd_add_spec "$@" ;;
  add-worktree) cmd_add_worktree "$@" ;;
  *) echo "ERROR: Unknown command '$COMMAND'" >&2; echo "Usage: swarm-state.sh {init|sync|status|next|gate-open|gate-close|dispatch|add-spec|add-worktree}" >&2; exit 1 ;;
esac
