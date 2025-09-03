import { TokenBucketRateLimiter, createRateLimitMiddleware, RateLimitPresets } from '../middleware/rate-limiter';

describe('Rate Limiter', () => {
  let mockKV: any;

  beforeEach(() => {
    mockKV = {
      get: jest.fn(),
      put: jest.fn()
    };
  });

  describe('TokenBucketRateLimiter', () => {
    it('should allow requests within rate limit', async () => {
      const limiter = new TokenBucketRateLimiter(mockKV, {
        maxTokens: 5,
        refillRate: 5,
        windowMs: 60000
      });

      mockKV.get.mockResolvedValue(null); // No existing bucket

      const result = await limiter.checkLimit('test-user');

      expect(result.allowed).toBe(true);
      expect(result.remainingTokens).toBe(4);
      expect(mockKV.put).toHaveBeenCalledWith(
        'ratelimit:test-user',
        expect.any(String),
        expect.objectContaining({ expirationTtl: 120 })
      );
    });

    it('should deny requests when rate limit exceeded', async () => {
      const limiter = new TokenBucketRateLimiter(mockKV, {
        maxTokens: 5,
        refillRate: 5,
        windowMs: 60000
      });

      mockKV.get.mockResolvedValue({
        tokens: 0,
        lastRefill: Date.now()
      });

      const result = await limiter.checkLimit('test-user');

      expect(result.allowed).toBe(false);
      expect(result.remainingTokens).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should refill tokens over time', async () => {
      const limiter = new TokenBucketRateLimiter(mockKV, {
        maxTokens: 5,
        refillRate: 60, // 1 per second
        windowMs: 60000
      });

      const oldTime = Date.now() - 5000; // 5 seconds ago
      mockKV.get.mockResolvedValue({
        tokens: 0,
        lastRefill: oldTime
      });

      const result = await limiter.checkLimit('test-user');

      expect(result.allowed).toBe(true);
      expect(result.remainingTokens).toBeGreaterThan(0);
    });
  });

  describe('createRateLimitMiddleware', () => {
    it('should pass through when rate limit not exceeded', async () => {
      const middleware = createRateLimitMiddleware(mockKV, {
        maxTokens: 10,
        refillRate: 10
      });

      mockKV.get.mockResolvedValue(null);

      const request = new Request('https://example.com/api');
      const ctx = {} as any;
      const next = jest.fn().mockResolvedValue(new Response('OK'));

      const response = await middleware(request, ctx, next);

      expect(next).toHaveBeenCalled();
      expect(response.status).toBe(200);
      expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('9');
    });

    it('should return 429 when rate limit exceeded', async () => {
      const middleware = createRateLimitMiddleware(mockKV, {
        maxTokens: 5,
        refillRate: 5
      });

      mockKV.get.mockResolvedValue({
        tokens: 0,
        lastRefill: Date.now()
      });

      const request = new Request('https://example.com/api');
      const ctx = {} as any;
      const next = jest.fn();

      const response = await middleware(request, ctx, next);

      expect(next).not.toHaveBeenCalled();
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBeTruthy();
      
      const body = await response.json();
      expect(body.error).toBe('Rate limit exceeded');
    });

    it('should use custom identifier extractor', async () => {
      const customExtractor = jest.fn().mockReturnValue('custom-id');
      const middleware = createRateLimitMiddleware(
        mockKV,
        { maxTokens: 5, refillRate: 5 },
        customExtractor
      );

      mockKV.get.mockResolvedValue(null);

      const request = new Request('https://example.com/api');
      const ctx = {} as any;
      const next = jest.fn().mockResolvedValue(new Response('OK'));

      await middleware(request, ctx, next);

      expect(customExtractor).toHaveBeenCalledWith(request, ctx);
      expect(mockKV.get).toHaveBeenCalledWith('ratelimit:custom-id', 'json');
    });
  });

  describe('RateLimitPresets', () => {
    it('should have appropriate limits for different endpoints', () => {
      expect(RateLimitPresets.AUTH.maxTokens).toBe(5);
      expect(RateLimitPresets.API.maxTokens).toBe(60);
      expect(RateLimitPresets.WALLET.maxTokens).toBe(30);
      expect(RateLimitPresets.CHAT.maxTokens).toBe(20);
      expect(RateLimitPresets.STATS.maxTokens).toBe(120);
      expect(RateLimitPresets.ADMIN.maxTokens).toBe(100);
    });
  });
});