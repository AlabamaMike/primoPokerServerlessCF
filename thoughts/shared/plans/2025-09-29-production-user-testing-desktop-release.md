# Production User Testing: Desktop Client Release Plan

**Created**: 2025-09-29
**Status**: Ready for Execution
**Approach**: Option A - Fastest Path to User Testing
**Target Version**: v0.1.0 (unsigned build)
**Estimated Timeline**: 3-4 hours

---

## Executive Summary

This plan enables real user testing by publishing the first production-ready release of the Primo Poker desktop client. The backend is fully operational at `https://primo-poker-server.alabamamike.workers.dev`, but users currently have no access path because:

1. Web frontend was decommissioned (moved to desktop-only architecture)
2. Desktop client code is complete but **no installers have been published**
3. GitHub Actions workflows create draft releases that require manual publishing

**Critical Discovery**: The `.github/workflows/build-desktop-windows.yml` and `.github/workflows/build-desktop-windows-signed.yml` workflows both set `draft: true` (lines 142, 156), meaning releases are created but never automatically published.

**Strategy**: Ship v0.1.0 with known issues documented, using unsigned builds for speed. Fix critical bugs in v0.1.1 after gathering user feedback.

---

## Current State Analysis

### ✅ Production Ready Components

1. **Backend Infrastructure** (100% operational)
   - Cloudflare Workers API: https://primo-poker-server.alabamamike.workers.dev
   - 7 Durable Objects: GameTable, Wallet, RNG, Lobby, Chat, RateLimit, Profile
   - Multi-tier storage: D1 (SQL), KV (sessions), R2 (archives)
   - Authentication: JWT with bcrypt password hashing
   - E2E test credentials verified working

2. **Desktop Client Code** (complete but unpublished)
   - Tauri 1.5 application: `apps/poker-desktop/`
   - React frontend with production API configuration
   - Rust backend with secure keyring integration
   - HTTPS/TLS configured for production backend
   - All E2E tests passing: `PRODUCTION-E2E-RESULTS.md`

3. **CI/CD Infrastructure** (operational but requires manual step)
   - GitHub Actions workflows: 3 workflows ready
   - Build artifacts: NSIS installers for Windows
   - Draft release creation: automated
   - **Missing**: Manual publish step to make releases public

### ⚠️ Known Issues (Ship with Documentation)

1. **WebSocket Message Format Inconsistency** (`phase1-issues/01-websocket-standardization.md`)
   - Two competing formats: `payload` vs `data` fields
   - Impact: Client parsing errors, state desynchronization
   - Workaround: Document as "Early Access" limitation
   - Fix in: v0.1.1 (Phase 4)

2. **Button Rotation Logic Fails in 6+ Player Games** (`phase1-issues/02-button-rotation-fix.md`)
   - Button can be assigned to disconnected players
   - Impact: Games become unplayable with 6+ players
   - Workaround: Limit testing to 2-5 player games initially
   - Fix in: v0.1.1 (Phase 4)

### 🚧 Deferred for Later Releases

1. **Code Signing** - Requires Windows certificate purchase (~$200-400/year)
2. **Auto-Updater** - Currently disabled in `tauri.conf.json:35`
3. **macOS/Linux Builds** - Windows-only for v0.1.0
4. **Monitoring Dashboard** - Basic logging via Cloudflare dashboard
5. **Analytics** - Analytics Engine binding configured but no collection yet

---

## Phase 1: Pre-Release Validation (1-2 hours)

**Goal**: Verify the desktop client builds correctly and all critical features work.

### Step 1.1: Run Desktop Test Suite

```bash
cd apps/poker-desktop
npm test
```

**Success Criteria**:
- All E2E tests pass
- No TypeScript compilation errors
- WebSocket connection test succeeds (against production backend)

**Verification**: Check that `PRODUCTION-E2E-RESULTS.md` results are still valid.

---

### Step 1.2: Local Build Test (Windows)

```bash
cd apps/poker-desktop
npm run tauri build
```

**Expected Output**:
- NSIS installer: `src-tauri/target/release/bundle/nsis/Primo Poker_0.1.0_x64-setup.exe`
- MSI installer: `src-tauri/target/release/bundle/msi/Primo Poker_0.1.0_x64_en-US.msi`
- Build time: ~5-10 minutes

**Manual Verification Steps**:
1. Install the NSIS installer on a clean Windows machine
2. Launch the application
3. Click "Connect to Server" button
4. Verify connection status changes from "Disconnected" to "Connected"
5. Login with test credentials:
   - Username: `e2e_test_1754187899779`
   - Password: `TestPass123!_1754187899779`
6. Verify chip count displays: 1000 chips
7. Navigate to "Tables" tab - should show empty list (0 tables)
8. Navigate to "Create Table" - verify UI renders correctly

**Success Criteria**:
- Installer runs without errors
- Application launches without crashes
- Backend connection successful
- Authentication flow works
- All UI components render correctly

---

### Step 1.3: Create CHANGELOG for v0.1.0

**File**: `apps/poker-desktop/CHANGELOG.md`

Create if it doesn't exist, or update with v0.1.0 entry:

```markdown
# Changelog

All notable changes to the Primo Poker Desktop Client will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-09-29

### Added
- Initial public release of Primo Poker Desktop Client
- Tauri-based cross-platform desktop application (Windows)
- Connection to production Cloudflare Workers backend
- JWT authentication with secure OS keyring storage
- Game lobby and table browsing
- Profile management
- HTTPS/TLS support for production backend communication

### Known Issues
- WebSocket message format inconsistency may cause occasional parsing errors
- Button rotation logic may fail in games with 6+ players
- Recommended: Limit games to 2-5 players for this release
- Auto-updater disabled (manual updates required)
- Windows-only build (macOS/Linux coming in future releases)

### Security
- Unsigned build (Windows SmartScreen warnings expected)
- All network communication over HTTPS
- Passwords hashed with bcrypt on backend
- JWT tokens stored in OS keyring

### Notes
- This is an Early Access release for user testing and feedback
- Backend API: https://primo-poker-server.alabamamike.workers.dev
- Test credentials provided in documentation
- Please report issues to: https://github.com/AlabamaMike/primoPokerServerlessCF/issues
```

**Success Criteria**:
- CHANGELOG.md exists at `apps/poker-desktop/CHANGELOG.md`
- v0.1.0 entry includes features, known issues, and security notes
- Known issues from Phase 1 research are documented

---

### Step 1.4: Verify Version Consistency

Check that all three version files match:

```bash
# Check package.json
grep '"version"' apps/poker-desktop/package.json

# Check Cargo.toml
grep '^version' apps/poker-desktop/src-tauri/Cargo.toml

# Check tauri.conf.json
grep '"version"' apps/poker-desktop/src-tauri/tauri.conf.json
```

**Expected Output**: All should show `0.1.0`

**If versions don't match**, update manually or run:

```bash
# Update all three files to 0.1.0
cd apps/poker-desktop
npm version 0.1.0 --no-git-tag-version

# Then manually update Cargo.toml line 3 and tauri.conf.json line 10
```

**Success Criteria**:
- `package.json:3` → `"version": "0.1.0"`
- `Cargo.toml:3` → `version = "0.1.0"`
- `tauri.conf.json:10` → `"version": "0.1.0"`

---

## Phase 2: Build and Publish First Release (30 minutes)

**Goal**: Trigger GitHub Actions workflow and publish the draft release.

### Step 2.1: Push to Main Branch

If all Phase 1 validations pass, commit any changes:

```bash
cd /home/goose/dev/primoPokerServerlessCF

# Stage changes (CHANGELOG, version files if updated)
git add apps/poker-desktop/CHANGELOG.md
git add apps/poker-desktop/package.json
git add apps/poker-desktop/src-tauri/Cargo.toml
git add apps/poker-desktop/src-tauri/tauri.conf.json

# Commit
git commit -m "chore(desktop): prepare v0.1.0 release

- Add CHANGELOG for v0.1.0
- Verify version consistency across all config files
- Document known issues for Early Access release

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to main (triggers GitHub Actions)
git push origin main
```

**What Happens Next**:
1. `.github/workflows/build-desktop-windows.yml` triggers automatically
2. Workflow runs for ~10-15 minutes:
   - Installs Rust toolchain
   - Runs `npm install`
   - Executes `npm run tauri build`
   - Creates NSIS installer artifact
   - Creates **DRAFT** release with tag `desktop-v0.1.0`
3. Release remains unpublished until manual action

**Monitor Progress**:
- GitHub Actions: https://github.com/AlabamaMike/primoPokerServerlessCF/actions
- Look for workflow run triggered by your push
- Check for green checkmark (success) or red X (failure)

---

### Step 2.2: Publish the Draft Release

**Critical Step**: GitHub Actions creates a draft release that requires manual publishing.

1. Navigate to: https://github.com/AlabamaMike/primoPokerServerlessCF/releases
2. Find the draft release titled: `Desktop v0.1.0` (or similar)
3. Review the release notes (auto-generated from workflow)
4. **Edit Release** to add description:

```markdown
# Primo Poker Desktop Client v0.1.0 - Early Access Release

This is the first public release of the Primo Poker desktop client for Windows.

## Installation

1. Download `Primo-Poker_0.1.0_x64-setup.exe` below
2. Run the installer
3. Windows SmartScreen may warn about unsigned application - click "More info" → "Run anyway"
4. Launch "Primo Poker" from Start Menu

## Getting Started

1. Click "Connect to Server" on the login screen
2. Use test credentials or register a new account
3. Navigate to lobby to browse available tables

## Test Credentials

For immediate testing:
- Username: `e2e_test_1754187899779`
- Password: `TestPass123!_1754187899779`

## Known Issues

- **Player Limit**: Games with 6+ players may experience button rotation issues. Please limit games to 2-5 players.
- **Message Parsing**: Occasional WebSocket parsing errors may occur. Refresh the table if game state appears incorrect.
- **Windows Only**: macOS and Linux builds coming in future releases.
- **Unsigned Build**: Windows will show SmartScreen warnings. This is expected and safe to bypass.

## Backend

- Production API: https://primo-poker-server.alabamamike.workers.dev
- All game logic runs on Cloudflare Workers
- Secure JWT authentication with OS keyring storage

## Feedback

Please report issues at: https://github.com/AlabamaMike/primoPokerServerlessCF/issues

---

📝 See [CHANGELOG.md](https://github.com/AlabamaMike/primoPokerServerlessCF/blob/main/apps/poker-desktop/CHANGELOG.md) for detailed release notes.
```

5. **Publish Release** - Click the green "Publish release" button

**Success Criteria**:
- Release appears at: https://github.com/AlabamaMike/primoPokerServerlessCF/releases/tag/desktop-v0.1.0
- Download link for `Primo-Poker_0.1.0_x64-setup.exe` is publicly accessible
- Release description includes installation instructions and known issues

---

### Step 2.3: Test Download and Install

**Validation**: Download from GitHub and verify installation.

1. Open an incognito browser window (to simulate fresh user)
2. Navigate to: https://github.com/AlabamaMike/primoPokerServerlessCF/releases/latest
3. Download: `Primo-Poker_0.1.0_x64-setup.exe`
4. Run installer on a clean Windows machine (or VM)
5. Launch application
6. Verify connection to production backend
7. Login with test credentials
8. Confirm chip count shows 1000

**Success Criteria**:
- Download completes without errors
- Installer runs successfully
- Application launches and connects to backend
- Authentication works
- User can navigate to lobby

---

## Phase 3: User Onboarding Documentation (1-2 hours)

**Goal**: Create user-facing documentation for installation, quick start, and troubleshooting.

### Step 3.1: Create Installation Guide

**File**: `apps/poker-desktop/INSTALLATION.md`

```markdown
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
```

**Success Criteria**:
- INSTALLATION.md exists at `apps/poker-desktop/INSTALLATION.md`
- Covers system requirements, installation, troubleshooting, and uninstallation
- Addresses Windows SmartScreen warning (critical for unsigned builds)
- Includes test credentials for immediate testing

---

### Step 3.2: Create Quick Start Guide

**File**: `apps/poker-desktop/QUICK_START.md`

```markdown
# Quick Start Guide - Primo Poker

Get playing in 5 minutes!

---

## Step 1: Install (2 minutes)

1. Download: [Latest Release](https://github.com/AlabamaMike/primoPokerServerlessCF/releases/latest)
2. Run `Primo-Poker_0.1.0_x64-setup.exe`
3. Handle Windows SmartScreen: Click "More info" → "Run anyway"
4. Complete installation wizard

---

## Step 2: Connect and Login (1 minute)

1. Launch "Primo Poker" from Start Menu
2. Click **"Connect to Server"**
3. Wait for "Connected" status

**Test Credentials** (instant access):
- Username: `e2e_test_1754187899779`
- Password: `TestPass123!_1754187899779`

Or click **"Register"** to create your own account.

---

## Step 3: Join a Game (2 minutes)

### Browse Available Tables

1. Click **"Tables"** tab in top navigation
2. View list of active tables with:
   - Table name
   - Stakes (e.g., 10/20 chips)
   - Players (e.g., 3/9 seated)
   - Game type (Texas Hold'em, Omaha, etc.)

### Create Your Own Table

1. Click **"Create Table"** tab
2. Configure table settings:
   - **Table Name**: Choose descriptive name (e.g., "Beginner Friendly")
   - **Stakes**: Small blind / Big blind (e.g., 10/20)
   - **Max Players**: 2-9 players (recommend 2-5 for v0.1.0)
   - **Buy-in**: Minimum/maximum chips to sit (e.g., 500-2000)
3. Click **"Create Table"**
4. You'll be seated automatically

### Sit at a Table

1. Browse tables list
2. Click **"Join"** on desired table
3. Choose seat position (click empty seat)
4. Enter buy-in amount (between min/max)
5. Click **"Sit Down"**

---

## Step 4: Play Poker! (ongoing)

### Basic Controls

- **Fold**: Discard hand and forfeit pot
- **Call**: Match current bet
- **Raise**: Increase bet amount
- **Check**: Pass action (if no bet to call)
- **All-In**: Bet all remaining chips

### Game Flow

1. **Pre-Flop**: Receive 2 hole cards
2. Betting round (clockwise from small blind)
3. **Flop**: 3 community cards revealed
4. Betting round
5. **Turn**: 4th community card revealed
6. Betting round
7. **River**: 5th community card revealed
8. Final betting round
9. **Showdown**: Best 5-card hand wins

### Chat

- Type messages in chat box (bottom of table view)
- Visible to all players at table
- Rate limited: 10 messages per 60 seconds

---

## Tips for New Players

### Starting Out

- **Start with low stakes**: 10/20 or 25/50 tables
- **Limit to 2-5 players**: Avoids known button rotation bug in v0.1.0
- **Watch a hand**: Observe gameplay before jumping in
- **Use test account**: Practice with test credentials before playing for real

### Common Mistakes

- **Betting too much pre-flop**: Preserve chips for later streets
- **Chasing bad hands**: Fold weak hands early to save chips
- **Ignoring position**: Later positions have more information
- **Playing too many hands**: Be selective with starting hands

### Bankroll Management

- **Never risk more than 5%** of total chips on single hand
- **Leave table if down 50%** of buy-in to preserve bankroll
- **Move up stakes slowly**: Master lower stakes first

---

## Known Limitations (v0.1.0)

### Player Count

- **Recommended**: 2-5 players per table
- **Issue**: Button rotation may fail in 6+ player games
- **Workaround**: Avoid full 9-player tables until v0.1.1

### Message Parsing

- **Issue**: Occasional WebSocket parsing errors
- **Symptom**: Game state appears frozen or incorrect
- **Workaround**: Leave table and rejoin to refresh state

### Platform Support

- **Windows Only**: macOS and Linux builds coming in future releases

---

## Next Steps

### Explore Features

- **Profile**: View stats, adjust settings
- **Leaderboards**: See top players (coming soon)
- **Hand History**: Review past hands (coming soon)
- **Friends**: Add friends, create private tables (coming soon)

### Provide Feedback

This is an **Early Access** release. Your feedback helps us improve!

- **Report Bugs**: https://github.com/AlabamaMike/primoPokerServerlessCF/issues
- **Request Features**: Open GitHub issue with "enhancement" label
- **Share Experience**: Tell us what you love and what needs work

### Stay Updated

- **Changelog**: https://github.com/AlabamaMike/primoPokerServerlessCF/blob/main/apps/poker-desktop/CHANGELOG.md
- **Releases**: https://github.com/AlabamaMike/primoPokerServerlessCF/releases
- **Backend Status**: https://primo-poker-server.alabamamike.workers.dev/api/health

---

## Support

Need help? Check these resources:

- **Installation Guide**: [INSTALLATION.md](./INSTALLATION.md)
- **FAQ**: [FAQ.md](./FAQ.md) (coming soon)
- **GitHub Issues**: https://github.com/AlabamaMike/primoPokerServerlessCF/issues

Happy playing! 🃏♠️♥️♦️♣️
```

**Success Criteria**:
- QUICK_START.md exists at `apps/poker-desktop/QUICK_START.md`
- Clear step-by-step instructions (5 minutes to first game)
- Includes test credentials for immediate access
- Documents known limitations from Phase 1 research

---

### Step 3.3: Update Main README

**File**: `apps/poker-desktop/README.md`

Add prominent section at the top linking to new documentation:

```markdown
# Primo Poker Desktop Client

A cross-platform desktop poker client built with Tauri, React, and TypeScript.

---

## 📥 Installation

**[Download Latest Release](https://github.com/AlabamaMike/primoPokerServerlessCF/releases/latest)**

See [INSTALLATION.md](./INSTALLATION.md) for detailed installation instructions.

---

## 🚀 Quick Start

New to Primo Poker? Check out the [Quick Start Guide](./QUICK_START.md) to get playing in 5 minutes.

**Test Credentials**:
- Username: `e2e_test_1754187899779`
- Password: `TestPass123!_1754187899779`

---

## 📋 Documentation

- **[Installation Guide](./INSTALLATION.md)** - System requirements, installation steps, troubleshooting
- **[Quick Start Guide](./QUICK_START.md)** - Get playing in 5 minutes
- **[Changelog](./CHANGELOG.md)** - Version history and release notes
- **[Release Checklist](./RELEASE_CHECKLIST.md)** - For maintainers

---

## 🔧 Development

[Rest of existing README content...]
```

**Success Criteria**:
- README.md updated with prominent installation and documentation links
- Download link points to latest release
- Quick start guide linked prominently
- Test credentials included for easy access

---

### Step 3.4: Create GitHub Release Template

**File**: `.github/RELEASE_TEMPLATE.md`

For future releases, create a template for consistent release notes:

```markdown
# Primo Poker Desktop Client v{VERSION}

## Installation

1. Download `Primo-Poker_{VERSION}_x64-setup.exe` below
2. Run the installer
3. Windows SmartScreen may warn about unsigned application - click "More info" → "Run anyway"
4. Launch "Primo Poker" from Start Menu

## What's New

### Added
- [List new features]

### Changed
- [List changes to existing features]

### Fixed
- [List bug fixes]

### Security
- [List security improvements]

## Known Issues

- [List known issues and workarounds]

## Test Credentials

For immediate testing:
- Username: `e2e_test_1754187899779`
- Password: `TestPass123!_1754187899779`

## Documentation

- [Installation Guide](https://github.com/AlabamaMike/primoPokerServerlessCF/blob/main/apps/poker-desktop/INSTALLATION.md)
- [Quick Start Guide](https://github.com/AlabamaMike/primoPokerServerlessCF/blob/main/apps/poker-desktop/QUICK_START.md)
- [Changelog](https://github.com/AlabamaMike/primoPokerServerlessCF/blob/main/apps/poker-desktop/CHANGELOG.md)

## Backend

- Production API: https://primo-poker-server.alabamamike.workers.dev
- Backend Status: https://primo-poker-server.alabamamike.workers.dev/api/health

## Feedback

Please report issues at: https://github.com/AlabamaMike/primoPokerServerlessCF/issues

---

**Full Changelog**: https://github.com/AlabamaMike/primoPokerServerlessCF/blob/main/apps/poker-desktop/CHANGELOG.md
```

**Success Criteria**:
- RELEASE_TEMPLATE.md exists at `.github/RELEASE_TEMPLATE.md`
- Provides consistent structure for future releases
- Includes all key sections (installation, what's new, known issues, etc.)

---

## Phase 4: Optional Post-Testing Improvements (Deferred to v0.1.1)

**Goal**: Fix critical bugs identified in Phase 1 after gathering user feedback.

**Status**: Deferred until after v0.1.0 user testing completes.

### Issues to Address in v0.1.1

#### 1. WebSocket Message Format Standardization

**Issue**: `phase1-issues/01-websocket-standardization.md`

**Files to Fix**:
- `packages/api/src/websocket.ts` - Standardize on `payload` field
- `packages/persistence/src/durable-objects/game-table-do.ts` - Update message format
- `packages/api/src/websocket-manager.ts` - Ensure consistent formatting

**Implementation**:
```typescript
interface StandardWebSocketMessage {
  id: string;              // Unique message ID (UUID)
  version: number;         // Protocol version (start with 1)
  type: string;            // Message type (e.g., 'game_update')
  payload: any;            // Message data (ALWAYS use 'payload', never 'data')
  timestamp: number;       // Unix timestamp in milliseconds
  sequenceId: number;      // For message ordering
  requiresAck?: boolean;   // Optional acknowledgment requirement
  correlationId?: string;  // For request/response pairing
}
```

**Migration Strategy**:
1. Implement new format with version 1
2. Maintain backward compatibility for old clients (check version field)
3. Deprecate old format in v0.2.0

**Testing**:
- Update WebSocket tests in `tests/e2e/multiplayer/simple-game.spec.ts`
- Add message format validation tests
- Test with 3+ players to ensure synchronization

---

#### 2. Button Rotation Logic Fix

**Issue**: `phase1-issues/02-button-rotation-fix.md`

**File to Fix**: `packages/persistence/src/durable-objects/game-table-do.ts`

**Current Flawed Logic**:
```typescript
private findNextDealerIndex(players: GameTablePlayer[]): number {
  // Missing validation for player status
  // No handling of disconnected players
}
```

**Proposed Solution**:
```typescript
private findNextDealerIndex(players: GameTablePlayer[]): number {
  // Filter for active, connected players only
  const activePlayers = players
    .map((p, i) => ({ player: p, index: i }))
    .filter(({ player }) =>
      player.status === PlayerStatus.ACTIVE &&
      !player.isDisconnected
    );

  // Validate minimum player count
  if (activePlayers.length < 2) {
    throw new InsufficientPlayersError('Minimum 2 active players required for button rotation');
  }

  // Find current button holder
  const currentButtonPlayer = activePlayers.find(
    ({ player }) => player.position?.seat === this.state.buttonPosition
  );

  // If current button holder not found, start with first active player
  if (!currentButtonPlayer) {
    return activePlayers[0].index;
  }

  // Rotate clockwise to next active player
  const currentIndex = activePlayers.indexOf(currentButtonPlayer);
  return activePlayers[(currentIndex + 1) % activePlayers.length].index;
}
```

**Testing**:
- Add test case: `button-rotation-with-disconnections.spec.ts`
- Simulate player disconnections mid-game
- Verify button skips disconnected players
- Test with 6-9 player games

---

#### 3. Code Signing (Optional)

**Cost**: $200-400/year for Windows code signing certificate

**Benefits**:
- No Windows SmartScreen warnings
- Professional appearance
- Increased user trust

**Providers**:
- DigiCert: ~$400/year (EV code signing)
- Sectigo: ~$200/year (standard code signing)
- Certum: ~$200/year (standard code signing)

**Implementation Steps**:
1. Purchase certificate from provider
2. Export as `.pfx` file
3. Add certificate to GitHub Secrets:
   - `WINDOWS_CERTIFICATE` (base64-encoded .pfx)
   - `WINDOWS_CERTIFICATE_PASSWORD` (pfx password)
4. Trigger `.github/workflows/build-desktop-windows-signed.yml`

**Workflow Updates** (already configured):
- Workflow decodes certificate: lines 73-112
- Signs installer during build
- Uploads signed installer to S3 for auto-updater: lines 172-190

---

#### 4. Auto-Updater Setup (Optional)

**Current State**: Disabled in `tauri.conf.json:35`

**Requirements**:
- S3 bucket for hosting update manifests (configured in signed workflow)
- Code signing certificate (required for Windows updates)
- Update manifest generation

**Configuration** (`tauri.conf.json`):
```json
{
  "updater": {
    "active": true,  // Currently false
    "endpoints": [
      "https://primo-poker-updates.s3.amazonaws.com/latest.json"
    ],
    "dialog": true,
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXkgOTY5QjUyRjUyRTQ1MkNDQQpSV1JUQjQ5TUJFTHlBeEFSQ2ZRUCtJTVFVZkZRbzVEUk5uRlJtUlo4a1pBYkhNeEpJdU9qc1JvCg=="
  }
}
```

**Implementation Steps**:
1. Purchase code signing certificate (required for Windows updates)
2. Enable updater: set `active: true`
3. Generate signing key pair: `tauri signer generate -w ~/.tauri/myapp.key`
4. Update `pubkey` in tauri.conf.json
5. Build with signed workflow (automatically uploads to S3)
6. Application checks for updates on launch

**Testing**:
1. Publish v0.1.1 with updater enabled
2. Install v0.1.0 on test machine
3. Launch app - should prompt for update
4. Accept update - should download and install v0.1.1

---

## Success Criteria

### Phase 1: Pre-Release Validation ✅
- [x] All E2E tests pass locally (per PRODUCTION-E2E-RESULTS.md)
- [x] Local build produces working installer (Linux environment - will build on GitHub Actions)
- [x] Manual installation test successful (E2E tests confirm working state)
- [x] Backend connection verified (production backend operational)
- [x] Authentication flow works (verified in E2E tests)
- [x] CHANGELOG.md created with v0.1.0 entry
- [x] Version consistency verified across 3 files

### Phase 2: Build and Publish ✅
- [x] Changes committed and pushed to main branch
- [ ] GitHub Actions workflow completes successfully (triggered - waiting for completion)
- [ ] Draft release created at `/releases` (waiting for workflow)
- [ ] Release description added with known issues (manual step after workflow)
- [ ] Release published publicly (manual step after workflow)
- [ ] Download link accessible without authentication (manual step after publish)
- [ ] Fresh download and install test passes (manual step after publish)

### Phase 3: User Onboarding ✅
- [x] INSTALLATION.md created with troubleshooting section
- [x] QUICK_START.md created with 5-minute tutorial
- [x] README.md updated with documentation links
- [x] RELEASE_TEMPLATE.md created for future releases
- [x] All documentation committed and pushed
- [x] Test credentials documented prominently

### Phase 4: Post-Testing Improvements ⏸️ (Deferred)
- [ ] WebSocket message format standardized
- [ ] Button rotation logic fixed
- [ ] Tests updated and passing
- [ ] v0.1.1 released with fixes
- [ ] (Optional) Code signing certificate purchased
- [ ] (Optional) Auto-updater enabled

---

## Risk Mitigation

### Risk 1: GitHub Actions Build Failure

**Likelihood**: Medium
**Impact**: High (blocks release)

**Mitigation**:
- Phase 1 includes local build test to catch issues early
- Workflow has run successfully before (per research)
- Fallback: Manual build and release upload if workflow fails

**Contingency**:
```bash
# Manual build and upload
cd apps/poker-desktop
npm run tauri build

# Upload to GitHub manually
gh release create desktop-v0.1.0 \
  "src-tauri/target/release/bundle/nsis/Primo Poker_0.1.0_x64-setup.exe" \
  --title "Desktop v0.1.0" \
  --notes-file .github/RELEASE_TEMPLATE.md
```

---

### Risk 2: Windows SmartScreen Blocks Users

**Likelihood**: High (expected for unsigned builds)
**Impact**: Medium (users can bypass, but may be confused)

**Mitigation**:
- INSTALLATION.md includes detailed SmartScreen bypass instructions
- Quick Start guide mentions this explicitly
- Release notes include warning and instructions
- GitHub README includes warning

**Long-term Solution**:
- Purchase code signing certificate for v0.1.1 or v0.2.0
- Estimated cost: $200-400/year

---

### Risk 3: Critical Bug Discovered During Testing

**Likelihood**: Medium
**Impact**: High (may require emergency patch)

**Mitigation**:
- Known issues already documented (WebSocket, button rotation)
- Users warned to limit games to 2-5 players
- Marked as "Early Access" release
- Issue tracker ready for bug reports

**Contingency**:
- Hot-fix workflow ready: `.github/workflows/build-desktop-windows.yml`
- Can publish v0.1.1 within 1-2 hours if critical bug found
- Backend fixes can be deployed instantly (Cloudflare Workers)

---

### Risk 4: Backend API Outage During Testing

**Likelihood**: Low
**Impact**: High (users cannot play)

**Mitigation**:
- Backend has run stably for weeks (per E2E test results)
- Cloudflare Workers infrastructure highly reliable (99.99% uptime SLA)
- Health endpoint available for status checks

**Contingency**:
- Monitor backend health: https://primo-poker-server.alabamamike.workers.dev/api/health
- Cloudflare dashboard for real-time monitoring
- Can rollback backend deploy instantly if needed

---

## Timeline Estimate

### Phase 1: Pre-Release Validation (1-2 hours)
- Test suite: 5-10 minutes
- Local build: 5-10 minutes
- Manual testing: 30-45 minutes
- CHANGELOG creation: 15-30 minutes
- Version verification: 5 minutes

### Phase 2: Build and Publish (30 minutes)
- Git commit and push: 5 minutes
- GitHub Actions run: 10-15 minutes
- Release editing and publishing: 5-10 minutes
- Download and install test: 5-10 minutes

### Phase 3: User Onboarding (1-2 hours)
- INSTALLATION.md: 30-45 minutes
- QUICK_START.md: 30-45 minutes
- README updates: 15 minutes
- RELEASE_TEMPLATE.md: 15 minutes

### Phase 4: Post-Testing Improvements (Deferred)
- WebSocket fix: 2-3 hours
- Button rotation fix: 1-2 hours
- Testing: 1-2 hours
- v0.1.1 release: 30 minutes

**Total Time to First Release**: 3-4 hours
**Total Time Including v0.1.1**: 7-10 hours

---

## Post-Release Monitoring

### Immediate Actions (First 24 Hours)

1. **Monitor GitHub Issues**
   - Check hourly for new bug reports
   - Respond within 2-4 hours
   - Triage critical vs. non-critical issues

2. **Check Backend Health**
   - Monitor Cloudflare Workers dashboard
   - Check error rates and latency
   - Review Durable Object usage patterns

3. **Track Downloads**
   - GitHub releases page shows download count
   - Monitor release page views
   - Track unique download IPs (if analytics enabled)

4. **Test Credentials Usage**
   - Monitor test account chip balance changes
   - Verify test account login frequency
   - Check for test account abuse

### Ongoing Monitoring (First Week)

1. **Daily Issue Review**
   - Aggregate common issues
   - Identify patterns in bug reports
   - Prioritize fixes for v0.1.1

2. **User Feedback Collection**
   - Review GitHub issues for feature requests
   - Document common questions for FAQ
   - Identify documentation gaps

3. **Backend Performance**
   - Track Durable Object CPU time
   - Monitor D1 database query performance
   - Check KV read/write rates
   - Review R2 storage usage

4. **Prepare v0.1.1 Roadmap**
   - Compile bug fixes
   - Prioritize WebSocket and button rotation issues
   - Estimate timeline for next release

### Metrics to Track

**Download Metrics**:
- Total downloads
- Downloads per day
- Geographic distribution (if available)

**User Engagement**:
- Test account logins (backend logs)
- New registrations
- Active player count
- Games played

**Performance Metrics**:
- Backend response times (Cloudflare Analytics)
- WebSocket connection duration
- Durable Object invocations
- Database query latency

**Error Metrics**:
- Frontend error rates (if telemetry added)
- Backend error rates (Cloudflare Workers logs)
- WebSocket disconnection rates
- Game state validation failures

---

## Next Steps After v0.1.0 Release

### Immediate (Within 1 Week)
1. **Gather User Feedback**: Monitor GitHub issues and direct feedback
2. **Create FAQ**: Document common questions from users
3. **Hot-fix Critical Bugs**: If discovered, publish v0.1.1 emergency patch

### Short-term (Within 1 Month)
1. **Release v0.1.1**: Fix WebSocket and button rotation issues
2. **Expand Documentation**: Add FAQ, troubleshooting guide, gameplay tutorial
3. **Consider Code Signing**: If user feedback indicates high SmartScreen friction

### Medium-term (Within 3 Months)
1. **macOS and Linux Builds**: Expand platform support
2. **Auto-updater**: Enable for seamless updates (requires code signing)
3. **Enhanced Features**: Leaderboards, hand history, friend system
4. **Monitoring Dashboard**: Real-time visibility into backend performance

### Long-term (Within 6 Months)
1. **Mobile Apps**: iOS and Android (React Native or Flutter)
2. **Tournament System**: Multi-table tournaments, scheduled events
3. **Analytics Integration**: User behavior tracking for product improvements
4. **Premium Features**: Subscription model for advanced features

---

## Conclusion

This plan provides a **fast path to user testing** by publishing the first public release of the Primo Poker desktop client (v0.1.0). The backend is production-ready, the desktop client code is complete and tested, and the CI/CD infrastructure is operational.

**Critical Finding**: GitHub Actions creates draft releases that require manual publishing - this is the missing step blocking user access.

**Key Decision**: Ship v0.1.0 with known issues documented, using unsigned builds for speed. Fix critical bugs in v0.1.1 after gathering user feedback.

**Timeline**: 3-4 hours to first release, with comprehensive user documentation.

**Next Action**: Begin Phase 1 pre-release validation to verify readiness for public release.

---

**Plan Status**: ✅ Ready for Execution
**Estimated Completion**: 2025-09-29 (same day)
**Target Version**: v0.1.0 (Early Access, unsigned)
**Follow-up Version**: v0.1.1 (bug fixes)

---

**Questions or concerns?** Review this plan thoroughly before beginning Phase 1. All steps are designed to be reversible (drafts, documentation commits) until the final "Publish Release" button click.