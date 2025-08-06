import { Logger } from '../logger';
import { LogAggregator, LogEntry, LoggerConfig } from '../types';

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
      minimal: 100000, // ops/sec
      withPII: 80000,
      withSampling: 90000,
      full: 70000
    },
    throughput: {
      minimal: 150000,
      withPII: 50000,
      structured: 120000
    },
    contextMerging: {
      single: 100000,
      nested: 80000
    },
    bufferManagement: {
      small: 100000,
      large: 120000
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
      logger.getEventEmitter().on((event) => {
        if (event.type === 'buffer_overflow') {
          overflowCount++;
        }
      });
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        logger.info(`Test message ${i}`, { index: i });
      }
      const duration = performance.now() - start;
      
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

      // PII filtering should have less than 100% overhead
      expect(overhead).toBeLessThan(100);
    });
  });
});