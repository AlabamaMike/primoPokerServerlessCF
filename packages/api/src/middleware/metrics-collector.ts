/**
 * Metrics Collection Middleware
 *
 * Automatically collects metrics for API requests
 */

import { IRequest } from 'itty-router';
import { logger } from '@primo-poker/core';

export interface MetricsCollectorConfig {
  analyticsEngine?: AnalyticsEngineDataset;
  kvNamespace?: KVNamespace;
  sampleRate?: number; // 0.0 to 1.0
}

export interface RequestMetrics {
  path: string;
  method: string;
  statusCode: number;
  duration: number;
  timestamp: number;
  userId?: string;
  errorType?: string;
}

/**
 * Middleware to collect request metrics
 */
export function metricsCollector(config: MetricsCollectorConfig) {
  const sampleRate = config.sampleRate ?? 1.0;

  return async (request: IRequest): Promise<Response | void> => {
    // Sample requests based on configured rate
    if (Math.random() > sampleRate) {
      return; // Skip this request
    }

    const startTime = Date.now();
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Store start time for later calculation
    request.startTime = startTime;

    // Continue to next middleware/handler
    // Metrics will be collected in the response handler
  };
}

/**
 * Middleware to record metrics after request completes
 */
export function metricsRecorder(config: MetricsCollectorConfig) {
  return async (request: IRequest, response: Response): Promise<Response> => {
    try {
      const startTime = request.startTime || Date.now();
      const duration = Date.now() - startTime;
      const url = new URL(request.url);

      const metrics: RequestMetrics = {
        path: url.pathname,
        method: request.method,
        statusCode: response.status,
        duration,
        timestamp: startTime,
        userId: (request as any).user?.userId,
        errorType: response.status >= 400 ? `http_${response.status}` : undefined,
      };

      // Write to Analytics Engine
      if (config.analyticsEngine) {
        config.analyticsEngine.writeDataPoint({
          blobs: [metrics.path, metrics.method, metrics.userId || 'anonymous'],
          doubles: [metrics.statusCode, metrics.duration],
          indexes: [
            metrics.errorType || 'success',
            getPathCategory(metrics.path)
          ],
        });
      }

      // Also write to KV for detailed debugging (sampled)
      if (config.kvNamespace && Math.random() < 0.01) { // 1% sample to KV
        const key = `metrics:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
        await config.kvNamespace.put(key, JSON.stringify(metrics), {
          expirationTtl: 86400, // Keep for 24 hours
        });
      }

      logger.debug('Request metrics collected', metrics);
    } catch (error) {
      // Don't let metrics collection break the request
      logger.error('Failed to collect metrics', error as Error);
    }

    return response;
  };
}

/**
 * Categorize API paths for easier analysis
 */
function getPathCategory(path: string): string {
  if (path.startsWith('/api/auth')) return 'auth';
  if (path.startsWith('/api/wallet')) return 'wallet';
  if (path.startsWith('/api/tables')) return 'tables';
  if (path.startsWith('/api/games')) return 'games';
  if (path.startsWith('/api/tournaments')) return 'tournaments';
  if (path.startsWith('/api/players')) return 'players';
  if (path.startsWith('/api/admin')) return 'admin';
  if (path.startsWith('/api/metrics')) return 'metrics';
  if (path.startsWith('/api/leaderboards')) return 'leaderboards';
  if (path.startsWith('/api/lobby')) return 'lobby';
  if (path.startsWith('/api/chat')) return 'chat';
  if (path.startsWith('/api/social')) return 'social';
  if (path.startsWith('/api/profiles')) return 'profiles';
  return 'other';
}

/**
 * Wrapper function to apply metrics middleware to handlers
 */
export function withMetrics<T extends IRequest>(
  handler: (request: T) => Promise<Response>,
  config: MetricsCollectorConfig
): (request: T) => Promise<Response> {
  return async (request: T): Promise<Response> => {
    // Record start time
    const startTime = Date.now();
    request.startTime = startTime;

    try {
      // Execute handler
      const response = await handler(request);

      // Record metrics
      await recordMetrics(request, response, config);

      return response;
    } catch (error) {
      // Record error metrics
      const errorResponse = new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500 }
      );

      await recordMetrics(request, errorResponse, config);

      throw error;
    }
  };
}

/**
 * Helper to record metrics
 */
async function recordMetrics(
  request: IRequest,
  response: Response,
  config: MetricsCollectorConfig
): Promise<void> {
  try {
    const startTime = request.startTime || Date.now();
    const duration = Date.now() - startTime;
    const url = new URL(request.url);

    const metrics: RequestMetrics = {
      path: url.pathname,
      method: request.method,
      statusCode: response.status,
      duration,
      timestamp: startTime,
      userId: (request as any).user?.userId,
      errorType: response.status >= 400 ? `http_${response.status}` : undefined,
    };

    // Write to Analytics Engine
    if (config.analyticsEngine) {
      config.analyticsEngine.writeDataPoint({
        blobs: [metrics.path, metrics.method, metrics.userId || 'anonymous'],
        doubles: [metrics.statusCode, metrics.duration],
        indexes: [
          metrics.errorType || 'success',
          getPathCategory(metrics.path)
        ],
      });
    }

    // Also write to KV for detailed debugging (sampled)
    if (config.kvNamespace && Math.random() < 0.01) { // 1% sample to KV
      const key = `metrics:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
      await config.kvNamespace.put(key, JSON.stringify(metrics), {
        expirationTtl: 86400, // Keep for 24 hours
      });
    }
  } catch (error) {
    // Don't let metrics collection break the request
    logger.error('Failed to record metrics', error as Error);
  }
}

/**
 * Aggregate metrics from KV or Analytics Engine
 */
export async function getAggregatedMetrics(
  kvNamespace: KVNamespace,
  timeRange: { start: number; end: number }
): Promise<Record<string, any>> {
  try {
    // List keys in the time range
    const prefix = 'metrics:';
    const keys = await kvNamespace.list({ prefix, limit: 1000 });

    const metrics: RequestMetrics[] = [];

    for (const key of keys.keys) {
      const data = await kvNamespace.get(key.name, 'json');
      if (data && typeof data === 'object') {
        const metric = data as RequestMetrics;
        if (metric.timestamp >= timeRange.start && metric.timestamp <= timeRange.end) {
          metrics.push(metric);
        }
      }
    }

    // Aggregate
    const aggregated = {
      totalRequests: metrics.length,
      averageDuration: metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length || 0,
      statusCodes: {} as Record<number, number>,
      paths: {} as Record<string, number>,
      errors: metrics.filter(m => m.errorType).length,
    };

    // Count status codes
    for (const metric of metrics) {
      aggregated.statusCodes[metric.statusCode] = (aggregated.statusCodes[metric.statusCode] || 0) + 1;
      aggregated.paths[metric.path] = (aggregated.paths[metric.path] || 0) + 1;
    }

    return aggregated;
  } catch (error) {
    logger.error('Failed to aggregate metrics', error as Error);
    return { error: 'Failed to aggregate metrics' };
  }
}
