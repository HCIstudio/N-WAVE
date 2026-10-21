#!/usr/bin/env bash
# Copy the wiki pages in wiki/ into a checkout of the GitHub wiki, and point the pages they
# replaced to their successors, so old links keep working. The Wiki workflow
# (.github/workflows/wiki.yml) runs this after every merge that changes wiki/, then commits
# and pushes the checkout.
#
#   scripts/publish-wiki.sh <wiki-checkout>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:?usage: publish-wiki.sh <wiki-checkout>}"
WIKI="https://github.com/HCIstudio/N-WAVE/wiki"

for page in "$ROOT"/wiki/*.md; do
  [ "$(basename "$page")" = "README.md" ] && continue # about the folder, not a page
  cp "$page" "$TARGET/"
done

# Pages of the old wiki, and the pages that replace them.
moved() {
  local old="$1"
  shift
  {
    echo "This page has moved. See:"
    echo
    for page in "$@"; do echo "- [${page//-/ }]($WIKI/$page)"; done
  } >"$TARGET/$old.md"
}
moved "Dockerized-Installation" Installation
moved "Manual-Installation" Installation
moved "Shell‐supported-Installation" Installation
moved "Using-N‐WAVE" First-Workflow Building-Workflows Running-Workflows
moved "Workflow-Nodes" Nodes
moved "Using-Custom-Nodes" Custom-Nodes
moved "Using-The-nf‐core-Libary-(EXPERIMENTAL)" nf-core-Library
