import { Router } from 'itty-router';
import { AuthenticationManager } from '@primo-poker/security';
import { StatisticsAggregator } from '@primo-poker/profiles';
import { StatsPeriod, StatsUpdateRequestSchema } from '@primo-poker/shared';
import { logger } from '@primo-poker/core';
import { requireAuth, requireRole } from '../../middleware/auth';

export function createStatisticsAdminRoutes(): Router<any> {
  const router = Router();

  // Trigger statistics aggregation manually
  router.post('/api/admin/statistics/aggregate', requireAuth, requireRole('admin'), async (request: any) => {
    try {
      const body = await request.json();
      const { period = StatsPeriod.DAILY } = body;

      logger.info('Admin triggered statistics aggregation', { 
        adminId: request.user.userId,
        period 
      });

      const aggregator = new StatisticsAggregator(request.env.DB, request.env.METRICS_NAMESPACE);
      
      // Run aggregation in the background
      request.env.ctx.waitUntil(aggregator.runAggregation(period));

      return new Response(JSON.stringify({
        success: true,
        message: `Statistics aggregation for ${period} period has been triggered`
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      logger.error('Failed to trigger statistics aggregation', error as Error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to trigger statistics aggregation'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  // Calculate statistics for a specific player
  router.post('/api/admin/statistics/player/:playerId', requireAuth, requireRole('admin'), async (request: any) => {
    try {
      const { playerId } = request.params;
      const body = await request.json();
      const validated = StatsUpdateRequestSchema.parse({ ...body, playerId });

      logger.info('Admin triggered player statistics calculation', {
        adminId: request.user.userId,
        playerId,
        forceRecalculation: validated.forceRecalculation
      });

      const aggregator = new StatisticsAggregator(request.env.DB, request.env.METRICS_NAMESPACE);
      
      // Calculate player stats
      await aggregator.calculatePlayerStats(playerId, validated.forceRecalculation);

      return new Response(JSON.stringify({
        success: true,
        message: `Statistics calculated for player ${playerId}`
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      logger.error('Failed to calculate player statistics', error as Error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to calculate player statistics'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  // Get job history
  router.get('/api/admin/statistics/jobs', requireAuth, requireRole('admin'), async (request: any) => {
    try {
      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get('limit') || '20');

      const aggregator = new StatisticsAggregator(request.env.DB, request.env.METRICS_NAMESPACE);
      const jobs = await aggregator.getJobHistory(limit);

      return new Response(JSON.stringify({
        success: true,
        jobs
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      logger.error('Failed to get job history', error as Error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to get job history'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  // Get aggregation status
  router.get('/api/admin/statistics/status', requireAuth, requireRole('admin'), async (request: any) => {
    try {
      // Get latest job status from KV
      const kv = request.env.METRICS_NAMESPACE;
      const list = await kv.list({ prefix: 'stats-job:', limit: 10 });
      
      const activeJobs = [];
      for (const key of list.keys) {
        const value = await kv.get(key.name);
        if (value) {
          const job = JSON.parse(value);
          if (job.status === 'running') {
            activeJobs.push({
              id: key.name.replace('stats-job:', ''),
              ...job
            });
          }
        }
      }

      // Get database statistics
      const statsResult = await request.env.DB.prepare(`
        SELECT 
          COUNT(DISTINCT player_id) as total_players,
          COUNT(*) as total_stat_records,
          MAX(last_calculated_at) as last_calculation
        FROM player_statistics
      `).first();

      return new Response(JSON.stringify({
        success: true,
        activeJobs,
        statistics: {
          totalPlayers: statsResult?.total_players || 0,
          totalStatRecords: statsResult?.total_stat_records || 0,
          lastCalculation: statsResult?.last_calculation || null
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      logger.error('Failed to get aggregation status', error as Error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to get aggregation status'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  return router;
}