import { CacheInvalidationHandler, CacheInvalidationEnv } from '../utils/cache-invalidation';

// Mock fetch globally
global.fetch = jest.fn();

describe('CacheInvalidationHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleInvalidation', () => {
    const mockEnv: CacheInvalidationEnv = {
      ZONE_ID: 'test-zone-id',
      CF_API_TOKEN: 'test-api-token',
      CACHE_INVALIDATION_SECRET: 'test-secret'
    };

    it('should reject requests without proper authentication', async () => {
      const request = new Request('https://example.com/api/cache-invalidate', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer wrong-secret'
        },
        body: JSON.stringify({ tags: ['api:test'] })
      });

      const response = await CacheInvalidationHandler.handleInvalidation(request, mockEnv);
      
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });

    it('should accept requests with proper authentication', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, id: 'purge-123' })
      });

      const request = new Request('https://example.com/api/cache-invalidate', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-secret',
          'CF-Ray': '123456789',
          'CF-IPCountry': 'US'
        },
        body: JSON.stringify({ tags: ['api:test'] })
      });

      const response = await CacheInvalidationHandler.handleInvalidation(request, mockEnv);
      
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.result).toEqual({ success: true, id: 'purge-123' });
    });

    it('should skip authentication if no secret is configured', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      });

      const envWithoutSecret: CacheInvalidationEnv = {
        ZONE_ID: 'test-zone-id',
        CF_API_TOKEN: 'test-api-token'
      };

      const request = new Request('https://example.com/api/cache-invalidate', {
        method: 'POST',
        body: JSON.stringify({ tags: ['api:test'] })
      });

      const response = await CacheInvalidationHandler.handleInvalidation(request, envWithoutSecret);
      
      expect(response.status).toBe(200);
    });

    it('should return 503 if environment variables are missing', async () => {
      const request = new Request('https://example.com/api/cache-invalidate', {
        method: 'POST',
        body: JSON.stringify({ tags: ['api:test'] })
      });

      const response = await CacheInvalidationHandler.handleInvalidation(request, {});
      
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Cache invalidation not configured');
    });

    it('should handle purge everything requests', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      });

      const request = new Request('https://example.com/api/cache-invalidate', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-secret'
        },
        body: JSON.stringify({ everything: true })
      });

      const response = await CacheInvalidationHandler.handleInvalidation(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/zones/test-zone-id/purge_cache',
        expect.objectContaining({
          body: JSON.stringify({ purge_everything: true })
        })
      );
    });

    it('should handle tag-based invalidation', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      });

      const tags = ['api:tables', 'api:lobby'];
      const request = new Request('https://example.com/api/cache-invalidate', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-secret'
        },
        body: JSON.stringify({ tags })
      });

      const response = await CacheInvalidationHandler.handleInvalidation(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/zones/test-zone-id/purge_cache',
        expect.objectContaining({
          body: JSON.stringify({ tags })
        })
      );
    });

    it('should handle URL-based invalidation', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      });

      const urls = ['https://example.com/api/test1', 'https://example.com/api/test2'];
      const request = new Request('https://example.com/api/cache-invalidate', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-secret'
        },
        body: JSON.stringify({ urls })
      });

      const response = await CacheInvalidationHandler.handleInvalidation(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/zones/test-zone-id/purge_cache',
        expect.objectContaining({
          body: JSON.stringify({ files: urls })
        })
      );
    });

    it('should return 400 if no invalidation targets specified', async () => {
      const request = new Request('https://example.com/api/cache-invalidate', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-secret'
        },
        body: JSON.stringify({})
      });

      const response = await CacheInvalidationHandler.handleInvalidation(request, mockEnv);
      
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('No invalidation targets specified');
    });

    it('should handle Cloudflare API errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ 
          success: false, 
          errors: [{ message: 'Rate limited' }] 
        })
      });

      const request = new Request('https://example.com/api/cache-invalidate', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-secret'
        },
        body: JSON.stringify({ tags: ['api:test'] })
      });

      const response = await CacheInvalidationHandler.handleInvalidation(request, mockEnv);
      
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Cache purge failed');
    });

    it('should handle JSON parsing errors', async () => {
      const request = new Request('https://example.com/api/cache-invalidate', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-secret'
        },
        body: 'invalid json'
      });

      const response = await CacheInvalidationHandler.handleInvalidation(request, mockEnv);
      
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Internal error during cache invalidation');
    });

    it('should set proper headers on all responses', async () => {
      const request = new Request('https://example.com/api/cache-invalidate', {
        method: 'POST',
        body: JSON.stringify({})
      });

      const response = await CacheInvalidationHandler.handleInvalidation(request, {});
      
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('invalidateGameCache', () => {
    const mockEnv: CacheInvalidationEnv = {
      ZONE_ID: 'test-zone-id',
      CF_API_TOKEN: 'test-api-token'
    };

    it('should invalidate cache for game-related tags', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      });

      await CacheInvalidationHandler.invalidateGameCache('table-123', mockEnv);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/zones/test-zone-id/purge_cache',
        expect.objectContaining({
          body: JSON.stringify({
            tags: ['api:tables', 'api:lobby', 'table:table-123']
          })
        })
      );
    });

    it('should handle errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      // Should not throw
      await expect(
        CacheInvalidationHandler.invalidateGameCache('table-123', mockEnv)
      ).resolves.toBeUndefined();
    });

    it('should not attempt invalidation without credentials', async () => {
      await CacheInvalidationHandler.invalidateGameCache('table-123', {});

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('invalidateLeaderboardCache', () => {
    const mockEnv: CacheInvalidationEnv = {
      ZONE_ID: 'test-zone-id',
      CF_API_TOKEN: 'test-api-token'
    };

    it('should invalidate cache for leaderboard tags', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      });

      await CacheInvalidationHandler.invalidateLeaderboardCache(mockEnv);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/zones/test-zone-id/purge_cache',
        expect.objectContaining({
          body: JSON.stringify({
            tags: ['api:leaderboards']
          })
        })
      );
    });

    it('should handle errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      // Should not throw
      await expect(
        CacheInvalidationHandler.invalidateLeaderboardCache(mockEnv)
      ).resolves.toBeUndefined();
    });
  });
});