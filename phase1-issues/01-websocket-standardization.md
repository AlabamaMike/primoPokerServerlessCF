# [BUG] WebSocket Message Format Inconsistency Causing Client Errors

## Bug Description

The codebase has two competing WebSocket message formats that are causing client-side parsing errors and state desynchronization in multiplayer games.

## Current Behavior

Two different message formats exist:
```typescript
// Format 1: websocket.ts uses direct payload
{
  type: 'game_update',
  payload: GameState,
  timestamp: string
}

// Format 2: game-table-do.ts uses data field
{
  type: 'game_update',
  data: GameState,
  timestamp: number
}
```

## Expected Behavior

A single, standardized message format should be used throughout the codebase with proper versioning support.

## Impact

- Client-side parsing errors
- Lost messages during gameplay
- State desynchronization between players
- Unpredictable game behavior

## Steps to Reproduce

1. Start a multiplayer game with 3+ players
2. Monitor WebSocket messages in browser DevTools
3. Observe inconsistent message formats causing parsing errors

## Proposed Solution

Implement unified message format:
```typescript
interface StandardWebSocketMessage {
  id: string;           // Unique message ID
  version: number;      // Protocol version
  type: string;         // Message type
  payload: any;         // Message data
  timestamp: number;    // Unix timestamp
  sequenceId: number;   // For ordering
  requiresAck?: boolean;
  correlationId?: string; // For request/response pairing
}
```

## Files Affected

- `packages/api/src/websocket.ts`
- `packages/persistence/src/durable-objects/game-table-do.ts`
- `packages/api/src/websocket-manager.ts`
- Client-side message handlers

## Priority

**Critical** - This is blocking stable multiplayer gameplay

## Labels

- bug
- phase-1
- websocket
- multiplayer
- critical

## Milestone

Phase 1: Core Platform Stability