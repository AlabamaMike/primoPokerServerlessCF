import { BettingEngine, BettingAction, ValidationResult } from '@primo-poker/core';
import { GamePlayer, PlayerStatus, GamePhase } from '@primo-poker/shared';

describe('BettingEngine Edge Cases and Comprehensive Tests', () => {
  let bettingEngine: BettingEngine;
  let players: Map<string, GamePlayer>;

  beforeEach(() => {
    players = new Map<string, GamePlayer>([
      ['player-1', {
        playerId: 'player-1',
        chips: 1000,
        currentBet: 0,
        totalBet: 0,
        isAllIn: false,
        status: PlayerStatus.ACTIVE,
        hasActed: false,
        seatPosition: 0
      }],
      ['player-2', {
        playerId: 'player-2',
        chips: 1000,
        currentBet: 0,
        totalBet: 0,
        isAllIn: false,
        status: PlayerStatus.ACTIVE,
        hasActed: false,
        seatPosition: 1
      }],
      ['player-3', {
        playerId: 'player-3',
        chips: 1000,
        currentBet: 0,
        totalBet: 0,
        isAllIn: false,
        status: PlayerStatus.ACTIVE,
        hasActed: false,
        seatPosition: 2
      }],
      ['player-4', {
        playerId: 'player-4',
        chips: 1000,
        currentBet: 0,
        totalBet: 0,
        isAllIn: false,
        status: PlayerStatus.ACTIVE,
        hasActed: false,
        seatPosition: 3
      }],
      ['player-5', {
        playerId: 'player-5',
        chips: 1000,
        currentBet: 0,
        totalBet: 0,
        isAllIn: false,
        status: PlayerStatus.ACTIVE,
        hasActed: false,
        seatPosition: 4
      }],
      ['player-6', {
        playerId: 'player-6',
        chips: 1000,
        currentBet: 0,
        totalBet: 0,
        isAllIn: false,
        status: PlayerStatus.ACTIVE,
        hasActed: false,
        seatPosition: 5
      }]
    ]);

    bettingEngine = new BettingEngine(10, 20); // Small blind: 10, Big blind: 20
  });

  describe('Complex Betting Scenarios', () => {
    it('should handle multiple re-raises in a single round', () => {
      // Initialize betting round
      bettingEngine.startBettingRound(players, GamePhase.PRE_FLOP, 0);

      // Player 1 opens with 50
      const result1 = bettingEngine.processBet('player-1', 50);
      expect(result1.success).toBe(true);
      expect(result1.updatedPlayers.get('player-1')?.currentBet).toBe(50);

      // Player 2 raises to 150
      const result2 = bettingEngine.processBet('player-2', 150);
      expect(result2.success).toBe(true);
      expect(result2.updatedPlayers.get('player-2')?.currentBet).toBe(150);

      // Player 3 re-raises to 400
      const result3 = bettingEngine.processBet('player-3', 400);
      expect(result3.success).toBe(true);
      expect(result3.updatedPlayers.get('player-3')?.currentBet).toBe(400);

      // Player 4 caps it at 1000 (all-in)
      const result4 = bettingEngine.processBet('player-4', 1000);
      expect(result4.success).toBe(true);
      expect(result4.updatedPlayers.get('player-4')?.isAllIn).toBe(true);
    });

    it('should handle side pot creation with multiple all-ins', () => {
      // Set different chip stacks
      players.get('player-1')!.chips = 100;
      players.get('player-2')!.chips = 250;
      players.get('player-3')!.chips = 500;
      players.get('player-4')!.chips = 1000;

      bettingEngine.startBettingRound(players, GamePhase.FLOP, 0);

      // Player 1 goes all-in with 100
      bettingEngine.processBet('player-1', 100);
      
      // Player 2 goes all-in with 250
      bettingEngine.processBet('player-2', 250);
      
      // Player 3 goes all-in with 500
      bettingEngine.processBet('player-3', 500);
      
      // Player 4 calls 500
      const result = bettingEngine.processBet('player-4', 500);

      // Verify side pots
      const sidePots = bettingEngine.calculateSidePots(result.updatedPlayers);
      expect(sidePots.length).toBeGreaterThan(1);
      
      // Main pot should include all players
      expect(sidePots[0]?.amount).toBe(400); // 100 * 4 players
      expect(sidePots[0]?.eligiblePlayers).toHaveLength(4);
      
      // First side pot
      expect(sidePots[1]?.amount).toBe(450); // (250-100) * 3 players
      expect(sidePots[1]?.eligiblePlayers).toHaveLength(3);
    });

    it('should handle betting round completion correctly', () => {
      bettingEngine.startBettingRound(players, GamePhase.PRE_FLOP, 0);

      // Everyone calls the big blind
      ['player-1', 'player-2', 'player-3', 'player-4', 'player-5', 'player-6'].forEach(playerId => {
        bettingEngine.processBet(playerId, 20);
      });

      const isComplete = bettingEngine.isBettingRoundComplete(players);
      expect(isComplete).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle player with exactly minimum raise amount', () => {
      bettingEngine.startBettingRound(players, GamePhase.PRE_FLOP, 0);

      // Player 1 bets 50
      bettingEngine.processBet('player-1', 50);

      // Player 2 has exactly 100 chips (minimum raise)
      players.get('player-2')!.chips = 100;
      const result = bettingEngine.processBet('player-2', 100);
      
      expect(result.success).toBe(true);
      expect(result.updatedPlayers.get('player-2')?.isAllIn).toBe(true);
    });

    it('should reject raise below minimum amount', () => {
      bettingEngine.startBettingRound(players, GamePhase.PRE_FLOP, 0);

      // Player 1 bets 50
      bettingEngine.processBet('player-1', 50);

      // Player 2 tries to raise to 75 (minimum should be 100)
      const result = bettingEngine.processBet('player-2', 75);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Minimum raise');
    });

    it('should handle check after all players check', () => {
      bettingEngine.startBettingRound(players, GamePhase.FLOP, 0);

      // All players check
      ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'].forEach(playerId => {
        const result = bettingEngine.processBet(playerId, 0);
        expect(result.success).toBe(true);
      });

      // Last player also checks
      const finalResult = bettingEngine.processBet('player-6', 0);
      expect(finalResult.success).toBe(true);
      
      const isComplete = bettingEngine.isBettingRoundComplete(finalResult.updatedPlayers);
      expect(isComplete).toBe(true);
    });

    it('should handle player folding when facing a bet', () => {
      bettingEngine.startBettingRound(players, GamePhase.PRE_FLOP, 0);

      // Player 1 bets 100
      bettingEngine.processBet('player-1', 100);

      // Player 2 folds
      const result = bettingEngine.fold('player-2');
      
      expect(result.success).toBe(true);
      expect(result.updatedPlayers.get('player-2')?.status).toBe(PlayerStatus.FOLDED);
      expect(result.updatedPlayers.get('player-2')?.hasActed).toBe(true);
    });

    it('should handle heads-up betting correctly', () => {
      // Remove all but 2 players
      players.delete('player-3');
      players.delete('player-4');
      players.delete('player-5');
      players.delete('player-6');

      bettingEngine.startBettingRound(players, GamePhase.PRE_FLOP, 0);

      // Small blind/dealer acts first pre-flop in heads-up
      const result1 = bettingEngine.processBet('player-1', 20);
      expect(result1.success).toBe(true);

      // Big blind can raise
      const result2 = bettingEngine.processBet('player-2', 50);
      expect(result2.success).toBe(true);

      // Small blind calls
      const result3 = bettingEngine.processBet('player-1', 50);
      expect(result3.success).toBe(true);

      const isComplete = bettingEngine.isBettingRoundComplete(result3.updatedPlayers);
      expect(isComplete).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should reject bet from non-existent player', () => {
      bettingEngine.startBettingRound(players, GamePhase.PRE_FLOP, 0);
      
      const result = bettingEngine.processBet('non-existent-player', 50);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Player not found');
    });

    it('should reject negative bet amount', () => {
      bettingEngine.startBettingRound(players, GamePhase.PRE_FLOP, 0);
      
      const result = bettingEngine.processBet('player-1', -50);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid bet amount');
    });

    it('should reject bet from folded player', () => {
      bettingEngine.startBettingRound(players, GamePhase.PRE_FLOP, 0);
      
      // Player 1 folds
      bettingEngine.fold('player-1');
      
      // Player 1 tries to bet
      const result = bettingEngine.processBet('player-1', 50);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Player has already folded');
    });

    it('should reject check when facing a bet', () => {
      bettingEngine.startBettingRound(players, GamePhase.PRE_FLOP, 0);
      
      // Player 1 bets
      bettingEngine.processBet('player-1', 50);
      
      // Player 2 tries to check
      const result = bettingEngine.processBet('player-2', 0);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot check');
    });
  });

  describe('Pot Calculation', () => {
    it('should calculate pot correctly with antes', () => {
      // Add antes
      players.forEach(player => {
        player.currentBet = 5; // 5 chip ante
        player.totalBet = 5;
        player.chips -= 5;
      });

      bettingEngine.startBettingRound(players, GamePhase.PRE_FLOP, 0);
      
      const pot = bettingEngine.calculateTotalPot(players);
      expect(pot).toBe(30); // 6 players * 5 ante
    });

    it('should calculate pot correctly after betting round', () => {
      bettingEngine.startBettingRound(players, GamePhase.PRE_FLOP, 0);
      
      // Everyone calls 50
      players.forEach((_, playerId) => {
        bettingEngine.processBet(playerId, 50);
      });
      
      const pot = bettingEngine.calculateTotalPot(players);
      expect(pot).toBe(300); // 6 players * 50
    });

    it('should handle odd chip distribution in side pots', () => {
      // Create situation with odd chips
      players.get('player-1')!.chips = 33;
      players.get('player-2')!.chips = 67;
      players.get('player-3')!.chips = 100;

      bettingEngine.startBettingRound(players, GamePhase.FLOP, 0);

      // All go all-in
      bettingEngine.processBet('player-1', 33);
      bettingEngine.processBet('player-2', 67);
      bettingEngine.processBet('player-3', 100);

      const updatedPlayers = bettingEngine.processBet('player-4', 100).updatedPlayers;
      const sidePots = bettingEngine.calculateSidePots(updatedPlayers);
      
      // Verify no chips are lost in side pot calculations
      const totalInPots = sidePots.reduce((sum, pot) => sum + pot.amount, 0);
      const totalBet = 33 + 67 + 100 + 100;
      expect(totalInPots).toBe(totalBet);
    });
  });

  describe('Special Betting Situations', () => {
    it('should handle straddle betting', () => {
      // Player 3 posts straddle (2x big blind)
      players.get('player-3')!.currentBet = 40;
      players.get('player-3')!.totalBet = 40;
      players.get('player-3')!.chips = 960;

      bettingEngine.startBettingRound(players, GamePhase.PRE_FLOP, 3); // Action starts at player 4
      
      // Minimum bet is now the straddle amount
      const result = bettingEngine.processBet('player-4', 40);
      expect(result.success).toBe(true);
    });

    it('should handle incomplete bet (all-in for less than minimum)', () => {
      bettingEngine.startBettingRound(players, GamePhase.FLOP, 0);
      
      // Player 1 bets 100
      bettingEngine.processBet('player-1', 100);
      
      // Player 2 only has 75 chips (less than the bet)
      players.get('player-2')!.chips = 75;
      const result = bettingEngine.processBet('player-2', 75);
      
      expect(result.success).toBe(true);
      expect(result.updatedPlayers.get('player-2')?.isAllIn).toBe(true);
      
      // Player 3 must call 100, not 75
      const result3 = bettingEngine.processBet('player-3', 100);
      expect(result3.success).toBe(true);
    });

    it('should reset betting properly between rounds', () => {
      bettingEngine.startBettingRound(players, GamePhase.PRE_FLOP, 0);
      
      // Complete pre-flop betting
      players.forEach((_, playerId) => {
        bettingEngine.processBet(playerId, 50);
      });
      
      // Start new round (flop)
      bettingEngine.startBettingRound(players, GamePhase.FLOP, 0);
      
      // Verify all players can check
      const result = bettingEngine.processBet('player-1', 0);
      expect(result.success).toBe(true);
      
      // Verify current bets are reset
      expect(result.updatedPlayers.get('player-1')?.currentBet).toBe(0);
    });
  });

  describe('Performance and Stress Tests', () => {
    it('should handle rapid betting actions', () => {
      bettingEngine.startBettingRound(players, GamePhase.PRE_FLOP, 0);
      
      const start = Date.now();
      
      // Simulate 100 betting actions
      for (let i = 0; i < 100; i++) {
        const playerId = `player-${(i % 6) + 1}`;
        const amount = (i % 3) * 10 + 20; // Varies between 20, 30, 40
        bettingEngine.processBet(playerId, amount);
      }
      
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(50); // Should process 100 bets in < 50ms
    });

    it('should handle maximum table size (9 players)', () => {
      // Add 3 more players
      for (let i = 7; i <= 9; i++) {
        players.set(`player-${i}`, {
          playerId: `player-${i}`,
          chips: 1000,
          currentBet: 0,
          totalBet: 0,
          isAllIn: false,
          status: PlayerStatus.ACTIVE,
          hasActed: false,
          seatPosition: i - 1
        });
      }
      
      bettingEngine.startBettingRound(players, GamePhase.PRE_FLOP, 0);
      
      // Process bets for all 9 players
      let success = true;
      players.forEach((_, playerId) => {
        const result = bettingEngine.processBet(playerId, 20);
        success = success && result.success;
      });
      
      expect(success).toBe(true);
      expect(bettingEngine.calculateTotalPot(players)).toBe(180); // 9 * 20
    });
  });
});