#!/usr/bin/env bash
# Ensure the cesium symlink exists in client/node_modules.
# Cesium hoists to the root node_modules but vite-plugin-cesium expects it
# under client/node_modules/cesium.

set -e

LINK="client/node_modules/cesium"
TARGET="../../node_modules/cesium"

if [ -L "$LINK" ] || [ -e "$LINK" ]; then
  exit 0
fi

mkdir -p client/node_modules
ln -s "$TARGET" "$LINK"
echo "Created symlink: $LINK -> $TARGET"
