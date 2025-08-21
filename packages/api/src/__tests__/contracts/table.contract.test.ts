import { z } from 'zod';
import { PokerAPIRoutes } from '../../routes';
import {
  createMockRequest,
  createAuthenticatedRequest,
  verifyContract,
  expectSuccessResponse,
  expectErrorResponse,
  testSchemaValidation,
  createTestTable,
} from './contract-test-utils';
import { AuthenticationManager } from '@primo-poker/security';
import { GameType, GamePhase, TableConfigSchema } from '@primo-poker/shared';

// Request schemas
const CreateTableRequestSchema = z.object({
  name: z.string().min(1).max(50),
  gameType: z.nativeEnum(GameType),
  smallBlind: z.number().positive(),
  bigBlind: z.number().positive(),
  minBuyIn: z.number().positive(),
  maxBuyIn: z.number().positive(),
  maxPlayers: z.number().int().min(2).max(9),
  timeToAct: z.number().int().min(5000).max(60000).optional(),
  timeBankMax: z.number().int().min(0).max(300000).optional(),
  password: z.string().optional(),
});

const JoinTableRequestSchema = z.object({
  buyIn: z.number().positive(),
  password: z.string().optional(),
});

const PlayerActionRequestSchema = z.object({
  action: z.enum(['FOLD', 'CHECK', 'CALL', 'BET', 'RAISE', 'ALL_IN']),
  amount: z.number().nonnegative().optional(),
});

// Response schemas
const TableListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  gameType: z.nativeEnum(GameType),
  stakes: z.object({
    smallBlind: z.number().positive(),
    bigBlind: z.number().positive(),
  }),
  playerCount: z.number().nonnegative(),
  maxPlayers: z.number().positive(),
  isActive: z.boolean(),
});

const TableStateSchema = z.object({
  tableId: z.string().uuid(),
  config: TableConfigSchema,
  playerCount: z.number().nonnegative(),
  isActive: z.boolean(),
  currentGame: z.object({
    id: z.string().uuid(),
    phase: z.nativeEnum(GamePhase),
    pot: z.number().nonnegative(),
    currentBet: z.number().nonnegative(),
    dealerPosition: z.number().int().nonnegative(),
  }).optional(),
  players: z.array(z.object({
    id: z.string().uuid(),
    username: z.string(),
    chipCount: z.number().nonnegative(),
    seatNumber: z.number().int().min(0).max(8),
    isActive: z.boolean(),
  })),
});

const JoinTableResponseSchema = z.object({
  success: z.boolean(),
  seatNumber: z.number().int().min(0).max(8),
  chipCount: z.number().positive(),
  message: z.string().optional(),
});

const TableSeatsResponseSchema = z.object({
  tableId: z.string().uuid(),
  maxSeats: z.number().positive(),
  seats: z.array(z.object({
    seatNumber: z.number().int().positive(),
    isOccupied: z.boolean(),
    playerId: z.string().uuid().optional(),
    playerName: z.string().optional(),
    chipCount: z.number().nonnegative().optional(),
    isActive: z.boolean(),
  })),
  availableSeats: z.array(z.number().int().positive()),
});

describe('Table API Contract Tests', () => {
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

  describe('GET /api/tables', () => {
    it('should return list of tables', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/tables',
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expectSuccessResponse(body);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should return specific table when tableId query provided', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/tables',
        query: { tableId: 'test-table-id' },
      });

      // Mock durable object response
      const mockTable = {
        tableId: 'test-table-id',
        config: createTestTable(),
        playerCount: 3,
        isActive: true,
      };

      const mockEnv = request.env as any;
      mockEnv.GAME_TABLES.get().fetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockTable), { status: 200 })
      );

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expectSuccessResponse(body);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(1);
    });
  });

  describe('POST /api/tables', () => {
    it('should validate request schema', async () => {
      await testSchemaValidation(
        CreateTableRequestSchema,
        {
          name: 'Test Table',
          gameType: GameType.TEXAS_HOLDEM,
          smallBlind: 10,
          bigBlind: 20,
          minBuyIn: 100,
          maxBuyIn: 1000,
          maxPlayers: 9,
        },
        [
          { data: { name: '', gameType: GameType.TEXAS_HOLDEM, smallBlind: 10, bigBlind: 20, minBuyIn: 100, maxBuyIn: 1000, maxPlayers: 9 }, expectedError: 'too small' },
          { data: { name: 'Table', gameType: 'INVALID', smallBlind: 10, bigBlind: 20, minBuyIn: 100, maxBuyIn: 1000, maxPlayers: 9 }, expectedError: 'Invalid' },
          { data: { name: 'Table', gameType: GameType.TEXAS_HOLDEM, smallBlind: -10, bigBlind: 20, minBuyIn: 100, maxBuyIn: 1000, maxPlayers: 9 }, expectedError: 'positive' },
          { data: { name: 'Table', gameType: GameType.TEXAS_HOLDEM, smallBlind: 10, bigBlind: 20, minBuyIn: 100, maxBuyIn: 1000, maxPlayers: 1 }, expectedError: 'too small' },
          { data: { name: 'Table', gameType: GameType.TEXAS_HOLDEM, smallBlind: 10, bigBlind: 20, minBuyIn: 100, maxBuyIn: 1000, maxPlayers: 10 }, expectedError: 'too small' },
        ]
      );
    });

    it('should require authentication', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/tables',
        body: createTestTable(),
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Missing or invalid authorization header/);
    });

    it('should create table successfully', async () => {
      const tableConfig = {
        name: 'High Stakes Table',
        gameType: GameType.TEXAS_HOLDEM,
        smallBlind: 50,
        bigBlind: 100,
        minBuyIn: 1000,
        maxBuyIn: 10000,
        maxPlayers: 6,
        timeToAct: 30000,
        timeBankMax: 60000,
      };

      const request = createAuthenticatedRequest({
        method: 'POST',
        url: 'http://localhost/api/tables',
        body: tableConfig,
      });

      // Mock durable object response
      const mockEnv = request.env as any;
      mockEnv.GAME_TABLES.get().fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          success: true,
          tableId: 'new-table-id',
          ...tableConfig,
        }), { status: 200 })
      );

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expectSuccessResponse(body);
      expect(body.data.tableId).toBeDefined();
      expect(body.data.name).toBe(tableConfig.name);
    });

    it('should handle invalid table configuration', async () => {
      const invalidConfig = {
        name: 'Invalid Table',
        gameType: GameType.TEXAS_HOLDEM,
        smallBlind: 100,
        bigBlind: 50, // Big blind smaller than small blind
        minBuyIn: 1000,
        maxBuyIn: 500, // Max buy-in smaller than min
        maxPlayers: 9,
      };

      const request = createAuthenticatedRequest({
        method: 'POST',
        url: 'http://localhost/api/tables',
        body: invalidConfig,
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expectErrorResponse(body, '400', /Invalid table configuration/);
    });

    it('should create password-protected table', async () => {
      const tableConfig = {
        name: 'Private Table',
        gameType: GameType.TEXAS_HOLDEM,
        smallBlind: 10,
        bigBlind: 20,
        minBuyIn: 100,
        maxBuyIn: 1000,
        maxPlayers: 9,
        password: 'secret123',
      };

      const request = createAuthenticatedRequest({
        method: 'POST',
        url: 'http://localhost/api/tables',
        body: tableConfig,
      });

      // Mock durable object response
      const mockEnv = request.env as any;
      mockEnv.GAME_TABLES.get().fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          success: true,
          tableId: 'private-table-id',
          ...tableConfig,
        }), { status: 200 })
      );

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expectSuccessResponse(body);
    });
  });

  describe('GET /api/tables/:tableId', () => {
    it('should return table state', async () => {
      const tableId = 'test-table-id';
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost/api/tables/${tableId}`,
        params: { tableId },
      });

      const mockTableState = {
        tableId,
        config: createTestTable(),
        playerCount: 2,
        isActive: true,
        currentGame: {
          id: 'game-id',
          phase: GamePhase.PRE_FLOP,
          pot: 30,
          currentBet: 20,
          dealerPosition: 0,
        },
        players: [
          { id: 'player1', username: 'player1', chipCount: 980, seatNumber: 0, isActive: true },
          { id: 'player2', username: 'player2', chipCount: 990, seatNumber: 2, isActive: true },
        ],
      };

      // Mock durable object response
      const mockEnv = request.env as any;
      mockEnv.GAME_TABLES.get().fetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockTableState), { status: 200 })
      );

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          responseSchema: TableStateSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.tableId).toBe(tableId);
    });

    it('should handle table not found', async () => {
      const tableId = 'non-existent-table';
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost/api/tables/${tableId}`,
        params: { tableId },
      });

      // Mock durable object response
      const mockEnv = request.env as any;
      mockEnv.GAME_TABLES.get().fetch.mockResolvedValueOnce(
        new Response('Table not found', { status: 404 })
      );

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(404);
      expectErrorResponse(body, '404', /Table not found/);
    });

    it('should require table ID parameter', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/tables/',
        params: {},
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expectErrorResponse(body, '400', /Table ID required/);
    });
  });

  describe('POST /api/tables/:tableId/join', () => {
    it('should validate request schema', async () => {
      await testSchemaValidation(
        JoinTableRequestSchema,
        {
          buyIn: 500,
        },
        [
          { data: { buyIn: 0 }, expectedError: 'positive' },
          { data: { buyIn: -100 }, expectedError: 'positive' },
          { data: {}, expectedError: 'Required' },
        ]
      );
    });

    it('should require authentication', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/tables/test-table/join',
        params: { tableId: 'test-table' },
        body: { buyIn: 500 },
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Missing or invalid authorization header/);
    });

    it('should join table successfully', async () => {
      const tableId = 'test-table-id';
      const request = createAuthenticatedRequest({
        method: 'POST',
        url: `http://localhost/api/tables/${tableId}/join`,
        params: { tableId },
        body: { buyIn: 500 },
      });

      // Mock durable object response
      const mockEnv = request.env as any;
      mockEnv.GAME_TABLES.get().fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          success: true,
          seatNumber: 3,
          chipCount: 500,
          message: 'Successfully joined table',
        }), { status: 200 })
      );

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          requestSchema: JoinTableRequestSchema,
          responseSchema: JoinTableResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.seatNumber).toBeDefined();
      expect(result.body.data.chipCount).toBe(500);
    });

    it('should handle table full error', async () => {
      const tableId = 'full-table-id';
      const request = createAuthenticatedRequest({
        method: 'POST',
        url: `http://localhost/api/tables/${tableId}/join`,
        params: { tableId },
        body: { buyIn: 500 },
      });

      // Mock durable object response
      const mockEnv = request.env as any;
      mockEnv.GAME_TABLES.get().fetch.mockResolvedValueOnce(
        new Response('Table is full', { status: 400 })
      );

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expectErrorResponse(body, '400', /Table is full/);
    });

    it('should handle insufficient funds error', async () => {
      const tableId = 'test-table-id';
      const request = createAuthenticatedRequest({
        method: 'POST',
        url: `http://localhost/api/tables/${tableId}/join`,
        params: { tableId },
        body: { buyIn: 10000 }, // Too high
      });

      // Mock durable object response
      const mockEnv = request.env as any;
      mockEnv.GAME_TABLES.get().fetch.mockResolvedValueOnce(
        new Response('Insufficient funds', { status: 400 })
      );

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expectErrorResponse(body, '400', /Insufficient funds/);
    });

    it('should join password-protected table', async () => {
      const tableId = 'private-table-id';
      const request = createAuthenticatedRequest({
        method: 'POST',
        url: `http://localhost/api/tables/${tableId}/join`,
        params: { tableId },
        body: { buyIn: 500, password: 'secret123' },
      });

      // Mock durable object response
      const mockEnv = request.env as any;
      mockEnv.GAME_TABLES.get().fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          success: true,
          seatNumber: 1,
          chipCount: 500,
        }), { status: 200 })
      );

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expectSuccessResponse(body);
    });
  });

  describe('POST /api/tables/:tableId/leave', () => {
    it('should require authentication', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/tables/test-table/leave',
        params: { tableId: 'test-table' },
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Missing or invalid authorization header/);
    });

    it('should leave table successfully', async () => {
      const tableId = 'test-table-id';
      const request = createAuthenticatedRequest({
        method: 'POST',
        url: `http://localhost/api/tables/${tableId}/leave`,
        params: { tableId },
      });

      // Mock durable object response
      const mockEnv = request.env as any;
      mockEnv.GAME_TABLES.get().fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          success: true,
          message: 'Successfully left table',
          cashOut: 750,
        }), { status: 200 })
      );

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expectSuccessResponse(body);
      expect(body.data.cashOut).toBe(750);
    });

    it('should handle player not at table error', async () => {
      const tableId = 'test-table-id';
      const request = createAuthenticatedRequest({
        method: 'POST',
        url: `http://localhost/api/tables/${tableId}/leave`,
        params: { tableId },
      });

      // Mock durable object response
      const mockEnv = request.env as any;
      mockEnv.GAME_TABLES.get().fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Player not at table' }), { status: 400 })
      );

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expectErrorResponse(body, '400', /Player not at table/);
    });
  });

  describe('GET /api/tables/:tableId/seats', () => {
    it('should return seat information', async () => {
      const tableId = 'test-table-id';
      const request = createMockRequest({
        method: 'GET',
        url: `http://localhost/api/tables/${tableId}/seats`,
        params: { tableId },
      });

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          responseSchema: TableSeatsResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.tableId).toBe(tableId);
      expect(result.body.data.seats).toHaveLength(9);
      expect(result.body.data.availableSeats).toBeDefined();
    });

    it('should require table ID parameter', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/tables//seats',
        params: {},
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expectErrorResponse(body, '400', /Table ID is required/);
    });
  });

  describe('POST /api/tables/:tableId/action', () => {
    it('should validate request schema', async () => {
      await testSchemaValidation(
        PlayerActionRequestSchema,
        {
          action: 'BET',
          amount: 100,
        },
        [
          { data: { action: 'INVALID' }, expectedError: 'Invalid' },
          { data: { action: 'BET', amount: -100 }, expectedError: 'nonnegative' },
          { data: {}, expectedError: 'Required' },
        ]
      );
    });

    it('should require authentication', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/tables/test-table/action',
        params: { tableId: 'test-table' },
        body: { action: 'CHECK' },
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Missing or invalid authorization header/);
    });

    it('should process player action successfully', async () => {
      const tableId = 'test-table-id';
      const request = createAuthenticatedRequest({
        method: 'POST',
        url: `http://localhost/api/tables/${tableId}/action`,
        params: { tableId },
        body: { action: 'BET', amount: 100 },
      });

      // Mock durable object response
      const mockEnv = request.env as any;
      mockEnv.GAME_TABLES.get().fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          success: true,
          gameState: {
            pot: 150,
            currentBet: 100,
            nextToAct: 2,
          },
        }), { status: 200 })
      );

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.gameState).toBeDefined();
    });

    it('should handle invalid action error', async () => {
      const tableId = 'test-table-id';
      const request = createAuthenticatedRequest({
        method: 'POST',
        url: `http://localhost/api/tables/${tableId}/action`,
        params: { tableId },
        body: { action: 'BET', amount: 10 }, // Below minimum
      });

      // Mock durable object response
      const mockEnv = request.env as any;
      mockEnv.GAME_TABLES.get().fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          success: false,
          error: 'Bet amount below minimum',
        }), { status: 400 })
      );

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should handle actions without amount', async () => {
      const actions = ['FOLD', 'CHECK', 'CALL'];
      
      for (const action of actions) {
        const tableId = 'test-table-id';
        const request = createAuthenticatedRequest({
          method: 'POST',
          url: `http://localhost/api/tables/${tableId}/action`,
          params: { tableId },
          body: { action },
        });

        // Mock durable object response
        const mockEnv = request.env as any;
        mockEnv.GAME_TABLES.get().fetch.mockResolvedValueOnce(
          new Response(JSON.stringify({ success: true }), { status: 200 })
        );

        const result = await verifyContract(
          router.handle.bind(router),
          request,
          {
            requestSchema: PlayerActionRequestSchema,
            statusCode: 200,
          }
        );

        expect(result.isValid).toBe(true);
      }
    });
  });
});