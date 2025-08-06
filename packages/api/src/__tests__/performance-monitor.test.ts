import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PerformanceMonitor } from '../middleware/performance-monitor';
import { MetricsCollector } from '@primo-poker/persistence';

// Mock the MetricsCollector
jest.mock('@primo-poker/persistence', () => ({
  ...jest.requireActual('@primo-poker/persistence'),
  MetricsCollector: jest.fn()
}));

describe('Performance Monitor Middleware', () => {
  let performanceMonitor: PerformanceMonitor;
  let mockMetricsCollector: jest.Mocked<MetricsCollector>;
  let mockNext: jest.Mock;
  let mockRequest: Request;
  let mockEnv: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    mockMetricsCollector = {
      recordRequest: jest.fn(),
      recordError: jest.fn(),
      recordResponseTime: jest.fn(),
      recordRateLimit: jest.fn(),
      getMetrics: jest.fn(),
    } as any;
    
    (MetricsCollector as any).mockImplementation(() => mockMetricsCollector);
    
    performanceMonitor = new PerformanceMonitor();
    mockNext = jest.fn().mockResolvedValue(new Response('OK', { status: 200 }));
    mockRequest = new Request('https://example.com/api/test');
    mockEnv = {
      DB: {},
      METRICS_NAMESPACE: {},
    };
  });

  describe('Request Tracking', () => {
    it('should record request metrics', async () => {
      await performanceMonitor.middleware(mockRequest, mockEnv, mockNext);
      
      expect(mockMetricsCollector.recordRequest).toHaveBeenCalledWith({
        method: 'GET',
        path: '/api/test',
        timestamp: expect.any(Number),
      });
    });

    it('should measure and record response time', async () => {
      await performanceMonitor.middleware(mockRequest, mockEnv, mockNext);
      
      expect(mockMetricsCollector.recordResponseTime).toHaveBeenCalledWith(
        expect.any(Number),
        '/api/test'
      );
    });

    it('should handle POST requests with body', async () => {
      mockRequest = new Request('https://example.com/api/test', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' }),
      });
      
      await performanceMonitor.middleware(mockRequest, mockEnv, mockNext);
      
      expect(mockMetricsCollector.recordRequest).toHaveBeenCalledWith({
        method: 'POST',
        path: '/api/test',
        timestamp: expect.any(Number),
        bodySize: expect.any(Number),
      });
    });
  });

  describe('Error Tracking', () => {
    it('should record error metrics when request fails', async () => {
      mockNext.mockRejectedValueOnce(new Error('Test error'));
      
      await expect(
        performanceMonitor.middleware(mockRequest, mockEnv, mockNext)
      ).rejects.toThrow('Test error');
      
      expect(mockMetricsCollector.recordError).toHaveBeenCalledWith({
        path: '/api/test',
        error: 'Test error',
        statusCode: 500,
        timestamp: expect.any(Number),
      });
    });

    it('should record HTTP error responses', async () => {
      mockNext.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
      
      await performanceMonitor.middleware(mockRequest, mockEnv, mockNext);
      
      expect(mockMetricsCollector.recordError).toHaveBeenCalledWith({
        path: '/api/test',
        statusCode: 404,
        timestamp: expect.any(Number),
      });
    });

    it('should categorize errors by type', async () => {
      mockNext.mockResolvedValueOnce(new Response('Bad Request', { status: 400 }));
      
      await performanceMonitor.middleware(mockRequest, mockEnv, mockNext);
      
      expect(mockMetricsCollector.recordError).toHaveBeenCalledWith({
        path: '/api/test',
        statusCode: 400,
        errorType: 'client_error',
        timestamp: expect.any(Number),
      });
    });
  });

  describe('Performance Thresholds', () => {
    it('should flag slow requests', async () => {
      // Simulate slow request
      mockNext.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return new Response('OK', { status: 200 });
      });
      
      await performanceMonitor.middleware(mockRequest, mockEnv, mockNext);
      
      expect(mockMetricsCollector.recordResponseTime).toHaveBeenCalledWith(
        expect.objectContaining({ slow: true }),
        '/api/test'
      );
    });

    it('should track percentiles', async () => {
      // Make multiple requests
      for (let i = 0; i < 10; i++) {
        await performanceMonitor.middleware(mockRequest, mockEnv, mockNext);
      }
      
      expect(mockMetricsCollector.recordResponseTime).toHaveBeenCalledTimes(10);
    });
  });

  describe('Memory Usage Tracking', () => {
    it('should track memory usage if available', async () => {
      // Mock performance.memory API
      (global as any).performance = {
        memory: {
          usedJSHeapSize: 1000000,
          totalJSHeapSize: 2000000,
          jsHeapSizeLimit: 4000000,
        },
      };
      
      await performanceMonitor.middleware(mockRequest, mockEnv, mockNext);
      
      expect(mockMetricsCollector.recordRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          memoryUsage: expect.any(Number),
        })
      );
    });
  });

  describe('Request Context', () => {
    it('should add correlation ID to requests', async () => {
      await performanceMonitor.middleware(mockRequest, mockEnv, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.any(Headers),
        }),
        mockEnv
      );
      
      const passedRequest = mockNext.mock.calls[0][0];
      expect(passedRequest.headers.get('X-Correlation-ID')).toBeTruthy();
    });

    it('should preserve existing correlation ID', async () => {
      mockRequest = new Request('https://example.com/api/test', {
        headers: {
          'X-Correlation-ID': 'existing-id',
        },
      });
      
      await performanceMonitor.middleware(mockRequest, mockEnv, mockNext);
      
      const passedRequest = mockNext.mock.calls[0][0];
      expect(passedRequest.headers.get('X-Correlation-ID')).toBe('existing-id');
    });
  });

  describe('Metrics Aggregation', () => {
    it('should provide aggregated metrics', async () => {
      mockMetricsCollector.getMetrics.mockResolvedValue({
        requestsPerMinute: 100,
        averageResponseTime: 50,
        errorRate: 0.02,
        p95ResponseTime: 150,
        p99ResponseTime: 300,
      });
      
      const metrics = await performanceMonitor.getAggregatedMetrics();
      
      expect(metrics).toEqual({
        requestsPerMinute: 100,
        averageResponseTime: 50,
        errorRate: 0.02,
        p95ResponseTime: 150,
        p99ResponseTime: 300,
      });
    });
  });
});