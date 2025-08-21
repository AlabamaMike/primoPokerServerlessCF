interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number;
}

interface RateLimiterConfig {
  capacity: number; // Maximum tokens in bucket
  refillRate: number; // Tokens added per minute
  keyPrefix?: string;
  storage: KVNamespace | DurableObjectStorage;
}

export class TokenBucketRateLimiter {
  private readonly config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = {
      keyPrefix: 'rate_limit:',
      ...config,
    };
  }

  private getKey(identifier: string): string {
    return `${this.config.keyPrefix}${identifier}`;
  }

  private async getBucket(identifier: string): Promise<TokenBucket | null> {
    const key = this.getKey(identifier);
    
    if ('get' in this.config.storage) {
      // KVNamespace
      const data = await this.config.storage.get(key);
      return data ? JSON.parse(data) : null;
    } else {
      // DurableObjectStorage
      return await this.config.storage.get<TokenBucket>(key) || null;
    }
  }

  private async saveBucket(identifier: string, bucket: TokenBucket): Promise<void> {
    const key = this.getKey(identifier);
    
    if ('put' in this.config.storage && 'expirationTtl' in this.config.storage.put) {
      // KVNamespace - expire after 1 hour of inactivity
      await this.config.storage.put(key, JSON.stringify(bucket), {
        expirationTtl: 3600,
      });
    } else {
      // DurableObjectStorage
      await this.config.storage.put(key, bucket);
    }
  }

  async consume(identifier: string, tokens: number = 1): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
  }> {
    const now = Date.now();
    let bucket = await this.getBucket(identifier);

    if (!bucket) {
      bucket = {
        tokens: this.config.capacity,
        lastRefill: now,
        capacity: this.config.capacity,
        refillRate: this.config.refillRate,
      };
    }

    // Calculate tokens to add based on time elapsed
    const timePassed = now - bucket.lastRefill;
    const minutesPassed = timePassed / 60000;
    const tokensToAdd = Math.floor(minutesPassed * bucket.refillRate);

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }

    // Check if we have enough tokens
    const allowed = bucket.tokens >= tokens;
    
    if (allowed) {
      bucket.tokens -= tokens;
    }

    await this.saveBucket(identifier, bucket);

    // Calculate when bucket will be full again
    const tokensNeeded = bucket.capacity - bucket.tokens;
    const minutesToRefill = tokensNeeded / bucket.refillRate;
    const resetAt = now + (minutesToRefill * 60000);

    return {
      allowed,
      remaining: Math.floor(bucket.tokens),
      resetAt: Math.floor(resetAt / 1000), // Convert to seconds
    };
  }

  async reset(identifier: string): Promise<void> {
    const key = this.getKey(identifier);
    
    if ('delete' in this.config.storage) {
      await this.config.storage.delete(key);
    } else {
      await this.config.storage.delete(key);
    }
  }
}

// Pre-configured rate limiters for different use cases
export const RateLimiters = {
  // Strict rate limit for authentication endpoints
  auth: (storage: KVNamespace | DurableObjectStorage) => new TokenBucketRateLimiter({
    capacity: 5,
    refillRate: 5, // 5 requests per minute
    keyPrefix: 'rl:auth:',
    storage,
  }),

  // General API rate limit
  api: (storage: KVNamespace | DurableObjectStorage) => new TokenBucketRateLimiter({
    capacity: 60,
    refillRate: 60, // 60 requests per minute
    keyPrefix: 'rl:api:',
    storage,
  }),

  // Wallet operations rate limit
  wallet: (storage: KVNamespace | DurableObjectStorage) => new TokenBucketRateLimiter({
    capacity: 30,
    refillRate: 30, // 30 requests per minute
    keyPrefix: 'rl:wallet:',
    storage,
  }),

  // Chat rate limit
  chat: (storage: KVNamespace | DurableObjectStorage) => new TokenBucketRateLimiter({
    capacity: 20,
    refillRate: 20, // 20 messages per minute
    keyPrefix: 'rl:chat:',
    storage,
  }),

  // Statistics API rate limit (higher for dashboards)
  statistics: (storage: KVNamespace | DurableObjectStorage) => new TokenBucketRateLimiter({
    capacity: 120,
    refillRate: 120, // 120 requests per minute
    keyPrefix: 'rl:stats:',
    storage,
  }),

  // Admin operations rate limit
  admin: (storage: KVNamespace | DurableObjectStorage) => new TokenBucketRateLimiter({
    capacity: 100,
    refillRate: 100, // 100 requests per minute
    keyPrefix: 'rl:admin:',
    storage,
  }),
};

// Middleware factory
export function createRateLimitMiddleware(
  rateLimiter: TokenBucketRateLimiter,
  getIdentifier: (request: Request) => string = (req) => {
    // Default: use IP address
    return req.headers.get('CF-Connecting-IP') || 'unknown';
  }
) {
  return async (request: Request, next: () => Promise<Response>): Promise<Response> => {
    const identifier = getIdentifier(request);
    const result = await rateLimiter.consume(identifier);

    if (!result.allowed) {
      return new Response('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': String(result.resetAt - Math.floor(Date.now() / 1000)),
          'X-RateLimit-Limit': String(rateLimiter['config'].capacity),
          'X-RateLimit-Remaining': String(result.remaining),
          'X-RateLimit-Reset': String(result.resetAt),
        },
      });
    }

    // Add rate limit headers to successful responses
    const response = await next();
    response.headers.set('X-RateLimit-Limit', String(rateLimiter['config'].capacity));
    response.headers.set('X-RateLimit-Remaining', String(result.remaining));
    response.headers.set('X-RateLimit-Reset', String(result.resetAt));

    return response;
  };
}