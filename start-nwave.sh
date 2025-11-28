#!/usr/bin/env bash
set -euo pipefail

echo "=== N-WAVE local bootstrap (Unix) ==="
echo

# --- helpers -------------------------------------------------------------

check_command() {
  command -v "$1" >/dev/null 2>&1
}

# --- argument parsing ----------------------------------------------------

SKIP_INSTALL=0
if [[ "${1-}" == "--skip-install" ]]; then
  SKIP_INSTALL=1
fi

# --- checks --------------------------------------------------------------

ensure_node() {
  echo "Checking Node.js..."

  if ! check_command node; then
    echo "ERROR: Node.js is not installed. Please install Node.js v18+ from https://nodejs.org"
    exit 1
  fi

  ver_raw="$(node -v 2>/dev/null)"   # e.g. v18.19.0
  ver="${ver_raw#v}"                 # strip leading v
  major="${ver%%.*}"                 # text before first dot

  if [[ "$major" -lt 18 ]]; then
    echo "ERROR: Node.js v18+ required, found $ver_raw"
    exit 1
  fi

  echo "Node.js version $ver_raw OK."
}

ensure_npm_or_pnpm() {
  echo
  echo "Checking npm / pnpm..."

  local has_npm=0
  local has_pnpm=0

  if check_command npm;  then has_npm=1;  fi
  if check_command pnpm; then has_pnpm=1; fi

  if [[ $has_npm -eq 0 && $has_pnpm -eq 0 ]]; then
    echo "ERROR: Neither npm nor pnpm is installed."
    echo "Install Node.js (which includes npm), or install pnpm manually."
    exit 1
  fi

  if [[ $has_pnpm -eq 1 ]]; then
    echo "pnpm available."
  fi

  if [[ $has_pnpm -eq 0 && $has_npm -eq 1 ]]; then
    echo "pnpm not found. (Optional) You can later run: npm install -g pnpm"
    echo "Using npm for installs."
  fi
}

ensure_mongo() {
  echo
  echo "Checking MongoDB..."

  local has_mongosh=0
  local has_mongo=0

  if check_command mongosh; then has_mongosh=1; fi
  if check_command mongo;   then has_mongo=1;   fi

  if [[ $has_mongosh -eq 0 && $has_mongo -eq 0 ]]; then
    echo "WARNING: MongoDB client (mongosh/mongo) not found in PATH."
    echo "Make sure MongoDB server is installed and running on localhost:27017."
    echo "Download: https://www.mongodb.com/try/download/community"
    return
  fi

  # simple ping test
  local ok=0
  if [[ $has_mongosh -eq 1 ]]; then
    if mongosh "mongodb://localhost:27017/admin" --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; then
      ok=1
    fi
  else
    if mongo "mongodb://localhost:27017/admin" --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; then
      ok=1
    fi
  fi

  if [[ $ok -eq 1 ]]; then
    echo "MongoDB connection OK (localhost:27017)."
  else
    echo "WARNING: Could not connect to MongoDB on localhost:27017."
    echo "Make sure MongoDB is installed, configured, and running."
  fi
}

# --- app runner ----------------------------------------------------------

run_app() {
  local name="$1"
  local dir="$2"
  local install_cmd="$3"
  local start_cmd="$4"

  if [[ ! -d "$dir" ]]; then
    echo "ERROR: $name directory '$dir' not found. Adjust paths in start-nwave.sh."
    exit 1
  fi

  echo
  echo "=== $name ==="

  if [[ $SKIP_INSTALL -eq 0 ]]; then
    echo "Installing dependencies for $name..."
    (
      cd "$dir"
      eval "$install_cmd"
    )
  else
    echo "Skipping dependency installation for $name (--skip-install set)."
  fi

  echo "Starting $name in background..."
  (
    cd "$dir"
    eval "$start_cmd"
  ) &
}

# --- main ---------------------------------------------------------------

ensure_node
ensure_npm_or_pnpm
ensure_mongo

# Choose package manager
if check_command pnpm; then
  FRONTEND_INSTALL="pnpm install"
  BACKEND_INSTALL="pnpm install"
else
  FRONTEND_INSTALL="npm install"
  BACKEND_INSTALL="npm install"
fi

# Adjust these if your scripts are different
FRONTEND_START="npm run dev"
BACKEND_START="npm run dev"

# Adjust directories if needed
run_app "Backend"  "backend"  "$BACKEND_INSTALL"  "$BACKEND_START"
run_app "Frontend" "frontend" "$FRONTEND_INSTALL" "$FRONTEND_START"

echo
echo "Both Backend and Frontend have been started in background."
echo "Press Ctrl+C to stop them (this will send SIGINT to both)."

wait
