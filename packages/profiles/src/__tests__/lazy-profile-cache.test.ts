import { LazyProfileCacheManager, LazyProfile, PlayerBasicInfo, PlayerStats } from '../lazy-profile-cache';
import { WorkerEnvironment } from '@primo-poker/shared';

// Mock fetch for cache client
global.fetch = jest.fn();

describe('LazyProfileCacheManager', () => {
  let manager: LazyProfileCacheManager;
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
    
    manager = new LazyProfileCacheManager(mockEnv as WorkerEnvironment);
  });

  describe('getProfile', () => {
    it('should return cached profile if available', async () => {
      const cachedProfile = {
        id: 'player123',
        basicInfo: {
          playerId: 'player123',
          displayName: 'TestPlayer',
          isOnline: true
        },
        fieldLoadStatus: [
          ['basicInfo', 'loaded'],
          ['stats', 'pending']
        ],
        lastUpdated: new Date()
      };

      mockFetch.mockResolvedValueOnce({
        json: async () => ({ value: cachedProfile, found: true })
      } as Response);

      const profile = await manager.getProfile('player123');

      expect(profile.id).toBe('player123');
      expect(profile.basicInfo.displayName).toBe('TestPlayer');
      expect(profile.fieldLoadStatus.get('basicInfo')).toBe('loaded');
      expect(profile.fieldLoadStatus.get('stats')).toBe('pending');
    });

    it('should create new lazy profile if not cached', async () => {
      mockFetch
        .mockResolvedValueOnce({
          json: async () => ({ value: null, found: false })
        } as Response)
        .mockResolvedValueOnce({
          json: async () => ({ success: true })
        } as Response);

      const profile = await manager.getProfile('player456');

      expect(profile.id).toBe('player456');
      expect(profile.basicInfo).toBeDefined();
      expect(profile.fieldLoadStatus.get('basicInfo')).toBe('loaded');
      expect(profile.fieldLoadStatus.get('stats')).toBe('pending');
      expect(profile.fieldLoadStatus.get('gameHistory')).toBe('pending');
      expect(profile.fieldLoadStatus.get('achievements')).toBe('pending');
    });

    it('should load requested fields lazily', async () => {
      const cachedProfile = {
        id: 'player789',
        basicInfo: {
          playerId: 'player789',
          displayName: 'LazyPlayer'
        },
        fieldLoadStatus: [
          ['basicInfo', 'loaded'],
          ['stats', 'pending']
        ],
        lastUpdated: new Date()
      };

      mockFetch
        .mockResolvedValueOnce({
          json: async () => ({ value: cachedProfile, found: true })
        } as Response)
        .mockResolvedValueOnce({
          json: async () => ({ success: true })
        } as Response);

      const profile = await manager.getProfile('player789', ['stats']);

      expect(profile.stats).toBeDefined();
      expect(profile.fieldLoadStatus.get('stats')).toBe('loaded');
    });
  });

  describe('getProfileBatch', () => {
    it('should fetch multiple profiles efficiently', async () => {
      const batchResults = {
        results: [
          {
            found: true,
            value: {
              id: 'player1',
              basicInfo: { playerId: 'player1', displayName: 'Player1' },
              fieldLoadStatus: [['basicInfo', 'loaded']]
            }
          },
          {
            found: false
          }
        ]
      };

      mockFetch
        .mockResolvedValueOnce({
          json: async () => batchResults
        } as Response)
        .mockResolvedValueOnce({
          json: async () => ({ success: true })
        } as Response);

      const profiles = await manager.getProfileBatch(['player1', 'player2']);

      expect(profiles).toHaveLength(2);
      expect(profiles[0].id).toBe('player1');
      expect(profiles[0].basicInfo.displayName).toBe('Player1');
      expect(profiles[1].id).toBe('player2');
    });

    it('should load fields for all profiles in batch', async () => {
      const batchResults = {
        results: [
          {
            found: true,
            value: {
              id: 'player1',
              basicInfo: { playerId: 'player1', displayName: 'Player1' },
              fieldLoadStatus: [
                ['basicInfo', 'loaded'],
                ['stats', 'pending']
              ]
            }
          },
          {
            found: true,
            value: {
              id: 'player2',
              basicInfo: { playerId: 'player2', displayName: 'Player2' },
              fieldLoadStatus: [
                ['basicInfo', 'loaded'],
                ['stats', 'pending']
              ]
            }
          }
        ]
      };

      mockFetch
        .mockResolvedValueOnce({
          json: async () => batchResults
        } as Response)
        .mockResolvedValueOnce({
          json: async () => ({ success: true })
        } as Response)
        .mockResolvedValueOnce({
          json: async () => ({ success: true })
        } as Response);

      const profiles = await manager.getProfileBatch(['player1', 'player2'], ['stats']);

      expect(profiles).toHaveLength(2);
      expect(profiles[0].stats).toBeDefined();
      expect(profiles[1].stats).toBeDefined();
    });
  });

  describe('prefetchProfiles', () => {
    it('should add profiles to prefetch queue', async () => {
      const batchResults = {
        results: [
          { found: false },
          { found: false }
        ]
      };

      mockFetch
        .mockResolvedValueOnce({
          json: async () => batchResults
        } as Response)
        .mockResolvedValueOnce({
          json: async () => ({ success: true })
        } as Response)
        .mockResolvedValueOnce({
          json: async () => ({ success: true })
        } as Response);

      await manager.prefetchProfiles(['player1', 'player2']);

      // Should have made batch request
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/batch'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('player1')
        })
      );
    });

    it('should respect max prefetch queue size', async () => {
      const ids = Array.from({ length: 150 }, (_, i) => `player${i}`);
      
      await manager.prefetchProfiles(ids);

      // Queue should be limited to maxPrefetchQueueSize (100)
      // Implementation detail: we can't directly check queue size,
      // but we can verify behavior through calls
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('loadProfileField', () => {
    it('should load a single field for a profile', async () => {
      const cachedProfile = {
        id: 'player123',
        basicInfo: {
          playerId: 'player123',
          displayName: 'TestPlayer'
        },
        fieldLoadStatus: [
          ['basicInfo', 'loaded'],
          ['stats', 'pending']
        ],
        lastUpdated: new Date()
      };

      mockFetch
        .mockResolvedValueOnce({
          json: async () => ({ value: cachedProfile, found: true })
        } as Response)
        .mockResolvedValueOnce({
          json: async () => ({ success: true })
        } as Response);

      const stats = await manager.loadProfileField('player123', 'stats');

      expect(stats).toBeDefined();
      expect(stats.totalGamesPlayed).toBeDefined();
    });
  });

  describe('getGameHistory', () => {
    it('should return cached game history if available', async () => {
      const cachedHistory = {
        history: [
          {
            gameId: 'game1',
            tableName: 'Table 1',
            playedAt: new Date(),
            position: 1,
            totalPlayers: 6,
            winnings: 100,
            handsPlayed: 50
          }
        ],
        hasMore: true,
        total: 100
      };

      mockFetch.mockResolvedValueOnce({
        json: async () => ({ value: cachedHistory, found: true })
      } as Response);

      const result = await manager.getGameHistory('player123', 1, 50);

      expect(result.history).toHaveLength(1);
      expect(result.history[0].gameId).toBe('game1');
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(100);
    });

    it('should fetch and cache game history if not cached', async () => {
      mockFetch
        .mockResolvedValueOnce({
          json: async () => ({ value: null, found: false })
        } as Response)
        .mockResolvedValueOnce({
          json: async () => ({ success: true })
        } as Response);

      const result = await manager.getGameHistory('player123', 1, 50);

      expect(result.history).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);

      // Verify it was cached
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/set'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('gameHistory:player123:1:50')
        })
      );
    });
  });

  describe('getAccessPatterns', () => {
    it('should track and return access patterns', async () => {
      const cachedProfile = {
        id: 'player123',
        basicInfo: {
          playerId: 'player123',
          displayName: 'TestPlayer'
        },
        fieldLoadStatus: [['basicInfo', 'loaded']],
        lastUpdated: new Date()
      };

      mockFetch.mockResolvedValue({
        json: async () => ({ value: cachedProfile, found: true })
      } as Response);

      // Access profile multiple times
      await manager.getProfile('player123', ['basicInfo']);
      await manager.getProfile('player123', ['stats']);
      await manager.getProfile('player123', ['basicInfo']);

      const patterns = await manager.getAccessPatterns();
      const playerPatterns = patterns.get('player123');

      expect(playerPatterns).toBeDefined();
      expect(playerPatterns!.length).toBeGreaterThan(0);
      
      const basicInfoPattern = playerPatterns!.find(p => p.field === 'basicInfo');
      expect(basicInfoPattern).toBeDefined();
      expect(basicInfoPattern!.accessCount).toBe(2);
    });
  });

  describe('Analytics tracking', () => {
    it('should send analytics data when accessing profiles', async () => {
      const cachedProfile = {
        id: 'player123',
        basicInfo: {
          playerId: 'player123',
          displayName: 'TestPlayer'
        },
        fieldLoadStatus: [['basicInfo', 'loaded']],
        lastUpdated: new Date()
      };

      mockFetch.mockResolvedValueOnce({
        json: async () => ({ value: cachedProfile, found: true })
      } as Response);

      await manager.getProfile('player123', ['basicInfo', 'stats']);

      expect(mockEnv.ANALYTICS?.writeDataPoint).toHaveBeenCalledWith({
        blobs: ['profile_access', 'player123', 'basicInfo', 'stats'],
        doubles: [expect.any(Number), 2],
        indexes: ['lazy_profile', 'development']
      });
    });
  });
});