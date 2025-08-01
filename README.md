# 🃏 Primo Poker - Professional Serverless Poker Platform

> **Current Status: Phase 2C Complete** ✅  
> Complete poker platform with hand evaluation, showdowns, and multiplayer support

A comprehensive serverless poker platform built on Cloudflare Workers with interactive frontend, real-time multiplayer capabilities, complete hand evaluation system, and modern web technologies.

## 🚀 Live Demo
**Frontend Demo**: [http://primopoker.club/demo/table](http://primopoker.club/demo/table)
- **Single Player Mode**: Interactive poker simulation with AI players
- **Multiplayer Mode**: Real-time WebSocket lobby and table joining
- **Hand Evaluation**: Complete showdown system with winner reveals
- **Hand History**: Browse detailed history of all played hands
- **Features**: Live game phases, betting actions, and synchronized state

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

## 🎮 Key Features Implemented

### **Interactive Poker Experience**
- Professional oval poker table with 9-max seating
- Animated card dealing (hole cards + community cards)
- Real-time pot tracking and chip management
- Complete betting actions (fold, call, bet, raise)
- Game phase progression (pre-flop → flop → turn → river)

### **Real-time Multiplayer**
- WebSocket-powered live communication
- Interactive table lobbies with player counts
- Synchronized game state across all players
- Auto-reconnection with heartbeat monitoring
- Seamless single-player ↔ multiplayer switching

### **Complete Hand Evaluation**
- Full Texas Hold'em ranking system (10 hand types)
- Cinematic showdown displays with winner celebrations
- Comprehensive hand history with detailed breakdowns
- Accurate pot distribution and tie-breaking logic
- Professional casino-quality animations and presentations

### **Professional UI/UX**
- Casino-quality visual design with custom poker theme
- Smooth animations and micro-interactions
- Fully responsive (desktop, tablet, mobile)
- Real-time connection status indicators
- Professional poker card and chip graphics

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
