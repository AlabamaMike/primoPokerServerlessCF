import {
  withPerformanceMonitoring,
  composeMiddlewareWithMonitoring,
  InMemoryPerformanceCollector,
  KVPerformanceCollector,
  PerformanceSummaryAggregator,
  PerformanceCollector,
  Middleware
} from '../middleware/performance-wrapper';
import { Context } from '@cloudflare/workers-types';

// Mock performance.now() for testing
const mockPerformanceNow = jest.spyOn(performance, 'now');

describe('Performance Wrapper', () => {
  let collector: PerformanceCollector;
  let mockNext: jest.MockedFunction<() => Promise<Response>>;
  let mockCtx: Context;

  beforeEach(() => {
    jest.clearAllMocks();
    collector = new InMemoryPerformanceCollector();
    mockNext = jest.fn().mockResolvedValue(new Response('OK'));
    mockCtx = {} as Context;
    
    // Mock performance timing
    let time = 0;
    mockPerformanceNow.mockImplementation(() => {
      time += 50; // Each call adds 50ms
      return time;
    });
  });

  describe('withPerformanceMonitoring', () => {
    it('should track successful middleware execution', async () => {
      const middleware: Middleware = async (req, ctx, next) => {
        return next();
      };

      const wrapped = withPerformanceMonitoring('test-middleware', middleware, collector);
      const request = new Request('https://example.com/test');

      await wrapped(request, mockCtx, mockNext);

      const metrics = await collector.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        middlewareName: 'test-middleware',
        executionTime: 100, // 50ms for start + 50ms for end
        timestamp: expect.any(Number)
      });
      expect(metrics[0].error).toBeUndefined();
    });

    it('should track middleware errors', async () => {
      const error = new Error('Test error');
      const middleware: Middleware = async () => {
        throw error;
      };

      const wrapped = withPerformanceMonitoring('error-middleware', middleware, collector);
      const request = new Request('https://example.com/test');

      await expect(wrapped(request, mockCtx, mockNext)).rejects.toThrow('Test error');

      const metrics = await collector.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        middlewareName: 'error-middleware',
        executionTime: 100,
        error: 'Test error'
      });
    });

    it('should track memory usage if available', async () => {
      // Mock memory API
      (globalThis as any).performance = {
        ...performance,
        memory: {
          usedJSHeapSize: 1000000
        }
      };

      const middleware: Middleware = async (req, ctx, next) => {
        (globalThis as any).performance.memory.usedJSHeapSize = 2000000;
        return next();
      };

      const wrapped = withPerformanceMonitoring('memory-middleware', middleware, collector);
      const request = new Request('https://example.com/test');

      await wrapped(request, mockCtx, mockNext);

      const metrics = await collector.getMetrics();
      expect(metrics[0].memoryUsage).toBe(1000000); // 2000000 - 1000000
    });
  });

  describe('composeMiddlewareWithMonitoring', () => {
    it('should compose multiple middlewares with monitoring', async () => {
      const middleware1: Middleware = async (req, ctx, next) => {
        const response = await next();
        return new Response(response.body, {
          headers: { 'X-Middleware-1': 'true' }
        });
      };

      const middleware2: Middleware = async (req, ctx, next) => {
        const response = await next();
        return new Response(response.body, {
          headers: { 'X-Middleware-2': 'true' }
        });
      };

      const composed = composeMiddlewareWithMonitoring(
        [
          { name: 'middleware-1', middleware: middleware1 },
          { name: 'middleware-2', middleware: middleware2 }
        ],
        collector
      );

      const request = new Request('https://example.com/test');
      const finalNext = jest.fn().mockResolvedValue(new Response('Final'));
      
      await composed(request, mockCtx);

      const metrics = await collector.getMetrics();
      expect(metrics).toHaveLength(2);
      expect(metrics.map(m => m.middlewareName)).toEqual(['middleware-2', 'middleware-1']);
    });
  });

  describe('InMemoryPerformanceCollector', () => {
    it('should store metrics in memory', async () => {
      const memCollector = new InMemoryPerformanceCollector();
      
      await memCollector.collect({
        middlewareName: 'test',
        executionTime: 100,
        timestamp: Date.now()
      });

      const metrics = await memCollector.getMetrics();
      expect(metrics).toHaveLength(1);
    });

    it('should filter metrics by time window', async () => {
      const memCollector = new InMemoryPerformanceCollector();
      const now = Date.now();
      
      await memCollector.collect({
        middlewareName: 'old',
        executionTime: 100,
        timestamp: now - 10000 // 10 seconds ago
      });

      await memCollector.collect({
        middlewareName: 'new',
        executionTime: 100,
        timestamp: now
      });

      const recentMetrics = await memCollector.getMetrics(5000); // Last 5 seconds
      expect(recentMetrics).toHaveLength(1);
      expect(recentMetrics[0].middlewareName).toBe('new');
    });
  });

  describe('KVPerformanceCollector', () => {
    let mockKV: any;

    beforeEach(() => {
      mockKV = {
        put: jest.fn(),
        list: jest.fn().mockResolvedValue({ keys: [] }),
        get: jest.fn()
      };
    });

    it('should store metrics in KV', async () => {
      const kvCollector = new KVPerformanceCollector(mockKV);
      
      await kvCollector.collect({
        middlewareName: 'test',
        executionTime: 100,
        timestamp: Date.now()
      });

      expect(mockKV.put).toHaveBeenCalledWith(
        expect.stringMatching(/^perf:\d+:/),
        expect.any(String),
        { expirationTtl: 3600 }
      );
    });

    it('should retrieve metrics from KV', async () => {
      const kvCollector = new KVPerformanceCollector(mockKV);
      const now = Date.now();
      
      mockKV.list.mockResolvedValue({
        keys: [
          { name: `perf:${now}:abc123` },
          { name: `perf:${now - 10000}:def456` }
        ]
      });

      mockKV.get.mockImplementation((key: string) => {
        if (key.includes('abc123')) {
          return Promise.resolve({
            middlewareName: 'recent',
            executionTime: 100,
            timestamp: now
          });
        }
        return Promise.resolve({
          middlewareName: 'old',
          executionTime: 200,
          timestamp: now - 10000
        });
      });

      const metrics = await kvCollector.getMetrics(5000);
      expect(metrics).toHaveLength(1);
      expect(metrics[0].middlewareName).toBe('recent');
    });
  });

  describe('PerformanceSummaryAggregator', () => {
    it('should aggregate performance metrics', async () => {
      const aggregator = new PerformanceSummaryAggregator(collector);
      
      // Add sample metrics
      const timestamps = [1000, 2000, 3000];
      for (const timestamp of timestamps) {
        await collector.collect({
          middlewareName: 'auth',
          executionTime: 50 + Math.random() * 50,
          timestamp
        });
        await collector.collect({
          middlewareName: 'rate-limit',
          executionTime: 20 + Math.random() * 30,
          timestamp
        });
      }

      // Add an error metric
      await collector.collect({
        middlewareName: 'auth',
        executionTime: 100,
        timestamp: 4000,
        error: 'Auth failed'
      });

      const summary = await aggregator.getPerformanceSummary();

      expect(summary.byMiddleware).toHaveProperty('auth');
      expect(summary.byMiddleware).toHaveProperty('rate-limit');
      
      expect(summary.byMiddleware.auth.count).toBe(4);
      expect(summary.byMiddleware.auth.errorCount).toBe(1);
      expect(summary.byMiddleware.auth.averageTime).toBeGreaterThan(0);
      expect(summary.byMiddleware.auth.p50).toBeGreaterThan(0);
      expect(summary.byMiddleware.auth.p95).toBeGreaterThan(0);

      expect(summary.overall.totalRequests).toBe(3); // 3 unique timestamps
      expect(summary.overall.totalErrors).toBe(1);
      expect(summary.overall.averageStackTime).toBeGreaterThan(0);
    });

    it('should calculate percentiles correctly', async () => {
      const aggregator = new PerformanceSummaryAggregator(collector);
      
      // Add 10 metrics with known values
      for (let i = 1; i <= 10; i++) {
        await collector.collect({
          middlewareName: 'test',
          executionTime: i * 10, // 10, 20, 30, ..., 100
          timestamp: i * 1000
        });
      }

      const summary = await aggregator.getPerformanceSummary();
      
      expect(summary.byMiddleware.test.p50).toBe(50); // Median
      expect(summary.byMiddleware.test.p95).toBe(100); // 95th percentile
      expect(summary.byMiddleware.test.p99).toBe(100); // 99th percentile
    });
  });
});