import { logger } from '@primo-poker/core';

export interface CacheInvalidationRequest {
  tags?: string[];
  urls?: string[];
  everything?: boolean;
}

export interface CloudflarePurgeRequestBody {
  purge_everything?: boolean;
  tags?: string[];
  files?: string[];
}

export interface CacheInvalidationEnv {
  ZONE_ID?: string;
  CF_API_TOKEN?: string;
  CACHE_INVALIDATION_SECRET?: string;
}

export class CacheInvalidationHandler {
  /**
   * Handle cache invalidation webhook
   */
  static async handleInvalidation(
    request: Request,
    env: CacheInvalidationEnv
  ): Promise<Response> {
    try {
      // Validate authentication
      if (env.CACHE_INVALIDATION_SECRET) {
        const authHeader = request.headers.get('Authorization');
        const expectedAuth = `Bearer ${env.CACHE_INVALIDATION_SECRET}`;
        
        if (!authHeader || authHeader !== expectedAuth) {
          logger.warn('Unauthorized cache invalidation attempt', { 
            ip: request.headers.get('CF-Connecting-IP') || 'unknown'
          });
          return new Response(JSON.stringify({
            success: false,
            error: 'Unauthorized'
          }), { 
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Validate request origin (Cloudflare headers)
      const cfHeaders = {
        ray: request.headers.get('CF-Ray'),
        country: request.headers.get('CF-IPCountry')
      };
      
      if (!cfHeaders.ray) {
        logger.warn('Cache invalidation request missing Cloudflare headers', cfHeaders);
      }

      const body = await request.json() as CacheInvalidationRequest;
      
      if (!env.ZONE_ID || !env.CF_API_TOKEN) {
        logger.error('Cache invalidation not configured - missing environment variables');
        return new Response(JSON.stringify({
          success: false,
          error: 'Cache invalidation not configured'
        }), { 
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const purgeBody: CloudflarePurgeRequestBody = {};
      
      if (body.everything) {
        purgeBody.purge_everything = true;
      } else if (body.tags && body.tags.length > 0) {
        purgeBody.tags = body.tags;
      } else if (body.urls && body.urls.length > 0) {
        purgeBody.files = body.urls;
      } else {
        return new Response(JSON.stringify({
          success: false,
          error: 'No invalidation targets specified'
        }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Use internal purge method
      const result = await this.purgeCache(purgeBody, env);
      
      if (!result.success) {
        return new Response(JSON.stringify({
          success: false,
          error: result.error,
          details: result.result
        }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      logger.info('Cache invalidated successfully', { 
        tags: body.tags?.length || 0,
        urls: body.urls?.length || 0,
        everything: body.everything || false
      });

      return new Response(JSON.stringify({
        success: true,
        result: result.result
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      logger.error('Cache invalidation error', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Internal error during cache invalidation'
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Internal method to purge cache
   */
  private static async purgeCache(
    purgeBody: CloudflarePurgeRequestBody,
    env: CacheInvalidationEnv
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    if (!env.ZONE_ID || !env.CF_API_TOKEN) {
      return { 
        success: false, 
        error: 'Cache invalidation not configured' 
      };
    }

    try {
      const cfResponse = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${env.ZONE_ID}/purge_cache`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.CF_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(purgeBody)
        }
      );

      const result = await cfResponse.json();
      
      if (!cfResponse.ok) {
        logger.error('Cloudflare cache purge failed', { 
          status: cfResponse.status,
          result 
        });
        return { 
          success: false, 
          error: 'Cache purge failed',
          result 
        };
      }

      return { success: true, result };
    } catch (error) {
      logger.error('Cache purge error', error);
      return { 
        success: false, 
        error: 'Internal error during cache purge' 
      };
    }
  }

  /**
   * Invalidate cache for specific game events
   */
  static async invalidateGameCache(tableId: string, env: CacheInvalidationEnv): Promise<void> {
    const tags = [
      `api:tables`,
      `api:lobby`,
      `table:${tableId}`,
    ];

    const result = await this.purgeCache({ tags }, env);
    
    if (!result.success) {
      logger.error('Failed to invalidate game cache', { 
        tableId,
        error: result.error 
      });
    } else {
      logger.info('Game cache invalidated', { tableId, tags });
    }
  }

  /**
   * Invalidate cache for leaderboard updates
   */
  static async invalidateLeaderboardCache(env: CacheInvalidationEnv): Promise<void> {
    const tags = ['api:leaderboards'];

    const result = await this.purgeCache({ tags }, env);
    
    if (!result.success) {
      logger.error('Failed to invalidate leaderboard cache', { 
        error: result.error 
      });
    } else {
      logger.info('Leaderboard cache invalidated', { tags });
    }
  }
}