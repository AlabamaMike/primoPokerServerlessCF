/**
 * BettingEngine Unit Tests - Phase 3B.2
 * 
 * Comprehensive tests for the advanced betting logic system
 */

import { BettingEngine, BettingResult, BettingError } from '@primo-poker/core'
import { GamePlayer, PlayerStatus, GamePhase } from '@primo-poker/shared'

describe('BettingEngine', () => {
  let bettingEngine: BettingEngine
  let mockPlayers: GamePlayer[]

  beforeEach(() => {
    bettingEngine = new BettingEngine()
    
    // Create mock players for testing
    mockPlayers = [
      {
        id: 'player-1',
        name: 'Alice',
        status: PlayerStatus.PLAYING,
        chipCount: 1000,
        position: { seat: 0, isButton: false, isSmallBlind: true, isBigBlind: false },
        // Runtime betting state
        chips: 1000,
        currentBet: 10, // Small blind
        hasActed: true,
        isFolded: false,
        isAllIn: false
      },
      {
        id: 'player-2', 
        name: 'Bob',
        status: PlayerStatus.PLAYING,
        chipCount: 1500,
        position: { seat: 1, isButton: false, isSmallBlind: false, isBigBlind: true },
        // Runtime betting state
        chips: 1500,
        currentBet: 20, // Big blind
        hasActed: true,
        isFolded: false,
        isAllIn: false
      },
      {
        id: 'player-3',
        name: 'Charlie', 
        status: PlayerStatus.PLAYING,
        chipCount: 800,
        position: { seat: 2, isButton: true, isSmallBlind: false, isBigBlind: false },
        // Runtime betting state
        chips: 800,
        currentBet: 0,
        hasActed: false,
        isFolded: false,
        isAllIn: false
      }
    ]
  })

  describe('Action Validation', () => {
    it('should validate fold action correctly', () => {
      const result = bettingEngine.validateAction(
        mockPlayers[2], // Charlie
        'fold',
        0,
        mockPlayers,
        20, // Current bet (big blind)
        GamePhase.PRE_FLOP
      )

      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should validate check when no bet to call', () => {
      // Set up scenario where current bet equals player's bet
      mockPlayers[2].currentBet = 20

      const result = bettingEngine.validateAction(
        mockPlayers[2],
        'check',
        0,
        mockPlayers,
        20,
        GamePhase.PRE_FLOP
      )

      expect(result.isValid).toBe(true)
    })

    it('should reject check when bet is required', () => {
      const result = bettingEngine.validateAction(
        mockPlayers[2], // Charlie has 0 bet, current bet is 20
        'check',
        0,
        mockPlayers,
        20,
        GamePhase.PRE_FLOP
      )

      expect(result.isValid).toBe(false)
      expect(result.error?.type).toBe('invalid_action')
    })

    it('should validate call action correctly', () => {
      const result = bettingEngine.validateAction(
        mockPlayers[2], // Charlie needs to call 20
        'call',
        20,
        mockPlayers,
        20,
        GamePhase.PRE_FLOP
      )

      expect(result.isValid).toBe(true)
      expect(result.actionType).toBe('call')
      expect(result.effectiveAmount).toBe(20)
    })

    it('should handle all-in when calling with insufficient chips', () => {
      // Set Charlie's chips to less than call amount
      mockPlayers[2].chips = 15

      const result = bettingEngine.validateAction(
        mockPlayers[2],
        'call',
        20,
        mockPlayers,
        20,
        GamePhase.PRE_FLOP
      )

      expect(result.isValid).toBe(true)
      expect(result.actionType).toBe('all_in')
      expect(result.effectiveAmount).toBe(15)
    })

    it('should validate bet action correctly', () => {
      // Reset to no current bet scenario
      const noBetPlayers = mockPlayers.map(p => ({ ...p, currentBet: 0 }))

      const result = bettingEngine.validateAction(
        mockPlayers[2],
        'bet',
        100,
        noBetPlayers,
        0,
        GamePhase.FLOP
      )

      expect(result.isValid).toBe(true)
      expect(result.actionType).toBe('bet')
      expect(result.effectiveAmount).toBe(100)
    })

    it('should reject bet when current bet exists', () => {
      const result = bettingEngine.validateAction(
        mockPlayers[2],
        'bet',
        100,
        mockPlayers,
        20, // Current bet exists
        GamePhase.PRE_FLOP
      )

      expect(result.isValid).toBe(false)
      expect(result.error?.type).toBe('invalid_action')
    })

    it('should validate raise action correctly', () => {
      const result = bettingEngine.validateAction(
        mockPlayers[2],
        'raise',
        50, // Raising to 50 (30 more than current 20)
        mockPlayers,
        20,
        GamePhase.PRE_FLOP
      )

      expect(result.isValid).toBe(true)
      expect(result.actionType).toBe('raise')
      expect(result.effectiveAmount).toBe(50)
    })

    it('should reject insufficient raise amount', () => {
      const result = bettingEngine.validateAction(
        mockPlayers[2],
        'raise',
        25, // Only 5 more than current bet, minimum raise should be 20
        mockPlayers,
        20,
        GamePhase.PRE_FLOP
      )

      expect(result.isValid).toBe(false)
      expect(result.error?.type).toBe('insufficient_raise')
    })

    it('should validate all-in action correctly', () => {
      const result = bettingEngine.validateAction(
        mockPlayers[2],
        'all_in',
        800, // Charlie's full stack
        mockPlayers,
        20,
        GamePhase.PRE_FLOP
      )

      expect(result.isValid).toBe(true)
      expect(result.actionType).toBe('all_in')
      expect(result.effectiveAmount).toBe(800)
    })

    it('should reject action from player with insufficient chips', () => {
      const result = bettingEngine.validateAction(
        mockPlayers[2],
        'bet',
        1000, // More than Charlie's 800 chips
        mockPlayers,
        0,
        GamePhase.FLOP
      )

      expect(result.isValid).toBe(false)
      expect(result.error?.type).toBe('insufficient_funds')
    })
  })

  describe('Side Pot Calculation', () => {
    it('should calculate side pots correctly with one all-in', () => {
      const allInPlayers = [
        { playerId: 'player-1', amount: 100 }, // All-in
        { playerId: 'player-2', amount: 200 },
        { playerId: 'player-3', amount: 200 }
      ]

      const sidePots = bettingEngine.calculateSidePots(allInPlayers)

      expect(sidePots).toHaveLength(2)
      expect(sidePots[0]).toEqual({
        amount: 300, // 100 * 3 players
        eligiblePlayers: ['player-1', 'player-2', 'player-3']
      })
      expect(sidePots[1]).toEqual({
        amount: 200, // (200 - 100) * 2 players
        eligiblePlayers: ['player-2', 'player-3']
      })
    })

    it('should calculate side pots with multiple all-ins', () => {
      const allInPlayers = [
        { playerId: 'player-1', amount: 50 },  // First all-in
        { playerId: 'player-2', amount: 150 }, // Second all-in
        { playerId: 'player-3', amount: 300 }  // Still in
      ]

      const sidePots = bettingEngine.calculateSidePots(allInPlayers)

      expect(sidePots).toHaveLength(3)
      expect(sidePots[0].amount).toBe(150) // 50 * 3
      expect(sidePots[1].amount).toBe(200) // (150 - 50) * 2
      expect(sidePots[2].amount).toBe(150) // (300 - 150) * 1
    })

    it('should handle equal bets (no side pots needed)', () => {
      const equalPlayers = [
        { playerId: 'player-1', amount: 100 },
        { playerId: 'player-2', amount: 100 },
        { playerId: 'player-3', amount: 100 }
      ]

      const sidePots = bettingEngine.calculateSidePots(equalPlayers)

      expect(sidePots).toHaveLength(1)
      expect(sidePots[0].amount).toBe(300)
      expect(sidePots[0].eligiblePlayers).toEqual(['player-1', 'player-2', 'player-3'])
    })
  })

  describe('Blind Posting', () => {
    it('should post blinds correctly', () => {
      const result = bettingEngine.postBlinds(mockPlayers, 10, 20)

      expect(result.success).toBe(true)
      expect(result.smallBlindPlayer?.id).toBe('player-1')
      expect(result.bigBlindPlayer?.id).toBe('player-2')
      expect(result.smallBlindPlayer?.currentBet).toBe(10)
      expect(result.bigBlindPlayer?.currentBet).toBe(20)
    })

    it('should handle insufficient chips for blinds', () => {
      // Set small blind player to have less than required
      mockPlayers[0].chips = 5

      const result = bettingEngine.postBlinds(mockPlayers, 10, 20)

      expect(result.success).toBe(true)
      expect(result.smallBlindPlayer?.currentBet).toBe(5) // All-in
      expect(result.smallBlindPlayer?.isAllIn).toBe(true)
    })
  })

  describe('Betting Round Completion', () => {
    it('should detect completed betting round', () => {
      // All players have acted and matched the current bet
      const completedPlayers = mockPlayers.map(p => ({
        ...p,
        hasActed: true,
        currentBet: 20,
        isFolded: false
      }))

      const isComplete = bettingEngine.isBettingRoundComplete(completedPlayers, 20)

      expect(isComplete).toBe(true)
    })

    it('should detect incomplete betting round', () => {
      // Player 3 hasn't acted yet
      mockPlayers[2].hasActed = false

      const isComplete = bettingEngine.isBettingRoundComplete(mockPlayers, 20)

      expect(isComplete).toBe(false)
    })

    it('should handle folded players correctly', () => {
      // Player 3 folded, others completed
      const foldedScenario = mockPlayers.map((p, i) => ({
        ...p,
        hasActed: true,
        currentBet: i === 2 ? 0 : 20,
        isFolded: i === 2
      }))

      const isComplete = bettingEngine.isBettingRoundComplete(foldedScenario, 20)

      expect(isComplete).toBe(true)
    })

    it('should handle all-in players correctly', () => {
      // Player 1 is all-in with less than current bet, others completed
      const allInScenario = mockPlayers.map((p, i) => ({
        ...p,
        hasActed: true,
        currentBet: i === 0 ? 15 : 20, // Player 1 all-in with 15
        isAllIn: i === 0,
        isFolded: false
      }))

      const isComplete = bettingEngine.isBettingRoundComplete(allInScenario, 20)

      expect(isComplete).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should create proper error objects', () => {
      const error = new BettingError('insufficient_funds', 'Not enough chips')

      expect(error.type).toBe('insufficient_funds')
      expect(error.message).toBe('Not enough chips')
      expect(error.name).toBe('BettingError')
    })

    it('should handle edge cases gracefully', () => {
      // Empty players array
      const result = bettingEngine.validateAction(
        mockPlayers[0],
        'fold',
        0,
        [],
        0,
        GamePhase.PRE_FLOP
      )

      expect(result.isValid).toBe(true) // Fold should always be valid
    })
  })
})
