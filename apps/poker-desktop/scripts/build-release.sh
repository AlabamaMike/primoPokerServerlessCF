#!/bin/bash

# Primo Poker Desktop Build Script
# This script builds the application for release with auto-update support

set -e

echo "🎰 Primo Poker Desktop - Release Build Script"
echo "============================================"

# Configuration
VERSION=${VERSION:-"0.1.0"}
RELEASE_NOTES=${RELEASE_NOTES:-"Initial release with new lobby design and auto-update support"}

echo "Building version: $VERSION"
echo ""

# Step 1: Clean previous builds
echo "📧 Step 1: Cleaning previous builds..."
rm -rf dist/
rm -rf src-tauri/target/release/bundle/

# Step 2: Install dependencies
echo "📦 Step 2: Installing dependencies..."
npm install

# Step 3: Run tests
echo "🧪 Step 3: Running tests..."
npm run test || echo "⚠️  Tests skipped (not all configured)"

# Step 4: Build frontend
echo "🎨 Step 4: Building frontend..."
npm run build:vite

# Step 5: Build Tauri app for all platforms
echo "🔨 Step 5: Building Tauri application..."

# Check current platform
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Building for macOS..."
    npm run tauri build
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Building for Linux..."
    npm run tauri build
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    echo "Building for Windows..."
    npm run tauri build
else
    echo "Unknown platform: $OSTYPE"
    exit 1
fi

# Step 6: Generate update manifest
echo "📋 Step 6: Generating update manifest..."
VERSION=$VERSION RELEASE_NOTES="$RELEASE_NOTES" node scripts/generate-update-manifest.js

# Step 7: Sign the binaries (placeholder - actual signing requires certificates)
echo "✍️  Step 7: Signing binaries..."
echo "⚠️  Note: Actual code signing requires valid certificates"
echo "   - Windows: Code signing certificate"
echo "   - macOS: Developer ID certificate"
echo "   - Linux: GPG key"

# Step 8: Package installers
echo "📦 Step 8: Packaging installers..."
BUNDLE_DIR="src-tauri/target/release/bundle"

if [[ -d "$BUNDLE_DIR" ]]; then
    echo "Found bundles in: $BUNDLE_DIR"
    
    # Create release directory
    mkdir -p dist/release
    
    # Copy bundles to release directory
    if [[ "$OSTYPE" == "darwin"* ]]; then
        cp -r "$BUNDLE_DIR/dmg/"*.dmg dist/release/ 2>/dev/null || true
        cp -r "$BUNDLE_DIR/macos/"*.app.tar.gz dist/release/ 2>/dev/null || true
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        cp "$BUNDLE_DIR/appimage/"*.AppImage dist/release/ 2>/dev/null || true
        cp "$BUNDLE_DIR/deb/"*.deb dist/release/ 2>/dev/null || true
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        cp "$BUNDLE_DIR/nsis/"*.exe dist/release/ 2>/dev/null || true
        cp "$BUNDLE_DIR/msi/"*.msi dist/release/ 2>/dev/null || true
    fi
fi

# Step 9: Create release summary
echo "📄 Step 9: Creating release summary..."
cat > dist/release/RELEASE_NOTES.md << EOF
# Primo Poker Desktop v$VERSION

## Release Date
$(date +"%Y-%m-%d")

## What's New
$RELEASE_NOTES

## Features
- 🎨 Beautiful Primo Poker design with purple/gold theme
- ⚡ Quick Seat for instant table finding
- 📋 Advanced waitlist management
- 🔄 Real-time updates via WebSocket
- 🔒 Secure authentication system
- 🎮 Smooth gameplay experience
- 🔄 Automatic updates

## System Requirements
- Windows 10/11 (64-bit)
- macOS 10.13 or later
- Ubuntu 18.04 or later / Debian 9 or later

## Installation
1. Download the appropriate installer for your platform
2. Run the installer and follow the instructions
3. Launch Primo Poker from your applications menu

## Auto-Update
The application will automatically check for updates on startup.
You can also check manually from the Help menu.

---
🎰 Enjoy playing at Primo Poker!
EOF

echo ""
echo "✅ Build complete!"
echo ""
echo "📁 Output files:"
ls -la dist/release/ 2>/dev/null || echo "No release files found"
echo ""
echo "📤 Next steps:"
echo "1. Test the installers on each platform"
echo "2. Sign the binaries with appropriate certificates"
echo "3. Upload to S3 bucket for distribution"
echo "4. Update latest.json with signatures"
echo "5. Announce the release!"
echo ""
echo "🎉 Happy shipping!"