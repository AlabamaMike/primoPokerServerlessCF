# Exhaustive Type Checking Guide

This guide explains how to use the exhaustive type checking utilities to ensure all cases of discriminated unions are handled in the codebase.

## Overview

Exhaustive type checking ensures that all possible values of a discriminated union (like enums or union types) are handled in your code. TypeScript will give compile-time errors if any case is missed, preventing runtime errors.

## Available Utilities

### 1. `assertNever`

The most basic exhaustive checking utility. Use in the default case of switch statements.

```typescript
import { assertNever } from '@primo-poker/shared';

function handleGamePhase(phase: GamePhase): string {
  switch (phase) {
    case GamePhase.WAITING:
      return 'waiting';
    case GamePhase.PRE_FLOP:
      return 'pre-flop';
    // ... handle all other cases
    default:
      // TypeScript error if any GamePhase is not handled
      return assertNever(phase);
  }
}
```

### 2. `exhaustiveHandle`

A functional approach to exhaustive handling with an object of handlers.

```typescript
import { exhaustiveHandle, ExhaustiveHandlers } from '@primo-poker/shared';

const handlers: ExhaustiveHandlers<PlayerAction, string> = {
  [PlayerAction.FOLD]: () => 'Player folded',
  [PlayerAction.CHECK]: () => 'Player checked',
  [PlayerAction.CALL]: () => 'Player called',
  [PlayerAction.BET]: () => 'Player bet',
  [PlayerAction.RAISE]: () => 'Player raised',
  [PlayerAction.ALL_IN]: () => 'Player went all-in',
};

const message = exhaustiveHandle(action, handlers);
```

### 3. `createMatcher`

A fluent API for building exhaustive matchers.

```typescript
import { createMatcher } from '@primo-poker/shared';

const getPhaseMessage = createMatcher<GamePhase, string>()
  .case(GamePhase.WAITING, () => 'Waiting for players')
  .case(GamePhase.PRE_FLOP, () => 'Pre-flop betting')
  .case(GamePhase.FLOP, () => 'Flop cards dealt')
  .case(GamePhase.TURN, () => 'Turn card dealt')
  .case(GamePhase.RIVER, () => 'River card dealt')
  .case(GamePhase.SHOWDOWN, () => 'Showing cards')
  .case(GamePhase.FINISHED, () => 'Game finished')
  .exhaustive();

const message = getPhaseMessage(currentPhase);
```

With default handler:

```typescript
const matcher = createMatcher<GamePhase, string>()
  .case(GamePhase.WAITING, () => 'Waiting')
  .case(GamePhase.PRE_FLOP, () => 'Playing')
  .withDefault(() => 'Other phase');
```

### 4. `isEnumValue`

Type guard for checking if a value belongs to an enum.

```typescript
import { isEnumValue } from '@primo-poker/shared';

function handleUnknownAction(value: unknown) {
  if (isEnumValue(PlayerAction, value)) {
    // value is now typed as PlayerAction
    return processAction(value);
  }
  throw new Error(`Invalid action: ${value}`);
}
```

## Benefits

1. **Compile-time Safety**: TypeScript errors if you miss a case
2. **Maintainability**: When adding new enum values, TypeScript shows all places that need updating
3. **Documentation**: Switch statements clearly show all possible cases
4. **Runtime Safety**: Prevents "impossible" states from causing crashes

## Migration Guide

### Before (without exhaustive checking):

```typescript
switch (action) {
  case 'fold':
    player.isFolded = true;
    break;
  case 'check':
    // handle check
    break;
  // Missing cases could cause silent failures
}
```

### After (with exhaustive checking):

```typescript
switch (action) {
  case PlayerAction.FOLD:
    player.isFolded = true;
    break;
  case PlayerAction.CHECK:
    // handle check
    break;
  case PlayerAction.CALL:
    // handle call
    break;
  case PlayerAction.BET:
    // handle bet
    break;
  case PlayerAction.RAISE:
    // handle raise
    break;
  case PlayerAction.ALL_IN:
    // handle all-in
    break;
  default:
    assertNever(action); // Compile error if any case is missed
}
```

## Best Practices

1. **Always use exhaustive checking** for discriminated unions in critical paths
2. **Prefer enums over string unions** for better type safety
3. **Use `assertNever` in default cases** to catch missing implementations
4. **Consider using matchers** for functional-style code
5. **Add unit tests** to verify all cases are handled correctly

## Common Patterns

### API Response Handling

```typescript
type ApiResponse = 
  | { type: 'success'; data: any }
  | { type: 'error'; message: string }
  | { type: 'loading' };

const renderResponse = createMatcher<ApiResponse['type'], JSX.Element>()
  .case('success', () => <SuccessView />)
  .case('error', () => <ErrorView />)
  .case('loading', () => <LoadingSpinner />)
  .exhaustive();
```

### State Machines

```typescript
function getNextState(current: GamePhase): GamePhase {
  return exhaustiveHandle(current, {
    [GamePhase.WAITING]: () => GamePhase.PRE_FLOP,
    [GamePhase.PRE_FLOP]: () => GamePhase.FLOP,
    [GamePhase.FLOP]: () => GamePhase.TURN,
    [GamePhase.TURN]: () => GamePhase.RIVER,
    [GamePhase.RIVER]: () => GamePhase.SHOWDOWN,
    [GamePhase.SHOWDOWN]: () => GamePhase.FINISHED,
    [GamePhase.FINISHED]: () => GamePhase.WAITING,
  });
}
```

## TypeScript Configuration

Ensure your `tsconfig.json` has strict mode enabled:

```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true
  }
}
```

This ensures TypeScript properly checks for exhaustiveness in your code.