import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createMetricsRoutes } from '../../routes/metrics';
import { WorkerEnvironment } from '@primo-poker/shared';

describe('Metrics Routes', () => {
  let metricsRoutes: ReturnType<typeof createMetricsRoutes>;
  let mockEnv: Partial<WorkerEnvironment>;
  let mockMonitor: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock the Durable Object
    mockMonitor = {
      fetch: jest.fn(),
    };

    // Mock environment
    mockEnv = {
      PERFORMANCE_MONITOR: {
        idFromName: jest.fn(() => 'mock-id'),
        get: jest.fn(() => mockMonitor),
      } as any,
    };

    metricsRoutes = createMetricsRoutes();
  });

  describe('GET /overview', () => {
    it('should return performance metrics overview', async () => {
      const mockMetrics = {
        cache: { hitRate: 0.9, missRate: 0.1 },
        api: { latency: { p50: 25, p95: 100, p99: 200 } },
        websocket: { connections: 100 },
        edge: { cacheHitRate: 0.95 },
        timestamp: Date.now(),
      };

      mockMonitor.fetch.mockResolvedValue(
        new Response(JSON.stringify(mockMetrics), {
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const request = new Request('http://example.com/api/metrics/overview');
      (request as any).env = mockEnv;

      const response = await metricsRoutes.handle(request);
      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockMetrics);
      expect(result.timestamp).toBeDefined();
    });

    it('should return 503 when performance monitor not configured', async () => {
      const request = new Request('http://example.com/api/metrics/overview');
      (request as any).env = {};

      const response = await metricsRoutes.handle(request);
      expect(response.status).toBe(503);

      const result = await response.json();
      expect(result.error).toBe('Performance monitor not configured');
    });
  });

  describe('GET /cache', () => {
    it('should return cache metrics', async () => {
      const mockMetrics = {
        cache: {
          hitRate: 0.9,
          missRate: 0.1,
          evictions: 10,
          size: 1000,
        },
      };

      mockMonitor.fetch.mockResolvedValue(
        new Response(JSON.stringify(mockMetrics), {
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const request = new Request('http://example.com/api/metrics/cache');
      (request as any).env = mockEnv;

      const response = await metricsRoutes.handle(request);
      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockMetrics.cache);
    });
  });

  describe('GET /latency', () => {
    it('should return latency metrics', async () => {
      const mockMetrics = {
        api: {
          latency: { p50: 25, p95: 100, p99: 200 },
        },
        edge: {
          avgResponseTime: 50,
        },
      };

      mockMonitor.fetch.mockResolvedValue(
        new Response(JSON.stringify(mockMetrics), {
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const request = new Request('http://example.com/api/metrics/latency');
      (request as any).env = mockEnv;

      const response = await metricsRoutes.handle(request);
      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data.api).toEqual(mockMetrics.api.latency);
      expect(result.data.edge.avgResponseTime).toBe(50);
    });
  });

  describe('GET /aggregate', () => {
    it('should return aggregated metrics for valid time window', async () => {
      const mockAggregated = {
        cache: { hitRate: 0.85 },
        api: { throughput: 1000 },
        window: '5m',
        sampleCount: 10,
      };

      mockMonitor.fetch.mockResolvedValue(
        new Response(JSON.stringify(mockAggregated), {
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const request = new Request('http://example.com/api/metrics/aggregate?window=5m');
      (request as any).env = mockEnv;

      const response = await metricsRoutes.handle(request);
      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAggregated);

      expect(mockMonitor.fetch).toHaveBeenCalledWith(
        expect.stringContaining('window=5m')
      );
    });

    it('should return 400 for invalid window parameter', async () => {
      const request = new Request('http://example.com/api/metrics/aggregate?window=invalid');
      (request as any).env = mockEnv;

      const response = await metricsRoutes.handle(request);
      expect(response.status).toBe(400);

      const result = await response.json();
      expect(result.error).toBe('Invalid window parameter. Must be 1m, 5m, or 1h');
    });

    it('should default to 1m window when not specified', async () => {
      mockMonitor.fetch.mockResolvedValue(
        new Response(JSON.stringify({ window: '1m' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const request = new Request('http://example.com/api/metrics/aggregate');
      (request as any).env = mockEnv;

      await metricsRoutes.handle(request);

      expect(mockMonitor.fetch).toHaveBeenCalledWith(
        expect.stringContaining('window=1m')
      );
    });
  });

  describe('GET /timeseries', () => {
    it('should return time series data for specified metric', async () => {
      const mockTimeSeries = {
        metric: 'cache.hitRate',
        dataPoints: [
          { timestamp: Date.now() - 3600000, value: 0.8 },
          { timestamp: Date.now() - 1800000, value: 0.85 },
          { timestamp: Date.now(), value: 0.9 },
        ],
        duration: '1h',
      };

      mockMonitor.fetch.mockResolvedValue(
        new Response(JSON.stringify(mockTimeSeries), {
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const request = new Request('http://example.com/api/metrics/timeseries?metric=cache.hitRate&duration=1h');
      (request as any).env = mockEnv;

      const response = await metricsRoutes.handle(request);
      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTimeSeries);
    });

    it('should return 400 when metric parameter is missing', async () => {
      const request = new Request('http://example.com/api/metrics/timeseries');
      (request as any).env = mockEnv;

      const response = await metricsRoutes.handle(request);
      expect(response.status).toBe(400);

      const result = await response.json();
      expect(result.error).toBe('Metric parameter is required');
    });
  });

  describe('GET /alerts', () => {
    it('should return active alerts', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          metric: 'api.errorRate',
          currentValue: 0.1,
          threshold: 0.05,
          severity: 'critical',
          timestamp: Date.now(),
          resolved: false,
        },
      ];

      mockMonitor.fetch.mockResolvedValue(
        new Response(JSON.stringify(mockAlerts), {
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const request = new Request('http://example.com/api/metrics/alerts');
      (request as any).env = mockEnv;

      const response = await metricsRoutes.handle(request);
      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAlerts);
    });
  });

  describe('POST /alerts', () => {
    it('should create new alert condition', async () => {
      const alertCondition = {
        id: 'high-error-rate',
        metric: 'api.errorRate',
        operator: 'gt',
        threshold: 0.05,
        window: '5m',
        severity: 'critical',
        enabled: true,
        notificationChannels: ['email'],
      };

      mockMonitor.fetch.mockResolvedValue(
        new Response(JSON.stringify({ success: true, conditionId: 'high-error-rate' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const request = new Request('http://example.com/api/metrics/alerts', {
        method: 'POST',
        body: JSON.stringify(alertCondition),
        headers: { 'Content-Type': 'application/json' },
      });
      (request as any).env = mockEnv;

      const response = await metricsRoutes.handle(request);
      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data.conditionId).toBe('high-error-rate');

      expect(mockMonitor.fetch).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(alertCondition),
        })
      );
    });

    it('should return 400 for invalid alert condition', async () => {
      const invalidCondition = {
        id: 'test',
        // Missing required fields
      };

      const request = new Request('http://example.com/api/metrics/alerts', {
        method: 'POST',
        body: JSON.stringify(invalidCondition),
        headers: { 'Content-Type': 'application/json' },
      });
      (request as any).env = mockEnv;

      const response = await metricsRoutes.handle(request);
      expect(response.status).toBe(400);

      const result = await response.json();
      expect(result.error).toBe('Invalid alert condition');
    });
  });

  describe('GET /ws', () => {
    it('should forward WebSocket upgrade requests', async () => {
      const mockResponse = new Response(null, {
        status: 101,
        headers: { 'Upgrade': 'websocket' },
      });
      mockMonitor.fetch.mockResolvedValue(mockResponse);

      const request = new Request('http://example.com/api/metrics/ws', {
        headers: { 'Upgrade': 'websocket' },
      });
      (request as any).env = mockEnv;

      const response = await metricsRoutes.handle(request);
      expect(response.status).toBe(101);

      expect(mockMonitor.fetch).toHaveBeenCalledWith(request);
    });

    it('should return 426 for non-WebSocket requests', async () => {
      const request = new Request('http://example.com/api/metrics/ws');
      (request as any).env = mockEnv;

      const response = await metricsRoutes.handle(request);
      expect(response.status).toBe(426);

      const text = await response.text();
      expect(text).toBe('Expected Upgrade: websocket');
    });
  });
});