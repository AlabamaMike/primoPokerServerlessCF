# Phase 2: Spectator UI with Seat Selection

## Overview
Enhance the spectator experience with better seat visualization and a smooth transition to becoming a player.

## Current State (from Phase 1)
- Users automatically join as spectators
- Empty seats are clickable with hover effects
- Basic "Click to Join" indication on seats

## Target Features
1. **Enhanced Seat Visualization**
   - Show min/max buy-in requirements on hover
   - Indicate preferred seating positions
   - Show seat statistics (hot/cold seat indicator)

2. **Seat Reservation System**
   - Temporary seat reservation while getting chips
   - Timeout if user doesn't complete buy-in
   - Visual feedback for reserved seats

3. **Improved Buy-in Flow**
   - Show wallet balance in chip modal
   - Quick buy-in presets (min, 2x, max)
   - Seamless transition from spectator to player

## Implementation Tasks

### 1. Enhanced Seat Component
**File**: `apps/poker-frontend/src/components/poker/PlayerSeat.tsx`

Add enhanced empty seat UI:
```typescript
// Enhanced empty seat for spectators
{isSpectating && onSeatClick && (
  <motion.button
    className="relative group"
    onMouseEnter={() => setShowSeatInfo(true)}
    onMouseLeave={() => setShowSeatInfo(false)}
  >
    {/* Seat info tooltip */}
    {showSeatInfo && (
      <div className="absolute bottom-full mb-2 bg-black/90 p-2 rounded">
        <div className="text-xs">
          <div>Buy-in: ${minBuyIn} - ${maxBuyIn}</div>
          <div>Position: {getPositionName(position)}</div>
        </div>
      </div>
    )}
  </motion.button>
)}
```

### 2. Seat Reservation Backend
**File**: `packages/persistence/src/game-table-do.ts`

Add seat reservation tracking:
```typescript
interface SeatReservation {
  playerId: string
  seatIndex: number
  reservedAt: number
  expiresAt: number
}

// Add to state
seatReservations: Map<number, SeatReservation>

// Add handler
private async handleReserveSeat(websocket: WebSocket, payload: any): Promise<void> {
  const { playerId, seatIndex } = payload
  
  // Check if seat is available
  if (this.isSeatOccupied(seatIndex) || this.state.seatReservations.has(seatIndex)) {
    return this.send(websocket, 'seat_unavailable', { seatIndex })
  }
  
  // Reserve seat
  this.state.seatReservations.set(seatIndex, {
    playerId,
    seatIndex,
    reservedAt: Date.now(),
    expiresAt: Date.now() + 60000 // 60 second reservation
  })
  
  // Notify all
  this.broadcastMessage({
    type: 'seat_reserved',
    data: { seatIndex, playerId }
  })
}
```

### 3. Enhanced GetChipsModal
**File**: `apps/poker-frontend/src/components/GetChipsModal.tsx`

Add quick buy-in options and wallet integration:
```typescript
const QuickBuyInOptions = ({ min, max, balance, onSelect }) => {
  const options = [
    { label: 'Min Buy-in', value: min },
    { label: '2x Min', value: min * 2 },
    { label: 'Max Buy-in', value: max }
  ].filter(opt => opt.value <= balance)
  
  return (
    <div className="grid grid-cols-3 gap-2 mb-4">
      {options.map(opt => (
        <button
          key={opt.label}
          onClick={() => onSelect(opt.value)}
          className="p-2 bg-gray-700 hover:bg-gray-600 rounded"
        >
          <div className="text-xs">{opt.label}</div>
          <div className="font-bold">${opt.value}</div>
        </button>
      ))}
    </div>
  )
}
```

### 4. Visual Feedback Updates
**File**: `apps/poker-frontend/src/components/poker/PokerTable.tsx`

Show reserved seats differently:
```typescript
// In seat rendering
const isReserved = reservedSeats.includes(index)
const isMyReservation = reservedSeats[index]?.playerId === currentUserId

<PlayerSeat
  isReserved={isReserved}
  isMyReservation={isMyReservation}
  reservationExpiry={reservedSeats[index]?.expiresAt}
/>
```

## Testing Checklist
- [ ] Seat hover shows buy-in requirements
- [ ] Seat reservation works correctly
- [ ] Reserved seats show visual indicator
- [ ] Reservation expires after timeout
- [ ] Quick buy-in options work
- [ ] Smooth transition from spectator to player
- [ ] Multiple spectators can't reserve same seat

## Success Metrics
- Reduced time from spectator to seated player
- Clear visual feedback at each step
- No race conditions for seat selection
- Intuitive UX for new players