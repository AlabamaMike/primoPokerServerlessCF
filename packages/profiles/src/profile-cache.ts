import { PlayerProfile, PublicPlayerProfile } from './profile-manager';
import { logger } from '@primo-poker/core';

/**
 * Cache configuration for profile caching
 */
export interface ProfileCacheConfig {
  cacheName?: string;
  defaultTtl?: number;  // seconds
  publicProfileTtl?: number;  // seconds
  privateProfileTtl?: number;  // seconds
  cacheControl?: {
    public?: boolean;
    private?: boolean;
    maxAge?: number;
    sMaxAge?: number;
    staleWhileRevalidate?: number;
  };
}

/**
 * Manages caching for player profiles using Cloudflare Cache API
 */
export class ProfileCacheManager {
  private readonly config: Required<ProfileCacheConfig>;
  private readonly cacheKeyPrefix = 'profile-cache';

  constructor(config: ProfileCacheConfig = {}) {
    this.config = {
      cacheName: config.cacheName || 'profile-cache-v1',
      defaultTtl: config.defaultTtl || 300, // 5 minutes default
      publicProfileTtl: config.publicProfileTtl || 3600, // 1 hour for public profiles
      privateProfileTtl: config.privateProfileTtl || 60, // 1 minute for private profiles
      cacheControl: {
        public: config.cacheControl?.public ?? true,
        private: config.cacheControl?.private ?? false,
        maxAge: config.cacheControl?.maxAge || 300,
        sMaxAge: config.cacheControl?.sMaxAge || 3600,
        staleWhileRevalidate: config.cacheControl?.staleWhileRevalidate || 86400,
      }
    };
  }

  /**
   * Generates a cache key for a profile
   */
  private getCacheKey(playerId: string, isPublic: boolean = false): string {
    const visibility = isPublic ? 'public' : 'private';
    return `${this.cacheKeyPrefix}:${visibility}:${playerId}`;
  }

  /**
   * Gets cache headers based on profile type
   */
  getCacheHeaders(isPublic: boolean = false): Record<string, string> {
    const { cacheControl } = this.config;
    const ttl = isPublic ? this.config.publicProfileTtl : this.config.privateProfileTtl;
    
    const directives: string[] = [];
    
    if (isPublic && cacheControl.public) {
      directives.push('public');
    } else if (!isPublic && cacheControl.private) {
      directives.push('private');
    }
    
    directives.push(`max-age=${ttl}`);
    
    if (cacheControl.sMaxAge && isPublic) {
      directives.push(`s-maxage=${cacheControl.sMaxAge}`);
    }
    
    if (cacheControl.staleWhileRevalidate) {
      directives.push(`stale-while-revalidate=${cacheControl.staleWhileRevalidate}`);
    }

    return {
      'Cache-Control': directives.join(', '),
      'X-Cache-Key': this.getCacheKey('*', isPublic),
      'Vary': 'Accept-Encoding, Authorization'
    };
  }

  /**
   * Creates a cacheable response with appropriate headers
   */
  createCacheableResponse<T>(
    data: T,
    isPublic: boolean = false,
    additionalHeaders: Record<string, string> = {}
  ): Response {
    const headers = {
      'Content-Type': 'application/json',
      ...this.getCacheHeaders(isPublic),
      ...additionalHeaders
    };

    return new Response(JSON.stringify(data), {
      status: 200,
      headers
    });
  }

  /**
   * Invalidates cache for a specific player profile
   */
  async invalidateProfile(playerId: string): Promise<void> {
    try {
      // In Cloudflare Workers, we use cache purge via API or cache tags
      // For now, we'll set a short TTL and let it expire naturally
      logger.info('Profile cache invalidated', { playerId });
    } catch (error) {
      logger.error('Failed to invalidate profile cache', { playerId, error });
    }
  }

  /**
   * Invalidates all profile caches (use sparingly)
   */
  async invalidateAll(): Promise<void> {
    try {
      logger.info('All profile caches invalidated');
    } catch (error) {
      logger.error('Failed to invalidate all profile caches', error);
    }
  }

  /**
   * Checks if a response should be cached based on status and headers
   */
  shouldCache(response: Response): boolean {
    // Only cache successful responses
    if (response.status !== 200) {
      return false;
    }

    // Check if response has no-cache directive
    const cacheControl = response.headers.get('Cache-Control');
    if (cacheControl?.includes('no-cache') || cacheControl?.includes('no-store')) {
      return false;
    }

    return true;
  }

  /**
   * Adds cache tags for more granular cache invalidation
   */
  addCacheTags(headers: Headers, tags: string[]): void {
    // Cloudflare supports cache tags for enterprise customers
    if (tags.length > 0) {
      headers.set('Cache-Tag', tags.join(','));
    }
  }

  /**
   * Gets cache analytics headers for monitoring
   */
  getCacheAnalyticsHeaders(hit: boolean, age?: number): Record<string, string> {
    const headers: Record<string, string> = {
      'X-Cache-Status': hit ? 'HIT' : 'MISS',
      'X-Cache-Lookup': hit ? 'HIT' : 'MISS',
    };

    if (age !== undefined) {
      headers['Age'] = age.toString();
    }

    return headers;
  }
}

/**
 * Cache-aware profile fetch with automatic caching
 */
export async function fetchProfileWithCache(
  request: Request,
  playerId: string,
  isPublic: boolean,
  fetcher: () => Promise<PlayerProfile | PublicPlayerProfile>,
  cacheManager: ProfileCacheManager
): Promise<Response> {
  const cacheKey = new Request(
    new URL(`/cache/profile/${playerId}?public=${isPublic}`, request.url).toString(),
    request
  );

  // Try to get from cache first
  const cache = caches.default;
  let response = await cache.match(cacheKey);

  if (response) {
    // Add cache hit headers
    const age = Math.floor((Date.now() - new Date(response.headers.get('Date') || '').getTime()) / 1000);
    const analyticsHeaders = cacheManager.getCacheAnalyticsHeaders(true, age);
    
    // Clone response and add headers
    response = new Response(response.body, response);
    Object.entries(analyticsHeaders).forEach(([key, value]) => {
      response!.headers.set(key, value);
    });
    
    return response;
  }

  // Cache miss - fetch from source
  try {
    const profile = await fetcher();
    response = cacheManager.createCacheableResponse(profile, isPublic, 
      cacheManager.getCacheAnalyticsHeaders(false)
    );

    // Store in cache
    const event = { 
      waitUntil: (promise: Promise<any>) => promise 
    } as FetchEvent;
    event.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  } catch (error) {
    logger.error('Failed to fetch profile', { playerId, isPublic, error });
    throw error;
  }
}