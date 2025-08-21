import { GamePhase } from '@primo-poker/shared';
import { assertNever, createMatcher, exhaustiveHandle } from '@primo-poker/shared';

/**
 * Example of exhaustive game phase handling using assertNever
 */
export function getPhaseDescription(phase: GamePhase): string {
  switch (phase) {
    case GamePhase.WAITING:
      return 'Waiting for players to join';
    case GamePhase.PRE_FLOP:
      return 'Initial betting round before community cards';
    case GamePhase.FLOP:
      return 'First three community cards dealt';
    case GamePhase.TURN:
      return 'Fourth community card dealt';
    case GamePhase.RIVER:
      return 'Final community card dealt';
    case GamePhase.SHOWDOWN:
      return 'Players reveal their cards';
    case GamePhase.FINISHED:
      return 'Game has ended';
    default:
      // TypeScript will error if any GamePhase is not handled above
      return assertNever(phase);
  }
}

/**
 * Example using exhaustiveHandle helper
 */
export function getNextPhase(currentPhase: GamePhase): GamePhase | null {
  return exhaustiveHandle(currentPhase, {
    [GamePhase.WAITING]: () => GamePhase.PRE_FLOP,
    [GamePhase.PRE_FLOP]: () => GamePhase.FLOP,
    [GamePhase.FLOP]: () => GamePhase.TURN,
    [GamePhase.TURN]: () => GamePhase.RIVER,
    [GamePhase.RIVER]: () => GamePhase.SHOWDOWN,
    [GamePhase.SHOWDOWN]: () => GamePhase.FINISHED,
    [GamePhase.FINISHED]: () => null,
  });
}

/**
 * Example using the Matcher pattern
 */
export const phaseActionValidator = createMatcher<GamePhase, string[]>()
  .case(GamePhase.WAITING, () => [])
  .case(GamePhase.PRE_FLOP, () => ['bet', 'call', 'raise', 'fold', 'check', 'all_in'])
  .case(GamePhase.FLOP, () => ['bet', 'call', 'raise', 'fold', 'check', 'all_in'])
  .case(GamePhase.TURN, () => ['bet', 'call', 'raise', 'fold', 'check', 'all_in'])
  .case(GamePhase.RIVER, () => ['bet', 'call', 'raise', 'fold', 'check', 'all_in'])
  .case(GamePhase.SHOWDOWN, () => [])
  .case(GamePhase.FINISHED, () => [])
  .exhaustive();

export function getAllowedActions(phase: GamePhase): string[] {
  return phaseActionValidator(phase);
}

/**
 * Example of handling with a runtime check for unknown values
 */
export function safeGetPhaseDescription(phase: string): string {
  // First check if it's a valid GamePhase
  if (!Object.values(GamePhase).includes(phase as GamePhase)) {
    return `Unknown phase: ${phase}`;
  }
  
  // Now TypeScript knows phase is a GamePhase
  return getPhaseDescription(phase as GamePhase);
}