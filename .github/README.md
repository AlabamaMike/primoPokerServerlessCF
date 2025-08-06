# 🃏 Primo Poker Server - Enterprise-Grade Serverless Poker Platform

<div align="center">
  
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![WebSocket](https://img.shields.io/badge/WebSocket-Real--time-00A6ED?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
[![Security](https://img.shields.io/badge/Security-JWT%20%2B%20Crypto-4CAF50?style=for-the-badge&logo=shield&logoColor=white)](https://github.com/primo-poker/security)

**Production API**: [https://primo-poker-server.alabamamike.workers.dev](https://primo-poker-server.alabamamike.workers.dev)

</div>

## 🎯 Overview

Primo Poker Server is a comprehensive, production-ready poker platform built entirely on Cloudflare's serverless infrastructure. It delivers real-time multiplayer Texas Hold'em poker with enterprise-grade security, scalability, and performance. The platform supports 6+ player games, tournaments, and features a complete poker engine with professional-grade hand evaluation, bankroll management, and cryptographically secure card shuffling.

### 🏆 Key Achievements

- **Full Multiplayer Support**: Real-time gameplay for 2-9 players per table
- **Production Deployment**: Live on Cloudflare Workers with global edge distribution
- **Secure Desktop Client**: Tauri-based application with OS keyring integration
- **Comprehensive Testing**: E2E test suite covering all game scenarios
- **WebSocket Architecture**: Sub-50ms latency real-time communication
- **Cryptographic Security**: Verifiable fair shuffling with audit trails

## 🏗️ System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
├─────────────────────────────────────────────────────────────────┤
│  Desktop Client (Tauri)  │  Web Browser  │  Mobile (Future)     │
│  - React + TypeScript     │  - PWA Ready  │  - React Native     │
│  - Rust Backend          │  - WebSocket  │  - Native Bridge    │
│  - OS Keyring Storage    │  - REST API   │                     │
└────────────┬────────────────────┬──────────────┬───────────────┘
             │                    │              │
             ▼                    ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API Gateway (Cloudflare)                     │
├─────────────────────────────────────────────────────────────────┤
│  REST API Routes          │  WebSocket Manager                  │
│  - Authentication         │  - Real-time Updates               │
│  - Table Management       │  - Player Actions                  │
│  - Wallet Operations      │  - Chat Messages                   │
│  - Tournament Control     │  - State Synchronization           │
└────────────┬────────────────────┬──────────────────────────────┘
             │                    │
             ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Durable Objects (Stateful)                      │
├─────────────────────────────────────────────────────────────────┤
│  GameTableDurableObject   │  SecureRNGDurableObject            │
│  - Game State Management  │  - Cryptographic Shuffling        │
│  - Player Connections     │  - Entropy Pool Management        │
│  - Action Validation      │  - Audit Trail Generation         │
│  - Pot Calculations       │                                    │
│                          │  RateLimitDurableObject            │
│  TableDurableObject      │  - Request Throttling              │
│  - Table Configuration   │  - DDoS Protection                 │
│  - Player Seating        │  - Fair Usage Enforcement         │
└────────────┬────────────────────┬──────────────────────────────┘
             │                    │
             ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Data Persistence Layer                       │
├─────────────────────────────────────────────────────────────────┤
│  D1 Database              │  R2 Object Storage                 │
│  - Player Accounts        │  - Hand History Archives          │
│  - Game History           │  - Audit Logs                     │
│  - Tournament Records     │  - Large Binary Data              │
│  - Statistics             │                                    │
│                          │  KV Storage                        │
│  Workers Analytics       │  - Session Cache                   │
│  - Performance Metrics   │  - Temporary Data                  │
│  - Error Tracking        │  - Rate Limit Counters            │
└─────────────────────────────────────────────────────────────────┘
```

### Domain-Driven Design

The codebase follows clean architecture principles with clear separation of concerns:

#### **Domain Layer** (`packages/core`)
- Pure business logic with zero infrastructure dependencies
- Poker game rules, hand evaluation, and game state management
- Domain events for all state changes (GameStarted, BetPlaced, HandCompleted)
- Value objects for cards, chips, positions, and bets

#### **Application Layer** (`packages/api`)
- Use cases and orchestration logic
- REST and WebSocket handlers
- Request/response transformation
- Authentication and authorization

#### **Infrastructure Layer** (`packages/persistence`)
- Cloudflare-specific implementations
- Durable Objects for stateful game management
- D1 database repositories
- R2 storage for hand history
- KV namespace for caching

#### **Shared Kernel** (`packages/shared`)
- Common types and interfaces
- Zod schemas for validation
- Error classes and utilities
- Domain-agnostic helpers

## 🎮 Core Features

### Poker Game Engine

- **Texas Hold'em**: Full implementation with all betting rounds
- **Hand Evaluation**: Professional-grade 7-card evaluation system
- **Game Phases**: WAITING → PRE_FLOP → FLOP → TURN → RIVER → SHOWDOWN
- **Betting Actions**: Fold, Check, Call, Bet, Raise, All-in
- **Side Pots**: Automatic calculation for all-in scenarios
- **Showdown Logic**: Winner determination with tie-breaking

### Real-time Multiplayer

- **WebSocket Communication**: Bidirectional real-time updates
- **Player Synchronization**: Consistent state across all clients
- **Spectator Mode**: Watch games without participating
- **Auto-reconnection**: Seamless recovery from disconnections
- **Heartbeat Monitoring**: Connection health tracking
- **Button Rotation**: Automatic dealer/blind position management

### Security & Fair Play

- **Cryptographic Shuffling**: Web Crypto API with SHA-256
- **JWT Authentication**: Secure token-based auth
- **Rate Limiting**: DDoS protection via Durable Objects
- **Audit Trails**: Complete hand history with verification
- **Mental Poker**: Commitment schemes for fairness
- **Anti-fraud**: Pattern detection and timing analysis

### Bankroll Management

- **Player Wallets**: Persistent chip balance tracking
- **Buy-in/Cash-out**: Controlled table entry/exit
- **Transaction History**: Complete audit trail
- **Multiple Tables**: Play at multiple tables simultaneously
- **Automatic Settlement**: Instant pot distribution

## 📡 API Endpoints

### Authentication
```http
POST   /api/auth/register     # Create new account
POST   /api/auth/login        # Authenticate user
POST   /api/auth/refresh      # Refresh JWT token
POST   /api/auth/logout       # Invalidate session
```

### Player Management
```http
GET    /api/players/me        # Get profile
PUT    /api/players/me        # Update profile
GET    /api/wallet            # Get wallet balance
POST   /api/wallet/buyin      # Buy chips for table
POST   /api/wallet/cashout    # Leave table with chips
GET    /api/wallet/transactions # Transaction history
```

### Table Operations
```http
GET    /api/tables            # List active tables
POST   /api/tables            # Create new table
GET    /api/tables/:id        # Get table state
GET    /api/tables/:id/seats  # Get seating info
POST   /api/tables/:id/join   # Join table
POST   /api/tables/:id/leave  # Leave table
POST   /api/tables/:id/action # Player action (bet/fold/etc)
```

### Game & History
```http
GET    /api/games/:id         # Get game details
GET    /api/games/:id/history # Get hand history
```

### Tournaments
```http
GET    /api/tournaments       # List tournaments
POST   /api/tournaments       # Create tournament
POST   /api/tournaments/:id/register # Register for tournament
```

## 🔌 WebSocket Protocol

### Connection
```javascript
ws://api.example.com/ws?token=JWT_TOKEN&tableId=TABLE_ID
```

### Message Format
```typescript
interface WebSocketMessage {
  type: 'game_update' | 'player_action' | 'chat' | 'error';
  payload: any;
  timestamp: number;
}
```

### Client → Server Events
```typescript
// Player action
{ type: 'player_action', payload: { action: 'fold' | 'call' | 'raise', amount?: number } }

// Chat message
{ type: 'chat', payload: { message: string } }

// Heartbeat
{ type: 'ping' }
```

### Server → Client Events
```typescript
// Game state update
{ type: 'game_update', payload: GameState }

// Player joined/left
{ type: 'player_joined', payload: Player }
{ type: 'player_left', payload: { playerId: string } }

// Chat broadcast
{ type: 'chat', payload: { playerId: string, username: string, message: string } }

// Error notification
{ type: 'error', payload: { code: string, message: string } }
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm 9+
- Cloudflare account with Workers access
- Wrangler CLI (`npm install -g wrangler`)

### Installation

```bash
# Clone repository
git clone https://github.com/primo-poker/serverless-cf.git
cd primo-poker-serverless-cf

# Install dependencies
npm install

# Build all packages
npm run build
```

### Cloudflare Setup

```bash
# Create D1 database
wrangler d1 create primo-poker-db

# Create KV namespace
wrangler kv:namespace create "SESSION_STORE"

# Create R2 bucket
wrangler r2 bucket create primo-poker-storage

# Configure secrets
wrangler secret put JWT_SECRET
wrangler secret put DATABASE_ENCRYPTION_KEY

# Run database migrations
wrangler d1 migrations apply primo-poker-db --local
```

### Development

```bash
# Start local development server
npm run dev

# Run tests
npm run test

# Type checking
npm run type-check

# Linting
npm run lint
```

### Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy

# Deploy with custom environment
wrangler deploy --env production
```

## 🧪 Testing

### Test Suites

```bash
# All tests
npm test

# Unit tests
npm run test:unit

# Integration tests  
npm run test:integration

# E2E tests (requires running server)
npm run test:e2e

# Coverage report
npm run test:coverage
```

### Test Architecture

- **Unit Tests**: Pure business logic validation
- **Integration Tests**: API endpoint testing
- **E2E Tests**: Full user journey validation
- **Multiplayer Tests**: Complex game scenario testing

## 📦 Package Structure

```
primo-poker-serverless-cf/
├── apps/
│   ├── poker-server/        # Main Cloudflare Workers app
│   │   ├── src/
│   │   │   ├── index.ts    # Worker entry point
│   │   │   └── bindings.d.ts
│   │   ├── migrations/     # D1 database migrations
│   │   └── wrangler.toml   # Cloudflare configuration
│   │
│   └── poker-desktop/       # Tauri desktop client
│       ├── src/            # React frontend
│       ├── src-tauri/      # Rust backend
│       └── package.json
│
├── packages/
│   ├── shared/             # Common types and utilities
│   │   ├── types/         # TypeScript interfaces
│   │   ├── schemas/       # Zod validation schemas
│   │   ├── errors/        # Custom error classes
│   │   └── utils/         # Helper functions
│   │
│   ├── core/              # Game engine and business logic
│   │   ├── poker-game.ts  # Main game controller
│   │   ├── hand-evaluator.ts # Hand ranking system
│   │   ├── table-manager.ts  # Table operations
│   │   └── tournament.ts     # Tournament logic
│   │
│   ├── security/          # Authentication and crypto
│   │   ├── auth-manager.ts   # JWT handling
│   │   ├── shuffle-verifier.ts # Fair shuffling
│   │   ├── password-manager.ts # Bcrypt operations
│   │   └── anti-fraud.ts     # Security measures
│   │
│   ├── persistence/       # Data layer implementations
│   │   ├── durable-objects/  # Stateful game objects
│   │   ├── repositories/     # D1 database access
│   │   ├── storage/          # R2 and KV operations
│   │   └── migrations/       # Database schemas
│   │
│   └── api/              # HTTP and WebSocket handlers
│       ├── routes.ts      # REST API endpoints
│       ├── websocket.ts   # Real-time communication
│       ├── middleware/    # Auth, CORS, rate limiting
│       └── validators/    # Request validation
│
├── tests/
│   ├── unit/             # Business logic tests
│   ├── integration/      # API tests
│   └── e2e/             # End-to-end tests
│       └── multiplayer/  # Complex game scenarios
│
└── scripts/             # Build and deployment scripts
```

## 🔒 Security Features

### Authentication & Authorization
- JWT tokens with refresh mechanism
- Secure password hashing with bcrypt
- Role-based access control (RBAC)
- Session management with automatic cleanup

### Cryptographic Security
- Web Crypto API for secure randomness
- SHA-256 commitments for shuffle verification
- Mental poker protocols for fairness
- Complete audit trails in R2 storage

### Anti-Fraud Measures
- Timing analysis for bot detection
- Pattern recognition for collusion
- Rate limiting via Durable Objects
- IP-based throttling and blocking

## 📈 Performance & Scalability

### Edge Computing Benefits
- **Global Distribution**: 200+ Cloudflare locations
- **Low Latency**: Sub-50ms response times
- **Auto-scaling**: Handles millions of requests
- **DDoS Protection**: Enterprise-grade security

### Optimization Strategies
- Durable Objects for stateful operations
- KV caching for frequently accessed data
- R2 storage for large binary data
- Workers Analytics for monitoring

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Standards
- TypeScript strict mode enabled
- 100% type coverage required
- ESLint + Prettier formatting
- Conventional commits
- Comprehensive test coverage

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [/docs](./docs)
- **Issues**: [GitHub Issues](https://github.com/primo-poker/issues)
- **Discord**: [Community Server](https://discord.gg/primo-poker)

## 🎉 Acknowledgments

Built with cutting-edge technologies:
- [Cloudflare Workers](https://workers.cloudflare.com/) - Serverless compute
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Tauri](https://tauri.app/) - Desktop applications
- [Zod](https://zod.dev/) - Runtime validation
- [Jest](https://jestjs.io/) - Testing framework

---

<div align="center">
  
**Primo Poker Server** - Professional-grade poker platform for the modern web

[API Documentation](./docs/api) | [Game Rules](./docs/rules) | [Deployment Guide](./docs/deployment)

</div>
