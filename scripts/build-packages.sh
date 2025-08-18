#!/bin/bash
set -e

# Get the root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Building packages in dependency order..."

# Clean any stale dist directories
echo "Cleaning stale dist directories..."
find "$ROOT_DIR/packages" -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true
find "$ROOT_DIR/packages" -name "tsconfig.tsbuildinfo" -type f -exec rm {} + 2>/dev/null || true

# Build shared first
echo "Building @primo-poker/shared..."
(cd "$ROOT_DIR/packages/shared" && npx tsc)

# Build logging (depends on shared)
echo "Building @primo-poker/logging..."
(cd "$ROOT_DIR/packages/logging" && npx tsc --build)

# Build security (depends on shared)
echo "Building @primo-poker/security..."
(cd "$ROOT_DIR/packages/security" && npx tsc)

# Build core (depends on shared and security)
echo "Building @primo-poker/core..."
(cd "$ROOT_DIR/packages/core" && npx tsc)

# Build persistence (depends on shared, core, and security)
echo "Building @primo-poker/persistence..."
(cd "$ROOT_DIR/packages/persistence" && npx tsc)

# Build profiles (depends on shared, core, and security)
echo "Building @primo-poker/profiles..."
(cd "$ROOT_DIR/packages/profiles" && npx tsc)

# Build api (depends on all above)
echo "Building @primo-poker/api..."
(cd "$ROOT_DIR/packages/api" && npx tsc)

# Build poker-server app
echo "Building @primo-poker/poker-server..."
(cd "$ROOT_DIR/apps/poker-server" && npx tsc --build)

echo "All packages built successfully!"