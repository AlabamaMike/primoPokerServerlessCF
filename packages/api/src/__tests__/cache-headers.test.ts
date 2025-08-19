import { CacheHeadersMiddleware, CacheableRequest } from '../middleware/cache-headers';
import { cacheConfig } from '../middleware/cache-config';

describe('CacheHeadersMiddleware', () => {
  describe('middleware', () => {
    it('should not cache authenticated requests by default', async () => {
      const request: CacheableRequest = {
        url: 'https://example.com/api/test',
        user: { id: '123' },
        headers: new Headers(),
      } as CacheableRequest;
      
      const response = new Response('test', { status: 200 });
      
      const middleware = CacheHeadersMiddleware.middleware();
      const cachedResponse = await middleware(request, response);
      
      expect(cachedResponse.headers.get('Cache-Control')).toBe('private, no-cache, no-store, must-revalidate');
      expect(cachedResponse.headers.get('Pragma')).toBe('no-cache');
      expect(cachedResponse.headers.get('Expires')).toBe('0');
    });

    it('should cache leaderboards even for authenticated users', async () => {
      const request: CacheableRequest = {
        url: 'https://example.com/api/leaderboards',
        user: { id: '123' },
        headers: new Headers(),
      } as CacheableRequest;
      
      const response = new Response('test', { status: 200 });
      
      const middleware = CacheHeadersMiddleware.middleware();
      const cachedResponse = await middleware(request, response);
      
      const ttl = cacheConfig.api.public.ttl;
      expect(cachedResponse.headers.get('Cache-Control')).toBe(`public, max-age=${ttl}, s-maxage=${ttl}`);
      expect(cachedResponse.headers.has('Cache-Tag')).toBe(true);
    });

    it('should cache lobby tables with appropriate TTL', async () => {
      const request: CacheableRequest = {
        url: 'https://example.com/api/lobby/tables',
        headers: new Headers(),
      } as CacheableRequest;
      
      const response = new Response('test', { status: 200 });
      
      const middleware = CacheHeadersMiddleware.middleware();
      const cachedResponse = await middleware(request, response);
      
      const ttl = cacheConfig.api.lobby.ttl;
      expect(cachedResponse.headers.get('Cache-Control')).toBe(`public, max-age=${ttl}, s-maxage=${ttl}`);
    });

    it('should not cache non-cacheable routes', async () => {
      const request: CacheableRequest = {
        url: 'https://example.com/api/auth/login',
        headers: new Headers(),
      } as CacheableRequest;
      
      const response = new Response('test', { status: 200 });
      
      const middleware = CacheHeadersMiddleware.middleware();
      const cachedResponse = await middleware(request, response);
      
      expect(cachedResponse.headers.get('Cache-Control')).toBe('private, no-cache, no-store, must-revalidate');
    });

    it('should cache static assets with appropriate TTL', async () => {
      const testCases = [
        { url: '/assets/style.css', type: 'scripts' },
        { url: '/images/logo.png', type: 'images' },
        { url: '/fonts/font.woff2', type: 'assets' },
      ];

      for (const testCase of testCases) {
        const request: CacheableRequest = {
          url: `https://example.com${testCase.url}`,
          headers: new Headers(),
        } as CacheableRequest;
        
        const response = new Response('test', { status: 200 });
        
        const middleware = CacheHeadersMiddleware.middleware();
        const cachedResponse = await middleware(request, response);
        
        const ttl = (cacheConfig.static as any)[testCase.type].ttl;
        expect(cachedResponse.headers.get('Cache-Control')).toBe(`public, max-age=${ttl}, s-maxage=${ttl}`);
      }
    });
  });

  describe('generateETag', () => {
    it('should generate consistent ETags for same content', async () => {
      const content = 'test content';
      const etag1 = await CacheHeadersMiddleware.generateETag(content);
      const etag2 = await CacheHeadersMiddleware.generateETag(content);
      
      expect(etag1).toBe(etag2);
      expect(etag1).toMatch(/^"[a-f0-9]{64}"$/); // Full SHA-256 hash
    });

    it('should generate different ETags for different content', async () => {
      const etag1 = await CacheHeadersMiddleware.generateETag('content1');
      const etag2 = await CacheHeadersMiddleware.generateETag('content2');
      
      expect(etag1).not.toBe(etag2);
    });

    it('should handle object content', async () => {
      const obj = { key: 'value', nested: { prop: 123 } };
      const etag = await CacheHeadersMiddleware.generateETag(obj);
      
      expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
    });
  });

  describe('handleConditionalRequest', () => {
    it('should return 304 for matching ETag', async () => {
      const request: CacheableRequest = {
        url: 'https://example.com/api/test',
        headers: new Headers({
          'If-None-Match': '"abc123"'
        }),
      } as CacheableRequest;
      
      const response = await CacheHeadersMiddleware.handleConditionalRequest(request, '"abc123"');
      
      expect(response).not.toBeNull();
      expect(response?.status).toBe(304);
      expect(response?.headers.get('ETag')).toBe('"abc123"');
    });

    it('should return null for non-matching ETag', async () => {
      const request: CacheableRequest = {
        url: 'https://example.com/api/test',
        headers: new Headers({
          'If-None-Match': '"abc123"'
        }),
      } as CacheableRequest;
      
      const response = await CacheHeadersMiddleware.handleConditionalRequest(request, '"xyz789"');
      
      expect(response).toBeNull();
    });

    it('should handle multiple ETags', async () => {
      const request: CacheableRequest = {
        url: 'https://example.com/api/test',
        headers: new Headers({
          'If-None-Match': '"abc123", "def456", "xyz789"'
        }),
      } as CacheableRequest;
      
      const response = await CacheHeadersMiddleware.handleConditionalRequest(request, '"def456"');
      
      expect(response).not.toBeNull();
      expect(response?.status).toBe(304);
    });

    it('should handle wildcard ETag', async () => {
      const request: CacheableRequest = {
        url: 'https://example.com/api/test',
        headers: new Headers({
          'If-None-Match': '*'
        }),
      } as CacheableRequest;
      
      const response = await CacheHeadersMiddleware.handleConditionalRequest(request, '"anyetag"');
      
      expect(response).not.toBeNull();
      expect(response?.status).toBe(304);
    });

    it('should return 304 for If-Modified-Since with older date', async () => {
      const request: CacheableRequest = {
        url: 'https://example.com/api/test',
        headers: new Headers({
          'If-Modified-Since': 'Wed, 21 Oct 2024 07:28:00 GMT'
        }),
      } as CacheableRequest;
      
      const lastModified = new Date('Wed, 21 Oct 2024 07:28:00 GMT');
      const response = await CacheHeadersMiddleware.handleConditionalRequest(request, undefined, lastModified);
      
      expect(response).not.toBeNull();
      expect(response?.status).toBe(304);
      expect(response?.headers.get('Last-Modified')).toBe(lastModified.toUTCString());
    });

    it('should return null for If-Modified-Since with newer date', async () => {
      const request: CacheableRequest = {
        url: 'https://example.com/api/test',
        headers: new Headers({
          'If-Modified-Since': 'Wed, 21 Oct 2024 07:28:00 GMT'
        }),
      } as CacheableRequest;
      
      const lastModified = new Date('Wed, 21 Oct 2024 08:00:00 GMT');
      const response = await CacheHeadersMiddleware.handleConditionalRequest(request, undefined, lastModified);
      
      expect(response).toBeNull();
    });
  });

  describe('setCacheHeaders', () => {
    it('should set Vary header for authentication', () => {
      const response = new Response('test');
      const cached = CacheHeadersMiddleware.setCacheHeaders(response, 'no-cache');
      
      const varyHeader = cached.headers.get('Vary');
      expect(varyHeader).toContain('Authorization');
      expect(varyHeader).toContain('Accept');
    });

    it('should preserve existing Vary headers', () => {
      const response = new Response('test', {
        headers: { 'Vary': 'Origin, X-Custom' }
      });
      const cached = CacheHeadersMiddleware.setCacheHeaders(response, 'no-cache');
      
      const varyHeader = cached.headers.get('Vary');
      expect(varyHeader).toContain('Origin');
      expect(varyHeader).toContain('X-Custom');
      expect(varyHeader).toContain('Authorization');
      expect(varyHeader).toContain('Accept');
    });

    it('should handle URL parsing errors gracefully', () => {
      const response = new Response('test');
      const cached = CacheHeadersMiddleware.setCacheHeaders(
        response, 
        'cache', 
        { ttl: 300, edge: true },
        'not-a-valid-url'
      );
      
      // Should still set cache headers even if URL parsing fails
      expect(cached.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=300');
      expect(cached.headers.get('Cache-Tag')).toBe('generic:request');
    });
  });

  describe('etagMiddleware', () => {
    it('should add ETag to successful responses', async () => {
      const request: CacheableRequest = {
        url: 'https://example.com/api/test',
        headers: new Headers(),
      } as CacheableRequest;
      
      const response = new Response('test content', { status: 200 });
      
      const middleware = CacheHeadersMiddleware.etagMiddleware();
      const result = await middleware(request, response);
      
      expect(result.headers.has('ETag')).toBe(true);
      expect(result.headers.get('ETag')).toMatch(/^"[a-f0-9]{64}"$/);
    });

    it('should not add ETag to non-200 responses', async () => {
      const request: CacheableRequest = {
        url: 'https://example.com/api/test',
        headers: new Headers(),
      } as CacheableRequest;
      
      const response = new Response('error', { status: 404 });
      
      const middleware = CacheHeadersMiddleware.etagMiddleware();
      const result = await middleware(request, response);
      
      expect(result.headers.has('ETag')).toBe(false);
    });

    it('should not override existing ETag', async () => {
      const request: CacheableRequest = {
        url: 'https://example.com/api/test',
        headers: new Headers(),
      } as CacheableRequest;
      
      const response = new Response('test', { 
        status: 200,
        headers: { 'ETag': '"existing-etag"' }
      });
      
      const middleware = CacheHeadersMiddleware.etagMiddleware();
      const result = await middleware(request, response);
      
      expect(result.headers.get('ETag')).toBe('"existing-etag"');
    });

    it('should handle responses without body', async () => {
      const request: CacheableRequest = {
        url: 'https://example.com/api/test',
        headers: new Headers(),
      } as CacheableRequest;
      
      const response = new Response(null, { status: 200 });
      
      const middleware = CacheHeadersMiddleware.etagMiddleware();
      const result = await middleware(request, response);
      
      expect(result.headers.has('ETag')).toBe(false);
    });
  });
});