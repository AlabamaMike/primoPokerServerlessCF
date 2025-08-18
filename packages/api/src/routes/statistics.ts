import { Router } from 'itty-router';
import { 
  StatsQuery,
  StatsQuerySchema,
  PlayerStatsViewSchema,
  PlayerStatisticsSchema,
  StatsPeriod,
  StatsGameType
} from '@primo-poker/shared';
import { logger } from '@primo-poker/core';
import { D1PlayerStatisticsRepository } from '@primo-poker/persistence';
import { createSuccessResponse, createErrorResponse } from '../utils/response-helpers';
import { statisticsRateLimiter } from '../middleware/rate-limiter';
import { z } from 'zod';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    username: string;
    email: string;
    roles?: string[];
  };
  env?: Env;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

interface Env {
  DB: D1Database;
  [key: string]: unknown;
}


// Cache headers configuration
const getCacheHeaders = (maxAge: number = 300): Record<string, string> => {
  return {
    'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}`,
    'CDN-Cache-Control': `max-age=${maxAge}`,
    'Surrogate-Control': `max-age=${maxAge}`,
  };
};

// Create statistics router
export function createStatisticsRoutes(): Router<AuthenticatedRequest> {
  const router = Router<AuthenticatedRequest>();

  // GET /api/players/{id}/statistics - Get player statistics
  router.get('/api/players/:playerId/statistics', statisticsRateLimiter.middleware(), async (request: AuthenticatedRequest) => {
    // Authentication is handled by the parent router
    if (!request.user) {
      return createErrorResponse('Not authenticated', 401, 'UNAUTHORIZED');
    }
    try {
      const { playerId } = request.params;
      const url = new URL(request.url);
      
      // Parse query parameters
      const period = url.searchParams.get('period') as StatsPeriod | null;
      const gameType = url.searchParams.get('gameType') as StatsGameType | null;
      
      // Validate player ID
      if (!z.string().uuid().safeParse(playerId).success) {
        return createErrorResponse('Invalid player ID format', 400, 'INVALID_PLAYER_ID');
      }

      // Check if user can access these statistics
      // Users can access their own stats, admins can access all stats
      const isOwnStats = request.user.userId === playerId;
      const isAdmin = request.user.roles?.includes('admin');
      
      if (!isOwnStats && !isAdmin) {
        return createErrorResponse('Forbidden', 403, 'FORBIDDEN');
      }

      if (!request.env?.DB) {
        logger.error('Database not available');
        return createErrorResponse('Database not available', 500, 'DATABASE_ERROR');
      }

      const statsRepo = new D1PlayerStatisticsRepository(request.env.DB);
      
      // Fetch player statistics
      const stats = await statsRepo.findByPlayer(
        playerId,
        period || undefined,
        gameType || undefined
      );

      if (stats.length === 0) {
        // For security, return same error as forbidden to avoid player enumeration
        if (!isOwnStats && !isAdmin) {
          return createErrorResponse('Forbidden', 403, 'FORBIDDEN');
        }
        return createErrorResponse('No statistics found', 404, 'STATS_NOT_FOUND');
      }

      // Transform and validate response
      const validatedStats = stats.map(stat => PlayerStatisticsSchema.parse(stat));

      logger.info('Player statistics retrieved', {
        playerId,
        period,
        gameType,
        statsCount: validatedStats.length
      });

      // Add cache headers for statistics (5 minutes)
      const response = createSuccessResponse({
        playerId,
        statistics: validatedStats,
        period: period || 'all',
        gameType: gameType || 'all'
      });

      // Add cache headers
      Object.entries(getCacheHeaders(300)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      // Add rate limit headers
      const remaining = Math.max(0, 30 - 1); // Simplified - in production, track actual usage
      response.headers.set('X-RateLimit-Limit', '30');
      response.headers.set('X-RateLimit-Remaining', remaining.toString());
      response.headers.set('X-RateLimit-Reset', new Date(Date.now() + 60000).toISOString());

      return response;

    } catch (error) {
      logger.error('Failed to get player statistics', error as Error);
      
      if (error instanceof z.ZodError) {
        return createErrorResponse('Invalid request', 400, 'VALIDATION_ERROR');
      }
      
      return createErrorResponse('Service unavailable', 500, 'INTERNAL_ERROR');
    }
  });

  // GET /api/leaderboards - Get leaderboard data
  router.get('/api/leaderboards', statisticsRateLimiter.middleware(), async (request: Request) => {
    try {
      const url = new URL(request.url);
      
      // Parse and validate query parameters
      const queryParams: Record<string, unknown> = {};
      
      // Extract query parameters
      url.searchParams.forEach((value, key) => {
        if (key === 'limit' || key === 'offset') {
          queryParams[key] = parseInt(value);
        } else if (key === 'playerIds') {
          queryParams[key] = value.split(',');
        } else if (key === 'startDate' || key === 'endDate') {
          queryParams[key] = new Date(value);
        } else {
          queryParams[key] = value;
        }
      });

      // Validate query parameters
      const validationResult = StatsQuerySchema.safeParse(queryParams);
      
      if (!validationResult.success) {
        return createErrorResponse(
          'Invalid query parameters: ' + validationResult.error.errors.map(e => e.message).join(', '),
          400,
          'INVALID_QUERY'
        );
      }

      const query = validationResult.data;

      // Cast request to AuthenticatedRequest for env access
      const authReq = request as AuthenticatedRequest;
      if (!authReq.env?.DB) {
        logger.error('Database not available');
        return createErrorResponse('Service unavailable', 500, 'DATABASE_ERROR');
      }

      const statsRepo = new D1PlayerStatisticsRepository(authReq.env.DB);
      
      // Fetch leaderboard data
      const leaderboard = await statsRepo.getLeaderboard(query);

      // Validate response data
      const validatedLeaderboard = leaderboard.map(entry => PlayerStatsViewSchema.parse(entry));

      logger.info('Leaderboard retrieved', {
        period: query.period,
        gameType: query.gameType,
        limit: query.limit,
        offset: query.offset,
        sortBy: query.sortBy,
        resultsCount: validatedLeaderboard.length
      });

      // Calculate pagination metadata
      const hasMore = validatedLeaderboard.length === query.limit;
      const nextOffset = hasMore ? query.offset + query.limit : null;

      const response = createSuccessResponse({
        leaderboard: validatedLeaderboard,
        query: {
          period: query.period || StatsPeriod.ALL_TIME,
          gameType: query.gameType || StatsGameType.ALL,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
          limit: query.limit,
          offset: query.offset
        },
        pagination: {
          limit: query.limit,
          offset: query.offset,
          hasMore,
          nextOffset
        }
      });

      // Add cache headers for leaderboard (1 minute for more frequent updates)
      Object.entries(getCacheHeaders(60)).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      // Add rate limit headers
      const remaining = Math.max(0, 30 - 1); // Simplified - in production, track actual usage
      response.headers.set('X-RateLimit-Limit', '30');
      response.headers.set('X-RateLimit-Remaining', remaining.toString());
      response.headers.set('X-RateLimit-Reset', new Date(Date.now() + 60000).toISOString());

      return response;

    } catch (error) {
      logger.error('Failed to get leaderboard', error as Error);
      
      if (error instanceof z.ZodError) {
        return createErrorResponse('Invalid request', 400, 'VALIDATION_ERROR');
      }
      
      return createErrorResponse('Service unavailable', 500, 'INTERNAL_ERROR');
    }
  });

  return router;
}

// Export a singleton instance
export const statisticsRoutes = createStatisticsRoutes();