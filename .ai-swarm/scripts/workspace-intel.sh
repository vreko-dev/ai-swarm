#!/usr/bin/env bash
# Reads workspace.json and emits conductor-relevant intelligence
# Called at conductor session start, step 3

set -euo pipefail

# Find workspace.json — check common locations
WORKSPACE_JSON=""
for path in ".ai-swarm/workspace.json" "agents.workspace.json" ".agents/agents.workspace.json"; do
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

echo "=== WORKSPACE INTELLIGENCE ==="
echo "Source: $WORKSPACE_JSON"
echo "Generated: $(jq -r '.generatedAt // "unknown"' "$WORKSPACE_JSON")"
echo ""

# Health
echo "+-HEALTH ---------------------------------------------------+"
jq -r '.health | to_entries[] | "  \(.key): \(.value)"' "$WORKSPACE_JSON" 2>/dev/null \
  || echo "  health field not present"
echo "+----------------------------------------------------------+"
echo ""

# Top fragile files (highest blast radius -- spec work here needs extra audit)
echo "+-TOP FRAGILE FILES (pre-dispatch audit required) ---------+"
FRAGILE_COUNT=$(jq -r '
  .files // {} | to_entries
  | map(select(.value.fragility != null))
  | length
' "$WORKSPACE_JSON" 2>/dev/null || echo "0")

if [ "$FRAGILE_COUNT" -gt 0 ]; then
  jq -r '
    .files // {} | to_entries
    | map(select(.value.fragility != null))
    | sort_by(-.value.fragility)
    | .[0:10]
    | .[]
    | "  [\(.value.fragility)] \(.key)"
  ' "$WORKSPACE_JSON" 2>/dev/null
else
  echo "  fragility data not present in current schema"
fi
echo "+----------------------------------------------------------+"
echo ""

# Co-change clusters (files that move together -- collision surface)
echo "+-CO-CHANGE CLUSTERS (collision surface) ------------------+"
CLUSTER_COUNT=$(jq -r '.coChangeClusters // [] | length' "$WORKSPACE_JSON" 2>/dev/null || echo "0")

if [ "$CLUSTER_COUNT" -gt 0 ]; then
  jq -r '
    .coChangeClusters // [] | .[0:5] | .[]
    | "  Cluster:\n    " + (. | join("\n    "))
  ' "$WORKSPACE_JSON" 2>/dev/null
else
  echo "  coChangeClusters: none recorded yet"
fi
echo "+----------------------------------------------------------+"
echo ""

# Risk summary
echo "+-CURRENT RISK STATE --------------------------------------+"
AGENT_COUNT=$(jq -r '.agents // {} | length' "$WORKSPACE_JSON" 2>/dev/null || echo "0")

if [ "$AGENT_COUNT" -gt 0 ]; then
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

echo "For full workspace intelligence: cat $WORKSPACE_JSON | python3 -m json.tool"
