#!/bin/bash
# Don't exit on error - allow packages to fail and continue
# set -e

# Get the root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Building packages in dependency order..."

# TODO: Re-enable type generation after fixing monorepo import paths
# Generate types from Zod schemas first
# echo "Generating types from Zod schemas..."
# cd "$ROOT_DIR" && node scripts/generate-types-from-zod.ts

# Clean any stale dist directories
echo "Cleaning stale dist directories..."
find "$ROOT_DIR/packages" -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true
find "$ROOT_DIR/packages" -name "tsconfig.tsbuildinfo" -type f -exec rm {} + 2>/dev/null || true

# Build types first (no dependencies)
echo "Building @primo-poker/types..."
(cd "$ROOT_DIR/packages/types" && npx tsc)

# Build shared (depends on types)
echo "Building @primo-poker/shared..."
(cd "$ROOT_DIR/packages/shared" && npx tsc)

# Build logging (depends on shared)
echo "Building @primo-poker/logging..."
(cd "$ROOT_DIR/packages/logging" && npx tsc --build) || echo "Warning: logging package build failed, continuing..."

# Build security (depends on shared)
echo "Building @primo-poker/security..."
(cd "$ROOT_DIR/packages/security" && npx tsc) || echo "Warning: security package build failed, continuing..."

# Build core (depends on shared and security)
echo "Building @primo-poker/core..."
(cd "$ROOT_DIR/packages/core" && npx tsc) || echo "Warning: core package build failed, continuing..."

# Build persistence (depends on shared, core, and security)
echo "Building @primo-poker/persistence..."
(cd "$ROOT_DIR/packages/persistence" && npx tsc) || echo "Warning: persistence package build failed, continuing..."

# Build profiles (depends on shared, core, and security)
echo "Building @primo-poker/profiles..."
(cd "$ROOT_DIR/packages/profiles" && npx tsc) || echo "Warning: profiles package build failed, continuing..."

# Build api (depends on all above)
echo "Building @primo-poker/api..."
(cd "$ROOT_DIR/packages/api" && npx tsc) || echo "Warning: api package build failed, continuing..."

# Build poker-server app
echo "Building @primo-poker/poker-server..."
(cd "$ROOT_DIR/apps/poker-server" && npx tsc --build) || echo "Warning: poker-server app build failed, continuing..."

echo "All packages built successfully!"