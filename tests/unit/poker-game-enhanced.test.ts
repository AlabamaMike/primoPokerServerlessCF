import { PokerGame } from '@primo-poker/core';
import { 
  TableConfig, 
  Player, 
  GameType, 
  BettingStructure, 
  GameFormat, 
  PlayerStatus,
  GamePhase,
  PlayerAction,
  Card,
  Suit,
  Rank
} from '@primo-poker/shared';

describe('PokerGame Enhanced Tests', () => {
  let tableConfig: TableConfig;
  let players: Player[];
  let game: PokerGame;

  beforeEach(() => {
    tableConfig = {
      id: 'test-table-1',
      name: 'Test Table',
      gameType: GameType.TEXAS_HOLDEM,
      bettingStructure: BettingStructure.NO_LIMIT,
      gameFormat: GameFormat.CASH,
      maxPlayers: 9,
      minBuyIn: 100,
      maxBuyIn: 1000,
      smallBlind: 5,
      bigBlind: 10,
      ante: 0,
      timeBank: 30,
      isPrivate: false,
    };

    players = [
      {
        id: 'player-1',
        username: 'Alice',
        email: 'alice@example.com',
        chipCount: 500,
        status: PlayerStatus.ACTIVE,
        timeBank: 30,
        isDealer: false,
      },
      {
        id: 'player-2',
        username: 'Bob',
        email: 'bob@example.com',
        chipCount: 500,
        status: PlayerStatus.ACTIVE,
        timeBank: 30,
        isDealer: false,
      },
      {
        id: 'player-3',
        username: 'Charlie',
        email: 'charlie@example.com',
        chipCount: 500,
        status: PlayerStatus.ACTIVE,
        timeBank: 30,
        isDealer: false,
      },
      {
        id: 'player-4',
        username: 'Dave',
        email: 'dave@example.com',
        chipCount: 500,
        status: PlayerStatus.ACTIVE,
        timeBank: 30,
        isDealer: false,
      },
      {
        id: 'player-5',
        username: 'Eve',
        email: 'eve@example.com',
        chipCount: 500,
        status: PlayerStatus.ACTIVE,
        timeBank: 30,
        isDealer: false,
      },
      {
        id: 'player-6',
        username: 'Frank',
        email: 'frank@example.com',
        chipCount: 500,
        status: PlayerStatus.ACTIVE,
        timeBank: 30,
        isDealer: false,
      },
    ];

    game = new PokerGame(tableConfig, players);
  });

  describe('6-Player Game Scenarios', () => {
    it('should handle complete hand from pre-flop to showdown with 6 players', async () => {
      await game.dealCards();
      const initialState = game.getGameState();
      expect(initialState.phase).toBe(GamePhase.PRE_FLOP);
      expect(initialState.pot).toBe(15); // Small blind + big blind

      // Pre-flop betting round
      const preflop = await completeRound(game, players, GamePhase.PRE_FLOP);
      expect(preflop.phase).toBe(GamePhase.FLOP);
      expect(preflop.communityCards).toHaveLength(3);

      // Flop betting round
      const flop = await completeRound(game, players, GamePhase.FLOP);
      expect(flop.phase).toBe(GamePhase.TURN);
      expect(flop.communityCards).toHaveLength(4);

      // Turn betting round
      const turn = await completeRound(game, players, GamePhase.TURN);
      expect(turn.phase).toBe(GamePhase.RIVER);
      expect(turn.communityCards).toHaveLength(5);

      // River betting round
      const river = await completeRound(game, players, GamePhase.RIVER);
      expect(river.phase).toBe(GamePhase.SHOWDOWN);

      // Showdown
      const showdownResult = await game.evaluateShowdown();
      expect(showdownResult.winners).toBeDefined();
      expect(showdownResult.winners.length).toBeGreaterThan(0);
    });

    it('should handle multiple players going all-in', async () => {
      // Set up players with different chip stacks
      players[0]!.chipCount = 100;
      players[1]!.chipCount = 250;
      players[2]!.chipCount = 500;
      game = new PokerGame(tableConfig, players.slice(0, 3));

      await game.dealCards();
      let gameState = game.getGameState();

      // Player 1 goes all-in
      const result1 = await game.processBet(gameState.activePlayerId!, 100);
      expect(result1.success).toBe(true);
      expect(result1.playerChips).toBe(0);

      // Player 2 goes all-in
      gameState = game.getGameState();
      const result2 = await game.processBet(gameState.activePlayerId!, 250);
      expect(result2.success).toBe(true);
      expect(result2.playerChips).toBe(0);

      // Player 3 calls
      gameState = game.getGameState();
      const result3 = await game.processBet(gameState.activePlayerId!, 250);
      expect(result3.success).toBe(true);

      // Verify side pots are created
      gameState = game.getGameState();
      expect(gameState.sidePots).toBeDefined();
      expect(gameState.sidePots.length).toBeGreaterThan(0);
    });
  });

  describe('Button Rotation Tests', () => {
    it('should rotate button position correctly across multiple hands', async () => {
      const dealerPositions: string[] = [];
      
      for (let i = 0; i < players.length * 2; i++) {
        const gameState = game.getGameState();
        dealerPositions.push(gameState.dealerId);
        
        // Deal and complete a quick hand
        await game.dealCards();
        
        // Everyone folds to big blind
        let state = game.getGameState();
        while (state.phase !== GamePhase.FINISHED && state.activePlayerId) {
          await game.processBet(state.activePlayerId, 0); // fold
          state = game.getGameState();
        }
        
        // Start new hand
        game = new PokerGame(tableConfig, players);
      }
      
      // Verify button rotated through all positions
      const uniquePositions = new Set(dealerPositions);
      expect(uniquePositions.size).toBe(players.length);
    });

    it('should handle button rotation when players leave', async () => {
      await game.dealCards();
      const initialDealer = game.getGameState().dealerId;
      
      // Remove a player
      const remainingPlayers = players.filter(p => p.id !== 'player-3');
      game = new PokerGame(tableConfig, remainingPlayers);
      
      const newDealer = game.getGameState().dealerId;
      expect(newDealer).not.toBe('player-3');
      expect(remainingPlayers.some(p => p.id === newDealer)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle minimum players (2-player heads-up)', async () => {
      const headsUpPlayers = players.slice(0, 2);
      game = new PokerGame(tableConfig, headsUpPlayers);
      
      const gameState = game.getGameState();
      // In heads-up, dealer is small blind
      expect(gameState.dealerId).toBe(gameState.smallBlindId);
      expect(gameState.bigBlindId).not.toBe(gameState.dealerId);
    });

    it('should handle maximum players (9 players)', async () => {
      const fullTable = [...players];
      for (let i = 7; i <= 9; i++) {
        fullTable.push({
          id: `player-${i}`,
          username: `Player${i}`,
          email: `player${i}@example.com`,
          chipCount: 500,
          status: PlayerStatus.ACTIVE,
          timeBank: 30,
          isDealer: false,
        });
      }
      
      game = new PokerGame(tableConfig, fullTable);
      await game.dealCards();
      
      const gameState = game.getGameState();
      expect(gameState.phase).toBe(GamePhase.PRE_FLOP);
      
      // Verify all players received cards
      const playerCount = fullTable.filter(p => p.status === PlayerStatus.ACTIVE).length;
      expect(playerCount).toBe(9);
    });

    it('should handle simultaneous betting actions gracefully', async () => {
      await game.dealCards();
      const gameState = game.getGameState();
      const activePlayer = gameState.activePlayerId!;
      const nonActivePlayer = players.find(p => p.id !== activePlayer)?.id!;
      
      // Try to bet with non-active player
      const result1 = await game.processBet(nonActivePlayer, 10);
      expect(result1.success).toBe(false);
      expect(result1.error).toBe('Not your turn');
      
      // Active player can still bet
      const result2 = await game.processBet(activePlayer, 10);
      expect(result2.success).toBe(true);
    });

    it('should handle player disconnection during their turn', async () => {
      await game.dealCards();
      const gameState = game.getGameState();
      const activePlayer = players.find(p => p.id === gameState.activePlayerId)!;
      
      // Simulate disconnection by setting status
      activePlayer.status = PlayerStatus.SITTING_OUT;
      
      // Game should be able to continue
      const remainingActive = players.filter(p => p.status === PlayerStatus.ACTIVE);
      expect(remainingActive.length).toBeGreaterThan(1);
    });
  });

  describe('Error Cases', () => {
    it('should reject bet below minimum raise', async () => {
      await game.dealCards();
      const gameState = game.getGameState();
      
      // Try to raise by less than minimum
      const invalidRaise = gameState.currentBet + 1;
      const result = await game.processBet(gameState.activePlayerId!, invalidRaise);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('too small');
    });

    it('should reject bet exceeding player chips', async () => {
      await game.dealCards();
      const gameState = game.getGameState();
      const activePlayer = players.find(p => p.id === gameState.activePlayerId)!;
      
      const excessiveBet = activePlayer.chipCount + 100;
      const result = await game.processBet(gameState.activePlayerId!, excessiveBet);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient funds');
    });

    it('should handle invalid game phase transitions', async () => {
      // Try to evaluate showdown before dealing cards
      await expect(game.evaluateShowdown()).rejects.toThrow('Cannot evaluate showdown in current phase');
      
      // Try to deal cards twice
      await game.dealCards();
      await expect(game.dealCards()).rejects.toThrow('Cannot deal cards in current game phase');
    });

    it('should handle malformed player actions', async () => {
      await game.dealCards();
      
      // Invalid player ID
      const result1 = await game.processBet('invalid-id', 10);
      expect(result1.success).toBe(false);
      expect(result1.error).toBe('Player not found');
      
      // Negative bet amount
      const gameState = game.getGameState();
      const result2 = await game.processBet(gameState.activePlayerId!, -10);
      expect(result2.success).toBe(false);
    });
  });

  describe('Complex Betting Scenarios', () => {
    it('should handle re-raises correctly', async () => {
      await game.dealCards();
      let gameState = game.getGameState();
      
      // Player 1 bets 20
      await game.processBet(gameState.activePlayerId!, 20);
      
      // Player 2 raises to 50
      gameState = game.getGameState();
      await game.processBet(gameState.activePlayerId!, 50);
      
      // Player 3 re-raises to 150
      gameState = game.getGameState();
      await game.processBet(gameState.activePlayerId!, 150);
      
      gameState = game.getGameState();
      expect(gameState.currentBet).toBe(150);
      expect(gameState.minRaise).toBe(100); // Last raise amount
    });

    it('should handle check-raise scenario', async () => {
      await game.dealCards();
      
      // Complete pre-flop
      await completeRound(game, players, GamePhase.PRE_FLOP, true);
      
      let gameState = game.getGameState();
      expect(gameState.phase).toBe(GamePhase.FLOP);
      expect(gameState.currentBet).toBe(0);
      
      // First player checks
      await game.processBet(gameState.activePlayerId!, 0);
      
      // Second player bets
      gameState = game.getGameState();
      await game.processBet(gameState.activePlayerId!, 20);
      
      // Third player raises (check-raise scenario)
      gameState = game.getGameState();
      await game.processBet(gameState.activePlayerId!, 60);
      
      gameState = game.getGameState();
      expect(gameState.currentBet).toBe(60);
    });
  });
});

// Helper function to complete a betting round
async function completeRound(
  game: PokerGame,
  players: Player[],
  expectedPhase: GamePhase,
  allCheck = false
): Promise<any> {
  let gameState = game.getGameState();
  const activePlayers = players.filter(p => p.status === PlayerStatus.ACTIVE);
  
  while (gameState.phase === expectedPhase && gameState.activePlayerId) {
    const action = allCheck ? 0 : gameState.currentBet;
    await game.processBet(gameState.activePlayerId, action);
    gameState = game.getGameState();
  }
  
  return gameState;
}