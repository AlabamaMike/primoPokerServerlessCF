# Phase 1: Automatic Spectator Mode Implementation

## Overview
Transform the table join experience so users automatically enter as spectators, creating a more natural flow for observing games before participating.

## Current Behavior
- Users join table and immediately see join modal
- No clear distinction between spectators and players
- WebSocket connection assumes player intent

## Target Behavior
- Users enter table as spectators by default
- Clear visual indication of spectator status
- Smooth transition to player when ready

## Implementation Tasks

### 1. Backend: Spectator WebSocket Messages

**File**: `packages/persistence/src/game-table-do.ts`

Add new message handlers:
```typescript
case 'spectate_table':
  await this.handleSpectateTable(websocket, payload)
  break

private async handleSpectateTable(websocket: WebSocket, payload: any): Promise<void> {
  const { userId, username } = payload
  
  // Add to spectators map
  this.state.spectators.set(userId, {
    id: userId,
    username,
    websocket,
    joinedAt: Date.now()
  })
  
  // Send current table state
  this.send(websocket, 'spectator_joined', {
    tableState: this.getTableState(),
    spectatorCount: this.state.spectators.size
  })
  
  // Broadcast spectator count update
  this.broadcast('spectator_count_update', {
    count: this.state.spectators.size
  })
}
```

### 2. Frontend: Auto-Spectator on Mount

**File**: `apps/poker-frontend/src/app/game/[tableId]/client-page.tsx`

Update component mount behavior:
```typescript
useEffect(() => {
  if (isConnected && tableInfo && !playerSeat) {
    // Automatically join as spectator
    gameWebSocket.send('spectate_table', {
      userId: user?.id || `guest-${Date.now()}`,
      username: user?.username || 'Guest'
    })
    setIsSpectating(true)
  }
}, [isConnected, tableInfo, playerSeat])
```

### 3. State Management Updates

**File**: `packages/persistence/src/game-table-do.ts`

Add spectator tracking to state:
```typescript
interface GameTableState {
  // ... existing fields
  spectators: Map<string, {
    id: string
    username: string
    websocket: WebSocket
    joinedAt: number
  }>
}
```

### 4. UI Updates for Spectator Mode

**File**: `apps/poker-frontend/src/components/poker/PokerTable.tsx`

Add spectator indicators:
```typescript
// Show spectator count
{isSpectating && (
  <div className="absolute top-4 right-4 bg-black/70 px-3 py-1 rounded">
    <span className="text-sm text-gray-300">
      👁 {spectatorCount} watching
    </span>
  </div>
)}

// Highlight available seats
{seats.map((seat, index) => (
  <SeatComponent
    key={index}
    seat={seat}
    isClickable={isSpectating && !seat.player}
    onClick={() => isSpectating && !seat.player && onSeatClick(index)}
  />
))}
```

### 5. WebSocket Connection Updates

**File**: `apps/poker-frontend/src/hooks/useWebSocket.ts`

Add spectator message handlers:
```typescript
client.on('spectator_joined', (message) => {
  console.log('Joined as spectator:', message.data)
  gameStore.setSpectatorMode(true)
  gameStore.updateTableState(message.data.tableState)
})

client.on('spectator_count_update', (message) => {
  gameStore.setSpectatorCount(message.data.count)
})
```

## Testing Plan

### Manual Testing
1. Navigate to table URL
2. Verify automatic spectator mode
3. Check spectator count updates
4. Test seat selection flow
5. Verify other spectators see updates

### E2E Test
```typescript
test('User joins table as spectator by default', async ({ page }) => {
  // Login and navigate to table
  await loginUser(page)
  await page.goto('/game/test-table-id')
  
  // Verify spectator mode
  await expect(page.locator('[data-testid="spectator-indicator"]')).toBeVisible()
  await expect(page.locator('[data-testid="join-modal"]')).not.toBeVisible()
  
  // Verify can click empty seats
  const emptySeat = page.locator('[data-testid="empty-seat-0"]')
  await expect(emptySeat).toHaveClass(/clickable/)
})
```

## Migration Notes
- No database changes required
- Backward compatible with existing tables
- Spectator state is ephemeral (not persisted)

## Success Criteria
- [ ] Users enter tables as spectators without modal
- [ ] Spectator count visible and updates real-time
- [ ] Empty seats are clearly clickable
- [ ] No disruption to existing game flow
- [ ] WebSocket messages properly handled

## Rollback Plan
If issues arise:
1. Revert frontend auto-spectator behavior
2. Keep backend spectator support (harmless)
3. Monitor WebSocket connection stability