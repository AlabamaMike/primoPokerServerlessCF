# Local Installer Testing Guide

## Prerequisites

1. **Install Rust and Tauri CLI**
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Tauri CLI
cargo install tauri-cli
```

2. **Platform-specific requirements**
   - **Windows**: Visual Studio 2022 with C++ build tools
   - **macOS**: Xcode Command Line Tools
   - **Linux**: `libwebkit2gtk-4.0-dev` and build essentials

## Step 1: Build the Installer

### Option A: Using npm scripts
```bash
cd apps/poker-desktop

# Install dependencies
npm install

# Build the installer for your current platform
npm run tauri build

# The installer will be in:
# src-tauri/target/release/bundle/
```

### Option B: Using the build script
```bash
cd apps/poker-desktop

# Make script executable
chmod +x scripts/build-release.sh

# Run build script
./scripts/build-release.sh
```

## Step 2: Locate the Installer

After building, find your installer in `src-tauri/target/release/bundle/`:

### Windows
```
bundle/
├── nsis/
│   └── Primo Poker_0.1.0_x64-setup.exe    # NSIS installer
└── msi/
    └── Primo Poker_0.1.0_x64_en-US.msi    # MSI installer
```

### macOS
```
bundle/
├── dmg/
│   └── Primo Poker_0.1.0_x64.dmg          # DMG installer
└── macos/
    └── Primo Poker.app                     # App bundle
```

### Linux
```
bundle/
├── appimage/
│   └── primo-poker_0.1.0_amd64.AppImage   # AppImage
└── deb/
    └── primo-poker_0.1.0_amd64.deb        # Debian package
```

## Step 3: Test the Installer

### Windows Testing
```bash
# Test NSIS installer
./src-tauri/target/release/bundle/nsis/Primo\ Poker_0.1.0_x64-setup.exe

# Or test MSI installer
msiexec /i "./src-tauri/target/release/bundle/msi/Primo Poker_0.1.0_x64_en-US.msi"
```

**What to test:**
- Installation process starts correctly
- License agreement displays
- Installation directory selection works
- Start menu shortcut created
- Desktop shortcut option works
- Application launches after install
- Uninstaller works properly

### macOS Testing
```bash
# Mount and test DMG
open "./src-tauri/target/release/bundle/dmg/Primo Poker_0.1.0_x64.dmg"

# Or test app bundle directly
open "./src-tauri/target/release/bundle/macos/Primo Poker.app"
```

**What to test:**
- DMG mounts correctly
- Drag to Applications works
- App launches from Applications folder
- Dock icon appears
- App asks for permissions if needed
- Uninstall by dragging to trash works

### Linux Testing
```bash
# Test AppImage
chmod +x "./src-tauri/target/release/bundle/appimage/primo-poker_0.1.0_amd64.AppImage"
./src-tauri/target/release/bundle/appimage/primo-poker_0.1.0_amd64.AppImage

# Test Debian package
sudo dpkg -i "./src-tauri/target/release/bundle/deb/primo-poker_0.1.0_amd64.deb"
```

**What to test:**
- AppImage runs without installation
- Debian package installs correctly
- Desktop entry created
- Application menu entry appears
- Uninstall with `sudo dpkg -r primo-poker`

## Step 4: Test Auto-Update Locally

### 1. Set up local update server
```bash
# Create update server directory
mkdir -p local-update-server
cd local-update-server

# Create a simple HTTP server
python3 -m http.server 8080
```

### 2. Create test update manifest
Create `local-update-server/latest.json`:
```json
{
  "version": "0.2.0",
  "notes": "Test update",
  "pub_date": "2025-01-05T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "",
      "url": "http://localhost:8080/Primo-Poker_0.2.0_x64-setup.nsis.zip"
    },
    "darwin-x86_64": {
      "signature": "",
      "url": "http://localhost:8080/Primo-Poker_0.2.0_x64.app.tar.gz"
    },
    "linux-x86_64": {
      "signature": "",
      "url": "http://localhost:8080/primo-poker_0.2.0_amd64.AppImage.tar.gz"
    }
  }
}
```

### 3. Update Tauri config for local testing
Temporarily modify `src-tauri/tauri.conf.json`:
```json
"updater": {
  "active": true,
  "endpoints": [
    "http://localhost:8080/latest.json"
  ],
  "dialog": true,
  "pubkey": ""
}
```

### 4. Build two versions
```bash
# Build version 0.1.0
npm run tauri build

# Install and run version 0.1.0

# Update version in package.json and tauri.conf.json to 0.2.0
# Build version 0.2.0
npm run tauri build

# Copy 0.2.0 installer to update server
cp src-tauri/target/release/bundle/[platform-specific-file] local-update-server/
```

### 5. Test update flow
1. Run version 0.1.0
2. The app should detect version 0.2.0 available
3. Click "Update Now" in the notification
4. Watch download progress
5. App should restart with version 0.2.0

## Troubleshooting

### Build Issues
```bash
# Clean build artifacts
rm -rf src-tauri/target
rm -rf dist

# Clear Rust cache
cargo clean

# Reinstall dependencies
npm install
```

### Common Problems

**"tauri: command not found"**
```bash
# Install globally
npm install -g @tauri-apps/cli

# Or use npx
npx tauri build
```

**"Failed to bundle project"**
- Check you have all platform tools installed
- On Windows: Install Visual Studio 2022
- On macOS: Install Xcode Command Line Tools
- On Linux: Install webkit2gtk

**"Code signing failed"**
- For local testing, code signing is optional
- Add to tauri.conf.json to skip:
```json
"bundle": {
  "macOS": {
    "signingIdentity": null
  }
}
```

## Quick Test Checklist

- [ ] Installer launches without errors
- [ ] Installation completes successfully
- [ ] Application starts after installation
- [ ] Window appears with correct size
- [ ] Login screen loads
- [ ] Can connect to backend
- [ ] Settings dialog opens
- [ ] Update check works (if testing updates)
- [ ] Uninstaller removes application

## Next Steps

After successful local testing:

1. **Test on different OS versions**
   - Windows 10 and 11
   - macOS 10.13+
   - Ubuntu 20.04+

2. **Test edge cases**
   - Install to different directories
   - Install without admin rights
   - Upgrade over existing installation
   - Network issues during update

3. **Performance testing**
   - Installation time
   - Application startup time
   - Memory usage
   - Update download speed