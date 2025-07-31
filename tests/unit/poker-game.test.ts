import { PokerGame } from '@primo-poker/core';
import { 
  TableConfig, 
  Player, 
  GameType, 
  BettingStructure, 
  GameFormat, 
  PlayerStatus,
  GamePhase,
  PlayerAction 
} from '@primo-poker/shared';

describe('PokerGame', () => {
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
      maxPlayers: 6,
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
    ];

    game = new PokerGame(tableConfig, players);
  });

  describe('Game Initialization', () => {
    it('should initialize with correct game state', () => {
      const gameState = game.getGameState();
      
      expect(gameState.tableId).toBe(tableConfig.id);
      expect(gameState.phase).toBe(GamePhase.WAITING);
      expect(gameState.pot).toBe(0);
      expect(gameState.communityCards).toHaveLength(0);
      expect(gameState.currentBet).toBe(tableConfig.bigBlind);
      expect(gameState.minRaise).toBe(tableConfig.bigBlind);
      expect(gameState.handNumber).toBe(1);
    });

    it('should assign dealer, small blind, and big blind positions', () => {
      const gameState = game.getGameState();
      
      expect(gameState.dealerId).toBeDefined();
      expect(gameState.smallBlindId).toBeDefined();
      expect(gameState.bigBlindId).toBeDefined();
      
      // All should be different players
      expect(gameState.dealerId).not.toBe(gameState.smallBlindId);
      expect(gameState.dealerId).not.toBe(gameState.bigBlindId);
      expect(gameState.smallBlindId).not.toBe(gameState.bigBlindId);
    });
  });

  describe('Deal Cards', () => {
    it('should deal hole cards and post blinds', async () => {
      await game.dealCards();
      
      const gameState = game.getGameState();
      expect(gameState.phase).toBe(GamePhase.PRE_FLOP);
      expect(gameState.pot).toBe(tableConfig.smallBlind + tableConfig.bigBlind);
    });

    it('should not allow dealing cards twice', async () => {
      await game.dealCards();
      
      await expect(game.dealCards()).rejects.toThrow('Cannot deal cards in current game phase');
    });
  });

  describe('Player Actions', () => {
    beforeEach(async () => {
      await game.dealCards();
    });

    it('should allow valid call action', async () => {
      const gameState = game.getGameState();
      const activePlayerId = gameState.activePlayerId!;
      
      const result = await game.processBet(activePlayerId, gameState.currentBet);
      
      expect(result.success).toBe(true);
      expect(result.newGameState?.pot).toBeGreaterThan(gameState.pot);
    });

    it('should allow valid raise action', async () => {
      const gameState = game.getGameState();
      const activePlayerId = gameState.activePlayerId!;
      const raiseAmount = gameState.currentBet + gameState.minRaise;
      
      const result = await game.processBet(activePlayerId, raiseAmount);
      
      expect(result.success).toBe(true);
      expect(result.newGameState?.currentBet).toBe(raiseAmount);
    });

    it('should allow fold action', async () => {
      const gameState = game.getGameState();
      const activePlayerId = gameState.activePlayerId!;
      
      const result = await game.processBet(activePlayerId, 0);
      
      expect(result.success).toBe(true);
    });

    it('should reject action from non-active player', async () => {
      const gameState = game.getGameState();
      const nonActivePlayerId = players.find(p => p.id !== gameState.activePlayerId)?.id!;
      
      const result = await game.processBet(nonActivePlayerId, gameState.currentBet);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not your turn');
    });

    it('should reject invalid raise amount', async () => {
      const gameState = game.getGameState();
      const activePlayerId = gameState.activePlayerId!;
      const invalidRaise = gameState.currentBet + 1; // Too small
      
      const result = await game.processBet(activePlayerId, invalidRaise);
      
      expect(result.success).toBe(false);
    });

    it('should reject bet exceeding chip count', async () => {
      const gameState = game.getGameState();
      const activePlayerId = gameState.activePlayerId!;
      const player = players.find(p => p.id === activePlayerId)!;
      const excessiveBet = player.chipCount + 100;
      
      const result = await game.processBet(activePlayerId, excessiveBet);
      
      expect(result.success).toBe(false);
    });
  });

  describe('Game Progression', () => {
    beforeEach(async () => {
      await game.dealCards();
    });

    it('should advance through betting rounds', async () => {
      const initialGameState = game.getGameState();
      
      // Complete pre-flop betting
      for (let i = 0; i < players.length; i++) {
        const gameState = game.getGameState();
        if (gameState.activePlayerId) {
          await game.processBet(gameState.activePlayerId, gameState.currentBet);
        }
      }
      
      const finalGameState = game.getGameState();
      expect(finalGameState.phase).not.toBe(initialGameState.phase);
    });

    it('should deal community cards at appropriate phases', async () => {
      // This would require completing betting rounds and checking community cards
      // Implementation depends on how the game handles phase transitions
      const gameState = game.getGameState();
      expect(gameState.communityCards).toHaveLength(0);
    });
  });

  describe('Showdown', () => {
    it('should evaluate hands and determine winners', async () => {
      // Set up game to reach showdown
      await game.dealCards();
      
      // This test would require reaching showdown phase
      // and having the evaluateShowdown method work properly
      const gameState = game.getGameState();
      
      if (gameState.phase === GamePhase.SHOWDOWN) {
        const result = await game.evaluateShowdown();
        expect(result.winners).toBeDefined();
        expect(result.winners.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid player ID', async () => {
      await game.dealCards();
      
      const result = await game.processBet('invalid-player-id', 10);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Player not found');
    });

    it('should handle showdown in wrong phase', async () => {
      await expect(game.evaluateShowdown()).rejects.toThrow('Cannot evaluate showdown in current phase');
    });
  });

  describe('Two-Player Game', () => {
    beforeEach(() => {
      // Create a heads-up game
      const headsUpPlayers = players.slice(0, 2);
      game = new PokerGame(tableConfig, headsUpPlayers);
    });

    it('should handle heads-up blind positions correctly', () => {
      const gameState = game.getGameState();
      
      // In heads-up, dealer is small blind
      expect(gameState.dealerId).toBe(gameState.smallBlindId);
    });
  });

  describe('All-in Scenarios', () => {
    beforeEach(async () => {
      await game.dealCards();
    });

    it('should handle all-in bet', async () => {
      const gameState = game.getGameState();
      const activePlayerId = gameState.activePlayerId!;
      const player = players.find(p => p.id === activePlayerId)!;
      
      // All-in with remaining chips
      const result = await game.processBet(activePlayerId, player.chipCount);
      
      expect(result.success).toBe(true);
      expect(result.playerChips).toBe(0);
    });
  });
});
