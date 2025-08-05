#!/bin/bash

# Quick Local Installer Test Script
# This script helps you test the installer build process locally

echo "🎰 Primo Poker - Local Installer Test"
echo "===================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the poker-desktop directory"
    exit 1
fi

# Function to check prerequisites
check_prerequisites() {
    echo "📋 Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js is not installed"
        return 1
    else
        echo "✅ Node.js: $(node --version)"
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        echo "❌ npm is not installed"
        return 1
    else
        echo "✅ npm: $(npm --version)"
    fi
    
    # Check Rust
    if ! command -v cargo &> /dev/null; then
        echo "❌ Rust is not installed"
        echo "   Install from: https://rustup.rs/"
        return 1
    else
        echo "✅ Rust: $(cargo --version)"
    fi
    
    # Check Tauri CLI
    if ! command -v tauri &> /dev/null; then
        echo "⚠️  Tauri CLI not found globally, will use npx"
    else
        echo "✅ Tauri CLI: $(tauri --version)"
    fi
    
    return 0
}

# Function to build installer
build_installer() {
    echo ""
    echo "🔨 Building installer..."
    echo ""
    
    # Install dependencies
    echo "📦 Installing dependencies..."
    npm install || { echo "❌ Failed to install dependencies"; exit 1; }
    
    # Build the application
    echo ""
    echo "🏗️  Building application..."
    if command -v tauri &> /dev/null; then
        npm run tauri build
    else
        npx tauri build
    fi
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Build completed successfully!"
        return 0
    else
        echo ""
        echo "❌ Build failed"
        return 1
    fi
}

# Function to locate installers
find_installers() {
    echo ""
    echo "📁 Looking for installers..."
    echo ""
    
    BUNDLE_DIR="src-tauri/target/release/bundle"
    
    if [ ! -d "$BUNDLE_DIR" ]; then
        echo "❌ Bundle directory not found: $BUNDLE_DIR"
        return 1
    fi
    
    echo "Found installers in: $BUNDLE_DIR"
    echo ""
    
    # List all installers
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "🍎 macOS Installers:"
        find "$BUNDLE_DIR" -name "*.dmg" -o -name "*.app" | while read -r file; do
            echo "   - $file"
        done
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "🐧 Linux Installers:"
        find "$BUNDLE_DIR" -name "*.AppImage" -o -name "*.deb" | while read -r file; do
            echo "   - $file"
        done
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
        echo "🪟 Windows Installers:"
        find "$BUNDLE_DIR" -name "*.exe" -o -name "*.msi" | while read -r file; do
            echo "   - $file"
        done
    fi
    
    return 0
}

# Function to test installer
test_installer() {
    echo ""
    echo "🧪 Testing installer..."
    echo ""
    
    BUNDLE_DIR="src-tauri/target/release/bundle"
    
    # Platform-specific testing
    if [[ "$OSTYPE" == "darwin"* ]]; then
        DMG_FILE=$(find "$BUNDLE_DIR/dmg" -name "*.dmg" | head -n 1)
        if [ -f "$DMG_FILE" ]; then
            echo "To test the macOS installer:"
            echo "  open \"$DMG_FILE\""
            echo ""
            echo "Then drag Primo Poker to Applications"
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        APPIMAGE_FILE=$(find "$BUNDLE_DIR/appimage" -name "*.AppImage" | head -n 1)
        if [ -f "$APPIMAGE_FILE" ]; then
            echo "To test the Linux AppImage:"
            echo "  chmod +x \"$APPIMAGE_FILE\""
            echo "  \"$APPIMAGE_FILE\""
        fi
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
        EXE_FILE=$(find "$BUNDLE_DIR/nsis" -name "*.exe" | head -n 1)
        if [ -f "$EXE_FILE" ]; then
            echo "To test the Windows installer:"
            echo "  \"$EXE_FILE\""
        fi
    fi
}

# Main menu
show_menu() {
    echo ""
    echo "What would you like to do?"
    echo "1) Check prerequisites"
    echo "2) Build installer (full process)"
    echo "3) Find existing installers"
    echo "4) Clean build artifacts"
    echo "5) Exit"
    echo ""
    read -p "Select option (1-5): " choice
    
    case $choice in
        1)
            check_prerequisites
            ;;
        2)
            if check_prerequisites; then
                build_installer
                if [ $? -eq 0 ]; then
                    find_installers
                    test_installer
                fi
            fi
            ;;
        3)
            find_installers
            test_installer
            ;;
        4)
            echo "🧹 Cleaning build artifacts..."
            rm -rf src-tauri/target
            rm -rf dist
            echo "✅ Cleaned"
            ;;
        5)
            echo "👋 Goodbye!"
            exit 0
            ;;
        *)
            echo "❌ Invalid option"
            ;;
    esac
}

# Run in loop
while true; do
    show_menu
    echo ""
    read -p "Press Enter to continue..."
done