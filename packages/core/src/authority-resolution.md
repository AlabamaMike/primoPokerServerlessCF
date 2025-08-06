# Authority-Based Conflict Resolution

## Overview

The authority-based conflict resolution strategy resolves conflicts between simultaneous player actions based on role hierarchy and authority levels. This ensures that higher-privilege users (admins, dealers) can override regular player actions when necessary.

## Authority Hierarchy

Default authority levels:
- **Admin**: Authority Level 3 - Highest priority, can override all actions
- **Dealer**: Authority Level 2 - Can override regular player actions  
- **Player**: Authority Level 1 - Standard player actions

## Conflict Resolution Process

1. **Timestamp Grouping**: Actions are grouped by timestamp to identify conflicts
2. **Authority Comparison**: Within each timestamp group, actions are sorted by authority level
3. **Winner Selection**: The action with highest authority is kept, others are discarded
4. **Tiebreakers**: For equal authority:
   - Microsecond timestamps (if available)
   - Player ID alphabetical order

## Configuration

### Basic Usage

```typescript
const resolved = await synchronizer.resolveConflicts(
  actions,
  ConflictResolutionStrategy.AUTHORITY_BASED
)
```

### Custom Authority Rules

```typescript
const customRules: AuthorityRules = {
  // Custom authority levels
  roleAuthority: {
    [PlayerRole.ADMIN]: 10,
    [PlayerRole.DEALER]: 5,
    [PlayerRole.PLAYER]: 1
  },
  
  // Disable timestamp tiebreaker
  useTimestampTiebreaker: false,
  
  // Custom resolver function
  customResolver: (action1, action2) => {
    // Implement custom logic
    return action1.amount > action2.amount ? action1 : action2
  }
}

const resolved = await synchronizer.resolveConflicts(
  actions,
  ConflictResolutionStrategy.AUTHORITY_BASED,
  { authorityRules: customRules }
)
```

## Player Action Records

Actions can specify authority in two ways:

1. **Role-based**: Set the `playerRole` field
```typescript
{
  playerId: 'admin1',
  action: 'bet',
  playerRole: PlayerRole.ADMIN,
  timestamp: 1000
}
```

2. **Explicit authority**: Set the `authorityLevel` field
```typescript
{
  playerId: 'player1',
  action: 'bet',
  authorityLevel: 10, // Overrides role-based authority
  timestamp: 1000
}
```

## Out-of-Turn Actions

The conflict detection system recognizes that admins can act out of turn:
- Regular players acting out of turn are flagged as conflicts
- Admins (or users with admin-level authority) can override turn order

## Examples

### Basic Authority Resolution
```typescript
// Three players act simultaneously
const actions = [
  { playerId: 'player1', action: 'bet', timestamp: 1000, playerRole: PlayerRole.PLAYER },
  { playerId: 'dealer1', action: 'bet', timestamp: 1000, playerRole: PlayerRole.DEALER },
  { playerId: 'admin1', action: 'bet', timestamp: 1000, playerRole: PlayerRole.ADMIN }
]

// Admin action wins due to highest authority
const resolved = await synchronizer.resolveConflicts(actions, ConflictResolutionStrategy.AUTHORITY_BASED)
// Result: [{ playerId: 'admin1', ... }]
```

### Custom Resolver
```typescript
// Use amount-based resolution instead of role-based
const customRules = {
  customResolver: (a1, a2) => a1.amount > a2.amount ? a1 : a2
}

const actions = [
  { playerId: 'admin1', action: 'bet', amount: 100, timestamp: 1000, playerRole: PlayerRole.ADMIN },
  { playerId: 'player1', action: 'bet', amount: 500, timestamp: 1000, playerRole: PlayerRole.PLAYER }
]

// Player wins due to higher amount
const resolved = await synchronizer.resolveConflicts(
  actions, 
  ConflictResolutionStrategy.AUTHORITY_BASED,
  { authorityRules: customRules }
)
// Result: [{ playerId: 'player1', amount: 500, ... }]
```