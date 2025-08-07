import { LobbyTablesRoute, LobbyTable, LobbyTablesResponse } from '../routes/lobby/tables';
import { WorkerEnvironment } from '@primo-poker/shared';

// Mock the logger
jest.mock('@primo-poker/core', () => ({
  logger: {
    setContext: jest.fn(),
    clearContext: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('LobbyTablesRoute', () => {
  let route: LobbyTablesRoute;
  let mockEnv: WorkerEnvironment;
  let mockLobbyCoordinator: any;
  let mockDurableObject: any;

  beforeEach(() => {
    // Setup mock Durable Object
    mockDurableObject = {
      fetch: jest.fn(),
    };

    // Setup mock namespace
    mockLobbyCoordinator = {
      idFromName: jest.fn().mockReturnValue('mock-id'),
      get: jest.fn().mockReturnValue(mockDurableObject),
    };

    // Setup mock environment
    mockEnv = {
      LOBBY_COORDINATOR: mockLobbyCoordinator,
    } as any;

    route = new LobbyTablesRoute(mockEnv);
  });

  describe('handleGetTables', () => {
    const createMockRequest = (queryString: string = '') => ({
      url: `https://example.com/api/lobby/tables${queryString}`,
      headers: {
        get: jest.fn().mockReturnValue(null),
      },
    } as any);

    const createMockTable = (id: number): LobbyTable => ({
      id: `table-${id}`,
      name: `Table ${id}`,
      gameType: 'holdem',
      stakes: {
        smallBlind: id * 10,
        bigBlind: id * 20,
        currency: 'USD',
      },
      seats: {
        total: 9,
        occupied: Math.floor(Math.random() * 9),
        available: Math.floor(Math.random() * 9),
      },
      statistics: {
        avgPot: id * 100,
        handsPerHour: 30 + id,
        playersPerFlop: 45.5,
      },
      waitingList: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
    });

    it('should fetch tables without filters', async () => {
      const mockTables = [createMockTable(1), createMockTable(2)];
      const mockResponse: LobbyTablesResponse = {
        tables: mockTables,
        pagination: {
          hasMore: false,
          total: 2,
        },
      };

      mockDurableObject.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const request = createMockRequest();
      const response = await route.handleGetTables(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.tables).toHaveLength(2);
      expect(data.data.pagination.total).toBe(2);

      // Verify DO was called correctly
      expect(mockLobbyCoordinator.idFromName).toHaveBeenCalledWith('main-lobby');
      expect(mockDurableObject.fetch).toHaveBeenCalledWith(
        'http://internal/tables',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filters: {
              stakes: undefined,
              seatsAvailable: undefined,
              gameType: undefined,
            },
            sort: undefined,
            cursor: undefined,
            limit: 50,
          }),
        })
      );
    });

    it('should apply stakes filter', async () => {
      const mockResponse: LobbyTablesResponse = {
        tables: [createMockTable(1)],
        pagination: { hasMore: false, total: 1 },
      };

      mockDurableObject.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const request = createMockRequest('?stakes=low,medium');
      await route.handleGetTables(request);

      expect(mockDurableObject.fetch).toHaveBeenCalledWith(
        'http://internal/tables',
        expect.objectContaining({
          body: expect.stringContaining('"stakes":["low","medium"]'),
        })
      );
    });

    it('should apply seats available filter', async () => {
      const mockResponse: LobbyTablesResponse = {
        tables: [createMockTable(1)],
        pagination: { hasMore: false, total: 1 },
      };

      mockDurableObject.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const request = createMockRequest('?seats_available=2-6');
      await route.handleGetTables(request);

      expect(mockDurableObject.fetch).toHaveBeenCalledWith(
        'http://internal/tables',
        expect.objectContaining({
          body: expect.stringContaining('"seatsAvailable":"2-6"'),
        })
      );
    });

    it('should apply game type filter', async () => {
      const mockResponse: LobbyTablesResponse = {
        tables: [createMockTable(1)],
        pagination: { hasMore: false, total: 1 },
      };

      mockDurableObject.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const request = createMockRequest('?game_type=holdem');
      await route.handleGetTables(request);

      expect(mockDurableObject.fetch).toHaveBeenCalledWith(
        'http://internal/tables',
        expect.objectContaining({
          body: expect.stringContaining('"gameType":"holdem"'),
        })
      );
    });

    it('should apply sorting', async () => {
      const mockResponse: LobbyTablesResponse = {
        tables: [createMockTable(2), createMockTable(1)],
        pagination: { hasMore: false, total: 2 },
      };

      mockDurableObject.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const request = createMockRequest('?sort=players_desc');
      await route.handleGetTables(request);

      expect(mockDurableObject.fetch).toHaveBeenCalledWith(
        'http://internal/tables',
        expect.objectContaining({
          body: expect.stringContaining('"sort":{"field":"players","direction":"desc"}'),
        })
      );
    });

    it('should handle cursor-based pagination', async () => {
      const mockResponse: LobbyTablesResponse = {
        tables: [createMockTable(3), createMockTable(4)],
        pagination: {
          cursor: 'next-cursor',
          hasMore: true,
          total: 100,
        },
      };

      mockDurableObject.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const request = createMockRequest('?cursor=abc123&limit=2');
      const response = await route.handleGetTables(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.pagination.cursor).toBe('next-cursor');
      expect(data.data.pagination.hasMore).toBe(true);

      expect(mockDurableObject.fetch).toHaveBeenCalledWith(
        'http://internal/tables',
        expect.objectContaining({
          body: expect.stringContaining('"cursor":"abc123"'),
        })
      );
    });

    it('should limit max results to 100', async () => {
      const mockResponse: LobbyTablesResponse = {
        tables: [],
        pagination: { hasMore: false, total: 0 },
      };

      mockDurableObject.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const request = createMockRequest('?limit=200');
      await route.handleGetTables(request);

      expect(mockDurableObject.fetch).toHaveBeenCalledWith(
        'http://internal/tables',
        expect.objectContaining({
          body: expect.stringContaining('"limit":100'),
        })
      );
    });

    it('should handle multiple filters and sorting', async () => {
      const mockResponse: LobbyTablesResponse = {
        tables: [createMockTable(1)],
        pagination: { hasMore: false, total: 1 },
      };

      mockDurableObject.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const request = createMockRequest('?stakes=high&seats_available=1-3&game_type=holdem&sort=avgPot_asc');
      await route.handleGetTables(request);

      const expectedBody = {
        filters: {
          stakes: ['high'],
          seatsAvailable: '1-3',
          gameType: 'holdem',
        },
        sort: {
          field: 'avgPot',
          direction: 'asc',
        },
        cursor: undefined,
        limit: 50,
      };

      expect(mockDurableObject.fetch).toHaveBeenCalledWith(
        'http://internal/tables',
        expect.objectContaining({
          body: JSON.stringify(expectedBody),
        })
      );
    });

    it('should handle DO fetch errors', async () => {
      mockDurableObject.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal DO error',
      });

      const request = createMockRequest();
      const response = await route.handleGetTables(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.message).toBe('Failed to fetch tables');
    });

    it('should handle missing LOBBY_COORDINATOR', async () => {
      const routeWithoutCoordinator = new LobbyTablesRoute({} as any);
      const request = createMockRequest();
      const response = await routeWithoutCoordinator.handleGetTables(request);

      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.message).toBe('Service temporarily unavailable');
    });

    it('should handle exceptions', async () => {
      mockDurableObject.fetch.mockRejectedValueOnce(new Error('Network error'));

      const request = createMockRequest();
      const response = await route.handleGetTables(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.message).toBe('Internal server error');
    });

    it('should include correlation ID in logging context', async () => {
      const mockResponse: LobbyTablesResponse = {
        tables: [],
        pagination: { hasMore: false, total: 0 },
      };

      mockDurableObject.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const request = createMockRequest();
      request.headers.get = jest.fn((name) => 
        name === 'X-Correlation-ID' ? 'test-correlation-id' : null
      );

      await route.handleGetTables(request);

      const { logger } = require('@primo-poker/core');
      expect(logger.setContext).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          operation: 'getLobbyTables',
        })
      );
      expect(logger.clearContext).toHaveBeenCalled();
    });

    it('should validate sort parameters', async () => {
      const mockResponse: LobbyTablesResponse = {
        tables: [],
        pagination: { hasMore: false, total: 0 },
      };

      mockDurableObject.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      // Invalid sort field should be ignored
      const request = createMockRequest('?sort=invalid_desc');
      await route.handleGetTables(request);

      expect(mockDurableObject.fetch).toHaveBeenCalledWith(
        'http://internal/tables',
        expect.objectContaining({
          body: expect.stringContaining('"sort":undefined'),
        })
      );
    });
  });
});
