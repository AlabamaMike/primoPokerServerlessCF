import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createStatisticsRoutes } from '../../routes/statistics';
import { D1PlayerStatisticsRepository } from '@primo-poker/persistence';
import { 
  PlayerStatistics, 
  PlayerStatsView,
  StatsPeriod,
  StatsGameType,
  RandomUtils
} from '@primo-poker/shared';

// Mock dependencies
jest.mock('@primo-poker/persistence');
jest.mock('@primo-poker/core', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock rate limiter
jest.mock('../../middleware/rate-limiter', () => ({
  statisticsRateLimiter: {
    middleware: () => jest.fn((req: any) => Promise.resolve())
  }
}));

describe('Statistics Routes', () => {
  let router: any;
  let mockRequest: any;
  let mockDB: any;
  let mockStatsRepo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    router = createStatisticsRoutes();
    
    mockDB = {};
    mockStatsRepo = {
      findByPlayer: jest.fn(),
      getLeaderboard: jest.fn()
    };
    
    (D1PlayerStatisticsRepository as jest.MockedClass<typeof D1PlayerStatisticsRepository>).mockImplementation(
      () => mockStatsRepo as any
    );
    
    mockRequest = {
      url: 'http://localhost',
      headers: new Map([['Authorization', 'Bearer test-token']]),
      user: {
        userId: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        roles: []
      },
      env: { DB: mockDB },
      params: {},
      query: {}
    };
  });

  describe('GET /api/players/:playerId/statistics', () => {
    const mockStats: Partial<PlayerStatistics> = {
      id: 'stat-123',
      playerId: 'user-123',
      period: StatsPeriod.ALL_TIME,
      gameType: StatsGameType.ALL,
      periodStart: new Date('2024-01-01'),
      handsPlayed: 1000,
      handsWon: 150,
      totalWinnings: 5000,
      totalBetAmount: 20000,
      vpip: 25.5,
      pfr: 18.2,
      aggressionFactor: 2.1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastCalculatedAt: new Date()
    };

    it('should return player statistics for own player ID', async () => {
      mockRequest.url = 'http://localhost/api/players/user-123/statistics';
      mockRequest.params = { playerId: 'user-123' };
      mockStatsRepo.findByPlayer.mockResolvedValue([mockStats]);

      const handler = router.routes.find((r: any) => 
        r.method === 'GET' && r.path.includes('/api/players/:playerId/statistics')
      ).handler;

      const response = await handler(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.playerId).toBe('user-123');
      expect(data.data.statistics).toHaveLength(1);
      expect(data.data.statistics[0].playerId).toBe('user-123');
      
      // Check cache headers
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=300');
    });

    it('should allow admin to access other player statistics', async () => {
      mockRequest.user.roles = ['admin'];
      mockRequest.url = 'http://localhost/api/players/other-user-456/statistics';
      mockRequest.params = { playerId: 'other-user-456' };
      mockStatsRepo.findByPlayer.mockResolvedValue([{ ...mockStats, playerId: 'other-user-456' }]);

      const handler = router.routes.find((r: any) => 
        r.method === 'GET' && r.path.includes('/api/players/:playerId/statistics')
      ).handler;

      const response = await handler(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.playerId).toBe('other-user-456');
    });

    it('should return 403 when non-admin tries to access other player statistics', async () => {
      mockRequest.url = 'http://localhost/api/players/other-user-456/statistics';
      mockRequest.params = { playerId: 'other-user-456' };

      const handler = router.routes.find((r: any) => 
        r.method === 'GET' && r.path.includes('/api/players/:playerId/statistics')
      ).handler;

      const response = await handler(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('FORBIDDEN');
    });

    it('should return 400 for invalid player ID format', async () => {
      mockRequest.url = 'http://localhost/api/players/invalid-id/statistics';
      mockRequest.params = { playerId: 'invalid-id' };

      const handler = router.routes.find((r: any) => 
        r.method === 'GET' && r.path.includes('/api/players/:playerId/statistics')
      ).handler;

      const response = await handler(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_PLAYER_ID');
    });

    it('should return 404 when no statistics found', async () => {
      mockRequest.url = 'http://localhost/api/players/user-123/statistics';
      mockRequest.params = { playerId: 'user-123' };
      mockStatsRepo.findByPlayer.mockResolvedValue([]);

      const handler = router.routes.find((r: any) => 
        r.method === 'GET' && r.path.includes('/api/players/:playerId/statistics')
      ).handler;

      const response = await handler(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('STATS_NOT_FOUND');
    });

    it('should filter by period and gameType', async () => {
      mockRequest.url = 'http://localhost/api/players/user-123/statistics?period=monthly&gameType=cash';
      mockRequest.params = { playerId: 'user-123' };
      mockStatsRepo.findByPlayer.mockResolvedValue([mockStats]);

      const handler = router.routes.find((r: any) => 
        r.method === 'GET' && r.path.includes('/api/players/:playerId/statistics')
      ).handler;

      await handler(mockRequest);

      expect(mockStatsRepo.findByPlayer).toHaveBeenCalledWith(
        'user-123',
        StatsPeriod.MONTHLY,
        StatsGameType.CASH
      );
    });
  });

  describe('GET /api/leaderboards', () => {
    const mockLeaderboard: Partial<PlayerStatsView>[] = [
      {
        playerId: 'player-1',
        username: 'TopPlayer',
        lifetimeHandsPlayed: 5000,
        lifetimeWinnings: 25000,
        lifetimeWinRate: 8.5,
        recentHandsPlayed: 500,
        recentWinnings: 3000,
        recentWinRate: 10.2,
        overallRank: 1,
        profitRank: 1,
        achievementsCount: 5,
        lastActiveAt: new Date()
      },
      {
        playerId: 'player-2',
        username: 'SecondBest',
        lifetimeHandsPlayed: 4500,
        lifetimeWinnings: 20000,
        lifetimeWinRate: 7.5,
        recentHandsPlayed: 400,
        recentWinnings: 2500,
        recentWinRate: 9.0,
        overallRank: 2,
        profitRank: 2,
        achievementsCount: 3,
        lastActiveAt: new Date()
      }
    ];

    it('should return leaderboard data', async () => {
      mockRequest.url = 'http://localhost/api/leaderboards';
      mockStatsRepo.getLeaderboard.mockResolvedValue(mockLeaderboard);

      const handler = router.routes.find((r: any) => 
        r.method === 'GET' && r.path === '/api/leaderboards'
      ).handler;

      const response = await handler(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.leaderboard).toHaveLength(2);
      expect(data.data.leaderboard[0].username).toBe('TopPlayer');
      
      // Check cache headers
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=60, s-maxage=60');
    });

    it('should handle query parameters correctly', async () => {
      mockRequest.url = 'http://localhost/api/leaderboards?period=weekly&gameType=tournament&sortBy=roi&limit=10&offset=20';
      mockStatsRepo.getLeaderboard.mockResolvedValue(mockLeaderboard);

      const handler = router.routes.find((r: any) => 
        r.method === 'GET' && r.path === '/api/leaderboards'
      ).handler;

      const response = await handler(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.query).toEqual({
        period: StatsPeriod.WEEKLY,
        gameType: StatsGameType.TOURNAMENT,
        sortBy: 'roi',
        sortOrder: 'desc',
        limit: 10,
        offset: 20
      });

      expect(mockStatsRepo.getLeaderboard).toHaveBeenCalledWith(
        expect.objectContaining({
          period: StatsPeriod.WEEKLY,
          gameType: StatsGameType.TOURNAMENT,
          sortBy: 'roi',
          limit: 10,
          offset: 20
        })
      );
    });

    it('should handle pagination metadata', async () => {
      mockRequest.url = 'http://localhost/api/leaderboards?limit=2';
      mockStatsRepo.getLeaderboard.mockResolvedValue(mockLeaderboard);

      const handler = router.routes.find((r: any) => 
        r.method === 'GET' && r.path === '/api/leaderboards'
      ).handler;

      const response = await handler(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.pagination).toEqual({
        limit: 2,
        offset: 0,
        hasMore: true,
        nextOffset: 2
      });
    });

    it('should return 400 for invalid query parameters', async () => {
      mockRequest.url = 'http://localhost/api/leaderboards?limit=invalid';

      const handler = router.routes.find((r: any) => 
        r.method === 'GET' && r.path === '/api/leaderboards'
      ).handler;

      const response = await handler(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_QUERY');
    });

    it('should work without authentication', async () => {
      delete mockRequest.user;
      mockRequest.url = 'http://localhost/api/leaderboards';
      mockStatsRepo.getLeaderboard.mockResolvedValue(mockLeaderboard);

      const handler = router.routes.find((r: any) => 
        r.method === 'GET' && r.path === '/api/leaderboards'
      ).handler;

      const response = await handler(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      mockRequest.url = 'http://localhost/api/leaderboards';
      mockStatsRepo.getLeaderboard.mockRejectedValue(new Error('Database connection failed'));

      const handler = router.routes.find((r: any) => 
        r.method === 'GET' && r.path === '/api/leaderboards'
      ).handler;

      const response = await handler(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('Authentication', () => {
    it('should return 401 when no auth header provided for player statistics', async () => {
      mockRequest.headers.delete('Authorization');
      mockRequest.url = 'http://localhost/api/players/user-123/statistics';
      mockRequest.params = { playerId: 'user-123' };

      const requireAuth = router.routes.find((r: any) => 
        r.method === 'GET' && r.path.includes('/api/players/:playerId/statistics')
      ).middlewares[0];

      const response = await requireAuth(mockRequest);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when invalid auth header format', async () => {
      mockRequest.headers.set('Authorization', 'InvalidFormat token');
      mockRequest.url = 'http://localhost/api/players/user-123/statistics';
      mockRequest.params = { playerId: 'user-123' };

      const requireAuth = router.routes.find((r: any) => 
        r.method === 'GET' && r.path.includes('/api/players/:playerId/statistics')
      ).middlewares[0];

      const response = await requireAuth(mockRequest);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });
});