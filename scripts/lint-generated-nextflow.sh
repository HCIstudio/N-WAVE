#!/usr/bin/env bash
# Lint the Nextflow N-WAVE generates: each built-in example and a set of node
# combinations (frontend/scripts/lint/fixtures.ts) is exported as a project,
# with the script and config a run of it uses next to it, and checked with
# `nextflow lint`. Fails when any file has errors (warnings are listed).
#
#   scripts/lint-generated-nextflow.sh [out-dir]
#
# Uses the nextflow/nextflow image (NEXTFLOW_LINT_IMAGE) when Docker is
# available, else `nextflow` on PATH. nf-core files come from GitHub, or from
# a local nf-core/modules checkout at the catalog's commit (NFCORE_MODULES_DIR).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mkdir -p "${1:-$ROOT/.lint-nextflow}" && cd "${1:-$ROOT/.lint-nextflow}" && pwd)"
IMAGE="${NEXTFLOW_LINT_IMAGE:-nextflow/nextflow:25.10.4}"

(cd "$ROOT/frontend" && npx vite-node scripts/lint/buildProjects.ts -- "$OUT")
(cd "$ROOT/backend" && npx ts-node --transpile-only scripts/writeRunFiles.ts "$OUT")

cd "$OUT"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "Linting with $IMAGE"
  docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$OUT:/w" -w /w "$IMAGE" \
    sh -c 'nextflow lint -o concise */project'
else
  echo "Linting with $(command -v nextflow) (Docker isn't available)"
  nextflow lint -o concise */project
fi
