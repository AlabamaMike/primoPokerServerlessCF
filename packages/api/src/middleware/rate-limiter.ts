import { IRequest } from 'itty-router';
import { logger } from '@primo-poker/core';

interface RateLimitConfig {
  windowMs: number;     // Time window in milliseconds
  maxRequests: number;  // Max requests per window
  keyGenerator?: (request: IRequest) => string; // Function to generate rate limit key
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  
  constructor(private config: RateLimitConfig) {
    // Note: In Cloudflare Workers, we cannot use setInterval
    // Cleanup happens on each request instead
  }

  /**
   * Middleware to check rate limits
   */
  middleware() {
    return async (request: IRequest): Promise<Response | void> => {
      // Cleanup expired entries on each request (Cloudflare Workers doesn't support setInterval)
      this.cleanup();
      
      const key = this.getKey(request);
      const now = Date.now();
      
      const entry = this.limits.get(key);
      
      if (!entry || entry.resetTime <= now) {
        // Create new entry or reset existing one
        this.limits.set(key, {
          count: 1,
          resetTime: now + this.config.windowMs
        });
        return; // Allow request
      }
      
      if (entry.count >= this.config.maxRequests) {
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
        
        logger.warn('Rate limit exceeded', {
          key,
          count: entry.count,
          maxRequests: this.config.maxRequests,
          retryAfter
        });
        
        return new Response(JSON.stringify({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            retryAfter
          }
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': this.config.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(entry.resetTime).toISOString()
          }
        });
      }
      
      // Increment counter
      entry.count++;
      
      // To help clients, downstream handlers should set the following rate limit headers on the response:
      // 'X-RateLimit-Limit': this.config.maxRequests.toString()
      // 'X-RateLimit-Remaining': (this.config.maxRequests - entry.count).toString()
      // 'X-RateLimit-Reset': new Date(entry.resetTime).toISOString()
    };
  }

  /**
   * Generate rate limit key for request
   */
  private getKey(request: IRequest): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(request);
    }
    
    // Default: Use IP address or fallback to a generic key
    const ip = request.headers?.get('CF-Connecting-IP') || 
               request.headers?.get('X-Forwarded-For') || 
               'unknown';
    
    return `rate-limit:${ip}`;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, entry] of this.limits.entries()) {
      if (entry.resetTime <= now) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.limits.delete(key);
    }
    
    if (expiredKeys.length > 0) {
      logger.debug('Cleaned up rate limit entries', { count: expiredKeys.length });
    }
  }
}

// Pre-configured rate limiters for different endpoints
export const walletRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,     // 1 minute
  maxRequests: 10,         // 10 requests per minute
  keyGenerator: (request) => {
    // Rate limit by authenticated user ID
    const userId = (request as any).user?.userId || 'anonymous';
    return `wallet:${userId}`;
  }
});

export const authRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  maxRequests: 5,            // 5 attempts per 15 minutes
  keyGenerator: (request) => {
    // Rate limit by IP for auth endpoints
    const ip = request.headers?.get('CF-Connecting-IP') || 
               request.headers?.get('X-Forwarded-For') || 
               'unknown';
    return `auth:${ip}`;
  }
});

export const socialRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,       // 1 minute
  maxRequests: 20,           // 20 requests per minute
  keyGenerator: (request) => {
    // Rate limit by authenticated user ID
    const userId = (request as any).user?.id || 'anonymous';
    return `social:${userId}`;
  }
});

export const statisticsRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,       // 1 minute
  maxRequests: 30,           // 30 requests per minute for stats
  keyGenerator: (request) => {
    // Rate limit by authenticated user ID for player stats, IP for leaderboards
    const userId = (request as any).user?.userId;
    if (userId) {
      return `stats:user:${userId}`;
    }
    // For public leaderboard endpoint, use IP
    const ip = request.headers?.get('CF-Connecting-IP') || 
               request.headers?.get('X-Forwarded-For') || 
               'unknown';
    return `stats:ip:${ip}`;
  }
});