#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for the atomic-monorepo workspace.
#
# Runs after the repository is checked out. It provisions the toolchain the repo
# declares (Node >= 22.19, Bun 1.3.14, uv, Rust via rustup), installs workspace
# dependencies from the committed lockfile, and builds the native N-API module
# so the test suites (which import it statically) and the CLI's PTY/search paths
# work. Safe to re-run: every step no-ops when its result is already present.
set -euo pipefail

NODE_VERSION="22.19.0"
BUN_VERSION="1.3.14"

log() { printf '\n=== %s ===\n' "$*"; }

ensure_path() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$HOME/.local/bin:$PATH"
  if [ -s "$NVM_DIR/versions/node/v$NODE_VERSION/bin/node" ]; then
    export PATH="$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH"
  fi
}

log "Ensuring Node $NODE_VERSION (nvm)"
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
if [ ! -s "$NVM_DIR/versions/node/v$NODE_VERSION/bin/node" ]; then
  nvm install "$NODE_VERSION"
fi
nvm alias default "$NODE_VERSION" >/dev/null

log "Ensuring Bun $BUN_VERSION"
if [ ! -x "$HOME/.bun/bin/bun" ]; then
  curl -fsSL https://bun.sh/install | bash -s "bun-v$BUN_VERSION"
fi

log "Ensuring uv"
if [ ! -x "$HOME/.local/bin/uv" ]; then
  curl -fsSL https://astral.sh/uv/install.sh | sh
fi

ensure_path

log "Persisting toolchain on PATH for future shells"
# The official nvm/bun installers append their own blocks; add a single guarded
# block so uv is on PATH and Node $NODE_VERSION wins over any platform-provided
# node, on every boot regardless of whether we booted from a snapshot.
MARKER="# >>> atomic cloud-agent toolchain >>>"
if ! grep -qF "$MARKER" "$HOME/.bashrc" 2>/dev/null; then
  {
    echo ""
    echo "$MARKER"
    echo 'export NVM_DIR="$HOME/.nvm"'
    echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"'
    echo 'export BUN_INSTALL="$HOME/.bun"'
    echo 'export PATH="$HOME/.local/bin:$BUN_INSTALL/bin:$PATH"'
    echo "if [ -s \"\$NVM_DIR/versions/node/v$NODE_VERSION/bin/node\" ]; then export PATH=\"\$NVM_DIR/versions/node/v$NODE_VERSION/bin:\$PATH\"; fi"
    echo "# <<< atomic cloud-agent toolchain <<<"
  } >> "$HOME/.bashrc"
fi

log "Toolchain versions"
node --version
npm --version
bun --version
uv --version
cargo --version || echo "WARNING: cargo not found (Rust toolchain required for the native module)"

log "Installing workspace dependencies (npm ci --ignore-scripts)"
npm ci --ignore-scripts

log "Building native N-API module (@bastani/atomic-natives)"
npm run build --workspace=@bastani/atomic-natives

log "Bootstrap complete"
