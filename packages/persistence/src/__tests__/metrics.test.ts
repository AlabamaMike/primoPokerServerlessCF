import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MetricsCollector } from '../monitoring/metrics';
import { D1Database } from '@cloudflare/workers-types';

describe('MetricsCollector', () => {
  let metricsCollector: MetricsCollector;
  let mockDB: jest.Mocked<D1Database>;
  let mockKV: jest.Mocked<KVNamespace>;

  beforeEach(() => {
    // Mock D1 Database
    mockDB = {
      prepare: jest.fn().mockReturnThis(),
      bind: jest.fn().mockReturnThis(),
      run: jest.fn().mockResolvedValue({ success: true }),
      all: jest.fn().mockResolvedValue({ results: [] }),
      first: jest.fn().mockResolvedValue(null),
      batch: jest.fn().mockResolvedValue([]),
    } as any;

    // Mock KV Namespace
    mockKV = {
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue({ keys: [] }),
    } as any;

    metricsCollector = new MetricsCollector(mockDB, mockKV);
  });

  describe('Request Recording', () => {
    it('should record request metrics to database', async () => {
      await metricsCollector.recordRequest({
        method: 'GET',
        path: '/api/health',
        timestamp: Date.now(),
      });

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO metrics_requests')
      );
      expect(mockDB.run).toHaveBeenCalled();
    });

    it('should aggregate requests by path', async () => {
      const requests = [
        { method: 'GET', path: '/api/health', timestamp: Date.now() },
        { method: 'GET', path: '/api/health', timestamp: Date.now() },
        { method: 'POST', path: '/api/tables', timestamp: Date.now() },
      ];

      for (const req of requests) {
        await metricsCollector.recordRequest(req);
      }

      const aggregated = await metricsCollector.getAggregatedRequests();
      expect(aggregated).toHaveProperty('/api/health', 2);
      expect(aggregated).toHaveProperty('/api/tables', 1);
    });

    it('should track request rates over time windows', async () => {
      const now = Date.now();
      const requests = Array.from({ length: 10 }, (_, i) => ({
        method: 'GET',
        path: '/api/test',
        timestamp: now + i * 1000,
      }));

      for (const req of requests) {
        await metricsCollector.recordRequest(req);
      }

      const rate = await metricsCollector.getRequestRate('1m');
      expect(rate).toBeGreaterThan(0);
    });
  });

  describe('Response Time Recording', () => {
    it('should record response times', async () => {
      await metricsCollector.recordResponseTime(45, '/api/health');

      expect(mockKV.put).toHaveBeenCalledWith(
        expect.stringContaining('response_time'),
        expect.any(String),
        expect.objectContaining({ expirationTtl: expect.any(Number) })
      );
    });

    it('should calculate percentiles', async () => {
      const responseTimes = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      
      for (const time of responseTimes) {
        await metricsCollector.recordResponseTime(time, '/api/test');
      }

      const percentiles = await metricsCollector.getResponseTimePercentiles('/api/test');
      
      expect(percentiles.p50).toBeCloseTo(55, 0);
      expect(percentiles.p95).toBeCloseTo(95, 0);
      expect(percentiles.p99).toBeCloseTo(100, 0);
    });

    it('should identify slow requests', async () => {
      await metricsCollector.recordResponseTime(1500, '/api/slow');
      
      const slowRequests = await metricsCollector.getSlowRequests(1000);
      expect(slowRequests).toHaveLength(1);
      expect(slowRequests[0].path).toBe('/api/slow');
    });
  });

  describe('Error Recording', () => {
    it('should record error metrics', async () => {
      await metricsCollector.recordError({
        path: '/api/test',
        error: 'Test error',
        statusCode: 500,
        timestamp: Date.now(),
      });

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO metrics_errors')
      );
    });

    it('should calculate error rates', async () => {
      // Record 10 requests, 2 with errors
      for (let i = 0; i < 10; i++) {
        await metricsCollector.recordRequest({
          method: 'GET',
          path: '/api/test',
          timestamp: Date.now(),
        });
        
        if (i < 2) {
          await metricsCollector.recordError({
            path: '/api/test',
            statusCode: 500,
            timestamp: Date.now(),
          });
        }
      }

      const errorRate = await metricsCollector.getErrorRate('/api/test');
      expect(errorRate).toBeCloseTo(0.2, 2);
    });

    it('should categorize errors by type', async () => {
      const errors = [
        { statusCode: 400, errorType: 'client_error' },
        { statusCode: 401, errorType: 'auth_error' },
        { statusCode: 500, errorType: 'server_error' },
        { statusCode: 503, errorType: 'availability_error' },
      ];

      for (const error of errors) {
        await metricsCollector.recordError({
          path: '/api/test',
          ...error,
          timestamp: Date.now(),
        });
      }

      const errorsByType = await metricsCollector.getErrorsByType();
      expect(errorsByType).toHaveProperty('client_error');
      expect(errorsByType).toHaveProperty('server_error');
    });
  });

  describe('Rate Limiting Metrics', () => {
    it('should track rate limit hits', async () => {
      await metricsCollector.recordRateLimit({
        clientId: 'user123',
        path: '/api/test',
        limited: true,
        timestamp: Date.now(),
      });

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO metrics_rate_limits')
      );
    });

    it('should calculate rate limit statistics', async () => {
      // Record rate limit events
      for (let i = 0; i < 10; i++) {
        await metricsCollector.recordRateLimit({
          clientId: 'user123',
          path: '/api/test',
          limited: i < 3, // 3 out of 10 are limited
          timestamp: Date.now(),
        });
      }

      const stats = await metricsCollector.getRateLimitStats();
      expect(stats.limitRate).toBeCloseTo(0.3, 2);
    });
  });

  describe('Durable Object Health Metrics', () => {
    it('should track Durable Object health', async () => {
      await metricsCollector.recordDurableObjectHealth({
        objectName: 'GameTable',
        instanceId: 'table-123',
        healthy: true,
        responseTime: 15,
        timestamp: Date.now(),
      });

      expect(mockKV.put).toHaveBeenCalledWith(
        expect.stringContaining('do_health'),
        expect.any(String)
      );
    });

    it('should aggregate Durable Object health status', async () => {
      const healthChecks = [
        { objectName: 'GameTable', instanceId: 'table-1', healthy: true },
        { objectName: 'GameTable', instanceId: 'table-2', healthy: true },
        { objectName: 'GameTable', instanceId: 'table-3', healthy: false },
      ];

      for (const check of healthChecks) {
        await metricsCollector.recordDurableObjectHealth({
          ...check,
          responseTime: 10,
          timestamp: Date.now(),
        });
      }

      const aggregated = await metricsCollector.getDurableObjectHealthSummary();
      expect(aggregated.GameTable.healthyCount).toBe(2);
      expect(aggregated.GameTable.unhealthyCount).toBe(1);
      expect(aggregated.GameTable.healthRate).toBeCloseTo(0.67, 2);
    });
  });

  describe('Metrics Aggregation', () => {
    it('should provide complete metrics summary', async () => {
      // Record various metrics
      await metricsCollector.recordRequest({
        method: 'GET',
        path: '/api/test',
        timestamp: Date.now(),
      });
      
      await metricsCollector.recordResponseTime(50, '/api/test');
      
      const summary = await metricsCollector.getMetricsSummary();
      
      expect(summary).toHaveProperty('requestsPerMinute');
      expect(summary).toHaveProperty('averageResponseTime');
      expect(summary).toHaveProperty('errorRate');
      expect(summary).toHaveProperty('p95ResponseTime');
      expect(summary).toHaveProperty('durableObjectHealth');
    });

    it('should clean up old metrics', async () => {
      // Record old metrics
      const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      
      await metricsCollector.recordRequest({
        method: 'GET',
        path: '/api/old',
        timestamp: oldTimestamp,
      });

      await metricsCollector.cleanupOldMetrics();

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM metrics_requests WHERE timestamp <')
      );
    });
  });
});