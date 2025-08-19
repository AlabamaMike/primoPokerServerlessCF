import { IRequest } from 'itty-router';
import { logger } from '@primo-poker/core';
import { 
  cacheConfig, 
  CacheControl, 
  CACHEABLE_CONTENT_TYPES,
  CACHEABLE_API_ROUTES,
  NON_CACHEABLE_API_ROUTES,
  CacheTTL
} from './cache-config';

interface CacheableRequest extends IRequest {
  user?: any;
}

export class CacheHeadersMiddleware {
  /**
   * Middleware to add cache headers to responses
   */
  static middleware() {
    return async (request: CacheableRequest, response: Response): Promise<Response> => {
      // Don't cache if user is authenticated (unless specifically allowed)
      const isAuthenticated = !!request.user;
      const url = new URL(request.url);
      const pathname = url.pathname;

      // Determine cache settings based on route
      const cacheSettings = this.determineCacheSettings(pathname, isAuthenticated);
      
      if (!cacheSettings || cacheSettings.ttl === 0) {
        // No caching
        return this.setCacheHeaders(response, 'no-cache');
      }

      // Set appropriate cache headers
      return this.setCacheHeaders(response, 'cache', cacheSettings);
    };
  }

  /**
   * Set cache headers on response
   */
  static setCacheHeaders(response: Response, type: 'cache' | 'no-cache', settings?: CacheTTL): Response {
    const headers = new Headers(response.headers);

    if (type === 'no-cache') {
      headers.set('Cache-Control', CacheControl.PRIVATE_NO_CACHE);
      headers.set('Pragma', 'no-cache');
      headers.set('Expires', '0');
    } else if (settings) {
      const maxAge = settings.ttl;
      const cacheControl = settings.edge 
        ? `public, max-age=${maxAge}, s-maxage=${maxAge}`
        : `private, max-age=${maxAge}`;
      
      headers.set('Cache-Control', cacheControl);
      
      // Add CDN cache tag for easier purging
      headers.set('Cache-Tag', this.generateCacheTag(response.url));
      
      // Set expires header
      const expires = new Date(Date.now() + maxAge * 1000).toUTCString();
      headers.set('Expires', expires);
    }

    // Always set Vary header for proper caching with authentication
    const existingVary = headers.get('Vary') || '';
    const varyHeaders = new Set(existingVary.split(',').map(h => h.trim()).filter(Boolean));
    varyHeaders.add('Authorization');
    varyHeaders.add('Accept');
    headers.set('Vary', Array.from(varyHeaders).join(', '));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  /**
   * Generate ETag for content using Web Crypto API
   */
  static async generateETag(content: any): Promise<string> {
    const data = typeof content === 'string' ? content : JSON.stringify(content);
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    // Use Web Crypto API for hashing
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return `"${hashHex.substring(0, 16)}"`;
  }

  /**
   * Handle conditional requests (If-None-Match, If-Modified-Since)
   */
  static async handleConditionalRequest(request: CacheableRequest): Promise<Response | null> {
    const ifNoneMatch = request.headers.get('If-None-Match');
    const ifModifiedSince = request.headers.get('If-Modified-Since');

    // This would need to be implemented with actual content checking
    // For now, we'll return null to indicate the request should proceed
    logger.debug('Conditional request headers', { ifNoneMatch, ifModifiedSince });
    
    return null;
  }

  /**
   * Purge cache for specific patterns
   */
  static async purgeCache(patterns: string[]): Promise<void> {
    // In production, this would call Cloudflare's API to purge cache
    // For now, we'll just log the purge request
    logger.info('Cache purge requested', { patterns });
    
    // Example of what the actual implementation might look like:
    // await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${CF_API_TOKEN}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({ 
    //     tags: patterns.map(p => this.generateCacheTag(p))
    //   })
    // });
  }

  /**
   * Determine cache settings based on route and authentication status
   */
  private static determineCacheSettings(pathname: string, isAuthenticated: boolean): CacheTTL | null {
    // Check if route should never be cached
    if (NON_CACHEABLE_API_ROUTES.some(route => {
      const regex = new RegExp(route.replace('*', '.*'));
      return regex.test(pathname);
    })) {
      return null;
    }

    // Check static assets
    if (pathname.match(/\.(js|css|png|jpg|jpeg|svg|webp|woff|woff2)$/)) {
      const ext = pathname.split('.').pop()!;
      if (['js', 'css'].includes(ext)) {
        return cacheConfig.static.scripts;
      } else if (['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext)) {
        return cacheConfig.static.images;
      } else {
        return cacheConfig.static.assets;
      }
    }

    // Check API routes
    if (pathname.startsWith('/api/')) {
      // Authenticated requests generally shouldn't be cached
      if (isAuthenticated && !pathname.includes('/leaderboards')) {
        return cacheConfig.api.authenticated;
      }

      // Check specific cacheable routes
      if (pathname.includes('/lobby/')) {
        return cacheConfig.api.lobby;
      }

      if (CACHEABLE_API_ROUTES.some(route => pathname.startsWith(route))) {
        return cacheConfig.api.public;
      }
    }

    // Default: no caching
    return null;
  }

  /**
   * Generate a cache tag for a URL
   */
  private static generateCacheTag(url: string): string {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // Generate tags based on path segments
    const segments = pathname.split('/').filter(Boolean);
    const tags: string[] = [];
    
    // Add hierarchical tags
    let currentPath = '';
    for (const segment of segments) {
      currentPath += '/' + segment;
      tags.push(`path:${currentPath}`);
    }
    
    // Add route-specific tags
    if (pathname.includes('/api/tables')) {
      tags.push('api:tables');
    } else if (pathname.includes('/api/lobby')) {
      tags.push('api:lobby');
    } else if (pathname.includes('/api/leaderboards')) {
      tags.push('api:leaderboards');
    }
    
    return tags.join(',');
  }

  /**
   * Middleware to add ETag support
   */
  static etagMiddleware() {
    return async (request: CacheableRequest, response: Response): Promise<Response> => {
      // Only add ETag for successful responses with content
      if (response.status !== 200 || !response.body) {
        return response;
      }

      // Check if response already has an ETag
      if (response.headers.get('ETag')) {
        return response;
      }

      try {
        // Clone response to read body
        const clonedResponse = response.clone();
        const content = await clonedResponse.text();
        
        // Generate ETag
        const etag = await this.generateETag(content);
        
        // Create new response with ETag header
        const headers = new Headers(response.headers);
        headers.set('ETag', etag);
        
        return new Response(content, {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      } catch (error) {
        logger.error('Failed to generate ETag', error);
        return response;
      }
    };
  }
}