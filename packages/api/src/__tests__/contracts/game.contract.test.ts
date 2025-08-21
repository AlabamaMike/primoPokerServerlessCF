import { z } from 'zod';
import { PokerAPIRoutes } from '../../routes';
import {
  createMockRequest,
  createAuthenticatedRequest,
  verifyContract,
  expectSuccessResponse,
  expectErrorResponse,
} from './contract-test-utils';
import { AuthenticationManager } from '@primo-poker/security';
import { GamePhase, GameType } from '@primo-poker/shared';

// Response schemas
const GameStateSchema = z.object({
  id: z.string().uuid(),
  tableId: z.string().uuid(),
  phase: z.nativeEnum(GamePhase),
  pot: z.number().nonnegative(),
  currentBet: z.number().nonnegative(),
  dealerPosition: z.number().int().nonnegative(),
  smallBlindPosition: z.number().int().nonnegative(),
  bigBlindPosition: z.number().int().nonnegative(),
  currentTurnPosition: z.number().int().nonnegative().optional(),
  communityCards: z.array(z.object({
    rank: z.string(),
    suit: z.string(),
  })),
  players: z.array(z.object({
    id: z.string().uuid(),
    username: z.string(),
    seatNumber: z.number().int().min(0).max(8),
    chipCount: z.number().nonnegative(),
    currentBet: z.number().nonnegative(),
    isActive: z.boolean(),
    isFolded: z.boolean(),
    isAllIn: z.boolean(),
    cards: z.array(z.object({
      rank: z.string(),
      suit: z.string(),
    })).optional(), // Only visible to the player themselves
  })),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const HandHistoryItemSchema = z.object({
  timestamp: z.string().datetime(),
  action: z.string(),
  playerId: z.string().uuid(),
  amount: z.number().nonnegative().optional(),
  details: z.record(z.any()).optional(),
});

const GameHistoryResponseSchema = z.object({
  gameId: z.string().uuid(),
  history: z.array(HandHistoryItemSchema),
});

describe('Game API Contract Tests', () => {
  let api: PokerAPIRoutes;
  let router: any;

  beforeEach(() => {
    api = new PokerAPIRoutes();
    router = api.getRouter();
    jest.clearAllMocks();

    // Mock authentication for protected routes
    jest.spyOn(AuthenticationManager.prototype, 'verifyAccessToken').mockResolvedValue({
      valid: true,
      payload: {
        userId: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['player'],
        sessionId: 'test-session',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      },
    });
  });

  describe('GET /api/games/:gameId', () => {
    it('should require authentication', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/games/test-game-id',
        params: { gameId: 'test-game-id' },
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Missing or invalid authorization header/);
    });

    it('should return game state', async () => {
      const gameId = 'test-game-id';
      const mockGame = {
        id: gameId,
        tableId: 'test-table-id',
        phase: GamePhase.PRE_FLOP,
        pot: 150,
        currentBet: 50,
        dealerPosition: 0,
        smallBlindPosition: 1,
        bigBlindPosition: 2,
        currentTurnPosition: 3,
        communityCards: [],
        players: [
          {
            id: 'player1',
            username: 'player1',
            seatNumber: 0,
            chipCount: 950,
            currentBet: 50,
            isActive: true,
            isFolded: false,
            isAllIn: false,
          },
          {
            id: 'player2',
            username: 'player2',
            seatNumber: 1,
            chipCount: 990,
            currentBet: 10,
            isActive: true,
            isFolded: false,
            isAllIn: false,
          },
          {
            id: 'player3',
            username: 'player3',
            seatNumber: 2,
            chipCount: 980,
            currentBet: 20,
            isActive: true,
            isFolded: false,
            isAllIn: false,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const request = createAuthenticatedRequest({
        method: 'GET',
        url: `http://localhost/api/games/${gameId}`,
        params: { gameId },
      });

      // Mock DB response
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first.mockResolvedValueOnce(mockGame);

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          responseSchema: GameStateSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.id).toBe(gameId);
    });

    it('should handle game not found', async () => {
      const gameId = 'non-existent-game';
      const request = createAuthenticatedRequest({
        method: 'GET',
        url: `http://localhost/api/games/${gameId}`,
        params: { gameId },
      });

      // Mock DB response - game not found
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first.mockResolvedValueOnce(null);

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(404);
      expectErrorResponse(body, '404', /Game not found/);
    });

    it('should include player cards only for the requesting player', async () => {
      const gameId = 'test-game-id';
      const mockGame = {
        id: gameId,
        tableId: 'test-table-id',
        phase: GamePhase.PRE_FLOP,
        pot: 150,
        currentBet: 50,
        dealerPosition: 0,
        smallBlindPosition: 1,
        bigBlindPosition: 2,
        communityCards: [],
        players: [
          {
            id: 'test-user-id', // Matches authenticated user
            username: 'testuser',
            seatNumber: 0,
            chipCount: 950,
            currentBet: 50,
            isActive: true,
            isFolded: false,
            isAllIn: false,
            cards: [
              { rank: 'A', suit: 'hearts' },
              { rank: 'K', suit: 'hearts' },
            ],
          },
          {
            id: 'other-player',
            username: 'otherplayer',
            seatNumber: 1,
            chipCount: 990,
            currentBet: 10,
            isActive: true,
            isFolded: false,
            isAllIn: false,
            // No cards visible for other players
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const request = createAuthenticatedRequest({
        method: 'GET',
        url: `http://localhost/api/games/${gameId}`,
        params: { gameId },
      });

      // Mock DB response
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first.mockResolvedValueOnce(mockGame);

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expectSuccessResponse(body);
      
      // Check that requesting player can see their cards
      const requestingPlayer = body.data.players.find((p: any) => p.id === 'test-user-id');
      expect(requestingPlayer.cards).toBeDefined();
      expect(requestingPlayer.cards).toHaveLength(2);
      
      // Check that other players' cards are not visible
      const otherPlayer = body.data.players.find((p: any) => p.id === 'other-player');
      expect(otherPlayer.cards).toBeUndefined();
    });

    it('should show community cards based on game phase', async () => {
      const phases = [
        { phase: GamePhase.PRE_FLOP, expectedCards: 0 },
        { phase: GamePhase.FLOP, expectedCards: 3 },
        { phase: GamePhase.TURN, expectedCards: 4 },
        { phase: GamePhase.RIVER, expectedCards: 5 },
        { phase: GamePhase.SHOWDOWN, expectedCards: 5 },
      ];

      for (const { phase, expectedCards } of phases) {
        const gameId = `game-${phase}`;
        const communityCards = [];
        
        // Add appropriate number of community cards
        for (let i = 0; i < expectedCards; i++) {
          communityCards.push({ rank: '10', suit: 'hearts' });
        }

        const mockGame = {
          id: gameId,
          tableId: 'test-table-id',
          phase,
          pot: 150,
          currentBet: 0,
          dealerPosition: 0,
          smallBlindPosition: 1,
          bigBlindPosition: 2,
          communityCards,
          players: [
            {
              id: 'player1',
              username: 'player1',
              seatNumber: 0,
              chipCount: 1000,
              currentBet: 0,
              isActive: true,
              isFolded: false,
              isAllIn: false,
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const request = createAuthenticatedRequest({
          method: 'GET',
          url: `http://localhost/api/games/${gameId}`,
          params: { gameId },
        });

        // Mock DB response
        const mockEnv = request.env as any;
        mockEnv.DB.prepare().first.mockResolvedValueOnce(mockGame);

        const response = await router.handle(request);
        const body = await response.json();

        expect(response.status).toBe(200);
        expectSuccessResponse(body);
        expect(body.data.communityCards).toHaveLength(expectedCards);
      }
    });
  });

  describe('GET /api/games/:gameId/history', () => {
    it('should require authentication', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/games/test-game-id/history',
        params: { gameId: 'test-game-id' },
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Missing or invalid authorization header/);
    });

    it('should return game history', async () => {
      const gameId = 'test-game-id';
      const request = createAuthenticatedRequest({
        method: 'GET',
        url: `http://localhost/api/games/${gameId}/history`,
        params: { gameId },
      });

      // For now, the implementation returns empty history
      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          responseSchema: GameHistoryResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.gameId).toBe(gameId);
      expect(result.body.data.history).toEqual([]);
    });

    it('should require game ID parameter', async () => {
      const request = createAuthenticatedRequest({
        method: 'GET',
        url: 'http://localhost/api/games//history',
        params: {},
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expectErrorResponse(body, '400', /Game ID and authentication required/);
    });
  });

  describe('Game State Edge Cases', () => {
    it('should handle all-in scenarios', async () => {
      const gameId = 'all-in-game';
      const mockGame = {
        id: gameId,
        tableId: 'test-table-id',
        phase: GamePhase.RIVER,
        pot: 2000,
        currentBet: 0,
        dealerPosition: 0,
        smallBlindPosition: 1,
        bigBlindPosition: 2,
        communityCards: [
          { rank: 'A', suit: 'hearts' },
          { rank: 'K', suit: 'hearts' },
          { rank: 'Q', suit: 'hearts' },
          { rank: 'J', suit: 'hearts' },
          { rank: '10', suit: 'hearts' },
        ],
        players: [
          {
            id: 'player1',
            username: 'player1',
            seatNumber: 0,
            chipCount: 0,
            currentBet: 0,
            isActive: true,
            isFolded: false,
            isAllIn: true, // All-in
          },
          {
            id: 'player2',
            username: 'player2',
            seatNumber: 1,
            chipCount: 0,
            currentBet: 0,
            isActive: true,
            isFolded: false,
            isAllIn: true, // All-in
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const request = createAuthenticatedRequest({
        method: 'GET',
        url: `http://localhost/api/games/${gameId}`,
        params: { gameId },
      });

      // Mock DB response
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first.mockResolvedValueOnce(mockGame);

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          responseSchema: GameStateSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.players.every((p: any) => p.isAllIn)).toBe(true);
    });

    it('should handle folded players', async () => {
      const gameId = 'fold-game';
      const mockGame = {
        id: gameId,
        tableId: 'test-table-id',
        phase: GamePhase.TURN,
        pot: 300,
        currentBet: 100,
        dealerPosition: 0,
        smallBlindPosition: 1,
        bigBlindPosition: 2,
        currentTurnPosition: 3,
        communityCards: [
          { rank: '2', suit: 'clubs' },
          { rank: '7', suit: 'diamonds' },
          { rank: 'K', suit: 'spades' },
          { rank: 'A', suit: 'hearts' },
        ],
        players: [
          {
            id: 'player1',
            username: 'player1',
            seatNumber: 0,
            chipCount: 900,
            currentBet: 100,
            isActive: true,
            isFolded: false,
            isAllIn: false,
          },
          {
            id: 'player2',
            username: 'player2',
            seatNumber: 1,
            chipCount: 1000,
            currentBet: 0,
            isActive: true,
            isFolded: true, // Folded
            isAllIn: false,
          },
          {
            id: 'player3',
            username: 'player3',
            seatNumber: 2,
            chipCount: 1000,
            currentBet: 0,
            isActive: true,
            isFolded: true, // Folded
            isAllIn: false,
          },
          {
            id: 'player4',
            username: 'player4',
            seatNumber: 3,
            chipCount: 900,
            currentBet: 100,
            isActive: true,
            isFolded: false,
            isAllIn: false,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const request = createAuthenticatedRequest({
        method: 'GET',
        url: `http://localhost/api/games/${gameId}`,
        params: { gameId },
      });

      // Mock DB response
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first.mockResolvedValueOnce(mockGame);

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          responseSchema: GameStateSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      
      const foldedPlayers = result.body.data.players.filter((p: any) => p.isFolded);
      expect(foldedPlayers).toHaveLength(2);
    });

    it('should handle finished game state', async () => {
      const gameId = 'finished-game';
      const mockGame = {
        id: gameId,
        tableId: 'test-table-id',
        phase: GamePhase.FINISHED,
        pot: 0, // Pot distributed
        currentBet: 0,
        dealerPosition: 0,
        smallBlindPosition: 1,
        bigBlindPosition: 2,
        communityCards: [
          { rank: 'A', suit: 'hearts' },
          { rank: 'K', suit: 'hearts' },
          { rank: 'Q', suit: 'hearts' },
          { rank: 'J', suit: 'hearts' },
          { rank: '10', suit: 'hearts' },
        ],
        players: [
          {
            id: 'winner',
            username: 'winner',
            seatNumber: 0,
            chipCount: 2000, // Won the pot
            currentBet: 0,
            isActive: true,
            isFolded: false,
            isAllIn: false,
            cards: [
              { rank: '9', suit: 'hearts' },
              { rank: '8', suit: 'hearts' },
            ],
          },
          {
            id: 'loser',
            username: 'loser',
            seatNumber: 1,
            chipCount: 0, // Lost everything
            currentBet: 0,
            isActive: false, // No longer active (busted)
            isFolded: false,
            isAllIn: false,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const request = createAuthenticatedRequest({
        method: 'GET',
        url: `http://localhost/api/games/${gameId}`,
        params: { gameId },
      }, 'winner'); // Authenticated as winner

      // Mock DB response
      const mockEnv = request.env as any;
      mockEnv.DB.prepare().first.mockResolvedValueOnce(mockGame);

      // Update auth mock for winner
      jest.spyOn(AuthenticationManager.prototype, 'verifyAccessToken').mockResolvedValueOnce({
        valid: true,
        payload: {
          userId: 'winner',
          username: 'winner',
          email: 'winner@example.com',
          roles: ['player'],
          sessionId: 'winner-session',
          iat: Date.now() / 1000,
          exp: Date.now() / 1000 + 3600,
        },
      });

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          responseSchema: GameStateSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.phase).toBe(GamePhase.FINISHED);
      expect(result.body.data.pot).toBe(0);
    });
  });
});