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