import { Context } from '@cloudflare/workers-types';

/**
 * Token Bucket Rate Limiter for Cloudflare Workers
 * Provides distributed rate limiting with configurable buckets
 */

export interface RateLimitConfig {
  maxTokens: number; // Maximum tokens in bucket
  refillRate: number; // Tokens added per minute
  windowMs?: number; // Time window in milliseconds (default: 60000)
  keyPrefix?: string; // Prefix for KV keys
}

export interface RateLimitResult {
  allowed: boolean;
  remainingTokens: number;
  resetAt: number;
  retryAfter?: number; // Seconds until retry (when rate limited)
}

export class TokenBucketRateLimiter {
  private config: Required<RateLimitConfig>;

  constructor(
    private kv: KVNamespace,
    config: RateLimitConfig
  ) {
    this.config = {
      windowMs: 60000, // 1 minute default
      keyPrefix: 'ratelimit:',
      ...config
    };
  }

  async checkLimit(identifier: string): Promise<RateLimitResult> {
    const key = `${this.config.keyPrefix}${identifier}`;
    const now = Date.now();

    // Get current bucket state
    const bucketData = await this.kv.get(key, 'json') as BucketState | null;
    
    let bucket: BucketState;
    if (!bucketData) {
      // Initialize new bucket
      bucket = {
        tokens: this.config.maxTokens,
        lastRefill: now
      };
    } else {
      // Calculate tokens to add based on time passed
      const timePassed = now - bucketData.lastRefill;
      const tokensToAdd = Math.floor((timePassed / this.config.windowMs) * this.config.refillRate);
      
      bucket = {
        tokens: Math.min(this.config.maxTokens, bucketData.tokens + tokensToAdd),
        lastRefill: now
      };
    }

    // Check if request is allowed
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      
      // Save updated bucket state with TTL
      await this.kv.put(key, JSON.stringify(bucket), {
        expirationTtl: Math.ceil(this.config.windowMs / 1000) * 2 // 2x window for safety
      });

      return {
        allowed: true,
        remainingTokens: bucket.tokens,
        resetAt: now + this.config.windowMs
      };
    }

    // Rate limited
    const resetAt = now + this.config.windowMs;
    const retryAfter = Math.ceil((resetAt - now) / 1000);

    return {
      allowed: false,
      remainingTokens: 0,
      resetAt,
      retryAfter
    };
  }
}

interface BucketState {
  tokens: number;
  lastRefill: number;
}

/**
 * Pre-configured rate limiters for different endpoints
 */
export const RateLimitPresets = {
  // Strict limit for auth endpoints
  AUTH: {
    maxTokens: 5,
    refillRate: 5, // 5 requests per minute
    windowMs: 60000
  },
  
  // General API endpoints
  API: {
    maxTokens: 60,
    refillRate: 60, // 60 requests per minute
    windowMs: 60000
  },
  
  // Wallet operations
  WALLET: {
    maxTokens: 30,
    refillRate: 30, // 30 requests per minute
    windowMs: 60000
  },
  
  // Chat messages
  CHAT: {
    maxTokens: 20,
    refillRate: 20, // 20 messages per minute
    windowMs: 60000
  },
  
  // Statistics queries
  STATS: {
    maxTokens: 120,
    refillRate: 120, // 120 requests per minute
    windowMs: 60000
  },
  
  // Admin operations
  ADMIN: {
    maxTokens: 100,
    refillRate: 100, // 100 requests per minute
    windowMs: 60000
  }
} as const;

/**
 * Rate limiting middleware for Cloudflare Workers
 */
export function createRateLimitMiddleware(
  kv: KVNamespace,
  config: RateLimitConfig,
  identifierExtractor: (request: Request, ctx: Context) => string = defaultIdentifierExtractor
) {
  const limiter = new TokenBucketRateLimiter(kv, config);

  return async function rateLimitMiddleware(
    request: Request,
    ctx: Context,
    next: () => Promise<Response>
  ): Promise<Response> {
    const identifier = identifierExtractor(request, ctx);
    const result = await limiter.checkLimit(identifier);

    // Add rate limit headers
    const headers = new Headers();
    headers.set('X-RateLimit-Limit', config.maxTokens.toString());
    headers.set('X-RateLimit-Remaining', result.remainingTokens.toString());
    headers.set('X-RateLimit-Reset', result.resetAt.toString());

    if (!result.allowed) {
      headers.set('Retry-After', result.retryAfter!.toString());
      
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          message: `Too many requests. Please retry after ${result.retryAfter} seconds.`,
          retryAfter: result.retryAfter
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...Object.fromEntries(headers)
          }
        }
      );
    }

    // Add headers to successful response
    const response = await next();
    const newResponse = new Response(response.body, response);
    
    headers.forEach((value, key) => {
      newResponse.headers.set(key, value);
    });

    return newResponse;
  };
}

/**
 * Default identifier extractor (IP-based)
 */
function defaultIdentifierExtractor(request: Request, ctx: Context): string {
  // Try CF-Connecting-IP header first (Cloudflare specific)
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) return cfIp;

  // Fallback to X-Forwarded-For
  const xForwardedFor = request.headers.get('X-Forwarded-For');
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',');
    return ips[0].trim();
  }

  // Last resort: use a generic identifier
  return 'anonymous';
}

/**
 * User-based identifier extractor for authenticated endpoints
 */
export function userIdentifierExtractor(request: Request, ctx: Context & { userId?: string }): string {
  if (ctx.userId) {
    return `user:${ctx.userId}`;
  }
  return defaultIdentifierExtractor(request, ctx);
}

/**
 * Composite rate limiter that checks multiple limits
 */
export class CompositeRateLimiter {
  private limiters: Map<string, TokenBucketRateLimiter> = new Map();

  constructor(private kv: KVNamespace) {}

  addLimiter(name: string, config: RateLimitConfig): void {
    this.limiters.set(name, new TokenBucketRateLimiter(this.kv, {
      ...config,
      keyPrefix: `${config.keyPrefix || 'ratelimit:'}${name}:`
    }));
  }

  async checkAllLimits(identifier: string): Promise<{
    allowed: boolean;
    results: Map<string, RateLimitResult>;
  }> {
    const results = new Map<string, RateLimitResult>();
    let allowed = true;

    for (const [name, limiter] of this.limiters) {
      const result = await limiter.checkLimit(identifier);
      results.set(name, result);
      
      if (!result.allowed) {
        allowed = false;
      }
    }

    return { allowed, results };
  }
}