#!/usr/bin/env bash
# Cross-check N-WAVE's importer with BioFlow-Insight (backend/bioflow): every
# lint fixture (frontend/scripts/lint/fixtures.ts), exported as a project, and
# the hand-written projects of the analysis's contract tests are analysed with
# the analysis image, imported with N-WAVE's importer, and the connections
# between steps compared (frontend/scripts/bioflow/crossCheck.ts).
#
#   scripts/bioflow-cross-check.sh [out-dir]
#
# BIOFLOW_IMAGE names the image to use (default nwave-bioflow:dev, built with
# `docker build -t nwave-bioflow:dev backend/bioflow`). nf-core files come
# from GitHub, or from a local nf-core/modules checkout (NFCORE_MODULES_DIR).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mkdir -p "${1:-$ROOT/.bioflow-cross-check}" && cd "${1:-$ROOT/.bioflow-cross-check}" && pwd)"
IMAGE="${BIOFLOW_IMAGE:-nwave-bioflow:dev}"

(cd "$ROOT/frontend" && npx vite-node scripts/lint/buildProjects.ts -- "$OUT")

# Hand-written projects (not the one with an error on purpose).
for project in "$ROOT"/backend/bioflow/tests/projects/*/; do
  name="$(basename "$project")"
  [ "$name" = "broken" ] && continue
  rm -rf "$OUT/handwritten-$name"
  mkdir -p "$OUT/handwritten-$name"
  cp -r "$project" "$OUT/handwritten-$name/project"
done

for project in "$OUT"/*/project; do
  echo "Analysing $(basename "$(dirname "$project")")"
  docker run --rm --network none --read-only --tmpfs /tmp \
    --cap-drop ALL --security-opt no-new-privileges \
    -v "$project:/project:ro" "$IMAGE" /project > "$(dirname "$project")/bioflow.json"
done

(cd "$ROOT/frontend" && npx vite-node scripts/bioflow/crossCheck.ts -- "$OUT")
