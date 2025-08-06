import { CloudflareAnalyticsAggregator } from '../cloudflare-analytics';
import { LogEntry } from '../../types';

// Mock fetch globally
global.fetch = jest.fn();

describe('CloudflareAnalyticsAggregator', () => {
  let aggregator: CloudflareAnalyticsAggregator;
  const mockConfig = {
    dataset: 'test-dataset',
    accountId: 'test-account',
    apiToken: 'test-token',
    batchSize: 2,
    flushInterval: 100,
    retryDelay: 50,
    maxRetries: 2,
  };

  const createLogEntry = (message: string): LogEntry => ({
    timestamp: new Date().toISOString(),
    level: 'info',
    message,
    context: {
      namespace: 'test',
      operation: 'test-op',
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () => 'OK',
    });
  });

  afterEach(async () => {
    if (aggregator) {
      await aggregator.stop();
    }
  });

  describe('Error Handling', () => {
    it('should call onError callback when send fails', async () => {
      const onError = jest.fn();
      const error = new Error('Network error');
      
      (global.fetch as jest.Mock).mockRejectedValueOnce(error);
      
      aggregator = new CloudflareAnalyticsAggregator({
        ...mockConfig,
        onError,
      });

      const entries = [createLogEntry('test1'), createLogEntry('test2')];
      await aggregator.send(entries);
      
      // Wait for flush
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(onError).toHaveBeenCalledWith(error, entries);
    });

    it('should add failed entries to dead letter queue', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      
      aggregator = new CloudflareAnalyticsAggregator(mockConfig);

      const entries = [createLogEntry('test1'), createLogEntry('test2')];
      await aggregator.send(entries);
      
      // Wait for flush
      await new Promise(resolve => setTimeout(resolve, 10));

      const metrics = aggregator.getMetrics();
      expect(metrics.totalFailed).toBe(2);
      expect(metrics.deadLetterQueueSize).toBe(1);
    });

    it('should retry failed entries with exponential backoff', async () => {
      let fetchCallCount = 0;
      (global.fetch as jest.Mock).mockImplementation(() => {
        fetchCallCount++;
        if (fetchCallCount === 1) {
          return Promise.reject(new Error('First failure'));
        }
        return Promise.resolve({ ok: true });
      });
      
      aggregator = new CloudflareAnalyticsAggregator({
        ...mockConfig,
        retryDelay: 50,
      });

      const entries = [createLogEntry('test1'), createLogEntry('test2')];
      await aggregator.send(entries);
      
      // Wait for initial flush to fail
      await new Promise(resolve => setTimeout(resolve, 10));

      // Wait for retry
      await new Promise(resolve => setTimeout(resolve, 100));

      const metrics = aggregator.getMetrics();
      expect(metrics.totalFailed).toBe(2);
      expect(metrics.totalRetried).toBe(2);
      expect(metrics.totalSent).toBe(0); // Initial send counts separately
      expect(fetchCallCount).toBe(2);
    });

    it('should drop entries after max retries exceeded', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Persistent failure'));
      
      aggregator = new CloudflareAnalyticsAggregator({
        ...mockConfig,
        retryDelay: 10,
        maxRetries: 2,
      });

      const entries = [createLogEntry('test1'), createLogEntry('test2')];
      await aggregator.send(entries);
      
      // Wait for initial flush and retries
      await new Promise(resolve => setTimeout(resolve, 200));

      const metrics = aggregator.getMetrics();
      expect(metrics.totalFailed).toBe(2);
      expect(metrics.totalDropped).toBe(2);
      expect(metrics.deadLetterQueueSize).toBe(0);
    });

    it('should drop entries when dead letter queue is full', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      
      aggregator = new CloudflareAnalyticsAggregator({
        ...mockConfig,
        maxDeadLetterQueueSize: 1,
      });

      // Send multiple batches to fill the queue
      await aggregator.send([createLogEntry('test1'), createLogEntry('test2')]);
      await aggregator.send([createLogEntry('test3'), createLogEntry('test4')]);
      
      // Wait for flushes
      await new Promise(resolve => setTimeout(resolve, 50));

      const metrics = aggregator.getMetrics();
      expect(metrics.deadLetterQueueSize).toBe(1);
      expect(metrics.totalDropped).toBe(2); // Second batch dropped
    });

    it('should include detailed error messages from API', async () => {
      const errorResponse = 'Invalid authentication';
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => errorResponse,
      });

      const onError = jest.fn();
      aggregator = new CloudflareAnalyticsAggregator({
        ...mockConfig,
        onError,
      });

      await aggregator.send([createLogEntry('test')]);
      
      // Force immediate flush since buffer hasn't reached batchSize
      await aggregator.flush();

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Analytics Engine API error: 401 - Invalid authentication',
        }),
        expect.any(Array)
      );
    });

    it('should handle text() failure gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => { throw new Error('Text parse error'); },
      });

      const onError = jest.fn();
      aggregator = new CloudflareAnalyticsAggregator({
        ...mockConfig,
        onError,
      });

      await aggregator.send([createLogEntry('test')]);
      
      // Force immediate flush since buffer hasn't reached batchSize
      await aggregator.flush();

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Analytics Engine API error: 500 - Internal Server Error',
        }),
        expect.any(Array)
      );
    });
  });

  describe('Metrics', () => {
    it('should track comprehensive metrics', async () => {
      let fetchCallCount = 0;
      (global.fetch as jest.Mock).mockImplementation(() => {
        fetchCallCount++;
        if (fetchCallCount === 1) {
          return Promise.reject(new Error('First failure'));
        }
        return Promise.resolve({ ok: true });
      });

      aggregator = new CloudflareAnalyticsAggregator({
        ...mockConfig,
        retryDelay: 10,
      });

      // Send successful batch
      await aggregator.send([createLogEntry('test1'), createLogEntry('test2')]);
      
      // This will fail initially then succeed on retry
      await aggregator.send([createLogEntry('test3'), createLogEntry('test4')]);
      
      // Wait for all operations
      await new Promise(resolve => setTimeout(resolve, 100));

      const metrics = aggregator.getMetrics();
      expect(metrics.totalSent).toBe(2); // First batch
      expect(metrics.totalFailed).toBe(2); // Second batch initially failed
      expect(metrics.totalRetried).toBe(2); // Second batch retried successfully
      expect(metrics.bufferSize).toBe(0);
    });
  });

  describe('Lifecycle', () => {
    it('should log metrics on shutdown', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      aggregator = new CloudflareAnalyticsAggregator(mockConfig);
      await aggregator.send([createLogEntry('test')]);
      
      await aggregator.stop();

      expect(consoleSpy).toHaveBeenCalledWith(
        'CloudflareAnalyticsAggregator final metrics:',
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });

    it('should stop timers on shutdown', async () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      aggregator = new CloudflareAnalyticsAggregator(mockConfig);
      await aggregator.stop();

      // Should clear both flush timer and retry timer
      expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
      
      clearIntervalSpy.mockRestore();
    });
  });
});