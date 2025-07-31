# Development Guide

This guide provides comprehensive information for developers working on the Primo Poker serverless platform.

## Development Environment Setup

### Prerequisites
- Node.js 18+ with npm 9+
- Cloudflare CLI (`wrangler`) installed globally
- VS Code with recommended extensions
- Git for version control

### Recommended VS Code Extensions
- TypeScript and JavaScript Language Features
- ESLint
- Prettier - Code formatter
- Jest Test Explorer
- Cloudflare Workers

### Local Development Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Build all packages:**
```bash
npm run build
```

3. **Start development with hot reload:**
```bash
npm run dev
```

4. **Run tests in watch mode:**
```bash
npm run test:watch
```

## Project Architecture

### Monorepo Structure

The project uses npm workspaces to manage multiple packages:

```
packages/
├── shared/      # Common types, utilities, validation schemas
├── core/        # Domain models, business logic (framework-agnostic)
├── security/    # Authentication, RNG, shuffle verification
├── persistence/ # Data access layer, Cloudflare integrations
└── api/         # HTTP/WebSocket handlers, API routes
```

### Clean Architecture Principles

1. **Domain Layer (Core)**
   - Contains pure business logic
   - No external dependencies
   - Framework-agnostic domain models

2. **Application Layer (API)**
   - Orchestrates domain operations
   - Handles use cases and workflows
   - Defines interfaces for external services

3. **Infrastructure Layer (Persistence)**
   - Implements external service integrations
   - Database operations (D1)
   - Storage operations (R2, KV)

4. **Presentation Layer (API)**
   - HTTP request/response handling
   - WebSocket event management
   - Input validation and serialization

### Domain-Driven Design

**Aggregates:**
- `Game`: Manages poker game state and rules
- `Player`: Player account and session data
- `Table`: Physical/virtual table configuration
- `Tournament`: Tournament lifecycle and structure

**Value Objects:**
- `Card`: Immutable playing card
- `Hand`: Poker hand evaluation
- `Chip`: Monetary value representation
- `Position`: Seat position at table

**Domain Events:**
- `GameStarted`: New game begins
- `BetPlaced`: Player places bet
- `HandCompleted`: Hand finishes
- `TournamentFinished`: Tournament ends

## Code Style and Standards

### TypeScript Configuration

All packages use strict TypeScript configuration:
- `strict: true`
- `noImplicitReturns: true`
- `noImplicitAny: true`
- `exactOptionalPropertyTypes: true`

### Naming Conventions

- **Files**: kebab-case (`poker-game.ts`)
- **Classes**: PascalCase (`PokerGame`)
- **Functions/Variables**: camelCase (`calculatePot`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_PLAYERS`)
- **Types/Interfaces**: PascalCase (`GameState`, `IPlayerRepository`)

### Import Organization

```typescript
// 1. Node.js built-ins
import { randomBytes } from 'crypto';

// 2. External libraries
import { z } from 'zod';

// 3. Internal packages (alphabetical)
import { Card, GameType } from '@primo-poker/shared';
import { PokerGame } from '@primo-poker/core';

// 4. Relative imports
import { validateGameAction } from './validation';
import type { GameAction } from '../types';
```

### Error Handling

Use custom error classes for domain-specific errors:

```typescript
export class InvalidGameActionError extends Error {
  constructor(
    message: string,
    public readonly gameId: string,
    public readonly playerId: string,
    public readonly action: string
  ) {
    super(message);
    this.name = 'InvalidGameActionError';
  }
}
```

## Testing Strategy

### Test Structure

```
tests/
├── unit/           # Isolated unit tests
├── integration/    # Service integration tests
├── e2e/           # End-to-end API tests
└── fixtures/      # Test data and mocks
```

### Unit Testing Guidelines

- Test domain logic in isolation
- Mock external dependencies
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

```typescript
describe('PokerGame', () => {
  describe('processBet', () => {
    it('should allow valid raise when player has sufficient chips', () => {
      // Arrange
      const game = createTestGame();
      const playerId = 'player1';
      const raiseAmount = 100;

      // Act
      const result = game.processBet(playerId, 'raise', raiseAmount);

      // Assert
      expect(result.success).toBe(true);
      expect(game.getCurrentBet()).toBe(raiseAmount);
    });
  });
});
```

### Integration Testing

Test Cloudflare service integrations using Miniflare:

```typescript
import { Miniflare } from 'miniflare';

describe('Game Durable Object', () => {
  let mf: Miniflare;

  beforeEach(async () => {
    mf = new Miniflare({
      script: await readFile('./dist/index.js', 'utf8'),
      durableObjects: { GAME_OBJECTS: 'GameDurableObject' },
    });
  });

  it('should create new game state', async () => {
    const response = await mf.dispatchFetch('/api/games', {
      method: 'POST',
      body: JSON.stringify({ tableId: 'table1' }),
    });

    expect(response.status).toBe(201);
  });
});
```

## Database Development

### Schema Management

Database migrations are stored in `apps/poker-server/migrations/`:

```sql
-- 0001_initial.sql
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  chips INTEGER DEFAULT 1000,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Migration Commands

```bash
# Create new migration
wrangler d1 migrations create primo-poker-db "add_tournaments_table"

# Apply migrations (local)
wrangler d1 migrations apply primo-poker-db --local

# Apply migrations (production)
wrangler d1 migrations apply primo-poker-db
```

### Repository Pattern

Data access follows repository pattern:

```typescript
export interface IPlayerRepository {
  findById(id: string): Promise<Player | null>;
  findByUsername(username: string): Promise<Player | null>;
  save(player: Player): Promise<void>;
  delete(id: string): Promise<void>;
}

export class D1PlayerRepository implements IPlayerRepository {
  constructor(private db: D1Database) {}

  async findById(id: string): Promise<Player | null> {
    const result = await this.db
      .prepare('SELECT * FROM players WHERE id = ?')
      .bind(id)
      .first();
    
    return result ? Player.fromDatabase(result) : null;
  }
}
```

## WebSocket Development

### Connection Management

WebSocket connections are managed per table:

```typescript
export class WebSocketManager {
  private connections = new Map<string, WebSocket>();
  private playerToTable = new Map<string, string>();

  async handleConnection(ws: WebSocket, request: Request) {
    const { playerId, tableId } = await this.authenticateConnection(request);
    
    this.connections.set(playerId, ws);
    this.playerToTable.set(playerId, tableId);

    ws.addEventListener('message', (event) => {
      this.handleMessage(playerId, JSON.parse(event.data));
    });
  }
}
```

### Event Broadcasting

Game events are broadcast to all connected players:

```typescript
broadcastToTable(tableId: string, event: GameEvent) {
  const message = JSON.stringify(event);
  
  for (const [playerId, connection] of this.connections) {
    if (this.playerToTable.get(playerId) === tableId) {
      connection.send(message);
    }
  }
}
```

## Security Considerations

### Random Number Generation

Use Web Crypto API for secure randomness:

```typescript
export class SecureRNG {
  static generateSeed(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(32));
  }

  static shuffleDeck(cards: Card[], seed: Uint8Array): Card[] {
    // Fisher-Yates shuffle with cryptographic seed
    const rng = new SeededRNG(seed);
    const shuffled = [...cards];
    
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled;
  }
}
```

### Input Validation

All API inputs are validated using Zod schemas:

```typescript
const PlayerActionSchema = z.object({
  playerId: z.string().uuid(),
  action: z.enum(['fold', 'call', 'raise', 'check']),
  amount: z.number().min(0).optional(),
});

export async function handlePlayerAction(request: Request) {
  const body = await request.json();
  const { playerId, action, amount } = PlayerActionSchema.parse(body);
  
  // Process validated action
}
```

### Authentication Flow

JWT tokens with refresh mechanism:

```typescript
export class AuthenticationManager {
  async login(username: string, password: string): Promise<AuthTokens> {
    const player = await this.validateCredentials(username, password);
    
    const accessToken = await this.generateAccessToken(player);
    const refreshToken = await this.generateRefreshToken(player);
    
    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const player = await this.playerRepository.findById(payload.playerId);
    
    if (!player) throw new Error('Player not found');
    
    return this.generateTokens(player);
  }
}
```

## Performance Optimization

### Durable Objects Best Practices

- Keep state minimal and focused
- Use hibernation for inactive objects
- Implement proper error handling and recovery

```typescript
export class GameDurableObject {
  private game: PokerGame | null = null;
  private lastActivity = Date.now();

  async fetch(request: Request): Promise<Response> {
    // Auto-hibernate after 30 minutes of inactivity
    if (Date.now() - this.lastActivity > 30 * 60 * 1000) {
      await this.persistState();
      return new Response('Hibernating', { status: 202 });
    }

    this.lastActivity = Date.now();
    return this.handleRequest(request);
  }
}
```

### KV Caching Strategy

Use KV store for frequently accessed, infrequently changed data:

```typescript
export class CachedPlayerRepository {
  constructor(
    private kvStore: KVNamespace,
    private d1Repository: D1PlayerRepository
  ) {}

  async findById(id: string): Promise<Player | null> {
    // Try cache first
    const cached = await this.kvStore.get(`player:${id}`, 'json');
    if (cached) return Player.fromJSON(cached);

    // Fallback to database
    const player = await this.d1Repository.findById(id);
    if (player) {
      // Cache for 1 hour
      await this.kvStore.put(`player:${id}`, JSON.stringify(player), {
        expirationTtl: 3600,
      });
    }

    return player;
  }
}
```

## Debugging and Monitoring

### Logging Best Practices

Use structured logging for better observability:

```typescript
export class Logger {
  static info(message: string, context: Record<string, any> = {}) {
    console.log(JSON.stringify({
      level: 'info',
      message,
      timestamp: new Date().toISOString(),
      ...context,
    }));
  }

  static error(error: Error, context: Record<string, any> = {}) {
    console.error(JSON.stringify({
      level: 'error',
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      ...context,
    }));
  }
}
```

### Error Tracking

Implement comprehensive error handling:

```typescript
export async function handleAPIRequest(request: Request): Promise<Response> {
  try {
    return await processRequest(request);
  } catch (error) {
    Logger.error(error, {
      url: request.url,
      method: request.method,
      userAgent: request.headers.get('user-agent'),
    });

    if (error instanceof ValidationError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Internal Server Error', { status: 500 });
  }
}
```

## Deployment

### Environment Configuration

Different configurations for each environment:

```toml
# wrangler.toml
[env.development]
vars = { ENVIRONMENT = "development", DEBUG = "true" }

[env.staging]
vars = { ENVIRONMENT = "staging", DEBUG = "false" }

[env.production]
vars = { ENVIRONMENT = "production", DEBUG = "false" }
```

### Deployment Pipeline

1. **Development**: Local testing with Miniflare
2. **Staging**: Automatic deployment from feature branches
3. **Production**: Manual deployment with approval gates

```bash
# Deploy to staging
wrangler deploy --env staging

# Deploy to production
wrangler deploy --env production
```

### Health Checks

Implement health check endpoints:

```typescript
export async function handleHealthCheck(): Promise<Response> {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: await checkDatabaseHealth(),
      kv: await checkKVHealth(),
      r2: await checkR2Health(),
    },
  };

  const allHealthy = Object.values(health.services).every(s => s === 'healthy');
  
  return new Response(JSON.stringify(health), {
    status: allHealthy ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## Contributing Guidelines

### Git Workflow

1. Create feature branch from `main`
2. Make atomic commits with conventional commit messages
3. Open pull request with detailed description
4. Ensure all tests pass and code is reviewed
5. Squash merge to `main`

### Commit Message Format

```
type(scope): description

[optional body]

[optional footer]
```

Examples:
- `feat(core): add tournament bracket generation`
- `fix(api): handle websocket disconnection gracefully`
- `docs(readme): update installation instructions`

### Code Review Checklist

- [ ] Code follows project conventions
- [ ] All tests pass
- [ ] TypeScript compilation succeeds
- [ ] Security considerations addressed
- [ ] Performance impact considered
- [ ] Documentation updated

## Troubleshooting

### Common Issues

**Build Errors:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Rebuild all packages
npm run clean && npm run build
```

**Test Failures:**
```bash
# Run tests with verbose output
npm test -- --verbose

# Run specific test file
npm test -- hand-evaluator.test.ts
```

**Wrangler Issues:**
```bash
# Update Wrangler to latest version
npm install -g @cloudflare/wrangler@latest

# Clear Wrangler cache
wrangler kv:namespace delete --namespace-id=<id> --force
```

### Performance Debugging

Use Cloudflare Analytics and Worker Analytics to monitor:
- Request latency
- Error rates
- Memory usage
- CPU time

### Security Audit

Regular security checks:
```bash
# Check for vulnerable dependencies
npm audit

# Run security linting
npm run lint:security
```
