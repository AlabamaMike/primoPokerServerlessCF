import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PerformanceMonitorDO } from '../performance-monitor-do';
import { 
  PerformanceMetrics, 
  AlertCondition, 
  Alert,
  CacheMetrics,
  ApiMetrics,
  WebSocketMetrics,
  EdgeMetrics
} from '../monitoring/performance-types';

// Mock Cloudflare Workers runtime
const mockStorage = {
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  deleteAll: jest.fn(),
  list: jest.fn(),
};

const mockState = {
  storage: mockStorage,
  id: { toString: () => 'test-do-id' },
  blockConcurrencyWhile: jest.fn(),
};

const mockCtx = {
  storage: mockStorage,
  acceptWebSocket: jest.fn(),
  getWebSockets: jest.fn(() => []),
  state: mockState,
};

const mockEnv = {};

describe('PerformanceMonitorDO', () => {
  let monitor: PerformanceMonitorDO;

  beforeEach(() => {
    jest.clearAllMocks();
    // Create instance with mocked context
    monitor = new PerformanceMonitorDO(mockState as any, mockEnv);
    (monitor as any).ctx = mockCtx;
  });

  describe('Metrics Collection', () => {
    it('should collect and store performance metrics', async () => {
      const metrics: Partial<PerformanceMetrics> = {
        cache: {
          hitRate: 0.85,
          missRate: 0.15,
          evictions: 10,
          size: 1000,
          avgHitLatency: 5,
          avgMissLatency: 50,
        },
        api: {
          latency: { p50: 25, p95: 100, p99: 200 },
          throughput: 1000,
          errors: 5,
          activeRequests: 10,
          requestsPerSecond: 50,
          errorRate: 0.005,
        },
      };

      const response = await monitor.fetch(
        new Request('http://internal/metrics/collect', {
          method: 'POST',
          body: JSON.stringify(metrics),
        })
      );

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result).toEqual({ success: true });
      expect(mockStorage.put).toHaveBeenCalledWith(
        'currentMetrics',
        expect.objectContaining({
          cache: metrics.cache,
          api: metrics.api,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should handle invalid metrics gracefully', async () => {
      const response = await monitor.fetch(
        new Request('http://internal/metrics/collect', {
          method: 'POST',
          body: 'invalid json',
        })
      );

      expect(response.status).toBe(500);
      const result = await response.json();
      expect(result.error).toBe('Failed to collect metrics');
    });
  });

  describe('Metrics Retrieval', () => {
    it('should return current metrics', async () => {
      const currentMetrics: PerformanceMetrics = {
        cache: {
          hitRate: 0.9,
          missRate: 0.1,
          evictions: 5,
          size: 500,
          avgHitLatency: 3,
          avgMissLatency: 30,
        },
        api: {
          latency: { p50: 20, p95: 80, p99: 150 },
          throughput: 800,
          errors: 2,
          activeRequests: 5,
          requestsPerSecond: 40,
          errorRate: 0.0025,
        },
        websocket: {
          connections: 100,
          messageRate: 200,
          batchingEfficiency: 0.8,
          avgMessageSize: 1024,
          compressionRatio: 0.7,
          disconnections: 5,
          reconnections: 3,
        },
        edge: {
          cacheHitRate: 0.95,
          bandwidth: 10000,
          regions: new Map(),
          avgResponseTime: 50,
          totalRequests: 10000,
        },
        timestamp: Date.now(),
      };

      (monitor as any).currentMetrics = currentMetrics;

      const response = await monitor.fetch(
        new Request('http://internal/metrics')
      );

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result).toEqual(currentMetrics);
    });

    it('should return 404 when no metrics available', async () => {
      (monitor as any).currentMetrics = null;

      const response = await monitor.fetch(
        new Request('http://internal/metrics')
      );

      expect(response.status).toBe(404);
      const result = await response.json();
      expect(result.error).toBe('No metrics available');
    });
  });

  describe('Aggregation', () => {
    it('should aggregate metrics over time windows', async () => {
      // Set up metrics history
      const now = Date.now();
      const metrics1: PerformanceMetrics = createTestMetrics(now - 30000, 0.8, 100);
      const metrics2: PerformanceMetrics = createTestMetrics(now - 60000, 0.9, 120);
      const metrics3: PerformanceMetrics = createTestMetrics(now, 0.85, 110);

      (monitor as any).aggregationBuffer.set('1m_buffer', [metrics1, metrics2, metrics3]);
      (monitor as any).currentMetrics = metrics3;

      const response = await monitor.fetch(
        new Request('http://internal/metrics/aggregate?window=1m')
      );

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.window).toBe('1m');
      expect(result.sampleCount).toBe(3);
      expect(result.cache.hitRate).toBeCloseTo(0.85); // Average of 0.8, 0.9, 0.85
    });
  });

  describe('Time Series', () => {
    it('should return time series data for a metric', async () => {
      const now = Date.now();
      const history = [
        { timestamp: now - 3600000, value: 0.8 },
        { timestamp: now - 1800000, value: 0.85 },
        { timestamp: now - 900000, value: 0.9 },
        { timestamp: now, value: 0.95 },
      ];

      (monitor as any).metricsHistory.set('cache.hitRate', history);

      const response = await monitor.fetch(
        new Request('http://internal/metrics/timeseries?metric=cache.hitRate&duration=1h')
      );

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.metric).toBe('cache.hitRate');
      expect(result.duration).toBe('1h');
      expect(result.dataPoints).toHaveLength(4);
    });

    it('should filter data points by duration', async () => {
      const now = Date.now();
      const history = [
        { timestamp: now - 7200000, value: 0.7 }, // 2 hours ago
        { timestamp: now - 3600000, value: 0.8 }, // 1 hour ago
        { timestamp: now - 1800000, value: 0.85 }, // 30 min ago
        { timestamp: now, value: 0.95 },
      ];

      (monitor as any).metricsHistory.set('cache.hitRate', history);

      const response = await monitor.fetch(
        new Request('http://internal/metrics/timeseries?metric=cache.hitRate&duration=1h')
      );

      const result = await response.json();
      expect(result.dataPoints).toHaveLength(3); // Only last hour
      expect(result.dataPoints[0].value).toBe(0.8);
    });
  });

  describe('Alerting', () => {
    it('should create alert conditions', async () => {
      const alertCondition: AlertCondition = {
        id: 'high-error-rate',
        metric: 'api.errorRate',
        operator: 'gt',
        threshold: 0.05,
        window: '5m',
        severity: 'critical',
        enabled: true,
        notificationChannels: ['email', 'slack'],
      };

      const response = await monitor.fetch(
        new Request('http://internal/alerts/create', {
          method: 'POST',
          body: JSON.stringify(alertCondition),
        })
      );

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.conditionId).toBe('high-error-rate');
      expect(mockStorage.put).toHaveBeenCalledWith(
        'alertConditions',
        expect.any(Map)
      );
    });

    it('should check alert conditions and trigger alerts', async () => {
      const alertCondition: AlertCondition = {
        id: 'high-error-rate',
        metric: 'api.errorRate',
        operator: 'gt',
        threshold: 0.05,
        window: '5m',
        severity: 'critical',
        enabled: true,
        notificationChannels: [],
      };

      (monitor as any).alertConditions.set('high-error-rate', alertCondition);
      (monitor as any).currentMetrics = createTestMetrics(Date.now(), 0.9, 100);
      (monitor as any).currentMetrics.api.errorRate = 0.1; // Above threshold

      await (monitor as any).checkAlertConditions();

      expect(mockStorage.put).toHaveBeenCalledWith(
        'alerts',
        expect.any(Map)
      );
    });

    it('should resolve alerts', async () => {
      const alert: Alert = {
        id: 'alert-123',
        conditionId: 'high-error-rate',
        metric: 'api.errorRate',
        currentValue: 0.1,
        threshold: 0.05,
        severity: 'critical',
        message: 'Error rate is high',
        timestamp: Date.now(),
        resolved: false,
      };

      (monitor as any).alerts.set('alert-123', alert);

      const response = await monitor.fetch(
        new Request('http://internal/alerts/resolve', {
          method: 'POST',
          body: JSON.stringify({ alertId: 'alert-123' }),
        })
      );

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
      
      const resolvedAlert = (monitor as any).alerts.get('alert-123');
      expect(resolvedAlert.resolved).toBe(true);
      expect(resolvedAlert.resolvedAt).toBeDefined();
    });
  });

  describe('WebSocket Support', () => {
    it('should upgrade to WebSocket connection', async () => {
      const mockWebSocketPair = {
        0: { readyState: 1, send: jest.fn() },
        1: { 
          readyState: 1, 
          addEventListener: jest.fn(),
          send: jest.fn(),
        },
      };

      // Mock WebSocketPair constructor
      global.WebSocketPair = jest.fn(() => mockWebSocketPair) as any;

      const response = await monitor.fetch(
        new Request('http://internal/ws', {
          headers: { 'Upgrade': 'websocket' },
        })
      );

      expect(response.status).toBe(101);
      expect(response.webSocket).toBeDefined();
      expect(mockCtx.acceptWebSocket).toHaveBeenCalledWith(mockWebSocketPair[1]);
    });

    it('should reject non-WebSocket requests to /ws', async () => {
      const response = await monitor.fetch(
        new Request('http://internal/ws')
      );

      expect(response.status).toBe(426);
      const text = await response.text();
      expect(text).toBe('Expected Upgrade: websocket');
    });
  });
});

// Helper function to create test metrics
function createTestMetrics(
  timestamp: number,
  cacheHitRate: number,
  apiThroughput: number
): PerformanceMetrics {
  return {
    cache: {
      hitRate: cacheHitRate,
      missRate: 1 - cacheHitRate,
      evictions: 10,
      size: 1000,
      avgHitLatency: 5,
      avgMissLatency: 50,
    },
    api: {
      latency: { p50: 25, p95: 100, p99: 200 },
      throughput: apiThroughput,
      errors: 5,
      activeRequests: 10,
      requestsPerSecond: 50,
      errorRate: 0.005,
    },
    websocket: {
      connections: 100,
      messageRate: 200,
      batchingEfficiency: 0.8,
      avgMessageSize: 1024,
      compressionRatio: 0.7,
      disconnections: 5,
      reconnections: 3,
    },
    edge: {
      cacheHitRate: 0.95,
      bandwidth: 10000,
      regions: new Map(),
      avgResponseTime: 50,
      totalRequests: 10000,
    },
    timestamp,
  };
}