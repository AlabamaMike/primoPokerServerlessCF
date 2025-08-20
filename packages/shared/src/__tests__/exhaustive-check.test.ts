import { 
  assertNever, 
  exhaustiveHandle, 
  isEnumValue, 
  createMatcher,
  ExhaustiveHandlers 
} from '../utils/exhaustive-check';
import { GamePhase, PlayerAction } from '../types';

describe('Exhaustive Type Checking', () => {
  describe('assertNever', () => {
    it('should throw an error when called', () => {
      expect(() => assertNever('unexpected' as never)).toThrow('Unexpected value: unexpected');
    });

    it('should throw custom message when provided', () => {
      expect(() => assertNever('test' as never, 'Custom error')).toThrow('Custom error');
    });

    it('should ensure exhaustive handling in switch statements', () => {
      function handleGamePhase(phase: GamePhase): string {
        switch (phase) {
          case GamePhase.WAITING:
            return 'waiting';
          case GamePhase.PRE_FLOP:
            return 'pre-flop';
          case GamePhase.FLOP:
            return 'flop';
          case GamePhase.TURN:
            return 'turn';
          case GamePhase.RIVER:
            return 'river';
          case GamePhase.SHOWDOWN:
            return 'showdown';
          case GamePhase.FINISHED:
            return 'finished';
          default:
            return assertNever(phase);
        }
      }

      // Test all phases are handled
      expect(handleGamePhase(GamePhase.WAITING)).toBe('waiting');
      expect(handleGamePhase(GamePhase.PRE_FLOP)).toBe('pre-flop');
      expect(handleGamePhase(GamePhase.FLOP)).toBe('flop');
      expect(handleGamePhase(GamePhase.TURN)).toBe('turn');
      expect(handleGamePhase(GamePhase.RIVER)).toBe('river');
      expect(handleGamePhase(GamePhase.SHOWDOWN)).toBe('showdown');
      expect(handleGamePhase(GamePhase.FINISHED)).toBe('finished');
    });
  });

  describe('exhaustiveHandle', () => {
    it('should handle all cases of a discriminated union', () => {
      const handlers: ExhaustiveHandlers<PlayerAction, string> = {
        [PlayerAction.FOLD]: () => 'Player folded',
        [PlayerAction.CHECK]: () => 'Player checked',
        [PlayerAction.CALL]: () => 'Player called',
        [PlayerAction.BET]: () => 'Player bet',
        [PlayerAction.RAISE]: () => 'Player raised',
        [PlayerAction.ALL_IN]: () => 'Player went all-in',
      };

      expect(exhaustiveHandle(PlayerAction.FOLD, handlers)).toBe('Player folded');
      expect(exhaustiveHandle(PlayerAction.CHECK, handlers)).toBe('Player checked');
      expect(exhaustiveHandle(PlayerAction.CALL, handlers)).toBe('Player called');
      expect(exhaustiveHandle(PlayerAction.BET, handlers)).toBe('Player bet');
      expect(exhaustiveHandle(PlayerAction.RAISE, handlers)).toBe('Player raised');
      expect(exhaustiveHandle(PlayerAction.ALL_IN, handlers)).toBe('Player went all-in');
    });

    it('should throw when handler is missing', () => {
      const incompleteHandlers = {
        [PlayerAction.FOLD]: () => 'folded',
        // Missing other handlers
      } as ExhaustiveHandlers<PlayerAction, string>;

      expect(() => exhaustiveHandle(PlayerAction.CHECK, incompleteHandlers))
        .toThrow('No handler found for value: check');
    });
  });

  describe('isEnumValue', () => {
    it('should correctly identify enum values', () => {
      expect(isEnumValue(GamePhase, GamePhase.WAITING)).toBe(true);
      expect(isEnumValue(GamePhase, 'waiting')).toBe(true);
      expect(isEnumValue(GamePhase, 'invalid')).toBe(false);
      expect(isEnumValue(GamePhase, 123)).toBe(false);
      expect(isEnumValue(GamePhase, null)).toBe(false);
      expect(isEnumValue(GamePhase, undefined)).toBe(false);
    });

    it('should work as a type guard', () => {
      const value: unknown = 'fold';
      
      if (isEnumValue(PlayerAction, value)) {
        // TypeScript now knows value is PlayerAction
        const action: PlayerAction = value;
        expect(action).toBe(PlayerAction.FOLD);
      }
    });
  });

  describe('createMatcher', () => {
    it('should create exhaustive matcher', () => {
      const getPhaseMessage = createMatcher<GamePhase, string>()
        .case(GamePhase.WAITING, () => 'Waiting for players')
        .case(GamePhase.PRE_FLOP, () => 'Pre-flop betting')
        .case(GamePhase.FLOP, () => 'Flop cards dealt')
        .case(GamePhase.TURN, () => 'Turn card dealt')
        .case(GamePhase.RIVER, () => 'River card dealt')
        .case(GamePhase.SHOWDOWN, () => 'Showing cards')
        .case(GamePhase.FINISHED, () => 'Game finished')
        .exhaustive();

      expect(getPhaseMessage(GamePhase.WAITING)).toBe('Waiting for players');
      expect(getPhaseMessage(GamePhase.FLOP)).toBe('Flop cards dealt');
      expect(getPhaseMessage(GamePhase.FINISHED)).toBe('Game finished');
    });

    it('should throw when case is missing in exhaustive matcher', () => {
      const incompleteMatcher = createMatcher<GamePhase, string>()
        .case(GamePhase.WAITING, () => 'Waiting')
        .case(GamePhase.PRE_FLOP, () => 'Pre-flop')
        // Missing other cases
        .exhaustive();

      expect(() => incompleteMatcher(GamePhase.FLOP))
        .toThrow('Unhandled case: flop');
    });

    it('should support default handler', () => {
      const matcherWithDefault = createMatcher<GamePhase, string>()
        .case(GamePhase.WAITING, () => 'Waiting')
        .case(GamePhase.PRE_FLOP, () => 'Pre-flop')
        .withDefault(() => 'Other phase');

      expect(matcherWithDefault(GamePhase.WAITING)).toBe('Waiting');
      expect(matcherWithDefault(GamePhase.PRE_FLOP)).toBe('Pre-flop');
      expect(matcherWithDefault(GamePhase.FLOP)).toBe('Other phase');
      expect(matcherWithDefault(GamePhase.TURN)).toBe('Other phase');
    });
  });
});