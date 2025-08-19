import { logger } from '@primo-poker/core';

export interface CacheInvalidationRequest {
  tags?: string[];
  urls?: string[];
  everything?: boolean;
}

export class CacheInvalidationHandler {
  /**
   * Handle cache invalidation webhook
   */
  static async handleInvalidation(
    request: Request,
    env: { ZONE_ID?: string; CF_API_TOKEN?: string }
  ): Promise<Response> {
    try {
      const body = await request.json() as CacheInvalidationRequest;
      
      if (!env.ZONE_ID || !env.CF_API_TOKEN) {
        logger.warn('Cache invalidation called without required environment variables');
        return new Response(JSON.stringify({
          success: false,
          error: 'Cache invalidation not configured'
        }), { status: 503 });
      }

      const purgeBody: any = {};
      
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
        }), { status: 400 });
      }

      // Call Cloudflare API to purge cache
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
        logger.error('Cloudflare cache purge failed', result);
        return new Response(JSON.stringify({
          success: false,
          error: 'Cache purge failed',
          details: result
        }), { status: cfResponse.status });
      }

      logger.info('Cache invalidated successfully', { 
        tags: body.tags,
        urls: body.urls,
        everything: body.everything 
      });

      return new Response(JSON.stringify({
        success: true,
        result
      }), { status: 200 });

    } catch (error) {
      logger.error('Cache invalidation error', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Internal error during cache invalidation'
      }), { status: 500 });
    }
  }

  /**
   * Invalidate cache for specific game events
   */
  static async invalidateGameCache(tableId: string, env: any): Promise<void> {
    const tags = [
      `api:tables`,
      `api:lobby`,
      `table:${tableId}`,
    ];

    try {
      await this.handleInvalidation(
        new Request('internal://cache-invalidation', {
          method: 'POST',
          body: JSON.stringify({ tags })
        }),
        env
      );
    } catch (error) {
      logger.error('Failed to invalidate game cache', error, { tableId });
    }
  }

  /**
   * Invalidate cache for leaderboard updates
   */
  static async invalidateLeaderboardCache(env: any): Promise<void> {
    const tags = ['api:leaderboards'];

    try {
      await this.handleInvalidation(
        new Request('internal://cache-invalidation', {
          method: 'POST',
          body: JSON.stringify({ tags })
        }),
        env
      );
    } catch (error) {
      logger.error('Failed to invalidate leaderboard cache', error);
    }
  }
}