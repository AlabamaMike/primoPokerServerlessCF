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

### Prerequisites

- **Node.js**: v18 or later
- **Rust**: Latest stable version
- **Tauri CLI**: `cargo install tauri-cli`

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

### Testing

```bash
# Run all tests
npm test

# Run E2E tests
npm run test:e2e
```

---

## 🏗️ Architecture

### Technology Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Rust with Tauri 1.5
- **State Management**: React Context + Hooks
- **API**: RESTful + WebSocket (production backend on Cloudflare Workers)
- **Security**: JWT authentication, OS keyring storage

### Project Structure

```
apps/poker-desktop/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── hooks/              # Custom React hooks
│   ├── services/           # API services
│   └── utils/              # Utility functions
├── src-tauri/              # Rust backend
│   ├── src/                # Tauri commands
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration
└── tests/                  # E2E tests
```

---

## 🌐 Backend API

Production backend: **https://primo-poker-server.alabamamike.workers.dev**

The desktop client connects to a serverless Cloudflare Workers backend that handles:
- User authentication (JWT)
- Game state management (Durable Objects)
- Real-time updates (WebSocket)
- Persistent storage (D1, KV, R2)

---

## 📝 Contributing

This project is currently in Early Access. We welcome bug reports and feature requests!

1. Check existing [issues](https://github.com/AlabamaMike/primoPokerServerlessCF/issues)
2. Open a new issue with detailed description
3. For bugs, include steps to reproduce
4. For features, explain use case and benefits

---

## 📜 License

See [LICENSE](../../LICENSE) in the root directory.

---

## 🐛 Known Issues

### v0.1.0 Limitations

- **Player Count**: Recommended 2-5 players per table. Button rotation may fail in 6+ player games.
- **WebSocket**: Occasional parsing errors. Leave and rejoin table if game state appears frozen.
- **Platform**: Windows-only. macOS and Linux builds coming soon.
- **Code Signing**: Unsigned build. Windows SmartScreen warnings expected.

See [CHANGELOG.md](./CHANGELOG.md) for complete list of known issues and planned fixes.

---

## 🔒 Security

- All network communication over HTTPS/TLS
- JWT tokens stored in OS keyring (Windows Credential Manager)
- Passwords hashed with bcrypt on backend
- No telemetry or analytics in v0.1.0

To report security vulnerabilities, please contact the maintainers privately via GitHub.

---

## 💬 Support

- **Issues**: https://github.com/AlabamaMike/primoPokerServerlessCF/issues
- **Backend Status**: https://primo-poker-server.alabamamike.workers.dev/api/health
- **Documentation**: See guides above

---

## 🎯 Roadmap

### v0.1.1 (Next Release)
- Fix WebSocket message format standardization
- Fix button rotation logic for 6+ player games
- Add unit test improvements

### v0.2.0 (Future)
- Code signing for Windows
- macOS and Linux builds
- Auto-updater support
- Enhanced UI/UX improvements

### v1.0.0 (Long-term)
- Tournament system
- Hand history viewer
- Leaderboards
- Friend system and private tables
- Mobile apps (iOS/Android)

---

Built with ❤️ using [Tauri](https://tauri.app)