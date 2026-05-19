#!/usr/bin/env bash
# swarm-state.sh — swarm state manager (SQLite backend, v2)
# Location: .ai-swarm/scripts/swarm-state.sh
#
# Usage:
#   ./swarm-state.sh init                          — initialize database and all agent directories
#   ./swarm-state.sh sync                          — sync HEAD SHA from live git state
#   ./swarm-state.sh status                        — print full swarm state summary
#   ./swarm-state.sh next                          — emit the highest-priority next action
#   ./swarm-state.sh add-spec <id> [p] [f] [n]    — register new idle spec (priority, file, notes)
#   ./swarm-state.sh add-worktree <id> <branch>   — create worktree and register atomically
#   ./swarm-state.sh complete-spec <id>            — mark spec as done
#   ./swarm-state.sh gate-open  <branch> <gate>   — open a gate (writes lockfile)
#   ./swarm-state.sh gate-close <branch> <gate>   — close a gate (removes lockfile)
#   ./swarm-state.sh dispatch   <spec-id>          — mark spec as dispatched
#   ./swarm-state.sh merge      <branch>           — record merge, remove worktree entry
#   ./swarm-state.sh events     [N]                — show last N events (default 20)
#   ./swarm-state.sh install-hook                  — install git pre-commit gate guard
#   ./swarm-state.sh check-gate-guard              — gate guard check (called by pre-commit hook)

set -euo pipefail

SWARM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_FILE="$SWARM_DIR/state/swarm.db"
GATES_DIR="$SWARM_DIR/state/gates"
LOCK_DIR="$SWARM_DIR/state/.swarm.lock"

# Backward-compat reference — only used during migration
STATE_FILE="$SWARM_DIR/state/current.json"

# ── Helpers ───────────────────────────────────────────────────────────────────

die() { echo "ERROR: $*" >&2; exit 1; }

require_sqlite() {
  command -v sqlite3 >/dev/null 2>&1 || \
    die "sqlite3 is required. Built into macOS. On Linux: apt install sqlite3 or brew install sqlite"
}

require_db() {
  test -f "$DB_FILE" || die "Database not found: $DB_FILE. Run: ./swarm-state.sh init"
}

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

head_sha() {
  git -C "$SWARM_DIR/.." rev-parse HEAD 2>/dev/null || echo "unknown"
}

# ── Locking ───────────────────────────────────────────────────────────────────
# Uses mkdir-based locking: POSIX-portable, atomic on macOS and Linux,
# no external dependencies (flock is GNU/Linux only).

acquire_lock() {
  local retries=10
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    retries=$((retries - 1))
    if [ "$retries" -eq 0 ]; then
      die "Could not acquire state lock after 10 attempts. Remove $LOCK_DIR if stale."
    fi
    sleep 0.2
  done
  # Ensure lock is released on exit/interrupt even if caller forgets
  trap 'release_lock' EXIT INT TERM
}

release_lock() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
  trap - EXIT INT TERM 2>/dev/null || true
}

# ── Database helpers ──────────────────────────────────────────────────────────

db() {
  sqlite3 "$DB_FILE" "$@"
}

log_event() {
  local verb="$1"
  local actor="${2:-swarm-state.sh}"
  local target="${3:-}"
  local detail="${4:-}"
  db "INSERT INTO events (verb, actor, target, detail) VALUES ('$verb', '$actor', '$target', '$detail');" \
    2>/dev/null || true
}

gate_lockfile() {
  local branch="$1"
  local gate="$2"
  local safe_branch
  safe_branch=$(echo "$branch" | tr '/' '_')
  echo "$GATES_DIR/${safe_branch}.gate${gate}.lock"
}

is_gate_locked() {
  local branch="$1"
  local gate="$2"
  test -f "$(gate_lockfile "$branch" "$gate")"
}

# ── Schema ────────────────────────────────────────────────────────────────────

SCHEMA='
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS worktrees (
  id                 TEXT PRIMARY KEY,
  branch             TEXT NOT NULL,
  spec               TEXT,
  phase              TEXT    DEFAULT "idle",
  priority           TEXT    DEFAULT "P0",
  merge_ready        INTEGER DEFAULT 0,
  merge_ready_reason TEXT,
  fragility          TEXT,
  notes              TEXT,
  created_at         TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at         TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS idle_specs (
  id                   TEXT PRIMARY KEY,
  spec                 TEXT,
  priority             TEXT DEFAULT "P0",
  dispatch_status      TEXT DEFAULT "NOT_DISPATCHED",
  dispatch_blocked_by  TEXT,
  notes                TEXT,
  created_at           TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS open_gates (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  branch       TEXT    NOT NULL,
  gate_number  INTEGER NOT NULL,
  gate_type    TEXT    DEFAULT "human",
  awaiting     TEXT,
  opened_at    TEXT    DEFAULT CURRENT_TIMESTAMP,
  locked       INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS blockers (
  id           TEXT PRIMARY KEY,
  status       TEXT DEFAULT "OPEN",
  closes_when  TEXT,
  created_at   TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ratchets (
  key        TEXT PRIMARY KEY,
  baseline   INTEGER,
  current    INTEGER,
  status     TEXT DEFAULT "PASS",
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Audit trail: every state mutation is logged here for retrospectives.
-- Replaces "transcript grep" as the primary observability source.
CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      TEXT DEFAULT CURRENT_TIMESTAMP,
  verb    TEXT NOT NULL,
  actor   TEXT,
  target  TEXT,
  detail  TEXT
);
'

# ── Init / Migration ──────────────────────────────────────────────────────────

_create_agent_dirs() {
  # All directories that swarm agents reference. Created once at init time
  # so agents never encounter "no such file or directory" on first use.
  mkdir -p "$SWARM_DIR/specs/archived"
  mkdir -p "$SWARM_DIR/knowledge"
  mkdir -p "$SWARM_DIR/adrs"
  mkdir -p "$SWARM_DIR/reports"
  mkdir -p "$SWARM_DIR/../audit-findings/archived"
  mkdir -p "$SWARM_DIR/../audit-findings/releases"
  touch "$SWARM_DIR/specs/archived/.gitkeep" 2>/dev/null || true
  touch "$SWARM_DIR/knowledge/.gitkeep"      2>/dev/null || true
  touch "$SWARM_DIR/adrs/.gitkeep"           2>/dev/null || true
  touch "$SWARM_DIR/reports/.gitkeep"        2>/dev/null || true
}

_migrate_from_json() {
  # Best-effort migration of existing current.json data.
  # Handles both the old schema (worktrees/specs/gates) and new (worktrees/idle_specs/open_gates).
  command -v jq >/dev/null 2>&1 || { echo "  jq not found — skipping data migration"; return; }

  echo "  Migrating worktrees..."
  while IFS= read -r row; do
    [ -z "$row" ] && continue
    local id branch spec phase priority merge_ready notes
    id=$(echo "$row"          | jq -r '.id // ""')
    branch=$(echo "$row"      | jq -r '.branch // ""')
    spec=$(echo "$row"        | jq -r '.spec // ""')
    phase=$(echo "$row"       | jq -r '.phase // "idle"')
    priority=$(echo "$row"    | jq -r '.priority // "P0"')
    merge_ready=$(echo "$row" | jq -r 'if .merge_ready then 1 else 0 end')
    notes=$(echo "$row"       | jq -r '.notes // ""')
    [ -z "$id" ] && continue
    # Escape single quotes for SQL
    id=$(echo "$id"       | sed "s/'/''/g")
    branch=$(echo "$branch" | sed "s/'/''/g")
    db "INSERT OR IGNORE INTO worktrees (id, branch, spec, phase, priority, merge_ready, notes)
        VALUES ('$id', '$branch', '$spec', '$phase', '$priority', $merge_ready, '$notes');" 2>/dev/null || true
  done < <(jq -c '.worktrees[]?' "$STATE_FILE" 2>/dev/null)

  echo "  Migrating idle specs..."
  # Handle both .idle_specs (new schema) and .specs (old schema)
  while IFS= read -r row; do
    [ -z "$row" ] && continue
    local sid sspec spriority sstatus snotes
    sid=$(echo "$row"      | jq -r '.id // ""')
    sspec=$(echo "$row"    | jq -r '.spec // ""')
    spriority=$(echo "$row" | jq -r '.priority // "P0"')
    sstatus=$(echo "$row"  | jq -r '.dispatch_status // "NOT_DISPATCHED"')
    snotes=$(echo "$row"   | jq -r '.notes // ""')
    [ -z "$sid" ] && continue
    sid=$(echo "$sid" | sed "s/'/''/g")
    db "INSERT OR IGNORE INTO idle_specs (id, spec, priority, dispatch_status, notes)
        VALUES ('$sid', '$sspec', '$spriority', '$sstatus', '$snotes');" 2>/dev/null || true
  done < <(jq -c '(.idle_specs // .specs // [])[]?' "$STATE_FILE" 2>/dev/null)

  echo "  Migrating blockers..."
  while IFS= read -r row; do
    [ -z "$row" ] && continue
    local bid bstatus bcloses
    bid=$(echo "$row"     | jq -r '.id // ""')
    bstatus=$(echo "$row" | jq -r '.status // "OPEN"')
    bcloses=$(echo "$row" | jq -r '.closes_when // ""')
    [ -z "$bid" ] && continue
    db "INSERT OR IGNORE INTO blockers (id, status, closes_when)
        VALUES ('$bid', '$bstatus', '$bcloses');" 2>/dev/null || true
  done < <(jq -c '.blockers[]?' "$STATE_FILE" 2>/dev/null)
}

cmd_init() {
  require_sqlite
  mkdir -p "$SWARM_DIR/state/gates"
  _create_agent_dirs

  if [ -f "$DB_FILE" ]; then
    echo "Database already exists: $DB_FILE"
    echo "Run 'status' to inspect current state."
  else
    sqlite3 "$DB_FILE" "$SCHEMA"
    db "INSERT OR IGNORE INTO meta (key, value) VALUES ('version',        '2.0');"
    db "INSERT OR IGNORE INTO meta (key, value) VALUES ('initialized_at', '$(timestamp)');"
    db "INSERT OR IGNORE INTO meta (key, value) VALUES ('last_updated',   '$(timestamp)');"
    db "INSERT OR IGNORE INTO meta (key, value) VALUES ('last_updated_by','swarm-state.sh init');"
    db "INSERT OR IGNORE INTO meta (key, value) VALUES ('head_sha',       'unknown');"
    echo "Initialized: $DB_FILE (SQLite, WAL mode)"

    # Migrate from current.json if it contains data
    if [ -f "$STATE_FILE" ]; then
      local has_data=0
      command -v jq >/dev/null 2>&1 && \
        has_data=$(jq '(.worktrees | length) + ((.idle_specs // .specs // []) | length)' "$STATE_FILE" 2>/dev/null || echo 0)
      if [ "${has_data:-0}" -gt 0 ]; then
        echo ""
        echo "Found existing data in current.json — migrating to swarm.db..."
        _migrate_from_json
        cp "$STATE_FILE" "${STATE_FILE}.bak"
        echo "Migration complete. current.json preserved as current.json.bak"
      fi
    fi
  fi

  cmd_sync
}

# ── Commands ──────────────────────────────────────────────────────────────────

cmd_sync() {
  require_sqlite
  require_db

  echo "=== Syncing from live git state ==="

  local sha
  sha=$(head_sha)
  local ts
  ts=$(timestamp)

  acquire_lock
  db "UPDATE meta SET value = '$sha'                WHERE key = 'head_sha';
      UPDATE meta SET value = '$ts'                 WHERE key = 'last_updated';
      UPDATE meta SET value = 'swarm-state.sh sync' WHERE key = 'last_updated_by';"
  release_lock

  echo "HEAD SHA: $sha"
  echo ""
  echo "Live worktrees:"
  git worktree list --porcelain 2>/dev/null | grep -E "^worktree|^branch|^HEAD" | head -40 || true
  echo ""
  echo "State synced. Run './swarm-state.sh status' for full view."
}

cmd_status() {
  require_sqlite
  require_db

  local sha updated updated_by
  sha=$(db        "SELECT value FROM meta WHERE key = 'head_sha';")
  updated=$(db    "SELECT value FROM meta WHERE key = 'last_updated';")
  updated_by=$(db "SELECT value FROM meta WHERE key = 'last_updated_by';")

  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║           SWARM STATE                                    ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""
  echo "HEAD SHA : ${sha:-unknown}"
  echo "Updated  : ${updated:-never}"
  echo "By       : ${updated_by:-unknown}"
  echo ""

  echo "┌─ OPEN GATES ─────────────────────────────────────────────┐"
  local gate_count
  gate_count=$(db "SELECT count(*) FROM open_gates WHERE locked = 1;")
  if [ "$gate_count" -eq 0 ]; then
    echo "│  None"
  else
    while IFS='|' read -r branch gate_num awaiting opened_at; do
      echo "│  Gate $gate_num — $branch"
      echo "│    Awaiting: $awaiting"
      echo "│    Opened:   $opened_at"
    done < <(db -separator '|' \
      "SELECT branch, gate_number, awaiting, opened_at FROM open_gates WHERE locked = 1;")
  fi
  echo "└──────────────────────────────────────────────────────────┘"
  echo ""

  echo "┌─ ACTIVE WORKTREES ───────────────────────────────────────┐"
  local wt_count
  wt_count=$(db "SELECT count(*) FROM worktrees;")
  if [ "$wt_count" -eq 0 ]; then
    echo "│  None"
  else
    while IFS='|' read -r wid branch phase priority merge_ready reason; do
      echo "│  [$priority] $wid"
      echo "│    Branch:  $branch"
      echo "│    Phase:   $phase"
      echo "│    Ready:   $merge_ready"
      echo "│    Reason:  ${reason:-—}"
    done < <(db -separator '|' \
      "SELECT id, branch, phase, priority, merge_ready, merge_ready_reason FROM worktrees;")
  fi
  echo "└──────────────────────────────────────────────────────────┘"
  echo ""

  echo "┌─ OPEN BLOCKERS ──────────────────────────────────────────┐"
  local blocker_count
  blocker_count=$(db "SELECT count(*) FROM blockers WHERE status = 'OPEN';")
  if [ "$blocker_count" -eq 0 ]; then
    echo "│  None — release gate is clear"
  else
    while IFS='|' read -r bid closes_when; do
      echo "│  [OPEN] $bid"
      echo "│    Closes when: $closes_when"
    done < <(db -separator '|' \
      "SELECT id, closes_when FROM blockers WHERE status = 'OPEN';")
  fi
  echo "└──────────────────────────────────────────────────────────┘"
  echo ""

  echo "┌─ IDLE P0 SPECS (must be dispatched) ─────────────────────┐"
  local p0_idle
  p0_idle=$(db "SELECT count(*) FROM idle_specs WHERE priority = 'P0' AND dispatch_status != 'DISPATCHED';")
  if [ "$p0_idle" -eq 0 ]; then
    echo "│  None"
  else
    while IFS='|' read -r sid status blocked_by; do
      echo "│  [$status] $sid"
      echo "│    Blocked by: ${blocked_by:-nothing — dispatch now}"
    done < <(db -separator '|' \
      "SELECT id, dispatch_status, dispatch_blocked_by FROM idle_specs
       WHERE priority = 'P0' AND dispatch_status != 'DISPATCHED';")
  fi
  echo "└──────────────────────────────────────────────────────────┘"
  echo ""

  echo "┌─ RATCHETS ───────────────────────────────────────────────┐"
  local ratchet_count
  ratchet_count=$(db "SELECT count(*) FROM ratchets;")
  if [ "$ratchet_count" -eq 0 ]; then
    echo "│  None configured"
  else
    while IFS='|' read -r rkey rcurrent rbaseline rstatus; do
      echo "│  $rkey: ${rcurrent:-?} (baseline: ${rbaseline:-none}) — $rstatus"
    done < <(db -separator '|' \
      "SELECT key, current, baseline, status FROM ratchets;")
  fi
  echo "└──────────────────────────────────────────────────────────┘"
  echo ""
}

cmd_next() {
  require_sqlite
  require_db

  echo "=== CONDUCTOR NEXT ACTION ==="
  echo ""

  # Priority 1: Any open human gate
  local human_gates
  human_gates=$(db "SELECT count(*) FROM open_gates WHERE gate_type = 'human' AND locked = 1;")
  if [ "$human_gates" -gt 0 ]; then
    echo "ACTION: HUMAN_GATE_PENDING"
    echo ""
    echo "One or more human gates are open. The conductor MUST NOT dispatch"
    echo "new work or commit to gated branches until the human resolves these:"
    echo ""
    while IFS='|' read -r gate_num branch awaiting; do
      echo "  Gate $gate_num on $branch"
      echo "  Awaiting: $awaiting"
      echo ""
    done < <(db -separator '|' \
      "SELECT gate_number, branch, awaiting FROM open_gates WHERE gate_type = 'human' AND locked = 1;")
    echo "Resolution: Human approves or blocks. Then run: ./swarm-state.sh gate-close <branch> <gate>"
    return 0
  fi

  # Priority 2: Merge-ready worktrees
  local merge_ready
  merge_ready=$(db "SELECT id FROM worktrees WHERE merge_ready = 1 LIMIT 1;")
  if [ -n "$merge_ready" ]; then
    echo "ACTION: OPEN_PR"
    echo ""
    while IFS='|' read -r wid branch spec reason notes; do
      echo "Branch:  $branch"
      echo "Spec:    $spec"
      echo "Reason:  $reason"
      echo "Notes:   $notes"
      echo ""
      echo "Run: gh pr create --base dev --head $branch"
    done < <(db -separator '|' \
      "SELECT id, branch, spec, merge_ready_reason, notes FROM worktrees WHERE id = '$merge_ready';")
    return 0
  fi

  # Priority 3: P0 idle specs unblocked, not yet dispatched
  local p0_unblocked
  p0_unblocked=$(db \
    "SELECT id FROM idle_specs
     WHERE priority = 'P0' AND dispatch_status = 'NOT_DISPATCHED' AND dispatch_blocked_by IS NULL
     LIMIT 1;")
  if [ -n "$p0_unblocked" ]; then
    echo "ACTION: DISPATCH_WORKTREE"
    echo ""
    while IFS='|' read -r sid spec notes; do
      echo "Spec:    ${spec:-NEEDS_SPEC — write spec first}"
      echo "ID:      $sid"
      echo "Notes:   $notes"
    done < <(db -separator '|' \
      "SELECT id, spec, notes FROM idle_specs WHERE id = '$p0_unblocked';")
    local needs_spec
    needs_spec=$(db "SELECT dispatch_status FROM idle_specs WHERE id = '$p0_unblocked';")
    [ "$needs_spec" = "NEEDS_SPEC" ] && echo "⚠  No spec file exists. Dispatch spec-writer first."
    echo "   Run: ./swarm-state.sh dispatch $p0_unblocked"
    return 0
  fi

  # Priority 4: P0 blocked by dependency
  local p0_blocked
  p0_blocked=$(db \
    "SELECT count(*) FROM idle_specs
     WHERE priority = 'P0' AND dispatch_status != 'DISPATCHED' AND dispatch_blocked_by IS NOT NULL;")
  if [ "$p0_blocked" -gt 0 ]; then
    echo "ACTION: UNBLOCK_DEPENDENCY"
    echo ""
    echo "P0 specs are blocked by dependencies:"
    while IFS='|' read -r sid blocked_by; do
      echo "  $sid"
      echo "    Blocked by: $blocked_by"
      echo ""
    done < <(db -separator '|' \
      "SELECT id, dispatch_blocked_by FROM idle_specs
       WHERE priority = 'P0' AND dispatch_status != 'DISPATCHED' AND dispatch_blocked_by IS NOT NULL;")
    echo "Resolve the blocker first, then re-run: ./swarm-state.sh next"
    return 0
  fi

  # Priority 5: Nothing urgent
  echo "ACTION: IDLE"
  echo ""
  echo "No P0 work pending. P1 options:"
  echo ""
  while IFS='|' read -r sid notes; do
    echo "  [P1] $sid"
    echo "    $notes"
    echo ""
  done < <(db -separator '|' \
    "SELECT id, notes FROM idle_specs WHERE priority = 'P1' AND dispatch_status = 'NOT_DISPATCHED';")
}

cmd_gate_open() {
  local branch="${1:-}"
  local gate="${2:-}"
  [ -n "$branch" ] || die "Usage: gate-open <branch> <gate-number>"
  [ -n "$gate" ]   || die "Usage: gate-open <branch> <gate-number>"

  require_sqlite
  require_db
  mkdir -p "$GATES_DIR"

  local lockfile
  lockfile=$(gate_lockfile "$branch" "$gate")

  if [ -f "$lockfile" ]; then
    echo "Gate $gate already open for $branch (lockfile exists)"
    cat "$lockfile"
    return 0
  fi

  local ts
  ts=$(timestamp)

  # Write lockfile (pre-commit hook reads these for speed)
  cat > "$lockfile" <<EOF
{
  "branch": "$branch",
  "gate": $gate,
  "opened_at": "$ts",
  "opened_by": "swarm-state.sh"
}
EOF

  acquire_lock
  db "INSERT INTO open_gates (branch, gate_number, gate_type, awaiting, opened_at, locked)
      VALUES ('$branch', $gate, 'human', 'Review required', '$ts', 1);
      UPDATE meta SET value = '$ts'                      WHERE key = 'last_updated';
      UPDATE meta SET value = 'swarm-state.sh gate-open' WHERE key = 'last_updated_by';"
  log_event "GATE_OPEN" "swarm-state.sh" "$branch" "gate=$gate"
  release_lock

  echo "Gate $gate opened for branch: $branch"
  echo "Lockfile: $lockfile"
  echo ""
  echo "⚠  No commits may be made to this branch while the gate is open."
  echo "   Resolve with: ./swarm-state.sh gate-close $branch $gate"
}

cmd_gate_close() {
  local branch="${1:-}"
  local gate="${2:-}"
  [ -n "$branch" ] || die "Usage: gate-close <branch> <gate-number>"
  [ -n "$gate" ]   || die "Usage: gate-close <branch> <gate-number>"

  require_sqlite
  require_db

  local lockfile
  lockfile=$(gate_lockfile "$branch" "$gate")

  if [ ! -f "$lockfile" ]; then
    echo "No lockfile found for gate $gate on $branch — already closed?"
  else
    rm "$lockfile"
    echo "Lockfile removed: $lockfile"
  fi

  acquire_lock
  db "DELETE FROM open_gates WHERE branch = '$branch' AND gate_number = $gate;
      UPDATE meta SET value = '$(timestamp)'               WHERE key = 'last_updated';
      UPDATE meta SET value = 'swarm-state.sh gate-close'  WHERE key = 'last_updated_by';"
  log_event "GATE_CLOSE" "swarm-state.sh" "$branch" "gate=$gate"
  release_lock

  echo "Gate $gate closed for branch: $branch"
  echo "Run: ./swarm-state.sh next"
}

cmd_dispatch() {
  local spec_id="${1:-}"
  [ -n "$spec_id" ] || die "Usage: dispatch <spec-id>"

  require_sqlite
  require_db

  local open_count
  open_count=$(db "SELECT count(*) FROM open_gates WHERE locked = 1;")
  if [ "$open_count" -gt 0 ]; then
    echo "⚠  Cannot dispatch: open gates exist. Resolve gates first."
    while IFS='|' read -r gate branch; do
      echo "  Gate $gate on $branch"
    done < <(db -separator '|' "SELECT gate_number, branch FROM open_gates WHERE locked = 1;")
    exit 1
  fi

  acquire_lock
  db "UPDATE idle_specs SET dispatch_status = 'DISPATCHED' WHERE id = '$spec_id';
      UPDATE meta SET value = '$(timestamp)'                WHERE key = 'last_updated';
      UPDATE meta SET value = 'swarm-state.sh dispatch'     WHERE key = 'last_updated_by';"
  log_event "DISPATCH" "swarm-state.sh" "$spec_id"
  release_lock

  echo "Dispatched: $spec_id"
}

cmd_merge() {
  local branch="${1:-}"
  [ -n "$branch" ] || die "Usage: merge <branch>"

  require_sqlite
  require_db

  if is_gate_locked "$branch" "1" || is_gate_locked "$branch" "2" || is_gate_locked "$branch" "3"; then
    die "Gate is still open for $branch. Close the gate before recording merge."
  fi

  local sha
  sha=$(head_sha)

  acquire_lock
  db "DELETE FROM worktrees WHERE branch = '$branch';
      UPDATE meta SET value = '$sha'                   WHERE key = 'head_sha';
      UPDATE meta SET value = '$(timestamp)'           WHERE key = 'last_updated';
      UPDATE meta SET value = 'swarm-state.sh merge'   WHERE key = 'last_updated_by';"
  log_event "MERGE" "swarm-state.sh" "$branch" "sha=$sha"
  release_lock

  echo "Merged: $branch"
  echo "Run: git worktree remove .worktrees/<dir>"
  echo "Run: ./swarm-state.sh next"
}

cmd_add_spec() {
  local spec_id="${1:-}"
  local priority="${2:-P0}"
  local spec_file="${3:-}"
  local notes="${4:-}"
  [ -n "$spec_id" ] || die "Usage: add-spec <spec-id> [priority] [spec-file] [notes]"

  require_sqlite
  require_db

  # Escape single quotes
  local safe_id safe_notes
  safe_id=$(echo "$spec_id"   | sed "s/'/''/g")
  safe_notes=$(echo "$notes"  | sed "s/'/''/g")

  acquire_lock
  db "INSERT INTO idle_specs (id, priority, spec, notes, dispatch_status)
      VALUES ('$safe_id', '$priority', '$spec_file', '$safe_notes', 'NOT_DISPATCHED');
      UPDATE meta SET value = '$(timestamp)'               WHERE key = 'last_updated';
      UPDATE meta SET value = 'swarm-state.sh add-spec'    WHERE key = 'last_updated_by';"
  log_event "SPEC" "swarm-state.sh" "$safe_id" "priority=$priority"
  release_lock

  echo "Spec registered: $spec_id (priority=$priority)"
  echo "Run: ./swarm-state.sh add-worktree $spec_id task/$spec_id  (when ready to dispatch)"
}

cmd_add_worktree() {
  local spec_id="${1:-}"
  local branch="${2:-}"
  [ -n "$spec_id" ] || die "Usage: add-worktree <spec-id> <branch>"
  [ -n "$branch" ]  || die "Usage: add-worktree <spec-id> <branch>"

  require_sqlite
  require_db

  local open_count
  open_count=$(db "SELECT count(*) FROM open_gates WHERE locked = 1;")
  [ "$open_count" -gt 0 ] && die "Cannot add worktree: open gates exist. Resolve gates first."

  # Atomically create git worktree + register in DB
  local worktree_path=".worktrees/$spec_id"
  local repo_root
  repo_root=$(git -C "$SWARM_DIR/.." rev-parse --show-toplevel)
  local full_path="$repo_root/$worktree_path"

  if [ -d "$full_path" ]; then
    echo "Worktree directory already exists: $full_path"
  else
    git -C "$repo_root" worktree add "$worktree_path" -b "$branch" dev
    echo "Created worktree: $worktree_path (branch: $branch)"
  fi

  local safe_id
  safe_id=$(echo "$spec_id" | sed "s/'/''/g")
  local spec_path=".ai-swarm/specs/$spec_id.md"

  acquire_lock
  db "INSERT OR IGNORE INTO worktrees (id, branch, spec, phase, priority)
      VALUES ('$safe_id', '$branch', '$spec_path', 'implement', 'P0');
      UPDATE meta SET value = '$(timestamp)'                    WHERE key = 'last_updated';
      UPDATE meta SET value = 'swarm-state.sh add-worktree'    WHERE key = 'last_updated_by';"
  log_event "DISPATCH" "swarm-state.sh" "$safe_id" "branch=$branch"
  release_lock

  echo "Worktree registered: $spec_id → $branch"
  echo "Ready for implementer dispatch."
}

cmd_complete_spec() {
  local spec_id="${1:-}"
  [ -n "$spec_id" ] || die "Usage: complete-spec <spec-id>"

  require_sqlite
  require_db

  local safe_id
  safe_id=$(echo "$spec_id" | sed "s/'/''/g")

  acquire_lock
  db "UPDATE idle_specs SET dispatch_status = 'DONE' WHERE id = '$safe_id';
      UPDATE meta SET value = '$(timestamp)'                   WHERE key = 'last_updated';
      UPDATE meta SET value = 'swarm-state.sh complete-spec'   WHERE key = 'last_updated_by';"
  log_event "MERGE" "swarm-state.sh" "$safe_id" "status=DONE"
  release_lock

  echo "Spec marked complete: $spec_id"
}

cmd_events() {
  local n="${1:-20}"
  require_sqlite
  require_db

  echo "=== RECENT EVENTS (last $n) ==="
  echo ""
  while IFS='|' read -r ts verb actor target detail; do
    printf "%-25s  %-16s  %-30s  [%s]  %s\n" "$ts" "$verb" "$target" "$actor" "$detail"
  done < <(db -separator '|' \
    "SELECT ts, verb, actor, target, detail FROM events ORDER BY id DESC LIMIT $n;")
}

# ── Gate guard (called by pre-commit hook) ─────────────────────────────────────

cmd_check_gate_guard() {
  local current_branch
  current_branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")

  [ -z "$current_branch" ] && exit 0

  local safe_branch
  safe_branch=$(echo "$current_branch" | tr '/' '_')

  for lockfile in "$GATES_DIR/${safe_branch}".gate*.lock; do
    if [ -f "$lockfile" ]; then
      echo ""
      echo "╔══════════════════════════════════════════════════════════╗"
      echo "║  COMMIT BLOCKED — GATE IS OPEN                          ║"
      echo "╚══════════════════════════════════════════════════════════╝"
      echo ""
      echo "  Branch: $current_branch"
      echo "  Lock:   $lockfile"
      echo ""
      cat "$lockfile"
      echo ""
      echo "  Resolve with: ./swarm-state.sh gate-close $current_branch <gate-number>"
      echo ""
      exit 1
    fi
  done

  exit 0
}

cmd_install_hook() {
  local hook_path
  hook_path="$(git -C "$SWARM_DIR/.." rev-parse --git-dir)/hooks/pre-commit"

  if [ -f "$hook_path" ]; then
    echo "pre-commit hook already exists: $hook_path"
    echo "Append manually or use --force to overwrite."
    return 0
  fi

  cat > "$hook_path" <<'HOOK'
#!/usr/bin/env bash
# swarm gate guard — installed by swarm-state.sh install-hook
SCRIPT_DIR="$(git rev-parse --show-toplevel)/.ai-swarm/scripts"
if [ -f "$SCRIPT_DIR/swarm-state.sh" ]; then
  bash "$SCRIPT_DIR/swarm-state.sh" check-gate-guard
fi
HOOK

  chmod +x "$hook_path"
  echo "Installed gate guard at: $hook_path"
}

# ── Main dispatch ─────────────────────────────────────────────────────────────

COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
  init)             cmd_init ;;
  sync)             cmd_sync ;;
  status)           cmd_status ;;
  next)             cmd_next ;;
  add-spec)         cmd_add_spec "$@" ;;
  add-worktree)     cmd_add_worktree "$@" ;;
  complete-spec)    cmd_complete_spec "$@" ;;
  gate-open)        cmd_gate_open "$@" ;;
  gate-close)       cmd_gate_close "$@" ;;
  dispatch)         cmd_dispatch "$@" ;;
  merge)            cmd_merge "$@" ;;
  events)           cmd_events "$@" ;;
  check-gate-guard) cmd_check_gate_guard ;;
  install-hook)     cmd_install_hook ;;
  help|*)
    echo "Usage: swarm-state.sh <command> [args]"
    echo ""
    echo "Commands:"
    echo "  init                               Initialize database, gates dir, and all agent directories"
    echo "  sync                               Sync HEAD SHA from live git state"
    echo "  status                             Print full swarm state summary"
    echo "  next                               Emit the highest-priority next action"
    echo "  add-spec  <id> [p] [file] [notes]  Register a new idle spec"
    echo "  add-worktree <id> <branch>         Create git worktree and register atomically"
    echo "  complete-spec <id>                 Mark a spec as done"
    echo "  gate-open  <branch> <gate>         Open a gate and write lockfile"
    echo "  gate-close <branch> <gate>         Close a gate and remove lockfile"
    echo "  dispatch   <spec-id>               Mark a spec as dispatched"
    echo "  merge      <branch>                Record a merge, remove worktree entry"
    echo "  events     [N]                     Show last N events from audit trail (default 20)"
    echo "  install-hook                       Install git pre-commit gate guard"
    echo "  check-gate-guard                   Run gate guard check (called by hook)"
    ;;
esac
