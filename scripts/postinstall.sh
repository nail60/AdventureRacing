#!/usr/bin/env bash
# Post-install setup:
# 1. Symlink cesium into client/node_modules (vite-plugin-cesium expects it there)
# 2. In worktrees, symlink .env files from the main working tree

set -e

# --- Cesium symlink ---
LINK="client/node_modules/cesium"
TARGET="../../node_modules/cesium"

if [ ! -L "$LINK" ] && [ ! -e "$LINK" ]; then
  mkdir -p client/node_modules
  ln -s "$TARGET" "$LINK"
  echo "Created symlink: $LINK -> $TARGET"
fi

# --- .env symlinks for worktrees (skip if not in a git repo, e.g. Docker build) ---
MAIN_TREE=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null | sed 's|/\.git$||') || true
THIS_TREE=$(git rev-parse --show-toplevel 2>/dev/null) || true

if [ -n "$MAIN_TREE" ] && [ -n "$THIS_TREE" ] && [ "$MAIN_TREE" != "$THIS_TREE" ]; then
  # We're in a worktree — symlink .env files from main tree
  for ENV_FILE in .env client/.env; do
    SRC="$MAIN_TREE/$ENV_FILE"
    DEST="$THIS_TREE/$ENV_FILE"
    if [ -f "$SRC" ] && [ ! -L "$DEST" ] && [ ! -e "$DEST" ]; then
      mkdir -p "$(dirname "$DEST")"
      ln -s "$SRC" "$DEST"
      echo "Symlinked $DEST -> $SRC"
    fi
  done
fi
