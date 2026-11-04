#!/usr/bin/env bash
# Record the browser demo's analyses: its built-in examples analysed with
# nextflow lint and BioFlow-Insight (the analysis image), written to
# frontend/src/demo/analysisResults.json. CI runs this and fails when the file
# changes: run it after changing the examples or the code N-WAVE generates.
#
#   scripts/record-demo-analysis.sh
#
# BIOFLOW_IMAGE names the analysis image (default nwave-bioflow:dev).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

(cd "$ROOT/frontend" && npx vite-node scripts/analysis/demoScripts.ts -- "$WORK/scripts.json")
(cd "$ROOT/backend" && NWAVE_DATA_DIR="$WORK/data" NWAVE_BIOFLOW_IMAGE="${BIOFLOW_IMAGE:-nwave-bioflow:dev}" \
  npx tsx scripts/analyseScripts.ts "$WORK/scripts.json" "$WORK/results.json")
(cd "$ROOT/frontend" && npx vite-node scripts/analysis/writeDemoResults.ts -- "$WORK/results.json")
echo "Wrote frontend/src/demo/analysisResults.json"
