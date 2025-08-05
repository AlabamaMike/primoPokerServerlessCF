# Quick Fix Implementation Guide

## 1. WebSocket Message Format Fix

### In `game-table-do.ts`, update all broadcast methods:

```typescript
// BEFORE:
this.broadcast({
  type: 'game_update',
  data: gameState
});

// AFTER:
this.broadcast({
  type: 'game_update',
  payload: gameState,
  timestamp: Date.now()
});
```

### Create a message builder helper:

```typescript
private buildMessage(type: string, payload: any): WebSocketMessage {
  return {
    type,
    payload,
    timestamp: Date.now()
  };
}

// Usage:
this.broadcast(this.buildMessage('game_update', gameState));
```

## 2. Fix "Player Not at Table" Error

### In `game-table-do.ts`, update action handler:

```typescript
private async handlePlayerAction(ws: WebSocket, message: any) {
  const playerId = this.getPlayerIdFromWebSocket(ws);
  
  if (!playerId) {
    return this.sendError(ws, 'WebSocket not associated with player');
  }
  
  // Check both connections AND players map
  if (!this.state.players.has(playerId)) {
    return this.sendError(ws, 'Player not seated at table');
  }
  
  const player = this.state.players.get(playerId);
  if (!player || player.status !== 'active') {
    return this.sendError(ws, 'Player not active in game');
  }
  
  // Process action...
}

private getPlayerIdFromWebSocket(ws: WebSocket): string | null {
  for (const [playerId, conn] of this.state.connections.entries()) {
    if (conn.websocket === ws) {
      return playerId;
    }
  }
  return null;
}
```

## 3. Player Connection Sync

### Add connection tracking when WebSocket connects:

```typescript
// In handleWebSocketConnection
private handleWebSocketConnection(ws: WebSocket, playerId: string, username: string) {
  // Verify player has joined table via API
  if (!this.state.players.has(playerId)) {
    ws.close(1008, 'Must join table before connecting WebSocket');
    return;
  }
  
  // Add to connections
  this.state.connections.set(playerId, {
    websocket: ws,
    playerId,
    username,
    isConnected: true,
    lastHeartbeat: Date.now()
  });
  
  // Send current state
  this.sendToPlayer(playerId, this.buildMessage('table_state_update', {
    tableId: this.state.tableId,
    players: Array.from(this.state.players.values()),
    gameState: this.getCurrentGameState()
  }));
}
```

## 4. Consistent Game State Structure

### Create a game state builder:

```typescript
private getCurrentGameState(): GameStateDTO {
  const game = this.state.gameState;
  if (!game) {
    return {
      phase: 'waiting',
      players: this.getPlayersDTO(),
      pot: 0,
      currentBet: 0,
      communityCards: []
    };
  }
  
  return {
    phase: game.phase,
    pot: game.pot,
    currentBet: game.currentBet,
    currentPlayer: game.currentPlayerIndex >= 0 ? 
      this.getPlayerAtIndex(game.currentPlayerIndex)?.id : undefined,
    players: this.getPlayersDTO(),
    communityCards: game.communityCards || [],
    dealerId: this.getDealerId(),
    smallBlindId: this.getSmallBlindId(),
    bigBlindId: this.getBigBlindId()
  };
}

private getPlayersDTO(): PlayerStateDTO[] {
  return Array.from(this.state.players.values()).map(player => ({
    id: player.id,
    username: player.username,
    chipCount: player.chips,
    status: player.status,
    position: player.position,
    currentBet: player.currentBet || 0,
    isFolded: player.isFolded,
    isAllIn: player.chips === 0 && player.status === 'active',
    hasActed: player.hasActed
  }));
}
```

## 5. Start New Hand Automatically

### Add hand completion and restart logic:

```typescript
private async completeHand() {
  // 1. Determine winners (simplified)
  const activePlayers = Array.from(this.state.players.values())
    .filter(p => p.status === 'active' && !p.isFolded);
  
  if (activePlayers.length === 1) {
    // Last player wins
    const winner = activePlayers[0];
    winner.chips += this.state.gameState.pot;
    
    this.broadcast(this.buildMessage('hand_complete', {
      winners: [{
        playerId: winner.id,
        amount: this.state.gameState.pot
      }]
    }));
  }
  
  // 2. Reset for next hand
  this.state.handNumber++;
  this.moveButton();
  this.resetPlayerStates();
  
  // 3. Wait then start new hand
  setTimeout(() => {
    if (this.getActivePlayers().length >= 2) {
      this.startNewHand();
    } else {
      this.state.gameState = null;
      this.broadcast(this.buildMessage('waiting_for_players', {}));
    }
  }, 3000);
}

private moveButton() {
  const activePlayers = this.getActivePlayers();
  if (activePlayers.length < 2) return;
  
  const currentButtonIndex = activePlayers.findIndex(p => p.position === this.state.buttonPosition);
  const nextIndex = (currentButtonIndex + 1) % activePlayers.length;
  this.state.buttonPosition = activePlayers[nextIndex].position;
}
```

## Testing the Fixes

After implementing these fixes, test with:

```bash
# Run simple 2-player test first
npm test simple-game.spec.ts

# If that works, try 6-player test
npm test full-table.spec.ts -- --grep "6-player"

# Enable debug logging to see message flow
TEST_LOG_LEVEL=debug LOG_WS_MESSAGES=true npm test
```

## Validation Checklist

- [ ] WebSocket messages have consistent `payload` field
- [ ] Players can send actions without "not at table" errors  
- [ ] Game state includes full player information
- [ ] Button rotates after each hand
- [ ] New hands start automatically
- [ ] All tests pass