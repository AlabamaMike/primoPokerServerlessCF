import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TokenBucketRateLimiter, RateLimiters, createRateLimitMiddleware } from '../rate-limiting/token-bucket';

// Mock KVNamespace
class MockKVNamespace implements KVNamespace {
  private store = new Map<string, string>();
  
  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }
  
  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value);
  }
  
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
  
  getWithMetadata(): never {
    throw new Error('Not implemented');
  }
  
  list(): never {
    throw new Error('Not implemented');
  }
}

describe('Token Bucket Rate Limiter', () => {
  let storage: MockKVNamespace;
  let rateLimiter: TokenBucketRateLimiter;

  beforeEach(() => {
    storage = new MockKVNamespace();
    rateLimiter = new TokenBucketRateLimiter({
      capacity: 10,
      refillRate: 60, // 60 tokens per minute
      storage,
    });
  });

  describe('consume', () => {
    it('should allow requests within capacity', async () => {
      const result1 = await rateLimiter.consume('user1', 1);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(9);

      const result2 = await rateLimiter.consume('user1', 3);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(6);
    });

    it('should block requests exceeding capacity', async () => {
      // Consume all tokens
      await rateLimiter.consume('user2', 10);
      
      // Next request should be blocked
      const result = await rateLimiter.consume('user2', 1);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should refill tokens over time', async () => {
      // Consume all tokens
      await rateLimiter.consume('user3', 10);
      
      // Mock time passing (1 second = 1 token with 60/min rate)
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
      
      const result = await rateLimiter.consume('user3', 1);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('should handle different identifiers separately', async () => {
      await rateLimiter.consume('user4', 5);
      await rateLimiter.consume('user5', 5);
      
      const result1 = await rateLimiter.consume('user4', 6);
      expect(result1.allowed).toBe(false);
      
      const result2 = await rateLimiter.consume('user5', 5);
      expect(result2.allowed).toBe(true);
    });

    it('should calculate correct reset time', async () => {
      await rateLimiter.consume('user6', 8);
      const result = await rateLimiter.consume('user6', 1);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
      
      // With 1 token remaining and needing 9 more for full capacity
      // at 60 tokens/minute = 1 token/second, should be ~9 seconds
      const expectedReset = Math.floor((Date.now() + 9000) / 1000);
      expect(Math.abs(result.resetAt - expectedReset)).toBeLessThan(2);
    });
  });

  describe('reset', () => {
    it('should reset rate limit for identifier', async () => {
      await rateLimiter.consume('user7', 10);
      await rateLimiter.reset('user7');
      
      const result = await rateLimiter.consume('user7', 5);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
    });
  });
});

describe('Pre-configured Rate Limiters', () => {
  let storage: MockKVNamespace;

  beforeEach(() => {
    storage = new MockKVNamespace();
  });

  it('should have correct auth limiter config', async () => {
    const authLimiter = RateLimiters.auth(storage);
    
    // Auth allows 5 requests per minute
    for (let i = 0; i < 5; i++) {
      const result = await authLimiter.consume('test', 1);
      expect(result.allowed).toBe(true);
    }
    
    const result = await authLimiter.consume('test', 1);
    expect(result.allowed).toBe(false);
  });

  it('should have correct wallet limiter config', async () => {
    const walletLimiter = RateLimiters.wallet(storage);
    
    // Wallet allows 30 requests per minute
    const result = await walletLimiter.consume('test', 25);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
  });
});

describe('Rate Limit Middleware', () => {
  let storage: MockKVNamespace;
  let middleware: ReturnType<typeof createRateLimitMiddleware>;

  beforeEach(() => {
    storage = new MockKVNamespace();
    const limiter = new TokenBucketRateLimiter({
      capacity: 2,
      refillRate: 60,
      storage,
    });
    middleware = createRateLimitMiddleware(limiter);
  });

  it('should allow requests within limit', async () => {
    const request = new Request('https://example.com/api/test', {
      headers: { 'CF-Connecting-IP': '192.168.1.1' },
    });
    
    const next = jest.fn().mockResolvedValue(new Response('OK'));
    const response = await middleware(request, next);
    
    expect(next).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('1');
  });

  it('should block requests exceeding limit', async () => {
    const request = new Request('https://example.com/api/test', {
      headers: { 'CF-Connecting-IP': '192.168.1.2' },
    });
    
    const next = jest.fn().mockResolvedValue(new Response('OK'));
    
    // Consume all tokens
    await middleware(request, next);
    await middleware(request, next);
    
    // Third request should be blocked
    const response = await middleware(request, next);
    
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect(next).toHaveBeenCalledTimes(2); // Not called for blocked request
  });

  it('should use custom identifier function', async () => {
    const limiter = new TokenBucketRateLimiter({
      capacity: 1,
      refillRate: 60,
      storage,
    });
    
    const customMiddleware = createRateLimitMiddleware(
      limiter,
      (req) => req.headers.get('X-User-ID') || 'anonymous'
    );
    
    const request1 = new Request('https://example.com/api/test', {
      headers: { 'X-User-ID': 'user123' },
    });
    
    const request2 = new Request('https://example.com/api/test', {
      headers: { 'X-User-ID': 'user456' },
    });
    
    const next = jest.fn().mockResolvedValue(new Response('OK'));
    
    // Different users should have separate limits
    const response1 = await customMiddleware(request1, next);
    expect(response1.status).toBe(200);
    
    const response2 = await customMiddleware(request2, next);
    expect(response2.status).toBe(200);
    
    // Same user second request should be blocked
    const response3 = await customMiddleware(request1, next);
    expect(response3.status).toBe(429);
  });
});