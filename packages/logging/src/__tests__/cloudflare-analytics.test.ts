import { CloudflareAnalyticsAggregator, CloudflareAnalyticsConfig } from '../aggregators/cloudflare-analytics';
import { LogEntry } from '../types';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('CloudflareAnalyticsAggregator', () => {
  let aggregator: CloudflareAnalyticsAggregator;
  let config: CloudflareAnalyticsConfig;
  let mockOnError: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    mockOnError = jest.fn();
    
    config = {
      dataset: 'test-dataset',
      accountId: 'test-account',
      apiToken: 'test-token',
      batchSize: 2,
      flushInterval: 1000,
      maxRetries: 2,
      retryDelay: 100,
      maxDeadLetterQueueSize: 10,
      onError: mockOnError,
    };
    
    aggregator = new CloudflareAnalyticsAggregator(config);
  });

  afterEach(() => {
    aggregator.stop();
    jest.useRealTimers();
  });

  const createLogEntry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
    timestamp: '2024-01-01T00:00:00.000Z',
    level: 'info',
    message: 'Test message',
    context: {},
    ...overrides,
  });

  describe('successful logging', () => {
    it('should send logs successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const entries = [createLogEntry({ message: 'Test 1' }), createLogEntry({ message: 'Test 2' })];
      
      await aggregator.send(entries);
      await aggregator.flush();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/test-account/analytics_engine/test-dataset/event',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        })
      );

      const metrics = aggregator.getMetrics();
      expect(metrics.totalSent).toBe(2);
      expect(metrics.totalFailed).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should call error callback on failure', async () => {
      const error = new Error('API Error');
      mockFetch.mockRejectedValueOnce(error);

      const entries = [createLogEntry({ message: 'Test 1' })];
      await aggregator.send(entries);
      await aggregator.flush();

      expect(mockOnError).toHaveBeenCalledWith(error, entries);
    });

    it('should add failed entries to dead letter queue', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const entries = [createLogEntry({ message: 'Test 1' }), createLogEntry({ message: 'Test 2' })];
      await aggregator.send(entries);
      await aggregator.flush();

      const metrics = aggregator.getMetrics();
      expect(metrics.totalSent).toBe(0);
      expect(metrics.totalFailed).toBe(2);
      expect(metrics.deadLetterQueueSize).toBe(1);
    });

    it('should retry failed entries with exponential backoff', async () => {
      // First attempt fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const entries = [createLogEntry({ message: 'Test 1' })];
      await aggregator.send(entries);
      await aggregator.flush();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const metrics1 = aggregator.getMetrics();
      expect(metrics1.deadLetterQueueSize).toBe(1);

      // Second attempt succeeds after retry delay
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      // Fast forward past retry delay (5 * 100ms = 500ms)
      jest.advanceTimersByTime(600);
      
      // Wait for the timer callback to complete
      await new Promise(resolve => setImmediate(resolve));

      const metrics2 = aggregator.getMetrics();
      expect(metrics2.totalRetried).toBe(1);
      expect(metrics2.totalSent).toBe(1);
      expect(metrics2.deadLetterQueueSize).toBe(0);
    });

    it('should drop entries after max retries', async () => {
      // All attempts fail
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const entries = [createLogEntry({ message: 'Test 1' })];
      await aggregator.send(entries);
      await aggregator.flush();

      // Fast forward through multiple retry attempts
      // First retry after 100ms * 5 = 500ms
      jest.advanceTimersByTime(600);
      await new Promise(resolve => setImmediate(resolve));

      // Second retry after 200ms * 5 = 1000ms (exponential backoff)
      jest.advanceTimersByTime(1100);
      await new Promise(resolve => setImmediate(resolve));

      const metrics = aggregator.getMetrics();
      expect(metrics.totalDropped).toBe(1);
      expect(metrics.deadLetterQueueSize).toBe(0);
    });

    it('should drop entries when dead letter queue is full', async () => {
      // Override config with small queue size
      aggregator.stop();
      aggregator = new CloudflareAnalyticsAggregator({
        ...config,
        maxDeadLetterQueueSize: 2,
        batchSize: 1,
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      // Fill the dead letter queue
      for (let i = 0; i < 3; i++) {
        await aggregator.send([createLogEntry({ message: `Test ${i}` })]);
        await aggregator.flush();
      }

      const metrics = aggregator.getMetrics();
      expect(metrics.deadLetterQueueSize).toBe(2);
      expect(metrics.totalDropped).toBe(1);
    });
  });

  describe('metrics', () => {
    it('should track all metrics correctly', async () => {
      // Successful send
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      
      await aggregator.send([createLogEntry()]);
      await aggregator.flush();

      // Failed send
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      
      await aggregator.send([createLogEntry()]);
      await aggregator.flush();

      // Successful retry
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      
      jest.advanceTimersByTime(600);
      await new Promise(resolve => setImmediate(resolve));

      const metrics = aggregator.getMetrics();
      expect(metrics.totalSent).toBe(2);
      expect(metrics.totalFailed).toBe(1);
      expect(metrics.totalRetried).toBe(1);
      expect(metrics.totalDropped).toBe(0);
      expect(metrics.deadLetterQueueSize).toBe(0);
    });
  });

  describe('lifecycle', () => {
    it('should process periodic flushes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await aggregator.send([createLogEntry()]);
      
      // Wait for automatic flush
      jest.advanceTimersByTime(1100);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should stop timers on shutdown', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      aggregator.stop();
      
      expect(clearIntervalSpy).toHaveBeenCalledTimes(2); // flush timer and retry timer
    });
  });
});