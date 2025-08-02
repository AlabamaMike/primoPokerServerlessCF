#!/bin/bash
set -e

# Get the root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Building packages in dependency order..."

# Build shared first
echo "Building @primo-poker/shared..."
(cd "$ROOT_DIR/packages/shared" && npx tsc --build)

# Build security (depends on shared)
echo "Building @primo-poker/security..."
(cd "$ROOT_DIR/packages/security" && npx tsc --build)

# Build core (depends on shared and security)
echo "Building @primo-poker/core..."
(cd "$ROOT_DIR/packages/core" && npx tsc --build)

# Build persistence (depends on shared, core, and security)
echo "Building @primo-poker/persistence..."
(cd "$ROOT_DIR/packages/persistence" && npx tsc --build)

# Build api (depends on all above)
echo "Building @primo-poker/api..."
(cd "$ROOT_DIR/packages/api" && npx tsc --build)

# Build poker-server app
echo "Building @primo-poker/poker-server..."
(cd "$ROOT_DIR/apps/poker-server" && npx tsc --build)

echo "All packages built successfully!"