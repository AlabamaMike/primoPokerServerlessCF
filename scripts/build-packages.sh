#!/bin/bash
set -e

# Get the root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Building packages in dependency order..."

# Build shared first
echo "Building @primo-poker/shared..."
(cd "$ROOT_DIR/packages/shared" && npm run build)

# Build security (depends on shared)
echo "Building @primo-poker/security..."
(cd "$ROOT_DIR/packages/security" && npm run build)

# Build core (depends on shared and security)
echo "Building @primo-poker/core..."
(cd "$ROOT_DIR/packages/core" && npm run build)

# Build persistence (depends on shared, core, and security)
echo "Building @primo-poker/persistence..."
(cd "$ROOT_DIR/packages/persistence" && npm run build)

# Build api (depends on all above)
echo "Building @primo-poker/api..."
(cd "$ROOT_DIR/packages/api" && npm run build)

# Build poker-server app
echo "Building @primo-poker/poker-server..."
(cd "$ROOT_DIR/apps/poker-server" && npm run build)

echo "All packages built successfully!"