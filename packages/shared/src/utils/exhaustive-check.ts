/**
 * Utility for exhaustive type checking of discriminated unions
 * 
 * This function ensures that all cases of a discriminated union are handled.
 * TypeScript will give a compile-time error if any case is missed.
 * 
 * @example
 * ```typescript
 * function handleGamePhase(phase: GamePhase) {
 *   switch (phase) {
 *     case GamePhase.WAITING:
 *       return 'waiting';
 *     case GamePhase.PRE_FLOP:
 *       return 'pre-flop';
 *     // ... handle all other cases
 *     default:
 *       return assertNever(phase); // Compile error if any case is missed
 *   }
 * }
 * ```
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${value}`);
}

/**
 * Type guard for exhaustive checks that returns a boolean
 * Useful when you want to check exhaustiveness without throwing
 * 
 * @example
 * ```typescript
 * function isValidGamePhase(phase: string): phase is GamePhase {
 *   return Object.values(GamePhase).includes(phase as GamePhase);
 * }
 * ```
 */
export function isExhaustive<T>(value: T, _exhaustiveCheck: never): boolean {
  return false;
}

/**
 * Helper type to ensure all members of a union are handled
 * 
 * @example
 * ```typescript
 * type GamePhaseHandlers = ExhaustiveHandlers<GamePhase, string>;
 * // This will require an object with all GamePhase values as keys
 * ```
 */
export type ExhaustiveHandlers<T extends string | number | symbol, R> = {
  [K in T]: () => R;
};

/**
 * Function to handle discriminated unions with exhaustive type checking
 * 
 * @example
 * ```typescript
 * const result = exhaustiveHandle(gamePhase, {
 *   [GamePhase.WAITING]: () => 'Game is waiting',
 *   [GamePhase.PRE_FLOP]: () => 'Pre-flop betting',
 *   // ... must handle all cases
 * });
 * ```
 */
export function exhaustiveHandle<T extends string | number | symbol, R>(
  value: T,
  handlers: ExhaustiveHandlers<T, R>
): R {
  const handler = handlers[value];
  if (!handler) {
    throw new Error(`No handler found for value: ${String(value)}`);
  }
  return handler();
}

/**
 * Type guard for checking if a value is a member of an enum
 * 
 * @example
 * ```typescript
 * if (isEnumValue(GamePhase, someValue)) {
 *   // someValue is now typed as GamePhase
 * }
 * ```
 */
export function isEnumValue<T extends Record<string, string | number>>(
  enumObj: T,
  value: unknown
): value is T[keyof T] {
  return Object.values(enumObj).includes(value as T[keyof T]);
}

/**
 * Creates a type-safe matcher for discriminated unions
 * 
 * @example
 * ```typescript
 * const phaseMessage = createMatcher<GamePhase, string>()
 *   .case(GamePhase.WAITING, () => 'Waiting for players')
 *   .case(GamePhase.PRE_FLOP, () => 'Pre-flop betting')
 *   .case(GamePhase.FLOP, () => 'Flop cards dealt')
 *   .case(GamePhase.TURN, () => 'Turn card dealt')
 *   .case(GamePhase.RIVER, () => 'River card dealt')
 *   .case(GamePhase.SHOWDOWN, () => 'Showing cards')
 *   .case(GamePhase.FINISHED, () => 'Game finished')
 *   .exhaustive();
 * 
 * const message = phaseMessage(currentPhase);
 * ```
 */
export class Matcher<T extends string | number | symbol, R> {
  private handlers: Partial<ExhaustiveHandlers<T, R>> = {};

  case(value: T, handler: () => R): this {
    this.handlers[value] = handler;
    return this;
  }

  exhaustive(): (value: T) => R {
    return (value: T) => {
      const handler = this.handlers[value];
      if (!handler) {
        assertNever(value as never, `Unhandled case: ${String(value)}`);
      }
      return handler();
    };
  }

  withDefault(defaultHandler: () => R): (value: T) => R {
    return (value: T) => {
      const handler = this.handlers[value];
      return handler ? handler() : defaultHandler();
    };
  }
}

export function createMatcher<T extends string | number | symbol, R>(): Matcher<T, R> {
  return new Matcher<T, R>();
}