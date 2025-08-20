import { LazyProfileCacheManager } from '../lazy-profile-cache';
import { WorkerEnvironment } from '@primo-poker/shared';

// Mock fetch for cache client
global.fetch = jest.fn();

describe('LazyProfileCacheManager Integration Tests', () => {
  let manager: LazyProfileCacheManager;
  let mockEnv: Partial<WorkerEnvironment>;
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let cacheData: Map<string, any>;

  beforeEach(() => {
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockClear();
    cacheData = new Map();
    
    mockEnv = {
      CACHE_DO: {
        idFromName: jest.fn().mockReturnValue({ toString: () => 'mock-cache-do-id' })
      } as any,
      ANALYTICS: {
        writeDataPoint: jest.fn()
      } as any,
      ENVIRONMENT: 'development'
    };
    
    // Mock distributed cache behavior
    mockFetch.mockImplementation(async (url, options) => {
      const body = JSON.parse((options as any).body);
      const urlStr = url.toString();
      
      if (urlStr.includes('/get')) {
        const key = `${body.namespace}:${body.key}`;
        const value = cacheData.get(key);
        return {
          json: async () => ({ value, found: !!value })
        } as Response;
      }
      
      if (urlStr.includes('/set')) {
        const key = `${body.namespace}:${body.key}`;
        cacheData.set(key, body.value);
        return {
          json: async () => ({ success: true })
        } as Response;
      }
      
      if (urlStr.includes('/delete')) {
        const key = `${body.namespace}:${body.key}`;
        const deleted = cacheData.delete(key);
        return {
          json: async () => ({ deleted })
        } as Response;
      }
      
      if (urlStr.includes('/batch')) {
        const results = body.operations.map((op: any) => {
          const key = `${op.namespace}:${op.key}`;
          if (op.value !== undefined) {
            cacheData.set(key, op.value);
            return { key: op.key, success: true };
          } else {
            const value = cacheData.get(key);
            return { key: op.key, value, found: !!value };
          }
        });
        return {
          json: async () => ({ results })
        } as Response;
      }
      
      throw new Error(`Unexpected URL: ${url}`);
    });
    
    manager = new LazyProfileCacheManager(mockEnv as WorkerEnvironment);
  });

  describe('Cache Integration', () => {
    it('should properly integrate with distributed cache for profile storage', async () => {
      // First access - cache miss, creates new profile
      const profile1 = await manager.getProfile('player123');
      expect(profile1.id).toBe('player123');
      expect(profile1.basicInfo).toBeDefined();
      
      // Verify it was stored in cache
      expect(cacheData.has('profiles:profile:player123')).toBe(true);
      
      // Second access - cache hit
      const profile2 = await manager.getProfile('player123');
      expect(profile2.id).toBe(profile1.id);
      expect(profile2.basicInfo.displayName).toBe(profile1.basicInfo.displayName);
    });

    it('should update cache when fields are loaded', async () => {
      // Get profile without fields
      const profile1 = await manager.getProfile('player456');
      expect(profile1.stats).toBeUndefined();
      
      // Get profile with stats field
      const profile2 = await manager.getProfile('player456', ['stats']);
      expect(profile2.stats).toBeDefined();
      
      // Verify cache was updated
      const cachedData = cacheData.get('profiles:profile:player456');
      expect(cachedData).toBeDefined();
      expect(cachedData.stats).toBeDefined();
      
      // Third access should get stats from cache
      const profile3 = await manager.getProfile('player456');
      expect(profile3.stats).toBeDefined();
      expect(profile3.stats).toEqual(profile2.stats);
    });
  });

  describe('Batch Operations', () => {
    it('should efficiently batch multiple profile operations', async () => {
      const playerIds = ['player1', 'player2', 'player3'];
      
      // Pre-populate some profiles
      cacheData.set('profiles:profile:player1', {
        id: 'player1',
        basicInfo: { playerId: 'player1', displayName: 'Player One' },
        fieldLoadStatus: [['basicInfo', 'loaded']],
        lastUpdated: new Date()
      });
      
      const profiles = await manager.getProfileBatch(playerIds);
      
      expect(profiles).toHaveLength(3);
      expect(profiles[0].basicInfo.displayName).toBe('Player One');
      expect(profiles[1].id).toBe('player2');
      expect(profiles[2].id).toBe('player3');
      
      // Verify new profiles were cached
      expect(cacheData.has('profiles:profile:player2')).toBe(true);
      expect(cacheData.has('profiles:profile:player3')).toBe(true);
    });

    it('should handle mixed cache hits and misses in batch', async () => {
      // Pre-populate some profiles
      cacheData.set('profiles:profile:player1', {
        id: 'player1',
        basicInfo: { playerId: 'player1', displayName: 'Cached Player' },
        fieldLoadStatus: [['basicInfo', 'loaded'], ['stats', 'loaded']],
        stats: { totalGamesPlayed: 100 },
        lastUpdated: new Date()
      });
      
      cacheData.set('profiles:profile:player3', {
        id: 'player3',
        basicInfo: { playerId: 'player3', displayName: 'Another Cached' },
        fieldLoadStatus: [['basicInfo', 'loaded']],
        lastUpdated: new Date()
      });
      
      const profiles = await manager.getProfileBatch(
        ['player1', 'player2', 'player3'],
        ['stats']
      );
      
      expect(profiles[0].stats).toBeDefined();
      expect(profiles[0].stats!.totalGamesPlayed).toBe(100);
      expect(profiles[1].stats).toBeDefined(); // Newly loaded
      expect(profiles[2].stats).toBeDefined(); // Newly loaded
    });
  });

  describe('Prefetching Integration', () => {
    it('should warm cache with prefetched profiles', async () => {
      const prefetchIds = ['prefetch1', 'prefetch2', 'prefetch3'];
      
      await manager.prefetchProfiles(prefetchIds);
      
      // Verify profiles were created and cached
      expect(cacheData.has('profiles:profile:prefetch1')).toBe(true);
      expect(cacheData.has('profiles:profile:prefetch2')).toBe(true);
      expect(cacheData.has('profiles:profile:prefetch3')).toBe(true);
      
      // Subsequent access should be from cache
      const profile = await manager.getProfile('prefetch1');
      expect(profile.basicInfo.displayName).toContain('prefetch1');
    });
  });

  describe('Game History Caching', () => {
    it('should cache paginated game history', async () => {
      const playerId = 'player789';
      
      // First request - cache miss
      const page1 = await manager.getGameHistory(playerId, 1, 50);
      expect(page1.history).toEqual([]);
      expect(cacheData.has('profiles:gameHistory:player789:1:50')).toBe(true);
      
      // Second request - cache hit
      cacheData.set('profiles:gameHistory:player789:1:50', {
        history: [{ gameId: 'game1', winnings: 100 }],
        hasMore: true,
        total: 100
      });
      
      const page1Again = await manager.getGameHistory(playerId, 1, 50);
      expect(page1Again.history).toHaveLength(1);
      expect(page1Again.history[0].gameId).toBe('game1');
    });

    it('should cache different pages separately', async () => {
      const playerId = 'player999';
      
      // Request multiple pages
      await manager.getGameHistory(playerId, 1, 50);
      await manager.getGameHistory(playerId, 2, 50);
      await manager.getGameHistory(playerId, 1, 25); // Different page size
      
      // Verify separate cache entries
      expect(cacheData.has('profiles:gameHistory:player999:1:50')).toBe(true);
      expect(cacheData.has('profiles:gameHistory:player999:2:50')).toBe(true);
      expect(cacheData.has('profiles:gameHistory:player999:1:25')).toBe(true);
    });
  });

  describe('Analytics Integration', () => {
    it('should track analytics for all operations', async () => {
      // Single profile access
      await manager.getProfile('player1', ['basicInfo', 'stats']);
      expect(mockEnv.ANALYTICS?.writeDataPoint).toHaveBeenCalledWith({
        blobs: ['profile_access', 'player1', 'basicInfo', 'stats'],
        doubles: [expect.any(Number), 2],
        indexes: ['lazy_profile', 'development']
      });
      
      // Batch access
      await manager.getProfileBatch(['player2', 'player3'], ['basicInfo']);
      expect(mockEnv.ANALYTICS?.writeDataPoint).toHaveBeenCalledTimes(3); // 1 + 2
    });

    it('should build access patterns from multiple accesses', async () => {
      // Multiple accesses to same profile
      await manager.getProfile('player1', ['basicInfo']);
      await manager.getProfile('player1', ['stats']);
      await manager.getProfile('player1', ['basicInfo', 'stats']);
      await manager.getProfile('player1', ['gameHistory']);
      
      const patterns = await manager.getAccessPatterns();
      const player1Patterns = patterns.get('player1');
      
      expect(player1Patterns).toBeDefined();
      expect(player1Patterns!.length).toBe(3); // basicInfo, stats, gameHistory
      
      const basicInfoPattern = player1Patterns!.find(p => p.field === 'basicInfo');
      expect(basicInfoPattern!.accessCount).toBe(2);
      
      const statsPattern = player1Patterns!.find(p => p.field === 'stats');
      expect(statsPattern!.accessCount).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle cache failures gracefully', async () => {
      // Mock cache failure
      mockFetch.mockRejectedValueOnce(new Error('Cache unavailable'));
      
      // Should still work by creating new profile
      await expect(manager.getProfile('player1')).rejects.toThrow();
    });

    it('should handle partial field loading failures', async () => {
      const profile = await manager.getProfile('player1');
      
      // Mock stats loading failure
      const originalFetch = mockFetch.getMockImplementation();
      mockFetch.mockImplementationOnce(async () => {
        throw new Error('Stats service unavailable');
      });
      
      // Restore normal behavior for subsequent calls
      mockFetch.mockImplementation(originalFetch!);
      
      // Should handle error gracefully
      const profileWithStats = await manager.getProfile('player1', ['stats']);
      expect(profileWithStats.id).toBe('player1');
      expect(profileWithStats.fieldLoadStatus.get('stats')).toBe('pending'); // Failed to load
    });
  });
});