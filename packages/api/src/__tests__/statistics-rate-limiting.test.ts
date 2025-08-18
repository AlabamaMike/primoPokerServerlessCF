import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { statisticsRateLimiter } from '../middleware/rate-limiter';

describe('Statistics Rate Limiting', () => {
  let mockRequest: any;

  beforeEach(() => {
    // Clear rate limiter state
    (statisticsRateLimiter as any).limits.clear();
    
    mockRequest = {
      headers: new Map([
        ['CF-Connecting-IP', '192.168.1.1'],
        ['Authorization', 'Bearer test-token']
      ]),
      user: {
        userId: 'user-123',
        username: 'testuser'
      }
    };
  });

  describe('Player Statistics Endpoint Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      // Make 30 requests (the limit)
      for (let i = 0; i < 30; i++) {
        const result = await statisticsRateLimiter.middleware()(mockRequest);
        expect(result).toBeUndefined(); // No response means request is allowed
      }
    });

    it('should block requests exceeding rate limit', async () => {
      // Make 30 requests to reach the limit
      for (let i = 0; i < 30; i++) {
        await statisticsRateLimiter.middleware()(mockRequest);
      }

      // 31st request should be blocked
      const result = await statisticsRateLimiter.middleware()(mockRequest);
      expect(result).toBeDefined();
      expect(result.status).toBe(429);
      
      const data = await result.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(data.error.retryAfter).toBeGreaterThan(0);
      
      // Check rate limit headers
      expect(result.headers.get('Retry-After')).toBeDefined();
      expect(result.headers.get('X-RateLimit-Limit')).toBe('30');
      expect(result.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(result.headers.get('X-RateLimit-Reset')).toBeDefined();
    });

    it('should rate limit by user ID for authenticated requests', async () => {
      // First user makes 30 requests
      for (let i = 0; i < 30; i++) {
        await statisticsRateLimiter.middleware()(mockRequest);
      }

      // First user's 31st request should be blocked
      const blockedResult = await statisticsRateLimiter.middleware()(mockRequest);
      expect(blockedResult).toBeDefined();
      expect(blockedResult.status).toBe(429);

      // Different user should be allowed
      const differentUserRequest = {
        ...mockRequest,
        user: {
          userId: 'user-456',
          username: 'differentuser'
        }
      };

      const allowedResult = await statisticsRateLimiter.middleware()(differentUserRequest);
      expect(allowedResult).toBeUndefined(); // Should be allowed
    });

    it('should reset rate limit after window expires', async () => {
      // Mock Date.now to control time
      const originalDateNow = Date.now;
      let currentTime = originalDateNow();
      Date.now = jest.fn(() => currentTime);

      try {
        // Make 30 requests to reach the limit
        for (let i = 0; i < 30; i++) {
          await statisticsRateLimiter.middleware()(mockRequest);
        }

        // 31st request should be blocked
        let result = await statisticsRateLimiter.middleware()(mockRequest);
        expect(result).toBeDefined();
        expect(result.status).toBe(429);

        // Advance time by 61 seconds (window is 60 seconds)
        currentTime += 61 * 1000;

        // Request should now be allowed
        result = await statisticsRateLimiter.middleware()(mockRequest);
        expect(result).toBeUndefined();
      } finally {
        Date.now = originalDateNow;
      }
    });
  });

  describe('Leaderboard Endpoint Rate Limiting', () => {
    it('should rate limit by IP for unauthenticated requests', async () => {
      // Remove user from request
      delete mockRequest.user;

      // Make 30 requests
      for (let i = 0; i < 30; i++) {
        await statisticsRateLimiter.middleware()(mockRequest);
      }

      // 31st request should be blocked
      const blockedResult = await statisticsRateLimiter.middleware()(mockRequest);
      expect(blockedResult).toBeDefined();
      expect(blockedResult.status).toBe(429);

      // Different IP should be allowed
      const differentIPRequest = {
        ...mockRequest,
        headers: new Map([
          ['CF-Connecting-IP', '192.168.1.2']
        ])
      };

      const allowedResult = await statisticsRateLimiter.middleware()(differentIPRequest);
      expect(allowedResult).toBeUndefined();
    });

    it('should handle missing IP gracefully', async () => {
      // Remove user and IP headers
      delete mockRequest.user;
      mockRequest.headers.delete('CF-Connecting-IP');
      mockRequest.headers.delete('X-Forwarded-For');

      // Should still work with 'unknown' key
      for (let i = 0; i < 30; i++) {
        const result = await statisticsRateLimiter.middleware()(mockRequest);
        expect(result).toBeUndefined();
      }

      // 31st request should be blocked
      const blockedResult = await statisticsRateLimiter.middleware()(mockRequest);
      expect(blockedResult).toBeDefined();
      expect(blockedResult.status).toBe(429);
    });
  });

  describe('Rate Limit Key Generation', () => {
    it('should generate correct key for authenticated user', async () => {
      // Make one request to create an entry
      await statisticsRateLimiter.middleware()(mockRequest);

      // Check that the correct key was used
      const limits = (statisticsRateLimiter as any).limits;
      expect(limits.has('stats:user:user-123')).toBe(true);
    });

    it('should generate correct key for unauthenticated user with IP', async () => {
      delete mockRequest.user;
      
      // Make one request to create an entry
      await statisticsRateLimiter.middleware()(mockRequest);

      // Check that the correct key was used
      const limits = (statisticsRateLimiter as any).limits;
      expect(limits.has('stats:ip:192.168.1.1')).toBe(true);
    });

    it('should prefer CF-Connecting-IP over X-Forwarded-For', async () => {
      delete mockRequest.user;
      mockRequest.headers.set('X-Forwarded-For', '10.0.0.1');
      
      // Make one request to create an entry
      await statisticsRateLimiter.middleware()(mockRequest);

      // Should use CF-Connecting-IP (192.168.1.1) not X-Forwarded-For
      const limits = (statisticsRateLimiter as any).limits;
      expect(limits.has('stats:ip:192.168.1.1')).toBe(true);
      expect(limits.has('stats:ip:10.0.0.1')).toBe(false);
    });
  });

  describe('Cleanup Mechanism', () => {
    it('should clean up expired entries on each request', async () => {
      const originalDateNow = Date.now;
      let currentTime = originalDateNow();
      Date.now = jest.fn(() => currentTime);

      try {
        // Create multiple entries at different times
        const requests = [
          { ...mockRequest, user: { userId: 'user-1' } },
          { ...mockRequest, user: { userId: 'user-2' } },
          { ...mockRequest, user: { userId: 'user-3' } }
        ];

        // Make requests for each user
        for (const req of requests) {
          await statisticsRateLimiter.middleware()(req);
        }

        // Verify all entries exist
        const limits = (statisticsRateLimiter as any).limits;
        expect(limits.size).toBe(3);

        // Advance time by 61 seconds
        currentTime += 61 * 1000;

        // Make a new request to trigger cleanup
        await statisticsRateLimiter.middleware()(mockRequest);

        // Old entries should be cleaned up
        expect(limits.has('stats:user:user-1')).toBe(false);
        expect(limits.has('stats:user:user-2')).toBe(false);
        expect(limits.has('stats:user:user-3')).toBe(false);
        expect(limits.has('stats:user:user-123')).toBe(true);
      } finally {
        Date.now = originalDateNow;
      }
    });
  });
});