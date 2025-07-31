# API Reference

This document provides comprehensive API documentation for the Primo Poker serverless platform.

## Base URL

- **Development**: `http://localhost:8787`
- **Production**: `https://api.primo-poker.com`

## Authentication

All authenticated endpoints require a JWT token in the Authorization header:

```http
Authorization: Bearer <your-jwt-token>
```

### Token Refresh

Access tokens expire after 15 minutes. Use the refresh token to obtain new tokens.

## Response Format

All API responses follow a consistent format:

```typescript
// Success Response
{
  "success": true,
  "data": <response_data>,
  "timestamp": "2024-01-15T10:30:00Z"
}

// Error Response
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input parameters",
    "details": {...}
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Authentication Endpoints

### POST /api/auth/register

Register a new player account.

**Request Body:**
```typescript
{
  "username": string,      // 3-20 characters, alphanumeric + underscore
  "email": string,         // Valid email address
  "password": string,      // Minimum 8 characters
  "firstName": string,     // Optional
  "lastName": string       // Optional
}
```

**Response:**
```typescript
{
  "success": true,
  "data": {
    "player": {
      "id": string,
      "username": string,
      "email": string,
      "firstName": string | null,
      "lastName": string | null,
      "chips": number,
      "createdAt": string
    },
    "tokens": {
      "accessToken": string,
      "refreshToken": string,
      "expiresIn": number
    }
  }
}
```

### POST /api/auth/login

Authenticate an existing player.

**Request Body:**
```typescript
{
  "username": string,      // Username or email
  "password": string
}
```

**Response:**
```typescript
{
  "success": true,
  "data": {
    "player": {
      "id": string,
      "username": string,
      "email": string,
      "firstName": string | null,
      "lastName": string | null,
      "chips": number,
      "lastLoginAt": string
    },
    "tokens": {
      "accessToken": string,
      "refreshToken": string,
      "expiresIn": number
    }
  }
}
```

### POST /api/auth/refresh

Refresh access token using refresh token.

**Request Body:**
```typescript
{
  "refreshToken": string
}
```

**Response:**
```typescript
{
  "success": true,
  "data": {
    "tokens": {
      "accessToken": string,
      "refreshToken": string,
      "expiresIn": number
    }
  }
}
```

### POST /api/auth/logout

**Headers:** `Authorization: Bearer <token>`

Invalidate current session tokens.

**Response:**
```typescript
{
  "success": true,
  "data": {
    "message": "Successfully logged out"
  }
}
```

## Player Endpoints

### GET /api/players/me

**Headers:** `Authorization: Bearer <token>`

Get current player profile.

**Response:**
```typescript
{
  "success": true,
  "data": {
    "player": {
      "id": string,
      "username": string,
      "email": string,
      "firstName": string | null,
      "lastName": string | null,
      "chips": number,
      "statistics": {
        "gamesPlayed": number,
        "handsWon": number,
        "totalWinnings": number,
        "biggestPot": number
      },
      "createdAt": string,
      "lastLoginAt": string
    }
  }
}
```

### PUT /api/players/me

**Headers:** `Authorization: Bearer <token>`

Update player profile.

**Request Body:**
```typescript
{
  "firstName"?: string,
  "lastName"?: string,
  "email"?: string
}
```

### GET /api/players/:id

Get public player profile.

**Response:**
```typescript
{
  "success": true,
  "data": {
    "player": {
      "id": string,
      "username": string,
      "publicStatistics": {
        "gamesPlayed": number,
        "handsWon": number,
        "tournamentWins": number
      },
      "joinedAt": string
    }
  }
}
```

## Table Endpoints

### GET /api/tables

List all active tables.

**Query Parameters:**
- `gameType`: `"TEXAS_HOLDEM" | "OMAHA" | "SEVEN_CARD_STUD"`
- `bettingStructure`: `"NO_LIMIT" | "LIMIT" | "POT_LIMIT"`
- `minBuyIn`: number
- `maxBuyIn`: number
- `limit`: number (default: 20)
- `offset`: number (default: 0)

**Response:**
```typescript
{
  "success": true,
  "data": {
    "tables": Array<{
      "id": string,
      "name": string,
      "gameType": GameType,
      "bettingStructure": BettingStructure,
      "maxPlayers": number,
      "currentPlayers": number,
      "smallBlind": number,
      "bigBlind": number,
      "minBuyIn": number,
      "maxBuyIn": number,
      "isActive": boolean,
      "createdAt": string
    }>,
    "total": number,
    "hasMore": boolean
  }
}
```

### POST /api/tables

**Headers:** `Authorization: Bearer <token>`

Create a new table.

**Request Body:**
```typescript
{
  "name": string,
  "gameType": GameType,
  "bettingStructure": BettingStructure,
  "maxPlayers": number,        // 2-10
  "smallBlind": number,
  "bigBlind": number,
  "minBuyIn": number,
  "maxBuyIn": number,
  "isPrivate"?: boolean,       // Default: false
  "password"?: string          // Required if isPrivate: true
}
```

**Response:**
```typescript
{
  "success": true,
  "data": {
    "table": {
      "id": string,
      "name": string,
      "gameType": GameType,
      "bettingStructure": BettingStructure,
      "maxPlayers": number,
      "smallBlind": number,
      "bigBlind": number,
      "minBuyIn": number,
      "maxBuyIn": number,
      "isPrivate": boolean,
      "createdBy": string,
      "createdAt": string
    }
  }
}
```

### GET /api/tables/:id

Get table details and current state.

**Response:**
```typescript
{
  "success": true,
  "data": {
    "table": {
      "id": string,
      "name": string,
      "gameType": GameType,
      "bettingStructure": BettingStructure,
      "maxPlayers": number,
      "players": Array<{
        "id": string,
        "username": string,
        "position": number,
        "chips": number,
        "isActive": boolean,
        "isDealer": boolean,
        "isSmallBlind": boolean,
        "isBigBlind": boolean
      }>,
      "gameState": {
        "phase": GamePhase,
        "pot": number,
        "currentBet": number,
        "activePlayer": string | null,
        "communityCards": Card[],
        "handNumber": number
      },
      "smallBlind": number,
      "bigBlind": number,
      "createdAt": string
    }
  }
}
```

### POST /api/tables/:id/join

**Headers:** `Authorization: Bearer <token>`

Join a table.

**Request Body:**
```typescript
{
  "buyIn": number,             // Must be between minBuyIn and maxBuyIn
  "position"?: number,         // Preferred seat (1-maxPlayers), optional
  "password"?: string          // Required for private tables
}
```

**Response:**
```typescript
{
  "success": true,
  "data": {
    "player": {
      "id": string,
      "position": number,
      "chips": number,
      "joinedAt": string
    },
    "table": {
      "id": string,
      "currentPlayers": number,
      "gameState": GameState
    }
  }
}
```

### POST /api/tables/:id/leave

**Headers:** `Authorization: Bearer <token>`

Leave a table.

**Response:**
```typescript
{
  "success": true,
  "data": {
    "chipsReturned": number,
    "leftAt": string
  }
}
```

## Game Endpoints

### POST /api/games/:gameId/action

**Headers:** `Authorization: Bearer <token>`

Submit a player action during a game.

**Request Body:**
```typescript
{
  "action": "fold" | "call" | "raise" | "check" | "all_in",
  "amount"?: number,           // Required for 'raise', ignored for others
  "timeUsed"?: number          // Time taken to make decision (seconds)
}
```

**Response:**
```typescript
{
  "success": true,
  "data": {
    "action": {
      "playerId": string,
      "action": string,
      "amount": number,
      "timestamp": string
    },
    "gameState": {
      "phase": GamePhase,
      "pot": number,
      "currentBet": number,
      "activePlayer": string | null,
      "communityCards": Card[],
      "players": Array<{
        "id": string,
        "chips": number,
        "bet": number,
        "isActive": boolean,
        "hasActed": boolean
      }>
    }
  }
}
```

### GET /api/games/:gameId/history

Get hand history for a specific game.

**Query Parameters:**
- `handNumber`: number (specific hand, optional)
- `limit`: number (default: 50)
- `offset`: number (default: 0)

**Response:**
```typescript
{
  "success": true,
  "data": {
    "hands": Array<{
      "handNumber": number,
      "startTime": string,
      "endTime": string | null,
      "players": Array<{
        "id": string,
        "username": string,
        "position": number,
        "startingChips": number,
        "endingChips": number,
        "holeCards": Card[] | null,    // null if folded early
        "finalHand": HandRanking | null
      }>,
      "actions": Array<{
        "playerId": string,
        "action": string,
        "amount": number,
        "phase": GamePhase,
        "timestamp": string
      }>,
      "communityCards": Card[],
      "pot": number,
      "winners": Array<{
        "playerId": string,
        "amount": number,
        "handRanking": HandRanking
      }>,
      "shuffleSeed": string,           // For verification
      "isVerified": boolean
    }>,
    "total": number
  }
}
```

## Tournament Endpoints

### GET /api/tournaments

List tournaments.

**Query Parameters:**
- `status`: `"upcoming" | "running" | "finished"`
- `type`: `"MULTI_TABLE" | "SINGLE_TABLE" | "HEADS_UP"`
- `buyIn`: number
- `limit`: number (default: 20)
- `offset`: number (default: 0)

**Response:**
```typescript
{
  "success": true,
  "data": {
    "tournaments": Array<{
      "id": string,
      "name": string,
      "type": TournamentType,
      "buyIn": number,
      "fee": number,
      "maxPlayers": number,
      "currentPlayers": number,
      "startTime": string,
      "status": TournamentStatus,
      "prizePool": number,
      "isGuaranteed": boolean,
      "guaranteedPrize": number | null
    }>,
    "total": number
  }
}
```

### POST /api/tournaments

**Headers:** `Authorization: Bearer <token>`

Create a new tournament.

**Request Body:**
```typescript
{
  "name": string,
  "type": TournamentType,
  "buyIn": number,
  "fee": number,                    // Tournament fee
  "maxPlayers": number,
  "startTime": string,              // ISO timestamp
  "isGuaranteed": boolean,
  "guaranteedPrize"?: number,       // Required if isGuaranteed: true
  "structure": {
    "levels": Array<{
      "level": number,
      "smallBlind": number,
      "bigBlind": number,
      "duration": number            // Minutes
    }>,
    "startingChips": number,
    "payoutStructure": Array<{
      "position": number,
      "percentage": number          // Percentage of prize pool
    }>
  }
}
```

### POST /api/tournaments/:id/register

**Headers:** `Authorization: Bearer <token>`

Register for a tournament.

**Response:**
```typescript
{
  "success": true,
  "data": {
    "registration": {
      "tournamentId": string,
      "playerId": string,
      "registeredAt": string,
      "tableAssignment": number | null,
      "seatAssignment": number | null
    },
    "tournament": {
      "currentPlayers": number,
      "status": TournamentStatus
    }
  }
}
```

### DELETE /api/tournaments/:id/register

**Headers:** `Authorization: Bearer <token>`

Unregister from a tournament (before it starts).

## WebSocket API

### Connection

Connect to WebSocket endpoint with authentication:

```javascript
const ws = new WebSocket('wss://api.primo-poker.com/ws', {
  headers: {
    'Authorization': 'Bearer ' + accessToken
  }
});
```

### Message Format

All WebSocket messages follow this format:

```typescript
{
  "type": string,       // Message type
  "payload": any,       // Message data
  "timestamp": string   // ISO timestamp
}
```

### Client → Server Messages

#### Join Table
```typescript
{
  "type": "join_table",
  "payload": {
    "tableId": string
  }
}
```

#### Leave Table
```typescript
{
  "type": "leave_table",
  "payload": {
    "tableId": string
  }
}
```

#### Player Action
```typescript
{
  "type": "player_action",
  "payload": {
    "gameId": string,
    "action": "fold" | "call" | "raise" | "check" | "all_in",
    "amount"?: number
  }
}
```

#### Chat Message
```typescript
{
  "type": "chat",
  "payload": {
    "tableId": string,
    "message": string
  }
}
```

#### Heartbeat
```typescript
{
  "type": "ping",
  "payload": {}
}
```

### Server → Client Messages

#### Game State Update
```typescript
{
  "type": "game_update",
  "payload": {
    "gameId": string,
    "tableId": string,
    "gameState": {
      "phase": GamePhase,
      "pot": number,
      "currentBet": number,
      "activePlayer": string | null,
      "communityCards": Card[],
      "players": Array<{
        "id": string,
        "position": number,
        "chips": number,
        "bet": number,
        "isActive": boolean,
        "hasActed": boolean,
        "holeCards": Card[] | null    // Only visible to the player
      }>,
      "timeBank": {
        "activePlayer": string | null,
        "timeRemaining": number,      // Seconds
        "timeBankRemaining": number   // Seconds
      }
    }
  }
}
```

#### Player Action Broadcast
```typescript
{
  "type": "player_action",
  "payload": {
    "gameId": string,
    "playerId": string,
    "username": string,
    "action": string,
    "amount": number,
    "timeUsed": number,
    "timestamp": string
  }
}
```

#### Hand Complete
```typescript
{
  "type": "hand_complete",
  "payload": {
    "gameId": string,
    "handNumber": number,
    "winners": Array<{
      "playerId": string,
      "username": string,
      "amount": number,
      "handRanking": HandRanking,
      "winningCards": Card[]
    }>,
    "pot": number,
    "showdown": Array<{
      "playerId": string,
      "holeCards": Card[],
      "handRanking": HandRanking
    }>
  }
}
```

#### Chat Message
```typescript
{
  "type": "chat",
  "payload": {
    "tableId": string,
    "playerId": string,
    "username": string,
    "message": string,
    "isSystem": boolean,
    "timestamp": string
  }
}
```

#### Player Joined/Left
```typescript
{
  "type": "player_joined" | "player_left",
  "payload": {
    "tableId": string,
    "playerId": string,
    "username": string,
    "position": number,
    "chips": number,
    "timestamp": string
  }
}
```

#### Tournament Update
```typescript
{
  "type": "tournament_update",
  "payload": {
    "tournamentId": string,
    "status": TournamentStatus,
    "currentLevel": {
      "level": number,
      "smallBlind": number,
      "bigBlind": number,
      "timeRemaining": number
    },
    "playersRemaining": number,
    "prizePool": number,
    "playerPosition": number | null    // Current rank, null if eliminated
  }
}
```

#### Error
```typescript
{
  "type": "error",
  "payload": {
    "code": string,
    "message": string,
    "details"?: any
  }
}
```

#### Heartbeat Response
```typescript
{
  "type": "pong",
  "payload": {}
}
```

## Error Codes

### Authentication Errors
- `AUTH_REQUIRED`: Authentication required
- `TOKEN_EXPIRED`: Access token expired
- `TOKEN_INVALID`: Invalid token format or signature
- `REFRESH_TOKEN_INVALID`: Invalid refresh token

### Validation Errors
- `VALIDATION_ERROR`: Request validation failed
- `INVALID_GAME_ACTION`: Invalid action for current game state
- `INSUFFICIENT_CHIPS`: Not enough chips for action
- `OUT_OF_TURN`: Action attempted out of turn

### Game Errors
- `GAME_NOT_FOUND`: Game or table not found
- `GAME_FULL`: Table is full
- `GAME_ALREADY_STARTED`: Cannot join after game started
- `PLAYER_NOT_IN_GAME`: Player not participating in game

### Tournament Errors
- `TOURNAMENT_NOT_FOUND`: Tournament not found
- `TOURNAMENT_FULL`: Tournament registration full
- `TOURNAMENT_STARTED`: Cannot register after start
- `ALREADY_REGISTERED`: Player already registered

### Rate Limiting
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `ACTION_TOO_FAST`: Action submitted too quickly

## Rate Limits

- **Authentication**: 5 requests per minute per IP
- **API Endpoints**: 100 requests per minute per authenticated user
- **WebSocket Messages**: 10 messages per second per connection
- **Game Actions**: 1 action per 2 seconds per player

## Data Types

### GameType
```typescript
enum GameType {
  TEXAS_HOLDEM = 'TEXAS_HOLDEM',
  OMAHA = 'OMAHA',
  SEVEN_CARD_STUD = 'SEVEN_CARD_STUD'
}
```

### BettingStructure
```typescript
enum BettingStructure {
  NO_LIMIT = 'NO_LIMIT',
  LIMIT = 'LIMIT',
  POT_LIMIT = 'POT_LIMIT'
}
```

### GamePhase
```typescript
enum GamePhase {
  WAITING = 'WAITING',
  PRE_FLOP = 'PRE_FLOP',
  FLOP = 'FLOP',
  TURN = 'TURN',
  RIVER = 'RIVER',
  SHOWDOWN = 'SHOWDOWN',
  HAND_COMPLETE = 'HAND_COMPLETE'
}
```

### Card
```typescript
interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 'J' | 'Q' | 'K' | 'A';
}
```

### HandRanking
```typescript
interface HandRanking {
  rank: number;          // 1 (high card) to 10 (royal flush)
  name: string;          // Human-readable name
  cards: Card[];         // Cards that make the hand
  kickers: Card[];       // Kicker cards for tie-breaking
}
```

This API reference provides comprehensive documentation for integrating with the Primo Poker platform. For additional examples and SDKs, check the repository documentation.
