import { Logger, LoggerConfig, LoggingEvent, LoggingMetrics } from '../index';

describe('Logger Error Handling', () => {
  let logger: Logger;
  let errorCallbacks: {
    aggregationErrors: Array<{ error: Error; entries: any[] }>;
    bufferOverflows: Array<{ droppedCount: number; bufferSize: number }>;
    filterErrors: Array<{ error: Error; entry: any; filterIndex: number }>;
  };

  beforeEach(() => {
    errorCallbacks = {
      aggregationErrors: [],
      bufferOverflows: [],
      filterErrors: [],
    };

    const config: LoggerConfig = {
      minLevel: 'debug',
      onAggregationError: (error, entries) => {
        errorCallbacks.aggregationErrors.push({ error, entries });
      },
      onBufferOverflow: (droppedCount, bufferSize) => {
        errorCallbacks.bufferOverflows.push({ droppedCount, bufferSize });
      },
      onFilterError: (error, entry, filterIndex) => {
        errorCallbacks.filterErrors.push({ error, entry, filterIndex });
      },
    };

    logger = new Logger(config);
  });

  describe('Error Callbacks', () => {
    it('should call onFilterError when a custom filter throws', () => {
      const filterError = new Error('Filter failed');
      const config: LoggerConfig = {
        minLevel: 'debug',
        customFilters: [
          () => true, // First filter passes
          () => { throw filterError; }, // Second filter throws
          () => false, // Third filter should still be called
        ],
        onFilterError: (error, entry, filterIndex) => {
          errorCallbacks.filterErrors.push({ error, entry, filterIndex });
        },
      };

      logger = new Logger(config);
      logger.info('Test message');

      expect(errorCallbacks.filterErrors).toHaveLength(1);
      expect(errorCallbacks.filterErrors[0]?.error).toBe(filterError);
      expect(errorCallbacks.filterErrors[0]?.filterIndex).toBe(1);
      expect(errorCallbacks.filterErrors[0]?.entry.message).toBe('Test message');
    });

    it('should call onAggregationError when flush fails', async () => {
      const aggregationError = new Error('Aggregation failed');
      const mockAggregator = {
        send: jest.fn().mockRejectedValue(aggregationError),
      };

      logger.setAggregator(mockAggregator);
      logger.info('Test message');

      await expect(logger.flush()).rejects.toThrow(aggregationError);
      
      expect(errorCallbacks.aggregationErrors).toHaveLength(1);
      expect(errorCallbacks.aggregationErrors[0]?.error).toBe(aggregationError);
      expect(errorCallbacks.aggregationErrors[0]?.entries).toHaveLength(1);
    });
  });

  describe('Event Emitter', () => {
    it('should emit events for logging lifecycle', async () => {
      const events: LoggingEvent[] = [];
      const eventEmitter = logger.getEventEmitter();
      
      eventEmitter.on((event) => {
        events.push(event);
      });

      // Log a message
      logger.info('Test message');

      // Set up aggregator
      const mockAggregator = {
        send: jest.fn().mockResolvedValue(undefined),
      };
      logger.setAggregator(mockAggregator);

      // Flush logs
      await logger.flush();

      // Check events
      const flushStartEvent = events.find(e => e.type === 'flush_started') as any;
      const flushCompleteEvent = events.find(e => e.type === 'flush_completed') as any;
      
      expect(flushStartEvent).toBeDefined();
      expect(flushStartEvent?.entryCount).toBe(1);
      
      expect(flushCompleteEvent).toBeDefined();
      expect(flushCompleteEvent?.entryCount).toBe(1);
      expect(flushCompleteEvent?.duration).toBeGreaterThanOrEqual(0);
    });

    it('should emit filter_error event when PII filter fails', () => {
      const events: LoggingEvent[] = [];
      
      // Create logger with PII filtering that will fail
      const config: LoggerConfig = {
        minLevel: 'debug',
        enablePIIFiltering: true,
      };
      
      logger = new Logger(config);
      const eventEmitter = logger.getEventEmitter();
      
      eventEmitter.on((event) => {
        events.push(event);
      });

      // Mock PII filter to throw
      const originalFilter = (logger as any).piiFilter.filter;
      (logger as any).piiFilter.filter = () => {
        throw new Error('PII filter error');
      };

      logger.info('Test message with PII');

      // Restore original filter
      (logger as any).piiFilter.filter = originalFilter;

      const filterErrorEvent = events.find(e => e.type === 'filter_error') as any;
      expect(filterErrorEvent).toBeDefined();
      expect(filterErrorEvent?.error.message).toBe('PII filter error');
      expect(filterErrorEvent?.filterIndex).toBe(-1); // PII filter is not indexed
    });

    it('should allow removing event listeners', () => {
      const events: LoggingEvent[] = [];
      const eventEmitter = logger.getEventEmitter();
      
      const listener = (event: LoggingEvent) => {
        events.push(event);
      };

      eventEmitter.on(listener);
      logger.info('First message');
      
      eventEmitter.off(listener);
      logger.info('Second message');

      // Only the first message should trigger events
      expect(events.length).toBeLessThan(2);
    });
  });

  describe('Metrics', () => {
    it('should track logging metrics', async () => {
      const mockAggregator = {
        send: jest.fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('Failed')),
      };

      logger.setAggregator(mockAggregator);

      // Log some messages
      logger.info('Message 1');
      logger.debug('Message 2');
      logger.error('Message 3', new Error('Test error'));

      // First flush succeeds
      await logger.flush();

      // Log more and flush fails
      logger.warn('Message 4');
      await expect(logger.flush()).rejects.toThrow();

      const metrics = logger.getMetrics();
      
      expect(metrics.totalLogsProcessed).toBe(4);
      expect(metrics.totalFlushAttempts).toBe(2);
      expect(metrics.totalFlushFailures).toBe(1);
      expect(metrics.totalAggregationErrors).toBe(1);
      expect(metrics.lastFlushDuration).toBeDefined();
      expect(metrics.lastFlushTimestamp).toBeDefined();
    });

    it('should track dropped logs due to buffer overflow', () => {
      // Create logger with small buffer size
      const config: LoggerConfig = {
        minLevel: 'debug',
        maxBufferSize: 2,
        onBufferOverflow: (droppedCount, bufferSize) => {
          errorCallbacks.bufferOverflows.push({ droppedCount, bufferSize });
        },
      };
      logger = new Logger(config);

      const events: LoggingEvent[] = [];
      const eventEmitter = logger.getEventEmitter();
      eventEmitter.on((event) => events.push(event));

      // Log more than buffer can hold
      logger.info('Message 1');
      logger.info('Message 2');
      logger.info('Message 3'); // This should be dropped
      logger.info('Message 4'); // This should be dropped

      const metrics = logger.getMetrics();
      expect(metrics.totalLogsProcessed).toBe(2);
      expect(metrics.totalLogsDropped).toBe(2);

      const overflowEvents = events.filter(e => e.type === 'buffer_overflow') as any[];
      expect(overflowEvents).toHaveLength(2);
      expect(errorCallbacks.bufferOverflows).toHaveLength(2);
      expect(errorCallbacks.bufferOverflows[0]?.bufferSize).toBe(2);
    });

    it('should return a copy of metrics to prevent external modification', () => {
      const metrics1 = logger.getMetrics();
      metrics1.totalLogsProcessed = 999;

      const metrics2 = logger.getMetrics();
      expect(metrics2.totalLogsProcessed).toBe(0);
    });
  });

  describe('Contextual Logger', () => {
    it('should forward event emitter and metrics methods', () => {
      const contextLogger = logger.withContext({ userId: 'test123' });
      
      expect(contextLogger.getEventEmitter()).toBe(logger.getEventEmitter());
      
      logger.info('Test');
      const contextMetrics = contextLogger.getMetrics();
      const parentMetrics = logger.getMetrics();
      
      expect(contextMetrics.totalLogsProcessed).toBe(parentMetrics.totalLogsProcessed);
    });
  });
});