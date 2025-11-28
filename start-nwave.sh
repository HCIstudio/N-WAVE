#!/usr/bin/env bash
set -euo pipefail

echo "=== N-WAVE local bootstrap (Unix) ==="
echo

check_command() {
  command -v "$1" >/dev/null 2>&1
}

SKIP_INSTALL=0
if [[ "${1-}" == "--skip-install" ]]; then
  SKIP_INSTALL=1
fi

ensure_node() {
  echo "Checking Node.js..."

  if ! check_command node; then
    echo "ERROR: Node.js is not installed. Please install Node.js v18+ from https://nodejs.org"
    read -p "Press Enter to exit..." || true
    exit 1
  fi

  ver_raw="$(node -v 2>/dev/null)"   # e.g. v18.19.0
  ver="${ver_raw#v}"                 # strip leading v
  major="${ver%%.*}"                 # text before first dot

  if [[ "$major" -lt 18 ]]; then
    echo "ERROR: Node.js v18+ required, found $ver_raw"
    read -p "Press Enter to exit..." || true
    exit 1
  fi

  echo "Node.js version $ver_raw OK."
}

ensure_pnpm() {
  echo
  echo "Checking pnpm..."

  if check_command pnpm; then
    echo "pnpm available."
    return
  fi

  echo "pnpm not found. Attempting to install globally using npm..."

  if ! check_command npm; then
    echo "ERROR: npm is not available, cannot install pnpm automatically."
    echo "Please install pnpm manually: https://pnpm.io/installation"
    read -p "Press Enter to exit..." || true
    exit 1
  fi

  if npm install -g pnpm; then
    echo "pnpm installed successfully."
  else
    echo "ERROR: Failed to install pnpm via npm."
    echo "Please install pnpm manually: https://pnpm.io/installation"
    read -p "Press Enter to exit..." || true
    exit 1
  fi
}

ensure_mongo() {
  echo
  echo "Checking MongoDB (port check on localhost:27017)..."

  # Prefer python3 for a short-timeout port check
  if check_command python3; then
    python3 - << 'EOF'
import socket, sys
s = socket.socket()
s.settimeout(2)
try:
    s.connect(("localhost", 27017))
except Exception:
    sys.exit(1)
else:
    s.close()
    sys.exit(0)
EOF
    rc=$?
  elif check_command nc; then
    # fallback: netcat if available
    nc -z localhost 27017 >/dev/null 2>&1
    rc=$?
  else
    # last resort: /dev/tcp, may block longer on some systems
    if bash -c '>/dev/tcp/localhost/27017' 2>/dev/null; then
      rc=0
    else
      rc=1
    fi
  fi

  if [[ $rc -ne 0 ]]; then
    echo "ERROR: No service is listening on localhost:27017. MongoDB does not seem to be running."
    echo "Make sure MongoDB Community Server is installed and its service is started."
    read -p "Press Enter to exit" || true
    exit 1
  fi

  echo "Port 27017 is open on localhost (assuming MongoDB is running)."
}

ensure_backend_env() {
  echo
  echo "Ensuring backend .env exists..."

  local backend_dir="backend"
  local env_file="${backend_dir}/.env"

  if [[ ! -d "$backend_dir" ]]; then
    echo "ERROR: Backend directory '$backend_dir' not found. Adjust paths in start-nwave.sh."
    read -p "Press Enter to exit..." || true
    exit 1
  fi

  if [[ ! -f "$env_file" ]]; then
    echo "Creating default backend .env at $env_file"
    printf 'MONGODB_URI=mongodb://localhost:27017/nwave\n' > "$env_file"
  else
    echo ".env already exists at $env_file (leaving it as-is)."
  fi
}


run_app() {
  local name="$1"
  local dir="$2"
  local install_cmd="$3"
  local start_cmd="$4"

  if [[ ! -d "$dir" ]]; then
    echo "ERROR: $name directory '$dir' not found. Adjust paths in start-nwave.sh."
    read -p "Press Enter to exit..." || true
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

  echo "Starting $name in background"
  (
    cd "$dir"
    eval "$start_cmd"
  ) &
}

ensure_node
ensure_pnpm
ensure_mongo
ensure_backend_env

FRONTEND_INSTALL="pnpm install"
BACKEND_INSTALL="pnpm install"

FRONTEND_START="pnpm dev"
BACKEND_START="pnpm dev"

run_app "Backend"  "backend"  "$BACKEND_INSTALL"  "$BACKEND_START"
run_app "Frontend" "frontend" "$FRONTEND_INSTALL" "$FRONTEND_START"

echo
echo "Both Backend and Frontend have been started in background."
echo "Press Ctrl+C to stop them (this will send SIGINT to both)."

wait
