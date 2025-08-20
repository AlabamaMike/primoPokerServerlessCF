import { IRequest, Router } from 'itty-router';
import { WorkerEnvironment } from '@primo-poker/shared';
import { logger } from '@primo-poker/core';
import { PerformanceMonitorDO } from '@primo-poker/persistence';

interface MetricsRequest extends IRequest {
  env?: WorkerEnvironment;
}

export const metricsRoutes = Router();

// Get current performance metrics overview
metricsRoutes.get('/overview', async (request: MetricsRequest) => {
  try {
    if (!request.env?.PERFORMANCE_MONITOR) {
      return new Response(JSON.stringify({ error: 'Performance monitor not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const monitorId = request.env.PERFORMANCE_MONITOR.idFromName('global');
    const monitor = request.env.PERFORMANCE_MONITOR.get(monitorId);
    
    const response = await monitor.fetch('http://internal/metrics');
    const metrics = await response.json();

    return new Response(JSON.stringify({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Failed to get metrics overview', error as Error);
    return new Response(JSON.stringify({ error: 'Failed to retrieve metrics' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Get cache metrics
metricsRoutes.get('/cache', async (request: MetricsRequest) => {
  try {
    if (!request.env?.PERFORMANCE_MONITOR) {
      return new Response(JSON.stringify({ error: 'Performance monitor not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const monitorId = request.env.PERFORMANCE_MONITOR.idFromName('global');
    const monitor = request.env.PERFORMANCE_MONITOR.get(monitorId);
    
    const response = await monitor.fetch('http://internal/metrics');
    const metrics = await response.json();

    return new Response(JSON.stringify({
      success: true,
      data: metrics.cache || {},
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Failed to get cache metrics', error as Error);
    return new Response(JSON.stringify({ error: 'Failed to retrieve cache metrics' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Get latency metrics
metricsRoutes.get('/latency', async (request: MetricsRequest) => {
  try {
    if (!request.env?.PERFORMANCE_MONITOR) {
      return new Response(JSON.stringify({ error: 'Performance monitor not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const monitorId = request.env.PERFORMANCE_MONITOR.idFromName('global');
    const monitor = request.env.PERFORMANCE_MONITOR.get(monitorId);
    
    const response = await monitor.fetch('http://internal/metrics');
    const metrics = await response.json();

    return new Response(JSON.stringify({
      success: true,
      data: {
        api: metrics.api?.latency || {},
        edge: {
          avgResponseTime: metrics.edge?.avgResponseTime || 0,
        },
      },
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Failed to get latency metrics', error as Error);
    return new Response(JSON.stringify({ error: 'Failed to retrieve latency metrics' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Get aggregated metrics
metricsRoutes.get('/aggregate', async (request: MetricsRequest) => {
  try {
    if (!request.env?.PERFORMANCE_MONITOR) {
      return new Response(JSON.stringify({ error: 'Performance monitor not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    const window = url.searchParams.get('window') || '1m';
    
    if (!['1m', '5m', '1h'].includes(window)) {
      return new Response(JSON.stringify({ error: 'Invalid window parameter. Must be 1m, 5m, or 1h' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const monitorId = request.env.PERFORMANCE_MONITOR.idFromName('global');
    const monitor = request.env.PERFORMANCE_MONITOR.get(monitorId);
    
    const response = await monitor.fetch(`http://internal/metrics/aggregate?window=${window}`);
    const aggregated = await response.json();

    return new Response(JSON.stringify({
      success: true,
      data: aggregated,
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Failed to get aggregated metrics', error as Error);
    return new Response(JSON.stringify({ error: 'Failed to retrieve aggregated metrics' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Get time series data
metricsRoutes.get('/timeseries', async (request: MetricsRequest) => {
  try {
    if (!request.env?.PERFORMANCE_MONITOR) {
      return new Response(JSON.stringify({ error: 'Performance monitor not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    const metric = url.searchParams.get('metric');
    const duration = url.searchParams.get('duration') || '1h';
    
    if (!metric) {
      return new Response(JSON.stringify({ error: 'Metric parameter is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const monitorId = request.env.PERFORMANCE_MONITOR.idFromName('global');
    const monitor = request.env.PERFORMANCE_MONITOR.get(monitorId);
    
    const response = await monitor.fetch(`http://internal/metrics/timeseries?metric=${metric}&duration=${duration}`);
    const timeSeries = await response.json();

    return new Response(JSON.stringify({
      success: true,
      data: timeSeries,
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Failed to get time series data', error as Error);
    return new Response(JSON.stringify({ error: 'Failed to retrieve time series data' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Get active alerts
metricsRoutes.get('/alerts', async (request: MetricsRequest) => {
  try {
    if (!request.env?.PERFORMANCE_MONITOR) {
      return new Response(JSON.stringify({ error: 'Performance monitor not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const monitorId = request.env.PERFORMANCE_MONITOR.idFromName('global');
    const monitor = request.env.PERFORMANCE_MONITOR.get(monitorId);
    
    const response = await monitor.fetch('http://internal/alerts');
    const alerts = await response.json();

    return new Response(JSON.stringify({
      success: true,
      data: alerts,
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Failed to get alerts', error as Error);
    return new Response(JSON.stringify({ error: 'Failed to retrieve alerts' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Create a new alert condition
metricsRoutes.post('/alerts', async (request: MetricsRequest) => {
  try {
    if (!request.env?.PERFORMANCE_MONITOR) {
      return new Response(JSON.stringify({ error: 'Performance monitor not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const alertCondition = await request.json();
    
    // Validate alert condition
    if (!alertCondition.id || !alertCondition.metric || !alertCondition.operator || 
        alertCondition.threshold === undefined || !alertCondition.window) {
      return new Response(JSON.stringify({ error: 'Invalid alert condition' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const monitorId = request.env.PERFORMANCE_MONITOR.idFromName('global');
    const monitor = request.env.PERFORMANCE_MONITOR.get(monitorId);
    
    const response = await monitor.fetch('http://internal/alerts/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alertCondition),
    });
    
    const result = await response.json();

    return new Response(JSON.stringify({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Failed to create alert', error as Error);
    return new Response(JSON.stringify({ error: 'Failed to create alert' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// WebSocket endpoint for real-time metrics
metricsRoutes.get('/ws', async (request: MetricsRequest) => {
  try {
    if (!request.env?.PERFORMANCE_MONITOR) {
      return new Response(JSON.stringify({ error: 'Performance monitor not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const monitorId = request.env.PERFORMANCE_MONITOR.idFromName('global');
    const monitor = request.env.PERFORMANCE_MONITOR.get(monitorId);
    
    // Forward WebSocket request to Durable Object
    return monitor.fetch(request);
  } catch (error) {
    logger.error('Failed to establish WebSocket connection', error as Error);
    return new Response(JSON.stringify({ error: 'Failed to establish WebSocket connection' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

export { metricsRoutes as createMetricsRoutes };