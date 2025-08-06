# [BUG] Button Rotation Logic Fails in 6+ Player Games

## Bug Description

The `findNextDealerIndex` method in `game-table-do.ts` has critical flaws that cause incorrect dealer assignment in multiplayer games, particularly with disconnected players.

## Current Behavior

- Button can be assigned to disconnected/inactive players
- No validation for minimum active players
- Incorrect rotation when players disconnect mid-game
- Game can get stuck when button is on invalid seat

## Expected Behavior

- Button should only rotate among active, connected players
- Proper validation for minimum player count
- Graceful handling of disconnections
- Consistent clockwise rotation

## Impact

- Games become unplayable when button lands on disconnected player
- Incorrect blinds assignment
- Player frustration and abandonment
- Critical for 6+ player games

## Root Cause

Current implementation doesn't properly filter for active players:
```typescript
// Current flawed logic
private findNextDealerIndex(players: GameTablePlayer[]): number {
  // Missing validation for player status
  // No handling of disconnected players
}
```

## Proposed Solution

```typescript
private findNextDealerIndex(players: GameTablePlayer[]): number {
  const activePlayers = players
    .map((p, i) => ({ player: p, index: i }))
    .filter(({ player }) => 
      player.status === PlayerStatus.ACTIVE && 
      !player.isDisconnected
    );
  
  if (activePlayers.length < 2) {
    throw new InsufficientPlayersError();
  }
  
  const currentButtonPlayer = activePlayers.find(
    ({ player }) => player.position?.seat === this.state.buttonPosition
  );
  
  if (!currentButtonPlayer) {
    return activePlayers[0].index;
  }
  
  const currentIndex = activePlayers.indexOf(currentButtonPlayer);
  return activePlayers[(currentIndex + 1) % activePlayers.length].index;
}
```

## Files Affected

- `packages/persistence/src/durable-objects/game-table-do.ts`
- Related test files

## Priority

**Critical** - Blocking multiplayer stability

## Labels

- bug
- phase-1
- game-logic
- multiplayer
- critical

## Milestone

Phase 1: Core Platform Stability