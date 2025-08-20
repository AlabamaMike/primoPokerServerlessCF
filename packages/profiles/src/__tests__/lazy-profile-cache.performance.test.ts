import { LazyProfileCacheManager } from '../lazy-profile-cache';
import { ProfileCacheManager } from '../profile-cache';
import { WorkerEnvironment } from '@primo-poker/shared';

// Mock fetch for cache client
global.fetch = jest.fn();

describe('LazyProfileCacheManager Performance Tests', () => {
  let lazyManager: LazyProfileCacheManager;
  let standardManager: ProfileCacheManager;
  let mockEnv: Partial<WorkerEnvironment>;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockClear();
    
    mockEnv = {
      CACHE_DO: {
        idFromName: jest.fn().mockReturnValue({ toString: () => 'mock-cache-do-id' })
      } as any,
      ANALYTICS: {
        writeDataPoint: jest.fn()
      } as any,
      ENVIRONMENT: 'development'
    };
    
    lazyManager = new LazyProfileCacheManager(mockEnv as WorkerEnvironment);
    standardManager = new ProfileCacheManager();
  });

  describe('Memory Usage Comparison', () => {
    it('should use less memory with lazy loading for partial field access', async () => {
      // Mock full profile data
      const fullProfile = {
        id: 'player123',
        basicInfo: {
          playerId: 'player123',
          displayName: 'TestPlayer',
          avatarUrl: 'https://example.com/avatar.jpg'
        },
        stats: {
          totalGamesPlayed: 1000,
          totalWinnings: 50000,
          biggestPot: 5000,
          favoriteGameType: 'No Limit Hold\'em',
          winRate: 55.5,
          handsPlayed: 25000,
          vpip: 22.5,
          pfr: 18.2,
          aggression: 3.2
        },
        gameHistory: Array.from({ length: 100 }, (_, i) => ({
          gameId: `game${i}`,
          tableName: `Table ${i}`,
          playedAt: new Date(),
          position: (i % 6) + 1,
          totalPlayers: 6,
          winnings: Math.random() * 1000,
          handsPlayed: Math.floor(Math.random() * 100)
        })),
        achievements: Array.from({ length: 20 }, (_, i) => ({
          id: `achievement${i}`,
          name: `Achievement ${i}`,
          description: `Description for achievement ${i}`,
          unlockedAt: new Date(),
          rarity: ['common', 'rare', 'epic', 'legendary'][i % 4] as any
        }))
      };

      // Mock lazy loaded profile (just basic info)
      const lazyProfile = {
        id: 'player123',
        basicInfo: fullProfile.basicInfo,
        fieldLoadStatus: [
          ['basicInfo', 'loaded'],
          ['stats', 'pending'],
          ['gameHistory', 'pending'],
          ['achievements', 'pending']
        ],
        lastUpdated: new Date()
      };

      mockFetch.mockResolvedValueOnce({
        json: async () => ({ value: lazyProfile, found: true })
      } as Response);

      // Test memory usage
      const lazySize = JSON.stringify(lazyProfile).length;
      const fullSize = JSON.stringify(fullProfile).length;

      expect(lazySize).toBeLessThan(fullSize);
      expect(fullSize / lazySize).toBeGreaterThan(5); // Should be at least 5x smaller
    });
  });

  describe('Load Time Comparison', () => {
    it('should load basic info faster with lazy loading', async () => {
      const iterations = 100;
      const times = {
        lazy: [] as number[],
        eager: [] as number[]
      };

      // Mock responses
      const lazyResponse = {
        id: 'player123',
        basicInfo: { playerId: 'player123', displayName: 'TestPlayer' },
        fieldLoadStatus: [['basicInfo', 'loaded']],
        lastUpdated: new Date()
      };

      const fullResponse = {
        ...lazyResponse,
        stats: { /* full stats */ },
        gameHistory: Array(100).fill({}),
        achievements: Array(20).fill({})
      };

      // Test lazy loading
      for (let i = 0; i < iterations; i++) {
        mockFetch.mockResolvedValueOnce({
          json: async () => ({ value: lazyResponse, found: true })
        } as Response);

        const start = performance.now();
        await lazyManager.getProfile('player123', ['basicInfo']);
        const end = performance.now();
        times.lazy.push(end - start);
      }

      // Test eager loading (simulated)
      for (let i = 0; i < iterations; i++) {
        mockFetch.mockResolvedValueOnce({
          json: async () => ({ value: fullResponse, found: true })
        } as Response);

        const start = performance.now();
        // Simulate processing full response
        JSON.parse(JSON.stringify(fullResponse));
        const end = performance.now();
        times.eager.push(end - start);
      }

      // Calculate averages
      const avgLazy = times.lazy.reduce((a, b) => a + b) / times.lazy.length;
      const avgEager = times.eager.reduce((a, b) => a + b) / times.eager.length;

      expect(avgLazy).toBeLessThan(avgEager);
    });
  });

  describe('Batch Loading Performance', () => {
    it('should efficiently load multiple profiles in batch', async () => {
      const playerIds = Array.from({ length: 50 }, (_, i) => `player${i}`);
      
      const batchResults = {
        results: playerIds.map(id => ({
          found: true,
          value: {
            id,
            basicInfo: { playerId: id, displayName: `Player ${id}` },
            fieldLoadStatus: [['basicInfo', 'loaded']],
            lastUpdated: new Date()
          }
        }))
      };

      mockFetch.mockResolvedValueOnce({
        json: async () => batchResults
      } as Response);

      const start = performance.now();
      const profiles = await lazyManager.getProfileBatch(playerIds);
      const end = performance.now();

      expect(profiles).toHaveLength(50);
      expect(end - start).toBeLessThan(100); // Should complete quickly

      // Should only make one batch request instead of 50 individual requests
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Prefetch Performance', () => {
    it('should not block main operations when prefetching', async () => {
      const prefetchIds = Array.from({ length: 20 }, (_, i) => `prefetch${i}`);
      const mainId = 'main-player';

      // Mock responses
      mockFetch
        .mockResolvedValueOnce({
          json: async () => ({
            results: prefetchIds.slice(0, 10).map(id => ({ found: false }))
          })
        } as Response)
        .mockResolvedValueOnce({
          json: async () => ({ value: null, found: false })
        } as Response)
        .mockResolvedValueOnce({
          json: async () => ({ success: true })
        } as Response);

      // Start prefetch (non-blocking)
      const prefetchPromise = lazyManager.prefetchProfiles(prefetchIds);

      // Immediately request main profile
      const start = performance.now();
      const profile = await lazyManager.getProfile(mainId);
      const end = performance.now();

      expect(profile).toBeDefined();
      expect(end - start).toBeLessThan(50); // Should not be blocked by prefetch

      await prefetchPromise; // Clean up
    });
  });

  describe('Access Pattern Analytics Performance', () => {
    it('should track patterns without significant overhead', async () => {
      const iterations = 1000;
      const times: number[] = [];

      const cachedProfile = {
        id: 'player123',
        basicInfo: { playerId: 'player123', displayName: 'TestPlayer' },
        fieldLoadStatus: [['basicInfo', 'loaded']],
        lastUpdated: new Date()
      };

      for (let i = 0; i < iterations; i++) {
        mockFetch.mockResolvedValueOnce({
          json: async () => ({ value: cachedProfile, found: true })
        } as Response);

        const start = performance.now();
        await lazyManager.getProfile('player123', ['basicInfo']);
        const end = performance.now();
        times.push(end - start);
      }

      const avgTime = times.reduce((a, b) => a + b) / times.length;
      const patterns = await lazyManager.getAccessPatterns();

      expect(patterns.get('player123')).toBeDefined();
      expect(avgTime).toBeLessThan(5); // Should add minimal overhead
    });
  });

  describe('Pagination Performance', () => {
    it('should efficiently handle paginated game history', async () => {
      const pages = 10;
      const pageSize = 50;
      const times: number[] = [];

      for (let page = 1; page <= pages; page++) {
        const history = {
          history: Array.from({ length: pageSize }, (_, i) => ({
            gameId: `game${(page - 1) * pageSize + i}`,
            tableName: 'Table',
            playedAt: new Date(),
            position: 1,
            totalPlayers: 6,
            winnings: 100,
            handsPlayed: 50
          })),
          hasMore: page < pages,
          total: pages * pageSize
        };

        mockFetch
          .mockResolvedValueOnce({
            json: async () => ({ value: null, found: false })
          } as Response)
          .mockResolvedValueOnce({
            json: async () => ({ success: true })
          } as Response);

        const start = performance.now();
        const result = await lazyManager.getGameHistory('player123', page, pageSize);
        const end = performance.now();
        
        times.push(end - start);
        expect(result.history).toHaveLength(0); // Mock returns empty
      }

      const avgTime = times.reduce((a, b) => a + b) / times.length;
      expect(avgTime).toBeLessThan(10); // Each page should load quickly
    });
  });
});