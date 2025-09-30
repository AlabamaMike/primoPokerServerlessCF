# Installation Guide - Primo Poker Desktop Client

## System Requirements

### Minimum Requirements
- **OS**: Windows 10 (64-bit) or later
- **RAM**: 4 GB
- **Storage**: 200 MB free space
- **Internet**: Broadband connection (for real-time gameplay)

### Recommended
- **OS**: Windows 11 (64-bit)
- **RAM**: 8 GB or more
- **Storage**: 500 MB free space
- **Internet**: 10 Mbps or faster

---

## Installation Steps

### 1. Download the Installer

Visit the releases page: https://github.com/AlabamaMike/primoPokerServerlessCF/releases/latest

Download: `Primo-Poker_0.1.0_x64-setup.exe` (approximately 10-15 MB)

### 2. Handle Windows SmartScreen Warning

When running the installer, Windows may show a SmartScreen warning because this is an unsigned application.

**To proceed safely**:
1. Windows will show "Windows protected your PC"
2. Click **"More info"**
3. Click **"Run anyway"**

This warning appears because we have not purchased a code signing certificate ($200-400/year). The application is safe to run.

### 3. Run the Installer

1. Double-click `Primo-Poker_0.1.0_x64-setup.exe`
2. Follow the installation wizard
3. Choose installation directory (default: `C:\Program Files\Primo Poker`)
4. Click "Install"
5. Installation completes in ~30 seconds

### 4. Launch the Application

- **From Start Menu**: Search for "Primo Poker" and click the icon
- **From Desktop**: Double-click the "Primo Poker" shortcut (if created during install)

---

## First Launch

### Connect to Server

1. The application opens to the login screen
2. Click **"Connect to Server"** button
3. Status should change from "Disconnected" to "Connected"
4. If connection fails, check your internet connection and firewall settings

### Test Credentials

For immediate testing without registration:

- **Username**: `e2e_test_1754187899779`
- **Password**: `TestPass123!_1754187899779`
- **Starting Chips**: 1,000

### Register New Account

1. Click "Register" on login screen
2. Choose username (alphanumeric, 3-20 characters)
3. Enter email address
4. Create password (minimum 8 characters, 1 uppercase, 1 lowercase, 1 number)
5. Confirm password
6. Click "Create Account"
7. You'll start with 1,000 chips

---

## Troubleshooting

### "Cannot connect to server"

**Possible Causes**:
- No internet connection
- Firewall blocking outbound HTTPS (port 443)
- Backend API temporarily down

**Solutions**:
1. Check internet connection: open https://google.com in browser
2. Check backend health: open https://primo-poker-server.alabamamike.workers.dev/api/health
   - Should show: `{"status":"healthy"}`
3. Check firewall settings: allow `Primo Poker.exe` to access internet
4. Retry connection: click "Retry" button on connection status

### "Login failed" or "Invalid credentials"

**Solutions**:
- Verify username is correct (case-sensitive)
- Verify password is correct (case-sensitive)
- If using test credentials, copy-paste to avoid typos
- Try "Forgot Password" link (if implemented)

### Windows SmartScreen blocks installer

**This is expected** for unsigned applications.

**Solution**:
1. Click "More info" link
2. Click "Run anyway" button
3. The application is safe - source code is open at: https://github.com/AlabamaMike/primoPokerServerlessCF

### Application crashes on launch

**Possible Causes**:
- Corrupted installation
- Missing Windows updates
- Incompatible Windows version (requires Windows 10+)

**Solutions**:
1. Uninstall via Windows Settings → Apps
2. Restart computer
3. Download fresh installer from GitHub releases
4. Install again
5. If issue persists, report at: https://github.com/AlabamaMike/primoPokerServerlessCF/issues

### Game state appears incorrect or frozen

**Known Issue**: WebSocket message parsing errors may occur occasionally.

**Solution**:
1. Leave the table
2. Return to lobby
3. Rejoin the table
4. Game state should refresh correctly

---

## Uninstallation

### Windows 10/11

1. Open **Settings**
2. Navigate to **Apps** → **Apps & features**
3. Search for "Primo Poker"
4. Click **Uninstall**
5. Follow prompts

### Manual Uninstall

If the standard uninstall fails:

1. Delete installation directory: `C:\Program Files\Primo Poker`
2. Delete user data: `C:\Users\[YourUsername]\AppData\Roaming\com.primo-poker.app`
3. Remove Start Menu shortcut: `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Primo Poker`

---

## Data and Privacy

### Local Storage

- **Authentication tokens**: Stored in Windows Credential Manager (secure OS keyring)
- **User preferences**: `AppData\Roaming\com.primo-poker.app`
- **Cache**: Temporary files in Windows temp directory

### Network Communication

- **All traffic encrypted**: HTTPS/TLS to backend API
- **Backend**: Cloudflare Workers at https://primo-poker-server.alabamamike.workers.dev
- **No third-party tracking**: No analytics or telemetry in v0.1.0

### Account Deletion

To delete your account:
1. Contact support (see README)
2. All account data will be permanently removed from backend database

---

## Support

- **Issues**: https://github.com/AlabamaMike/primoPokerServerlessCF/issues
- **Documentation**: https://github.com/AlabamaMike/primoPokerServerlessCF/tree/main/apps/poker-desktop
- **Backend Status**: https://primo-poker-server.alabamamike.workers.dev/api/health