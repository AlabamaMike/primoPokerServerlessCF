import { IRequest } from 'itty-router';
import { logger } from '@primo-poker/core';
import { RequestCoalescer, CoalescingOptions } from './request-coalescer';

interface IdempotencyRecord {
  response: Response;
  expiresAt: number;
}

export interface IdempotencyOptions {
  ttl: number;
  dedupeStrategy: 'cache' | 'coalesce' | 'both';
  coalescingOptions?: Partial<CoalescingOptions>;
}

export class IdempotencyManager {
  private cache: Map<string, IdempotencyRecord> = new Map();
  private readonly TTL: number;
  private readonly dedupeStrategy: 'cache' | 'coalesce' | 'both';
  private coalescer?: RequestCoalescer;

  constructor(options: Partial<IdempotencyOptions> = {}) {
    this.TTL = options.ttl || 24 * 60 * 60 * 1000; // 24 hours default
    this.dedupeStrategy = options.dedupeStrategy || 'cache';
    
    if (this.dedupeStrategy !== 'cache') {
      this.coalescer = new RequestCoalescer({
        windowMs: 100,
        maxBatchSize: 10,
        mergeStrategy: 'first',
        ...options.coalescingOptions,
      });
    }
    
    // Clean up expired entries every hour
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  /**
   * Middleware to handle idempotency
   */
  middleware() {
    return async (request: IRequest): Promise<Response | void> => {
      // Only handle POST requests with idempotency key
      if (request.method !== 'POST') {
        return;
      }

      const idempotencyKey = request.headers?.get('Idempotency-Key');
      if (!idempotencyKey) {
        return; // No idempotency key, proceed normally
      }

      // Check if we have a cached response
      const cached = this.cache.get(idempotencyKey);
      if (cached && cached.expiresAt > Date.now()) {
        logger.info('Returning cached idempotent response', { idempotencyKey });
        
        // Clone the response to avoid issues with body being already read
        return cached.response.clone();
      }

      // No cached response found, proceed to handler. Caching must be handled in the handler or via a wrapper.
    };
  }

  /**
   * Store a response for an idempotency key
   */
  async storeResponse(key: string, response: Response): Promise<void> {
    // Clone the response to ensure we can read it multiple times
    const clonedResponse = response.clone();
    
    this.cache.set(key, {
      response: clonedResponse,
      expiresAt: Date.now() + this.TTL
    });
  }

  /**
   * Get a cached response for an idempotency key
   */
  getCachedResponse(key: string): Response | null {
    const cached = this.cache.get(key);
    
    if (!cached || cached.expiresAt <= Date.now()) {
      return null;
    }
    
    // Clone the response before returning
    return cached.response.clone();
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, record] of this.cache.entries()) {
      if (record.expiresAt <= now) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.cache.delete(key);
    }
    
    if (expiredKeys.length > 0) {
      logger.debug('Cleaned up idempotency cache', { count: expiredKeys.length });
    }
  }
}

// Singleton instance
export const idempotencyManager = new IdempotencyManager();

/**
 * Create an IdempotencyManager with custom options
 */
export function createIdempotencyManager(options: Partial<IdempotencyOptions>): IdempotencyManager {
  return new IdempotencyManager(options);
}

/**
 * Helper to wrap a handler with idempotency support
 */
export function withIdempotency<T extends IRequest>(
  handler: (request: T) => Promise<Response>,
  options?: Partial<IdempotencyOptions>
): (request: T) => Promise<Response> {
  const manager = options ? createIdempotencyManager(options) : idempotencyManager;
  
  return async (request: T): Promise<Response> => {
    const idempotencyKey = request.headers?.get('Idempotency-Key');
    
    if (!idempotencyKey) {
      return handler(request);
    }
    
    // Apply deduplication strategy
    if (manager.dedupeStrategy === 'cache' || manager.dedupeStrategy === 'both') {
      // Check for cached response
      const cached = manager.getCachedResponse(idempotencyKey);
      if (cached) {
        logger.info('Returning cached idempotent response', { idempotencyKey });
        cached.headers.set('X-Idempotent-Replay', 'true');
        cached.headers.set('X-Dedupe-Strategy', 'cache');
        return cached;
      }
    }
    
    // Apply coalescing if enabled
    if (manager.coalescer && (manager.dedupeStrategy === 'coalesce' || manager.dedupeStrategy === 'both')) {
      try {
        const response = await manager.coalescer.coalesce(idempotencyKey, () => handler(request));
        response.headers.set('X-Dedupe-Strategy', 'coalesce');
        return response;
      } catch (error) {
        logger.error('Coalescing failed, falling back to direct execution', { idempotencyKey, error });
      }
    }
    
    // Execute handler and cache response
    const response = await handler(request);
    
    // Only cache successful responses
    if (response.status >= 200 && response.status < 300) {
      await manager.storeResponse(idempotencyKey, response);
    }
    
    return response;
  };
}