import { Logger } from '../logger';
import { LogAggregator, LogEntry, LoggerConfig } from '../types';

interface BenchmarkResult {
  name: string;
  ops: number;
  duration: number;
  memoryUsed?: number;
}

class MockAggregator implements LogAggregator {
  public sentEntries: LogEntry[] = [];
  public sendCalls = 0;

  async send(entries: LogEntry[]): Promise<void> {
    this.sendCalls++;
    this.sentEntries.push(...entries);
  }
}

export class LoggerBenchmark {
  private results: BenchmarkResult[] = [];

  async runAll(): Promise<BenchmarkResult[]> {
    console.log('Starting Logger Benchmarks...\n');

    await this.benchmarkLoggerInstantiation();
    await this.benchmarkLoggingThroughput();
    await this.benchmarkPIIFiltering();
    await this.benchmarkContextMerging();
    await this.benchmarkBufferManagement();

    return this.results;
  }

  private async benchmarkLoggerInstantiation(): Promise<void> {
    const iterations = 10000;
    const configs: LoggerConfig[] = [
      { minLevel: 'info' },
      { minLevel: 'debug', enablePIIFiltering: true },
      { minLevel: 'info', enableSampling: true, samplingRate: 0.5 },
      { 
        minLevel: 'info', 
        enablePIIFiltering: true,
        customFilters: [(entry: LogEntry) => true, (entry: LogEntry) => true],
        maxBufferSize: 5000
      }
    ];

    for (const config of configs) {
      const configName = this.getConfigName(config);
      const start = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        new Logger(config);
      }
      
      const duration = performance.now() - start;
      const result: BenchmarkResult = {
        name: `Logger instantiation (${configName})`,
        ops: Math.round(iterations / (duration / 1000)),
        duration
      };
      
      this.results.push(result);
      console.log(`✓ ${result.name}: ${result.ops.toLocaleString()} ops/sec`);
    }
  }

  private async benchmarkLoggingThroughput(): Promise<void> {
    const iterations = 100000;
    const configs: Array<{ config: LoggerConfig; name: string }> = [
      { config: { minLevel: 'info' }, name: 'minimal config' },
      { config: { minLevel: 'info', enablePIIFiltering: false }, name: 'PII filtering disabled' },
      { config: { minLevel: 'info', enablePIIFiltering: true }, name: 'PII filtering enabled' },
      { config: { minLevel: 'info', enableSampling: true, samplingRate: 0.1 }, name: '10% sampling' },
      { config: { minLevel: 'info', outputFormat: 'structured' }, name: 'structured format' }
    ];

    for (const { config, name } of configs) {
      const logger = new Logger(config);
      const aggregator = new MockAggregator();
      logger.setAggregator(aggregator);

      const start = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        logger.info(`Test message ${i}`, { 
          userId: 'user123',
          operation: 'benchmark',
          index: i
        });
      }
      
      const duration = performance.now() - start;
      const result: BenchmarkResult = {
        name: `Logging throughput (${name})`,
        ops: Math.round(iterations / (duration / 1000)),
        duration
      };
      
      this.results.push(result);
      console.log(`✓ ${result.name}: ${result.ops.toLocaleString()} ops/sec`);
    }
  }

  private async benchmarkPIIFiltering(): Promise<void> {
    const iterations = 50000;
    const testData = [
      { 
        message: 'User email is test@example.com', 
        context: { email: 'test@example.com', phone: '555-123-4567' }
      },
      {
        message: 'Payment with card 4111-1111-1111-1111',
        context: { cardNumber: '4111111111111111', cvv: '123' }
      },
      {
        message: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature',
        context: { token: 'secret-token', password: 'user-password' }
      }
    ];

    // Benchmark with PII filtering enabled
    const loggerWithPII = new Logger({ minLevel: 'info', enablePIIFiltering: true });
    const start1 = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      const data = testData[i % testData.length]!;
      loggerWithPII.info(data.message, data.context);
    }
    
    const duration1 = performance.now() - start1;
    this.results.push({
      name: 'PII filtering (enabled)',
      ops: Math.round(iterations / (duration1 / 1000)),
      duration: duration1
    });

    // Benchmark without PII filtering
    const loggerWithoutPII = new Logger({ minLevel: 'info', enablePIIFiltering: false });
    const start2 = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      const data = testData[i % testData.length]!;
      loggerWithoutPII.info(data.message, data.context);
    }
    
    const duration2 = performance.now() - start2;
    this.results.push({
      name: 'PII filtering (disabled)',
      ops: Math.round(iterations / (duration2 / 1000)),
      duration: duration2
    });

    const overhead = ((duration1 - duration2) / duration2) * 100;
    console.log(`✓ PII filtering overhead: ${overhead.toFixed(2)}%`);
  }

  private async benchmarkContextMerging(): Promise<void> {
    const iterations = 50000;
    const baseLogger = new Logger({ minLevel: 'info', enablePIIFiltering: false });
    
    // Benchmark single context
    const start1 = performance.now();
    const contextLogger1 = baseLogger.withContext({ userId: 'user123' });
    
    for (let i = 0; i < iterations; i++) {
      contextLogger1.info('Test message', { operation: 'test', index: i });
    }
    
    const duration1 = performance.now() - start1;
    this.results.push({
      name: 'Context merging (single level)',
      ops: Math.round(iterations / (duration1 / 1000)),
      duration: duration1
    });

    // Benchmark nested contexts
    const start2 = performance.now();
    const contextLogger2 = baseLogger
      .withContext({ userId: 'user123' })
      .withContext({ sessionId: 'session456' })
      .withContext({ requestId: 'req789' });
    
    for (let i = 0; i < iterations; i++) {
      contextLogger2.info('Test message', { operation: 'test', index: i });
    }
    
    const duration2 = performance.now() - start2;
    this.results.push({
      name: 'Context merging (3 levels)',
      ops: Math.round(iterations / (duration2 / 1000)),
      duration: duration2
    });

    console.log(`✓ Context merging benchmarks completed`);
  }

  private async benchmarkBufferManagement(): Promise<void> {
    const bufferSizes = [100, 1000, 5000, 10000];
    const iterations = 50000;

    for (const bufferSize of bufferSizes) {
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
        
        // Flush when buffer is nearly full
        if (i % (bufferSize - 10) === 0) {
          await logger.flush();
        }
      }
      
      // Final flush
      await logger.flush();
      
      const duration = performance.now() - start;
      const result: BenchmarkResult = {
        name: `Buffer management (size: ${bufferSize})`,
        ops: Math.round(iterations / (duration / 1000)),
        duration,
        memoryUsed: aggregator.sentEntries.length
      };
      
      this.results.push(result);
      console.log(`✓ ${result.name}: ${result.ops.toLocaleString()} ops/sec`);
    }

    // Benchmark buffer overflow behavior
    const overflowLogger = new Logger({ 
      minLevel: 'info', 
      enablePIIFiltering: false,
      maxBufferSize: 100 
    });
    
    let droppedCount = 0;
    overflowLogger.getEventEmitter().on((event) => {
      if (event.type === 'buffer_overflow') {
        droppedCount += event.droppedCount;
      }
    });

    const start = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      overflowLogger.info(`Test message ${i}`, { index: i });
    }
    
    const duration = performance.now() - start;
    this.results.push({
      name: 'Buffer overflow handling',
      ops: Math.round(iterations / (duration / 1000)),
      duration,
      memoryUsed: droppedCount
    });

    console.log(`✓ Buffer overflow: ${droppedCount} logs dropped`);
  }

  private getConfigName(config: LoggerConfig): string {
    const parts: string[] = [];
    parts.push(config.minLevel);
    if (config.enablePIIFiltering) parts.push('PII');
    if (config.enableSampling) parts.push(`sampling:${config.samplingRate}`);
    if (config.customFilters) parts.push(`filters:${config.customFilters.length}`);
    if (config.maxBufferSize) parts.push(`buffer:${config.maxBufferSize}`);
    return parts.join(', ');
  }

  printSummary(): void {
    console.log('\n=== Benchmark Summary ===\n');
    
    const maxNameLength = Math.max(...this.results.map(r => r.name.length));
    
    for (const result of this.results) {
      const name = result.name.padEnd(maxNameLength);
      const ops = result.ops.toLocaleString().padStart(12);
      const duration = `${result.duration.toFixed(2)}ms`.padStart(10);
      const memory = result.memoryUsed !== undefined 
        ? ` | Memory: ${result.memoryUsed.toLocaleString()}`
        : '';
      
      console.log(`${name} | ${ops} ops/sec | ${duration}${memory}`);
    }
  }
}