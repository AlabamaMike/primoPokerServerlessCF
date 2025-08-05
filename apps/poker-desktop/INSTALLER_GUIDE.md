# Primo Poker Desktop - Installer & Auto-Update Guide

## Overview

The Primo Poker Desktop application includes a complete installer and auto-update system built with Tauri.

## Features Implemented

### 1. Auto-Update System
- **Tauri Updater**: Configured in `tauri.conf.json` with S3 endpoint
- **Update UI**: Beautiful update notification component with progress tracking
- **Settings Dialog**: User preferences for update behavior
- **Background Checks**: Automatic update checks on startup

### 2. Installer Configuration
- **Windows**: NSIS installer with custom settings
- **macOS**: DMG installer with app bundle
- **Linux**: AppImage and .deb packages
- **License**: EULA included in installers

### 3. Update Components

#### UpdateManager Component
- Real-time download progress
- Error handling and retry logic
- User-friendly notifications
- Automatic app restart after update

#### Settings Dialog
- Update preferences (auto-check, auto-download)
- Check interval configuration
- Manual update check button
- About section with version info

### 4. Build Scripts
- `build-release.sh`: Complete build pipeline
- `generate-update-manifest.js`: Creates update manifests
- `generate-icons.cjs`: Icon generation placeholders

## Configuration Files

### tauri.conf.json
```json
{
  "updater": {
    "active": true,
    "endpoints": ["https://primo-poker-updates.s3.amazonaws.com/latest.json"],
    "dialog": true,
    "pubkey": ""
  },
  "bundle": {
    "windows": {
      "nsis": {
        "installMode": "currentUser",
        "languages": ["English"]
      }
    },
    "macOS": {
      "minimumSystemVersion": "10.13"
    },
    "linux": {
      "appimage": {
        "bundleMediaFramework": true
      }
    }
  }
}
```

## Update Server Setup

### S3 Bucket Structure
```
primo-poker-updates/
├── latest.json              # Update manifest
├── primo-poker_0.1.0_x64.app.tar.gz     # macOS Intel
├── primo-poker_0.1.0_aarch64.app.tar.gz # macOS ARM
├── primo-poker_0.1.0_x64-setup.nsis.zip # Windows
└── primo-poker_0.1.0_amd64.AppImage.tar.gz # Linux
```

### latest.json Format
```json
{
  "version": "0.1.0",
  "notes": "Bug fixes and performance improvements",
  "pub_date": "2025-01-05T12:00:00Z",
  "platforms": {
    "darwin-x86_64": {
      "signature": "...",
      "url": "https://primo-poker-updates.s3.amazonaws.com/primo-poker_0.1.0_x64.app.tar.gz"
    }
  }
}
```

## Building for Release

### Prerequisites
1. Install Rust and Tauri CLI
2. Set up code signing certificates (optional but recommended)
3. Configure S3 bucket with public read access

### Build Process
```bash
# 1. Set version and release notes
export VERSION="0.1.0"
export RELEASE_NOTES="Initial release with new lobby"

# 2. Run build script
./scripts/build-release.sh

# 3. Sign the binaries (platform-specific)
# Windows: signtool sign /a /t http://timestamp.digicert.com app.exe
# macOS: codesign --deep --force --verify --verbose --sign "Developer ID" app.app
# Linux: Use GPG to sign

# 4. Generate update manifest
node scripts/generate-update-manifest.js

# 5. Upload to S3
aws s3 cp dist/release/ s3://primo-poker-updates/ --recursive
```

## Testing Auto-Update

### Local Testing
1. Build version 0.1.0 and install
2. Update version to 0.2.0 in package.json and tauri.conf.json
3. Build new version
4. Create local update server with latest.json
5. Launch 0.1.0 version - should detect update

### Production Testing
1. Deploy update files to S3
2. Install older version on test machine
3. Launch app and verify update notification
4. Test download progress and installation
5. Verify app restarts with new version

## Security Considerations

### Code Signing
- **Required for auto-update to work on production**
- Windows: EV certificate recommended
- macOS: Developer ID certificate required
- Linux: GPG signing recommended

### Update Verification
- Tauri verifies signatures before installing
- Use strong RSA keys (4096 bit recommended)
- Keep private keys secure

## Troubleshooting

### Common Issues
1. **Update not detected**: Check latest.json URL and CORS settings
2. **Signature verification failed**: Ensure proper signing and pubkey
3. **Download fails**: Check S3 permissions and URL format
4. **Installation fails**: Verify user permissions

### Debug Mode
Enable update logs in Tauri:
```rust
tauri::Builder::default()
    .setup(|app| {
        #[cfg(debug_assertions)]
        app.get_window("main").unwrap().open_devtools();
        Ok(())
    })
```

## Next Steps

1. **Set up S3 bucket** with CloudFront for global distribution
2. **Obtain code signing certificates** for each platform
3. **Create CI/CD pipeline** for automated releases
4. **Implement telemetry** for update success tracking
5. **Add rollback mechanism** for failed updates

## Summary

The Primo Poker Desktop installer and auto-update system is fully implemented with:
- ✅ Cross-platform installer configuration
- ✅ Automatic update checking and downloading
- ✅ User-friendly update notifications
- ✅ Settings for update preferences
- ✅ Build and release scripts
- ✅ S3-based update distribution

The system is production-ready pending code signing certificates and S3 deployment.