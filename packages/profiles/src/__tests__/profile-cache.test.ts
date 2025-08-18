import { ProfileCacheManager } from '../profile-cache';

describe('ProfileCacheManager', () => {
  let cacheManager: ProfileCacheManager;

  beforeEach(() => {
    cacheManager = new ProfileCacheManager({
      publicProfileTtl: 3600,
      privateProfileTtl: 60,
      cacheControl: {
        public: true,
        private: false,
        maxAge: 300,
        sMaxAge: 3600,
        staleWhileRevalidate: 86400
      }
    });
  });

  describe('getCacheHeaders', () => {
    it('should generate correct headers for public profiles', () => {
      const headers = cacheManager.getCacheHeaders(true);
      
      expect(headers['Cache-Control']).toContain('public');
      expect(headers['Cache-Control']).toContain('max-age=3600');
      expect(headers['Cache-Control']).toContain('s-maxage=3600');
      expect(headers['Cache-Control']).toContain('stale-while-revalidate=86400');
      expect(headers['Vary']).toBe('Accept-Encoding, Authorization');
    });

    it('should generate correct headers for private profiles', () => {
      const headers = cacheManager.getCacheHeaders(false);
      
      expect(headers['Cache-Control']).not.toContain('public');
      expect(headers['Cache-Control']).toContain('max-age=60');
      expect(headers['Cache-Control']).not.toContain('s-maxage');
      expect(headers['Vary']).toBe('Accept-Encoding, Authorization');
    });
  });

  describe('createCacheableResponse', () => {
    it('should create response with cache headers', () => {
      const data = { playerId: '123', displayName: 'Test' };
      const response = cacheManager.createCacheableResponse(data, true);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toContain('public');
    });

    it('should include additional headers if provided', () => {
      const data = { playerId: '123' };
      const response = cacheManager.createCacheableResponse(data, false, {
        'X-Custom-Header': 'value'
      });
      
      expect(response.headers.get('X-Custom-Header')).toBe('value');
    });
  });

  describe('shouldCache', () => {
    it('should cache successful responses', () => {
      const response = new Response('data', { status: 200 });
      expect(cacheManager.shouldCache(response)).toBe(true);
    });

    it('should not cache error responses', () => {
      const response = new Response('error', { status: 404 });
      expect(cacheManager.shouldCache(response)).toBe(false);
    });

    it('should not cache responses with no-cache directive', () => {
      const response = new Response('data', {
        status: 200,
        headers: { 'Cache-Control': 'no-cache' }
      });
      expect(cacheManager.shouldCache(response)).toBe(false);
    });

    it('should not cache responses with no-store directive', () => {
      const response = new Response('data', {
        status: 200,
        headers: { 'Cache-Control': 'no-store' }
      });
      expect(cacheManager.shouldCache(response)).toBe(false);
    });
  });

  describe('getCacheAnalyticsHeaders', () => {
    it('should return HIT headers with age', () => {
      const headers = cacheManager.getCacheAnalyticsHeaders(true, 120);
      
      expect(headers['X-Cache-Status']).toBe('HIT');
      expect(headers['X-Cache-Lookup']).toBe('HIT');
      expect(headers['Age']).toBe('120');
    });

    it('should return MISS headers without age', () => {
      const headers = cacheManager.getCacheAnalyticsHeaders(false);
      
      expect(headers['X-Cache-Status']).toBe('MISS');
      expect(headers['X-Cache-Lookup']).toBe('MISS');
      expect(headers['Age']).toBeUndefined();
    });
  });

  describe('addCacheTags', () => {
    it('should add cache tags to headers', () => {
      const headers = new Headers();
      cacheManager.addCacheTags(headers, ['profile', 'user-123']);
      
      expect(headers.get('Cache-Tag')).toBe('profile,user-123');
    });

    it('should not add cache tags if empty', () => {
      const headers = new Headers();
      cacheManager.addCacheTags(headers, []);
      
      expect(headers.get('Cache-Tag')).toBeNull();
    });
  });
});