#!/bin/sh
#
# workspace-intel.sh — Emit conductor-relevant workspace intelligence.
#
# Reads workspace.json (if available from a daemon) and emits:
#   - Health status
#   Top fragile files (highest blast radius)
#   - Co-change clusters (collision surface)
#   - Risk summary
#
# Usage:
#   bash .ai-swarm/scripts/workspace-intel.sh
#
# If workspace.json is not available, exits 0 with a warning.

set -eu

SWARM_DIR="${SWARM_DIR:-.ai-swarm}"

# Find workspace.json
WORKSPACE_JSON=""
for path in ".agents/agents.workspace.json" ".workspace/workspace.json" "workspace.json"; do
  if [ -f "$path" ]; then
    WORKSPACE_JSON="$path"
    break
  fi
done

if [ -z "$WORKSPACE_JSON" ]; then
  echo "WARNING: WORKSPACE INTELLIGENCE UNAVAILABLE"
  echo "   workspace.json not found."
  echo "   Conductor may proceed but without fragility or co-change data."
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "WARNING: jq is required for workspace intelligence. Skipping."
  exit 0
fi

echo "=== WORKSPACE INTELLIGENCE ==="
echo "Source: $WORKSPACE_JSON"
echo "Generated: $(jq -r '.generatedAt // "unknown"' "$WORKSPACE_JSON" 2>/dev/null || echo "unknown")"
echo ""

# Health
echo "+-HEALTH ---------------------------------------------------+"
jq -r '.health | to_entries[] | "  \(.key): \(.value)"' "$WORKSPACE_JSON" 2>/dev/null \
  || echo "  health field not present"
echo "+----------------------------------------------------------+"
echo ""

# Top fragile files
echo "+-TOP FRAGILE FILES (pre-dispatch audit required) ---------+"
FRAGILE_COUNT=$(jq -r '
  .files // {} | to_entries
  | map(select(.value.fragility != null))
  | length
' "$WORKSPACE_JSON" 2>/dev/null || echo "0")

if [ "$FRAGILE_COUNT" -gt 0 ] 2>/dev/null; then
  jq -r '
    .files // {} | to_entries
    | map(select(.value.fragility != null))
    | sort_by(-.value.fragility)
    | .[0:10]
    | .[]
    | "  [\(.value.fragility)] \(.key)"
  ' "$WORKSPACE_JSON" 2>/dev/null
else
  echo "  fragility data not present"
fi
echo "+----------------------------------------------------------+"
echo ""

# Co-change clusters
echo "+-CO-CHANGE CLUSTERS (collision surface) ------------------+"
CLUSTER_COUNT=$(jq -r '.coChangeClusters // [] | length' "$WORKSPACE_JSON" 2>/dev/null || echo "0")

if [ "$CLUSTER_COUNT" -gt 0 ] 2>/dev/null; then
  jq -r '
    .coChangeClusters // [] | .[0:5] | .[]
    | "  Cluster: \(. | join(", "))"
  ' "$WORKSPACE_JSON" 2>/dev/null
else
  echo "  coChangeClusters: none recorded yet"
fi
echo "+----------------------------------------------------------+"
echo ""

# Risk summary
echo "+-CURRENT RISK STATE --------------------------------------+"
AGENT_COUNT=$(jq -r '.agents // {} | length' "$WORKSPACE_JSON" 2>/dev/null || echo "0")

if [ "$AGENT_COUNT" -gt 0 ] 2>/dev/null; then
  jq -r '
    .agents // {} | to_entries
    | map(select(.value.riskScore != null))
    | sort_by(-.value.riskScore)
    | .[0:5]
    | .[]
    | "  [\(.value.riskScore)] \(.key)"
  ' "$WORKSPACE_JSON" 2>/dev/null
else
  echo "  agents/riskScore: no data yet"
fi
echo "+----------------------------------------------------------+"
echo ""

echo "For full workspace intelligence: cat $WORKSPACE_JSON | jq ."
