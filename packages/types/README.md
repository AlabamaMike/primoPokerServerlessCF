# @primo-poker/types

Centralized TypeScript types for the Primo Poker application.

## Overview

This package provides a single source of truth for all shared types, interfaces, enums, and schemas used across the frontend and backend applications.

## Structure

- `domain/` - Core domain types (game, player, table, tournament, events, errors)
- `api/` - API request/response types and authentication
- `websocket/` - WebSocket message types and events
- `persistence/` - Database and wallet types
- `security/` - Authentication and security types
- `core/` - Core game mechanics types
- `utils/` - Validation and helper types

## Usage

```typescript
import { 
  Player, 
  GameState, 
  PlayerAction,
  ApiResponse 
} from '@primo-poker/types';
```

## Benefits

- Single source of truth for types
- Better type safety across packages
- Reduced duplication
- Easier maintenance
- Clear separation of concerns