# Poker Application - User Journey Implementation Plan

## Overview
This document outlines the implementation plan to complete the end-to-end user journey for the multiplayer poker application.

## Current State Analysis

### ✅ Fully Implemented
- User authentication (login/register)
- Lobby with table listing and filtering
- Table creation
- Core game engine
- WebSocket infrastructure
- JWT security

### 🟡 Partially Implemented
- Spectator mode (backend exists, not integrated)
- Seat management (API exists, flow incomplete)
- Wallet system (backend exists, no frontend)

### ❌ Missing
- Automatic spectator mode on table join
- Seamless spectator → player transitions
- Stand up functionality
- Wallet frontend integration
- State transition WebSocket messages

## Implementation Phases

### Phase 1: Automatic Spectator Mode (2-3 days)
**Goal**: Users automatically join tables as spectators

1. **Backend Changes**:
   - Modify `handleJoinTable` in GameTableDO to support spectator mode
   - Add `spectator_joined` WebSocket message type
   - Track spectators separately from players in table state

2. **Frontend Changes**:
   - Update `MultiplayerGameClient` to handle spectator state on mount
   - Remove automatic join modal, default to spectator view
   - Add spectator count display

3. **WebSocket Messages**:
   ```typescript
   // New message types
   { type: 'spectator_joined', payload: { spectatorId, username } }
   { type: 'spectator_left', payload: { spectatorId } }
   { type: 'spectator_count', payload: { count } }
   ```

### Phase 2: Spectator UI with Seat Selection (3-4 days)
**Goal**: Spectators can click empty seats to sit down

1. **UI Components**:
   - Add click handlers to empty seats in spectator mode
   - Show seat numbers and "Click to Sit" on hover
   - Display current spectator count
   - Add educational overlays (hand rankings, bet sizes)

2. **State Management**:
   - Track which seats are available in real-time
   - Update seat availability via WebSocket
   - Handle seat reservation during buy-in process

3. **Integration**:
   - Connect seat click → GetChipsModal → join table flow
   - Prevent race conditions for seat selection

### Phase 3: Stand Up Functionality (2 days)
**Goal**: Players can stand up and return to spectator mode

1. **Backend**:
   - Add `stand_up` WebSocket message handler
   - Return chips to player's wallet
   - Convert player to spectator
   - Free up the seat

2. **Frontend**:
   - Add "Stand Up" button for seated players
   - Confirm dialog with chip count
   - Smooth transition animation
   - Update UI to spectator mode

3. **WebSocket Messages**:
   ```typescript
   { type: 'stand_up', payload: { playerId, chipCount } }
   { type: 'player_stood_up', payload: { playerId, seatNumber, chipsReturned } }
   ```

### Phase 4: Wallet/Bankroll Integration (3-4 days)
**Goal**: Complete wallet system with persistent storage

1. **Backend Storage**:
   - Create D1 schema for wallets
   - Implement wallet CRUD operations
   - Add transaction history tracking
   - Handle concurrent balance updates

2. **Frontend Components**:
   - Wallet balance display in header
   - Transaction history modal
   - Buy-in with wallet balance check
   - Cash out confirmation

3. **API Endpoints**:
   ```typescript
   GET /api/wallet/balance
   POST /api/wallet/deposit
   POST /api/wallet/withdraw
   GET /api/wallet/transactions
   ```

### Phase 5: WebSocket State Transitions (2 days)
**Goal**: Real-time updates for all state changes

1. **Message Types**:
   - Seat availability updates
   - Wallet balance changes
   - Player state transitions
   - Table state synchronization

2. **Frontend Handlers**:
   - Update local state on WebSocket messages
   - Handle disconnection/reconnection
   - Sync state after reconnect

### Phase 6: E2E Testing (2-3 days)
**Goal**: Comprehensive tests for complete user journey

1. **Test Scenarios**:
   - Register → Login → View Lobby
   - Create Table → Join as Spectator
   - Select Seat → Buy In → Play Hand
   - Stand Up → Return to Spectator
   - Leave Table → Return to Lobby

2. **Edge Cases**:
   - Simultaneous seat selection
   - Disconnection during buy-in
   - Insufficient wallet balance
   - Table full scenarios

## Technical Considerations
- E2E tests must be completed against production endpoints through browser tests 

### State Management
- Use single source of truth for table state
- Implement optimistic updates with rollback
- Handle WebSocket message ordering

### Security
- Validate all seat selections server-side
- Prevent wallet manipulation
- Rate limit seat selection attempts

### Performance
- Debounce seat hover effects
- Lazy load spectator features
- Optimize WebSocket message frequency

## Success Metrics
- Complete user journey without page refreshes
- < 100ms response time for seat selection
- Zero race conditions in seat allocation
- 100% E2E test coverage for user journey

## Timeline
- **Total Duration**: 15-20 days
- **Phase 1-3**: Core functionality (7-9 days)
- **Phase 4-5**: Integration (5-6 days)
- **Phase 6**: Testing (2-3 days)

## Next Steps
1. Start with Phase 1 (automatic spectator mode)
2. Deploy and test each phase incrementally
3. Gather user feedback after Phase 3
4. Adjust timeline based on discoveries