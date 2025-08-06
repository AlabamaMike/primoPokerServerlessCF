import { Logger } from '../logger';
import { LogAggregator, LogEntry, LoggerConfig } from '../types';
import { SimpleEventEmitter } from '../event-emitter';

// Environment detection
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const isSlow = process.env.SLOW_TEST_ENV === 'true';

// Adjust thresholds based on environment
const getThreshold = (baseValue: number): number => {
  if (isCI) return Math.floor(baseValue * 0.5); // CI can be 50% slower
  if (isSlow) return Math.floor(baseValue * 0.3); // Slow environments get 70% reduction
  return baseValue;
};

// Percentile calculation helper
function calculatePercentiles(values: number[]): { p50: number; p95: number; p99: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const p50Index = Math.floor(sorted.length * 0.5);
  const p95Index = Math.floor(sorted.length * 0.95);
  const p99Index = Math.floor(sorted.length * 0.99);
  return {
    p50: sorted[p50Index] || 0,
    p95: sorted[p95Index] || 0,
    p99: sorted[p99Index] || 0
  };
}

// Memory profiling helper
function getMemoryUsage(): { heap: number; external: number; rss: number } {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const usage = process.memoryUsage();
    return {
      heap: usage.heapUsed,
      external: usage.external,
      rss: usage.rss
    };
  }
  return { heap: 0, external: 0, rss: 0 };
}

describe('Logger Performance Benchmarks', () => {
  // Suppress console output during tests
  const originalConsole = {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
    log: console.log
  };

  beforeAll(() => {
    // Mock console methods to suppress output
    console.debug = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  afterAll(() => {
    // Restore original console methods
    console.debug = originalConsole.debug;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log = originalConsole.log;
  });
  class MockAggregator implements LogAggregator {
    public sentEntries: LogEntry[] = [];
    public sendCalls = 0;

    async send(entries: LogEntry[]): Promise<void> {
      this.sendCalls++;
      this.sentEntries.push(...entries);
    }
  }

  const PERFORMANCE_THRESHOLDS = {
    instantiation: {
      minimal: getThreshold(400000), // ops/sec
      withPII: getThreshold(500000),
      withSampling: getThreshold(450000),
      full: getThreshold(400000)
    },
    throughput: {
      minimal: getThreshold(200000),
      withPII: getThreshold(40000),
      structured: getThreshold(150000)
    },
    contextMerging: {
      single: getThreshold(100000),
      nested: getThreshold(100000)
    },
    bufferManagement: {
      small: getThreshold(200000),
      large: getThreshold(200000)
    },
    concurrent: {
      basic: getThreshold(50000),
      heavy: getThreshold(20000)
    }
  };

  describe('Logger instantiation performance', () => {
    it('should instantiate minimal logger efficiently', () => {
      const iterations = 10000;
      const config: LoggerConfig = { minLevel: 'info' };
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        new Logger(config);
      }
      const duration = performance.now() - start;
      
      const opsPerSec = Math.round(iterations / (duration / 1000));
      originalConsole.log(`Minimal logger instantiation: ${opsPerSec.toLocaleString()} ops/sec`);
      
      expect(opsPerSec).toBeGreaterThan(PERFORMANCE_THRESHOLDS.instantiation.minimal);
    });

    it('should instantiate logger with PII filtering efficiently', () => {
      const iterations = 10000;
      const config: LoggerConfig = { 
        minLevel: 'info',
        enablePIIFiltering: true 
      };
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        new Logger(config);
      }
      const duration = performance.now() - start;
      
      const opsPerSec = Math.round(iterations / (duration / 1000));
      originalConsole.log(`Logger with PII instantiation: ${opsPerSec.toLocaleString()} ops/sec`);
      
      expect(opsPerSec).toBeGreaterThan(PERFORMANCE_THRESHOLDS.instantiation.withPII);
    });

    it('should instantiate full-featured logger efficiently', () => {
      const iterations = 10000;
      const config: LoggerConfig = { 
        minLevel: 'info',
        enablePIIFiltering: true,
        enableSampling: true,
        samplingRate: 0.5,
        customFilters: [(entry: LogEntry) => true],
        maxBufferSize: 5000
      };
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        new Logger(config);
      }
      const duration = performance.now() - start;
      
      const opsPerSec = Math.round(iterations / (duration / 1000));
      originalConsole.log(`Full-featured logger instantiation: ${opsPerSec.toLocaleString()} ops/sec`);
      
      expect(opsPerSec).toBeGreaterThan(PERFORMANCE_THRESHOLDS.instantiation.full);
    });
  });

  describe('Logging throughput performance', () => {
    it('should handle high throughput with minimal config', () => {
      const iterations = 50000;
      const logger = new Logger({ minLevel: 'info', enablePIIFiltering: false });
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        logger.info(`Test message ${i}`, { index: i });
      }
      const duration = performance.now() - start;
      
      const opsPerSec = Math.round(iterations / (duration / 1000));
      originalConsole.log(`Minimal config throughput: ${opsPerSec.toLocaleString()} ops/sec`);
      
      expect(opsPerSec).toBeGreaterThan(PERFORMANCE_THRESHOLDS.throughput.minimal);
    });

    it('should maintain performance with PII filtering', () => {
      const iterations = 50000;
      const logger = new Logger({ minLevel: 'info', enablePIIFiltering: true });
      
      const testData = {
        message: 'User email is test@example.com with card 4111-1111-1111-1111',
        context: { 
          email: 'test@example.com',
          creditCard: '4111111111111111',
          token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature'
        }
      };
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        logger.info(testData.message, testData.context);
      }
      const duration = performance.now() - start;
      
      const opsPerSec = Math.round(iterations / (duration / 1000));
      originalConsole.log(`PII filtering throughput: ${opsPerSec.toLocaleString()} ops/sec`);
      
      expect(opsPerSec).toBeGreaterThan(PERFORMANCE_THRESHOLDS.throughput.withPII);
    });

    it('should handle structured format efficiently', () => {
      const iterations = 50000;
      const logger = new Logger({ 
        minLevel: 'info',
        outputFormat: 'structured',
        enablePIIFiltering: false 
      });
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        logger.info(`Test message ${i}`, { 
          userId: 'user123',
          operation: 'benchmark',
          index: i 
        });
      }
      const duration = performance.now() - start;
      
      const opsPerSec = Math.round(iterations / (duration / 1000));
      originalConsole.log(`Structured format throughput: ${opsPerSec.toLocaleString()} ops/sec`);
      
      expect(opsPerSec).toBeGreaterThan(PERFORMANCE_THRESHOLDS.throughput.structured);
    });
  });

  describe('Context merging performance', () => {
    it('should merge single context efficiently', () => {
      const iterations = 30000;
      const baseLogger = new Logger({ minLevel: 'info', enablePIIFiltering: false });
      const contextLogger = baseLogger.withContext({ userId: 'user123' });
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        contextLogger.info('Test message', { operation: 'test', index: i });
      }
      const duration = performance.now() - start;
      
      const opsPerSec = Math.round(iterations / (duration / 1000));
      originalConsole.log(`Single context merging: ${opsPerSec.toLocaleString()} ops/sec`);
      
      expect(opsPerSec).toBeGreaterThan(PERFORMANCE_THRESHOLDS.contextMerging.single);
    });

    it('should handle nested contexts efficiently', () => {
      const iterations = 30000;
      const baseLogger = new Logger({ minLevel: 'info', enablePIIFiltering: false });
      const contextLogger = baseLogger
        .withContext({ userId: 'user123' })
        .withContext({ sessionId: 'session456' })
        .withContext({ requestId: 'req789' });
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        contextLogger.info('Test message', { operation: 'test', index: i });
      }
      const duration = performance.now() - start;
      
      const opsPerSec = Math.round(iterations / (duration / 1000));
      originalConsole.log(`Nested context merging: ${opsPerSec.toLocaleString()} ops/sec`);
      
      expect(opsPerSec).toBeGreaterThan(PERFORMANCE_THRESHOLDS.contextMerging.nested);
    });
  });

  describe('Buffer management performance', () => {
    it('should handle small buffer efficiently', async () => {
      const iterations = 30000;
      const bufferSize = 100;
      const logger = new Logger({ 
        minLevel: 'info',
        enablePIIFiltering: false,
        maxBufferSize: bufferSize 
      });
      const aggregator = new MockAggregator();
      logger.setAggregator(aggregator);
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        logger.info(`Test message ${i}`, { index: i });
        if (i % (bufferSize - 10) === 0) {
          await logger.flush();
        }
      }
      await logger.flush();
      const duration = performance.now() - start;
      
      const opsPerSec = Math.round(iterations / (duration / 1000));
      originalConsole.log(`Small buffer (${bufferSize}) management: ${opsPerSec.toLocaleString()} ops/sec`);
      
      expect(opsPerSec).toBeGreaterThan(PERFORMANCE_THRESHOLDS.bufferManagement.small);
      expect(aggregator.sendCalls).toBeGreaterThan(0);
    });

    it('should handle large buffer efficiently', async () => {
      const iterations = 30000;
      const bufferSize = 5000;
      const logger = new Logger({ 
        minLevel: 'info',
        enablePIIFiltering: false,
        maxBufferSize: bufferSize 
      });
      const aggregator = new MockAggregator();
      logger.setAggregator(aggregator);
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        logger.info(`Test message ${i}`, { index: i });
        if (i % (bufferSize - 10) === 0) {
          await logger.flush();
        }
      }
      await logger.flush();
      const duration = performance.now() - start;
      
      const opsPerSec = Math.round(iterations / (duration / 1000));
      originalConsole.log(`Large buffer (${bufferSize}) management: ${opsPerSec.toLocaleString()} ops/sec`);
      
      expect(opsPerSec).toBeGreaterThan(PERFORMANCE_THRESHOLDS.bufferManagement.large);
      expect(aggregator.sendCalls).toBeGreaterThan(0);
    });

    it('should handle buffer overflow gracefully', () => {
      const iterations = 1000;
      const bufferSize = 10;
      const logger = new Logger({ 
        minLevel: 'info',
        enablePIIFiltering: false,
        maxBufferSize: bufferSize 
      });
      
      let overflowCount = 0;
      // Fixed: Store listener reference for cleanup
      const eventListener = (event: any) => {
        if (event.type === 'buffer_overflow') {
          overflowCount++;
        }
      };
      
      const eventEmitter = logger.getEventEmitter();
      eventEmitter.on(eventListener);
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        logger.info(`Test message ${i}`, { index: i });
      }
      const duration = performance.now() - start;
      
      // Cleanup: Remove event listener
      eventEmitter.off(eventListener);
      
      const opsPerSec = Math.round(iterations / (duration / 1000));
      originalConsole.log(`Buffer overflow handling: ${opsPerSec.toLocaleString()} ops/sec`);
      originalConsole.log(`Overflow events: ${overflowCount}`);
      
      expect(overflowCount).toBeGreaterThan(0);
      expect(overflowCount).toBeLessThan(iterations); // Some logs should still go through
    });
  });

  describe('PII filtering performance impact', () => {
    it('should measure PII filtering overhead', () => {
      const iterations = 20000;
      const testData = {
        message: 'Processing payment for test@example.com with card 4111-1111-1111-1111',
        context: {
          email: 'user@example.com',
          phone: '555-123-4567',
          creditCard: '4111111111111111',
          ssn: '123-45-6789',
          ipAddress: '192.168.1.1',
          token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature',
          password: 'secret123',
          apiKey: 'sk_test_12345'
        }
      };

      // Test with PII filtering
      const loggerWithPII = new Logger({ minLevel: 'info', enablePIIFiltering: true });
      const start1 = performance.now();
      for (let i = 0; i < iterations; i++) {
        loggerWithPII.info(testData.message, testData.context);
      }
      const duration1 = performance.now() - start1;

      // Test without PII filtering
      const loggerWithoutPII = new Logger({ minLevel: 'info', enablePIIFiltering: false });
      const start2 = performance.now();
      for (let i = 0; i < iterations; i++) {
        loggerWithoutPII.info(testData.message, testData.context);
      }
      const duration2 = performance.now() - start2;

      const overhead = ((duration1 - duration2) / duration2) * 100;
      const opsWithPII = Math.round(iterations / (duration1 / 1000));
      const opsWithoutPII = Math.round(iterations / (duration2 / 1000));

      originalConsole.log(`PII filtering enabled: ${opsWithPII.toLocaleString()} ops/sec`);
      originalConsole.log(`PII filtering disabled: ${opsWithoutPII.toLocaleString()} ops/sec`);
      originalConsole.log(`PII filtering overhead: ${overhead.toFixed(2)}%`);

      // PII filtering should have less than 600% overhead (6x slower is acceptable)
      expect(overhead).toBeLessThan(600);
    });
  });

  describe('Concurrent load testing', () => {
    it('should handle concurrent logging efficiently', async () => {
      const concurrentLoggers = 10;
      const iterationsPerLogger = 5000;
      const logger = new Logger({ 
        minLevel: 'info',
        enablePIIFiltering: false,
        maxBufferSize: 1000 
      });
      
      const memBefore = getMemoryUsage();
      const latencies: number[] = [];
      
      const start = performance.now();
      
      // Simulate concurrent logging from multiple sources
      const promises = Array(concurrentLoggers).fill(null).map((_, loggerId) => {
        return new Promise<void>((resolve) => {
          setImmediate(() => {
            for (let i = 0; i < iterationsPerLogger; i++) {
              const opStart = performance.now();
              logger.info(`Logger ${loggerId} message ${i}`, { 
                loggerId, 
                index: i,
                timestamp: Date.now() 
              });
              latencies.push(performance.now() - opStart);
            }
            resolve();
          });
        });
      });
      
      await Promise.all(promises);
      const duration = performance.now() - start;
      
      const memAfter = getMemoryUsage();
      const memoryGrowth = memAfter.heap - memBefore.heap;
      
      const totalOps = concurrentLoggers * iterationsPerLogger;
      const opsPerSec = Math.round(totalOps / (duration / 1000));
      const percentiles = calculatePercentiles(latencies);
      
      originalConsole.log(`Concurrent logging (${concurrentLoggers} loggers):`);
      originalConsole.log(`  Throughput: ${opsPerSec.toLocaleString()} ops/sec`);
      originalConsole.log(`  P50 latency: ${percentiles.p50.toFixed(3)}ms`);
      originalConsole.log(`  P95 latency: ${percentiles.p95.toFixed(3)}ms`);
      originalConsole.log(`  P99 latency: ${percentiles.p99.toFixed(3)}ms`);
      originalConsole.log(`  Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
      
      expect(opsPerSec).toBeGreaterThan(PERFORMANCE_THRESHOLDS.concurrent.basic);
      expect(percentiles.p99).toBeLessThan(10); // P99 should be under 10ms
    });

    it('should maintain performance under heavy concurrent load', async () => {
      const concurrentLoggers = 50;
      const iterationsPerLogger = 1000;
      const aggregator = new MockAggregator();
      const logger = new Logger({ 
        minLevel: 'info',
        enablePIIFiltering: true,
        enableSampling: true,
        samplingRate: 0.5,
        maxBufferSize: 5000 
      });
      logger.setAggregator(aggregator);
      
      // Add simulated latency to aggregator
      aggregator.send = async (entries: LogEntry[]) => {
        await new Promise(resolve => setTimeout(resolve, 10)); // 10ms latency
        aggregator.sentEntries.push(...entries);
        aggregator.sendCalls++;
      };
      
      const memBefore = getMemoryUsage();
      const start = performance.now();
      
      const promises = Array(concurrentLoggers).fill(null).map((_, loggerId) => {
        return new Promise<void>((resolve) => {
          setImmediate(async () => {
            for (let i = 0; i < iterationsPerLogger; i++) {
              logger.info(`Heavy load test ${i}`, { 
                loggerId, 
                email: 'test@example.com',
                card: '4111-1111-1111-1111',
                data: Array(100).fill('x').join('') // Larger payload
              });
              
              // Occasional flush to test buffer management
              if (i % 100 === 0) {
                await logger.flush();
              }
            }
            resolve();
          });
        });
      });
      
      await Promise.all(promises);
      await logger.flush(); // Final flush
      
      const duration = performance.now() - start;
      const memAfter = getMemoryUsage();
      
      const totalOps = concurrentLoggers * iterationsPerLogger;
      const opsPerSec = Math.round(totalOps / (duration / 1000));
      const memoryGrowth = memAfter.heap - memBefore.heap;
      
      originalConsole.log(`Heavy concurrent load (${concurrentLoggers} loggers with PII+sampling):`);
      originalConsole.log(`  Throughput: ${opsPerSec.toLocaleString()} ops/sec`);
      originalConsole.log(`  Aggregator calls: ${aggregator.sendCalls}`);
      originalConsole.log(`  Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
      originalConsole.log(`  Environment: ${isCI ? 'CI' : 'Local'}`);
      
      expect(opsPerSec).toBeGreaterThan(PERFORMANCE_THRESHOLDS.concurrent.heavy);
      expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024); // Less than 100MB growth
    });
  });

  describe('Memory profiling', () => {
    it('should track memory usage across different configurations', () => {
      const configs = [
        { name: 'minimal', config: { minLevel: 'info' as const } },
        { name: 'with PII', config: { minLevel: 'info' as const, enablePIIFiltering: true } },
        { name: 'with buffer', config: { minLevel: 'info' as const, maxBufferSize: 10000 } },
        { name: 'full featured', config: { 
          minLevel: 'info' as const, 
          enablePIIFiltering: true,
          enableSampling: true,
          samplingRate: 0.5,
          maxBufferSize: 10000 
        }}
      ];
      
      const results: Array<{ name: string; memoryMB: number }> = [];
      
      for (const { name, config } of configs) {
        if (global.gc) global.gc(); // Force GC if available
        
        const memBefore = getMemoryUsage();
        const loggers: Logger[] = [];
        
        // Create multiple logger instances
        for (let i = 0; i < 1000; i++) {
          loggers.push(new Logger(config));
        }
        
        // Log some messages
        for (const logger of loggers.slice(0, 100)) {
          for (let i = 0; i < 10; i++) {
            logger.info('Memory test', { index: i });
          }
        }
        
        const memAfter = getMemoryUsage();
        const memoryUsed = (memAfter.heap - memBefore.heap) / 1024 / 1024;
        
        results.push({ name, memoryMB: memoryUsed });
        originalConsole.log(`Memory usage (${name}): ${memoryUsed.toFixed(2)}MB for 1000 loggers`);
      }
      
      // Verify memory usage is reasonable
      results.forEach(result => {
        expect(result.memoryMB).toBeLessThan(50); // Each config should use less than 50MB
      });
    });
  });
});