#!/bin/bash

# Development Build Test (No Rust Required)
# This simulates what the installer would look like

echo "🎰 Primo Poker - Development Build Test"
echo "======================================="
echo ""
echo "This script simulates the installer process without requiring Rust/Tauri"
echo ""

# Create mock installer structure
create_mock_installer() {
    echo "📦 Creating mock installer structure..."
    
    # Create directories
    mkdir -p mock-installer/windows
    mkdir -p mock-installer/macos
    mkdir -p mock-installer/linux
    
    # Create mock installer info files
    cat > mock-installer/windows/installer-info.txt << EOF
=================================
Primo Poker Desktop Installer
Version: 0.1.0
Platform: Windows x64
=================================

Installation Steps:
1. Welcome Screen
   - Shows Primo Poker logo
   - Version 0.1.0

2. License Agreement (EULA)
   - User must accept to continue

3. Installation Directory
   - Default: C:\Program Files\Primo Poker
   - User can change location

4. Start Menu Options
   - Create start menu shortcut
   - Create desktop shortcut

5. Installation Progress
   - Copying files...
   - Creating shortcuts...
   - Registering uninstaller...

6. Completion
   - Launch Primo Poker checkbox
   - Finish button

Installed Files:
- Primo Poker.exe (main executable)
- app.asar (application resources)
- WebView2Loader.dll (web renderer)
- resources/ (assets)
- uninstall.exe

Total Size: ~85 MB
EOF

    cat > mock-installer/macos/installer-info.txt << EOF
=================================
Primo Poker Desktop Installer
Version: 0.1.0
Platform: macOS Universal
=================================

DMG Contents:
- Primo Poker.app
- Applications shortcut
- README.txt

Installation:
1. Mount DMG
2. Drag Primo Poker to Applications
3. Eject DMG
4. Launch from Applications

App Bundle Structure:
Primo Poker.app/
├── Contents/
│   ├── Info.plist
│   ├── MacOS/
│   │   └── primo-poker (executable)
│   ├── Resources/
│   │   ├── icon.icns
│   │   └── assets/
│   └── Frameworks/
│       └── WebKit.framework/

Total Size: ~95 MB
EOF

    cat > mock-installer/linux/installer-info.txt << EOF
=================================
Primo Poker Desktop Installer
Version: 0.1.0
Platform: Linux x64
=================================

Available Formats:

1. AppImage (Recommended)
   - primo-poker_0.1.0_amd64.AppImage
   - No installation required
   - chmod +x and run
   - Size: ~90 MB

2. Debian Package
   - primo-poker_0.1.0_amd64.deb
   - Install: sudo dpkg -i primo-poker_0.1.0_amd64.deb
   - Creates menu entry
   - Size: ~85 MB

Desktop Entry:
[Desktop Entry]
Name=Primo Poker
Comment=Desktop poker client
Exec=/usr/bin/primo-poker
Icon=primo-poker
Type=Application
Categories=Games;
EOF

    echo "✅ Mock installer structure created"
}

# Test update manifest
create_update_manifest() {
    echo ""
    echo "📋 Creating update manifest..."
    
    mkdir -p mock-installer/updates
    
    cat > mock-installer/updates/latest.json << EOF
{
  "version": "0.2.0",
  "notes": "New Features:\n- Improved lobby performance\n- Fixed connection issues\n- Added new table themes",
  "pub_date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "platforms": {
    "windows-x86_64": {
      "signature": "mock-signature-windows",
      "url": "https://primo-poker-updates.s3.amazonaws.com/primo-poker_0.2.0_x64-setup.nsis.zip"
    },
    "darwin-x86_64": {
      "signature": "mock-signature-mac-intel",
      "url": "https://primo-poker-updates.s3.amazonaws.com/primo-poker_0.2.0_x64.app.tar.gz"
    },
    "darwin-aarch64": {
      "signature": "mock-signature-mac-arm",
      "url": "https://primo-poker-updates.s3.amazonaws.com/primo-poker_0.2.0_aarch64.app.tar.gz"
    },
    "linux-x86_64": {
      "signature": "mock-signature-linux",
      "url": "https://primo-poker-updates.s3.amazonaws.com/primo-poker_0.2.0_amd64.AppImage.tar.gz"
    }
  }
}
EOF

    echo "✅ Update manifest created"
}

# Simulate installer UI
simulate_installer_ui() {
    echo ""
    echo "🖼️  Simulating Installer UI Flow..."
    echo ""
    
    # Create HTML preview
    cat > mock-installer/installer-preview.html << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Primo Poker Installer Preview</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: #0F172A;
            color: white;
            padding: 20px;
            margin: 0;
        }
        .installer-window {
            max-width: 600px;
            margin: 0 auto;
            background: #1E293B;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .header {
            background: linear-gradient(135deg, #6B46C1 0%, #F59E0B 100%);
            padding: 30px;
            text-align: center;
        }
        .logo {
            width: 80px;
            height: 80px;
            background: #0F172A;
            border-radius: 16px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 48px;
            font-weight: bold;
            margin-bottom: 20px;
        }
        .content {
            padding: 30px;
        }
        .step {
            margin-bottom: 30px;
            padding: 20px;
            background: #0F172A;
            border-radius: 8px;
            border: 1px solid #334155;
        }
        .button {
            background: linear-gradient(135deg, #6B46C1 0%, #F59E0B 100%);
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            margin-right: 10px;
        }
        .progress {
            background: #334155;
            height: 8px;
            border-radius: 4px;
            margin: 20px 0;
            overflow: hidden;
        }
        .progress-bar {
            background: linear-gradient(90deg, #6B46C1 0%, #F59E0B 100%);
            height: 100%;
            width: 65%;
            transition: width 0.3s;
        }
    </style>
</head>
<body>
    <div class="installer-window">
        <div class="header">
            <div class="logo">P</div>
            <h1>Primo Poker Desktop</h1>
            <p>Version 0.1.0 Installer</p>
        </div>
        
        <div class="content">
            <div class="step">
                <h3>Step 1: Welcome</h3>
                <p>Welcome to the Primo Poker Desktop installer. This wizard will guide you through the installation process.</p>
            </div>
            
            <div class="step">
                <h3>Step 2: License Agreement</h3>
                <p>Please read and accept the End User License Agreement to continue.</p>
                <textarea readonly style="width: 100%; height: 100px; background: #1E293B; border: 1px solid #334155; color: #94A3B8; padding: 10px;">
PRIMO POKER END USER LICENSE AGREEMENT

By installing this software, you agree to the terms...
                </textarea>
            </div>
            
            <div class="step">
                <h3>Step 3: Installation Progress</h3>
                <p>Installing Primo Poker Desktop...</p>
                <div class="progress">
                    <div class="progress-bar"></div>
                </div>
                <p style="color: #94A3B8; font-size: 14px;">Copying files... 65%</p>
            </div>
            
            <div style="text-align: right; margin-top: 30px;">
                <button class="button" style="background: #475569;">Back</button>
                <button class="button">Next</button>
            </div>
        </div>
    </div>
    
    <div style="margin-top: 40px; text-align: center; color: #64748B;">
        <p>This is a preview of how the installer would look</p>
        <p>Actual installer will be native to each platform</p>
    </div>
</body>
</html>
EOF

    echo "✅ Installer UI preview created"
    echo "   View: mock-installer/installer-preview.html"
}

# Show summary
show_summary() {
    echo ""
    echo "📊 Installer Test Summary"
    echo "========================"
    echo ""
    echo "✅ Created mock installer structure for:"
    echo "   - Windows (NSIS)"
    echo "   - macOS (DMG)"
    echo "   - Linux (AppImage & DEB)"
    echo ""
    echo "✅ Generated update manifest"
    echo "   - Version 0.2.0 ready for testing"
    echo ""
    echo "✅ Created installer UI preview"
    echo ""
    echo "📁 Files created in: ./mock-installer/"
    echo ""
    echo "To view installer details:"
    echo "  - Windows: cat mock-installer/windows/installer-info.txt"
    echo "  - macOS:   cat mock-installer/macos/installer-info.txt"
    echo "  - Linux:   cat mock-installer/linux/installer-info.txt"
    echo ""
    echo "To test update flow:"
    echo "  - View: mock-installer/updates/latest.json"
    echo ""
    echo "To preview installer UI:"
    echo "  - Open: mock-installer/installer-preview.html"
}

# Main execution
create_mock_installer
create_update_manifest
simulate_installer_ui
show_summary

# Open preview if possible
if command -v xdg-open &> /dev/null; then
    echo ""
    read -p "Open installer preview in browser? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        xdg-open mock-installer/installer-preview.html
    fi
elif command -v open &> /dev/null; then
    echo ""
    read -p "Open installer preview in browser? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open mock-installer/installer-preview.html
    fi
fi