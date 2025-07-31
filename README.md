# Primo Poker - Serverless Poker Room Server

A comprehensive serverless poker room server built using Cloudflare's ecosystem (Workers, Durable Objects, D1, R2, and Queues) following Clean Architecture and Domain-Driven Design principles.

## 🏗️ Architecture Overview

### Clean Architecture Layers

1. **Domain Layer** (`packages/core`): Pure TypeScript poker game logic with no framework dependencies
2. **Application Layer** (`packages/api`): Use cases for game operations and API handlers
3. **Infrastructure Layer** (`packages/persistence`): Cloudflare-specific implementations (D1, R2, KV, Durable Objects)
4. **Presentation Layer** (`packages/api`): WebSocket and REST API handlers

### Domain-Driven Design

- **Aggregates**: Game, Player, Table, Tournament
- **Value Objects**: Card, Hand, Chip, Bet, Position
- **Domain Events**: GameStarted, BetPlaced, HandCompleted, TournamentFinished
- **Repositories**: IGameRepository, IPlayerRepository, ITournamentRepository

## 🎮 Core Features

### Game Variants
- **Texas Hold'em** (Limit, No-Limit, Pot-Limit)
- **Omaha** (Hi, Hi-Lo)
- **Seven Card Stud** (Hi, Hi-Lo)
- **Tournament formats** (MTT, SNG, Heads-Up)

### Cloudflare Services Integration
- **Workers**: API endpoints and WebSocket connections
- **Durable Objects**: Game state management per table
- **D1**: Player accounts, hand history, tournament data
- **R2**: Hand replay storage, audit logs
- **Queues**: Tournament scheduling, hand analysis
- **KV**: Session management, cache layer

### Security & Fairness
- Cryptographically secure RNG using Web Crypto API
- Mental poker algorithm for card shuffling verification
- Hand history with verifiable randomness proofs
- Rate limiting and DDoS protection
- JWT-based authentication with refresh tokens

### Real-time Features
- WebSocket connections for live game updates
- Automatic disconnection handling with time banks
- Observer mode for tournament spectating
- Table chat with profanity filtering

## 📁 Project Structure

```
primo-poker-serverless/
├── packages/
│   ├── shared/          # Common types and utilities
│   ├── core/            # Domain models and business logic
│   ├── security/        # Authentication, RNG, anti-fraud
│   ├── persistence/     # Data access layer (D1, Durable Objects)
│   └── api/             # REST/WebSocket API handlers
├── apps/
│   └── poker-server/    # Main Cloudflare Workers application
├── tests/
│   ├── unit/            # Unit tests
│   └── integration/     # Integration tests
└── docs/                # Documentation
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm 9+
- Cloudflare account with Workers, D1, R2, and KV access

### Installation

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd primo-poker-serverless
npm install
```

2. **Build all packages:**
```bash
npm run build
```

3. **Set up Cloudflare services:**
```bash
# Create D1 database
wrangler d1 create primo-poker-db

# Create KV namespace
wrangler kv:namespace create "SESSION_STORE"

# Create R2 bucket
wrangler r2 bucket create primo-poker-hand-history

# Run database migrations
wrangler d1 migrations apply primo-poker-db
```

4. **Configure secrets:**
```bash
wrangler secret put JWT_SECRET
wrangler secret put DATABASE_ENCRYPTION_KEY
```

5. **Start development server:**
```bash
npm run dev
```

## 🧪 Testing

Run the comprehensive test suite:

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## 📊 Key Components

### Hand Evaluator
```typescript
import { Hand } from '@primo-poker/core';

const cards = [/* 5-7 cards */];
const evaluation = Hand.evaluate(cards);
console.log(evaluation.ranking, evaluation.description);
```

### Poker Game Engine
```typescript
import { PokerGame } from '@primo-poker/core';

const game = new PokerGame(tableConfig, players);
await game.dealCards();
const result = await game.processBet(playerId, amount);
```

### Shuffle Verification
```typescript
import { ShuffleVerifier } from '@primo-poker/security';

const verifier = new ShuffleVerifier();
const deck = verifier.generateDeck();
const shuffled = verifier.shuffleDeck(deck, seed);
const isValid = verifier.verifyFairness(shuffled);
```

### Real-time WebSocket
```typescript
import { WebSocketManager } from '@primo-poker/api';

const wsManager = new WebSocketManager(jwtSecret);
await wsManager.handleConnection(ws, request);
```

## 🔒 Security Features

### Cryptographic Shuffling
- Verifiable deck generation with commitments
- Fisher-Yates shuffle with cryptographic seeds
- Mental poker protocols for multi-party verification

### Authentication
- JWT tokens with refresh mechanism
- Rate limiting for login attempts
- Session management with automatic cleanup

### Anti-fraud Measures
- Hand history immutability
- Action timing analysis
- Pattern detection for collusion

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/login` - Player login
- `POST /api/auth/refresh` - Token refresh  
- `POST /api/auth/logout` - Player logout

### Tables
- `GET /api/tables` - List active tables
- `POST /api/tables` - Create new table
- `POST /api/tables/:id/join` - Join table
- `POST /api/tables/:id/action` - Player action

### Games
- `GET /api/games/:id` - Get game state
- `GET /api/games/:id/history` - Hand history

### Tournaments
- `GET /api/tournaments` - List tournaments
- `POST /api/tournaments` - Create tournament
- `POST /api/tournaments/:id/register` - Register for tournament

## 🎯 WebSocket Events

### Client → Server
```typescript
// Player action
{
  type: 'player_action',
  payload: {
    playerId: string,
    action: 'fold' | 'call' | 'raise' | 'check',
    amount?: number
  }
}

// Chat message
{
  type: 'chat',
  payload: {
    playerId: string,
    message: string
  }
}
```

### Server → Client
```typescript
// Game state update
{
  type: 'game_update',
  payload: GameState
}

// Chat broadcast
{
  type: 'chat',
  payload: {
    playerId: string,
    username: string,
    message: string,
    isSystem: boolean
  }
}
```

## 🗄️ Database Schema

The D1 database includes tables for:
- `players` - Player accounts and statistics
- `games` - Game states and history
- `tournaments` - Tournament information
- `hand_actions` - Detailed action history
- `sessions` - Authentication sessions

See `apps/poker-server/migrations/0001_initial.sql` for the complete schema.

## 📈 Performance & Scaling

### Cloudflare Edge Benefits
- Global distribution with <50ms latency
- Automatic scaling based on demand
- Built-in DDoS protection

### Optimization Features
- Durable Objects for stateful game management
- KV caching for frequently accessed data
- R2 for long-term storage with lifecycle policies

## 🔧 Configuration

### Environment Variables
```toml
# wrangler.toml
[vars]
ENVIRONMENT = "production"

# Secrets (set via wrangler secret put)
JWT_SECRET = "your-secret-key"
DATABASE_ENCRYPTION_KEY = "your-encryption-key"
```

### Table Configuration
```typescript
const tableConfig: TableConfig = {
  gameType: GameType.TEXAS_HOLDEM,
  bettingStructure: BettingStructure.NO_LIMIT,
  maxPlayers: 9,
  minBuyIn: 100,
  maxBuyIn: 10000,
  smallBlind: 5,
  bigBlind: 10
};
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run `npm run lint` and `npm test`
5. Submit a pull request

### Code Style
- TypeScript with strict mode
- ESLint + Prettier configuration
- Conventional commits specification
- 100% type coverage required

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For questions and support:
- Open an issue on GitHub
- Check the documentation in `/docs`
- Review the test files for usage examples

## 🎉 Acknowledgments

Built with:
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [TypeScript](https://www.typescriptlang.org/)
- [Jest](https://jestjs.io/)
- [Zod](https://zod.dev/)

---

**Primo Poker** - Professional-grade serverless poker platform for the modern web.