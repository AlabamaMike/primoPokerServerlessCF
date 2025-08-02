# Phase 3: Stand Up Functionality

## Overview
Implement the ability for seated players to "stand up" from the table, returning their chips to their bankroll and transitioning back to spectator mode.

## Current State
- Players can join tables and sit down
- No way to leave seat without disconnecting
- Chips are locked at the table

## Target Features
1. **Stand Up Button**
   - Visible only to seated players
   - Disabled during active hands
   - Confirmation dialog for chip return

2. **Chip Management**
   - Return chips to player's bankroll
   - Track bankroll separately from table chips
   - Update wallet/bankroll display

3. **State Transitions**
   - Seated Player → Spectator
   - Maintain WebSocket connection
   - Clear seat immediately
   - Preserve chat/history access

## Implementation Tasks

### 1. UI Component - Stand Up Button
**File**: `apps/poker-frontend/src/app/game/[tableId]/client-page.tsx`

Add stand up button in player controls:
```typescript
{playerSeat !== null && !isSpectating && (
  <div className="bg-[#2d2d2d] rounded-lg p-4 border border-[#3d3d3d]">
    <div className="flex justify-between items-center">
      <div className="text-gray-400">
        Player controls will appear here when it's your turn
      </div>
      <button
        onClick={handleStandUp}
        disabled={isInActiveHand}
        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white rounded"
      >
        Stand Up
      </button>
    </div>
  </div>
)}
```

### 2. Backend Stand Up Handler
**File**: `packages/persistence/src/game-table-do.ts`

```typescript
private async handleStandUp(websocket: WebSocket, payload: any): Promise<void> {
  const { playerId } = payload
  const player = this.state.players.get(playerId)
  
  if (!player) {
    return this.sendError(websocket, 'Player not at table')
  }
  
  // Check if player is in active hand
  if (this.isPlayerInActiveHand(playerId)) {
    return this.sendError(websocket, 'Cannot stand up during active hand')
  }
  
  // Get player's current chips
  const chipCount = player.chips
  
  // Remove player from table
  this.state.players.delete(playerId)
  
  // Add back as spectator
  this.state.spectators.set(playerId, {
    id: playerId,
    username: player.username,
    joinedAt: Date.now()
  })
  
  // Send confirmation with chip count
  this.send(websocket, 'stand_up_success', {
    chipCount,
    returnedToBankroll: true
  })
  
  // Broadcast table update
  await this.broadcastTableState()
  
  // Broadcast spectator update
  await this.broadcastMessage({
    type: 'player_stood_up',
    data: {
      playerId,
      username: player.username,
      seatIndex: player.position.seat
    }
  })
}
```

### 3. Bankroll Integration
**File**: `apps/poker-frontend/src/stores/auth-store.ts` (or new bankroll store)

```typescript
interface BankrollState {
  balance: number
  updateBalance: (amount: number) => void
  addChips: (amount: number) => void
  removeChips: (amount: number) => void
}

// In stand up success handler
const handleStandUpSuccess = (chipCount: number) => {
  bankrollStore.addChips(chipCount)
  gameStore.setPlayerSeat(null)
  gameStore.setSpectatorMode(true)
}
```

### 4. Stand Up Confirmation Modal
**File**: `apps/poker-frontend/src/components/StandUpModal.tsx`

```typescript
interface StandUpModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  chipCount: number
}

export function StandUpModal({ isOpen, onClose, onConfirm, chipCount }: StandUpModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2>Stand Up from Table?</h2>
      <p>Your ${chipCount} in chips will be returned to your bankroll.</p>
      <div className="flex gap-3">
        <button onClick={onClose}>Cancel</button>
        <button onClick={onConfirm} className="bg-orange-600">
          Stand Up
        </button>
      </div>
    </Modal>
  )
}
```

### 5. Active Hand Detection
Add helper to check if player is in active hand:
```typescript
private isPlayerInActiveHand(playerId: string): boolean {
  if (!this.state.game || this.state.game.phase === GamePhase.WAITING) {
    return false
  }
  
  const player = this.state.players.get(playerId)
  return player && !player.isFolded && this.state.game.phase !== GamePhase.SHOWDOWN
}
```

## State Management Updates
1. Track whether player is in active hand
2. Update spectator count when player stands up
3. Clear player's seat reference
4. Update bankroll balance

## Testing Scenarios
- [ ] Stand up between hands
- [ ] Cannot stand up during active hand
- [ ] Chips returned to bankroll
- [ ] Transition to spectator mode
- [ ] Seat becomes available immediately
- [ ] Other players see update
- [ ] Can sit back down with new buy-in

## Edge Cases
1. Player disconnection while standing up
2. Game ending while stand up in progress
3. Table dissolution with standing players
4. Concurrent stand up requests

## Success Metrics
- Clean transition from player to spectator
- No chip loss during stand up
- Clear UI feedback
- Proper state synchronization