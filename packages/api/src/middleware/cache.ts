/**
 * Cache Middleware
 * 
 * Example of how to use the CacheDO for caching API responses
 */

import { Request as IttyRequest } from 'itty-router';
import { CacheHelper } from '@primo-poker/persistence';
import { logger } from '@primo-poker/core';

export interface CacheOptions {
  ttl?: number;
  namespace?: string;
  keyGenerator?: (req: IttyRequest) => string;
}

/**
 * Cache middleware for API routes
 * 
 * Usage:
 * router.get('/api/expensive-operation', cacheMiddleware({ ttl: 300000 }), handler);
 */
export function cacheMiddleware(options: CacheOptions = {}) {
  return async (req: IttyRequest) => {
    const env = (req as any).env;
    if (!env?.CACHE_DO) {
      // Skip caching if CacheDO is not available
      return;
    }

    const cacheHelper = new CacheHelper(env);
    
    // Generate cache key
    const keyGenerator = options.keyGenerator || ((req) => {
      const url = new URL(req.url);
      return `api:${req.method}:${url.pathname}${url.search}`;
    });
    
    const cacheKey = keyGenerator(req);
    
    try {
      // Try to get from cache
      const cached = await cacheHelper.get(cacheKey, options.namespace);
      if (cached) {
        logger.info('Cache hit', { key: cacheKey });
        
        // Return cached response
        return new Response(JSON.stringify(cached.body), {
          status: cached.status || 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Cache': 'HIT',
            ...cached.headers,
          },
        });
      }
      
      logger.info('Cache miss', { key: cacheKey });
    } catch (error) {
      logger.error('Cache read error', error as Error);
      // Continue without cache on error
    }
    
    // Store original json method
    const originalJson = Response.prototype.json;
    
    // Intercept response to cache it
    (req as any).cacheResponse = async (response: Response) => {
      if (response.status === 200) {
        try {
          const body = await response.clone().json();
          const headers: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            if (key.toLowerCase() !== 'x-cache') {
              headers[key] = value;
            }
          });
          
          await cacheHelper.set(
            cacheKey,
            {
              body,
              status: response.status,
              headers,
            },
            options.ttl || 300000, // Default 5 minutes
            options.namespace
          );
          
          logger.info('Cached response', { key: cacheKey });
        } catch (error) {
          logger.error('Cache write error', error as Error);
        }
      }
    };
  };
}

/**
 * Invalidate cache entries
 */
export async function invalidateCache(
  env: any,
  patterns: string[],
  namespace?: string
): Promise<void> {
  if (!env?.CACHE_DO) {
    return;
  }

  const cacheHelper = new CacheHelper(env);
  
  // For now, we can only clear entire namespace
  // In a production system, we might want to implement pattern-based invalidation
  if (namespace) {
    await cacheHelper.clear(namespace);
    logger.info('Cleared cache namespace', { namespace });
  }
}

/**
 * Warm cache with data
 */
export async function warmCache(
  env: any,
  type: 'lobby' | 'player',
  data: any[]
): Promise<void> {
  if (!env?.CACHE_DO) {
    return;
  }

  const cacheHelper = new CacheHelper(env);
  await cacheHelper.warm(type, data);
  logger.info('Warmed cache', { type, count: data.length });
}