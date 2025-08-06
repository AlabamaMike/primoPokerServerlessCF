import { LogLevel, LogEntry, LogContext, LoggerConfig, LogAggregator, LoggingEvent, LoggingMetrics, ProcessedLoggerConfig } from './types';
import { DefaultPIIFilter } from './pii-filter';
import { SimpleEventEmitter } from './event-emitter';

/**
 * Rate limiter for preventing callback storms
 */
interface RateLimiter {
  shouldAllow(key: string): boolean;
}

class SimpleRateLimiter implements RateLimiter {
  private readonly maxCalls: number;
  private readonly windowMs: number;
  private readonly calls = new Map<string, number[]>();

  constructor(maxCalls: number = 10, windowMs: number = 60000) {
    this.maxCalls = maxCalls;
    this.windowMs = windowMs;
  }

  shouldAllow(key: string): boolean {
    const now = Date.now();
    const callTimes = this.calls.get(key) || [];
    
    // Remove old calls outside the window
    const recentCalls = callTimes.filter(time => now - time < this.windowMs);
    
    if (recentCalls.length >= this.maxCalls) {
      return false;
    }
    
    recentCalls.push(now);
    this.calls.set(key, recentCalls);
    return true;
  }
}

/**
 * Logger class with comprehensive error handling and monitoring capabilities
 * 
 * @example
 * ```typescript
 * const logger = new Logger({
 *   minLevel: 'info',
 *   enablePIIFiltering: true,
 *   onAggregationError: (error, entries) => {
 *     console.error('Failed to aggregate logs:', error);
 *   }
 * });
 * 
 * logger.info('User logged in', { userId: '123' });
 * logger.error('Payment failed', new Error('Network timeout'));
 * ```
 */
export class Logger {
  private static readonly LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };
  private static readonly DEFAULT_MAX_BUFFER_SIZE = 10000;
  private static readonly PII_FILTER_INDEX = -1; // Named constant for PII filter index

  protected readonly config: ProcessedLoggerConfig;
  private readonly piiFilter: DefaultPIIFilter;
  private readonly eventEmitter: SimpleEventEmitter;
  private readonly rateLimiter: RateLimiter;
  private buffer: LogEntry[] = [];
  private flushingBuffer: LogEntry[] = [];
  private isFlushInProgress = false;
  protected aggregator?: LogAggregator;
  private metrics: LoggingMetrics = {
    totalLogsProcessed: 0,
    totalLogsDropped: 0,
    totalAggregationErrors: 0,
    totalFilterErrors: 0,
    totalFlushAttempts: 0,
    totalFlushFailures: 0,
  };

  /**
   * Create a new Logger instance
   * @param config Logger configuration options
   */
  constructor(config: LoggerConfig) {
    const processedConfig: ProcessedLoggerConfig = {
      minLevel: config.minLevel || 'info',
      enableSampling: config.enableSampling ?? false,
      samplingRate: config.samplingRate ?? 1,
      enablePIIFiltering: config.enablePIIFiltering ?? true,
      customFilters: config.customFilters ?? [],
      outputFormat: config.outputFormat ?? 'json',
      namespace: config.namespace ?? 'default',
      maxBufferSize: config.maxBufferSize ?? Logger.DEFAULT_MAX_BUFFER_SIZE,
    };
    
    // Only set optional callbacks if they are provided
    if (config.onAggregationError !== undefined) {
      processedConfig.onAggregationError = config.onAggregationError;
    }
    if (config.onBufferOverflow !== undefined) {
      processedConfig.onBufferOverflow = config.onBufferOverflow;
    }
    if (config.onFilterError !== undefined) {
      processedConfig.onFilterError = config.onFilterError;
    }
    
    this.config = processedConfig;
    
    this.piiFilter = new DefaultPIIFilter();
    this.eventEmitter = new SimpleEventEmitter();
    this.rateLimiter = new SimpleRateLimiter();
    
    // Register error callbacks as event listeners if provided with rate limiting
    if (config.onAggregationError) {
      this.eventEmitter.on((event) => {
        if (event.type === 'aggregation_error' && this.rateLimiter.shouldAllow('aggregation_error')) {
          config.onAggregationError!(event.error, event.entries);
        }
      });
    }
    
    if (config.onBufferOverflow) {
      this.eventEmitter.on((event) => {
        if (event.type === 'buffer_overflow' && this.rateLimiter.shouldAllow('buffer_overflow')) {
          config.onBufferOverflow!(event.droppedCount, event.bufferSize);
        }
      });
    }
    
    if (config.onFilterError) {
      this.eventEmitter.on((event) => {
        if (event.type === 'filter_error' && this.rateLimiter.shouldAllow('filter_error')) {
          config.onFilterError!(event.error, event.entry, event.filterIndex);
        }
      });
    }
  }

  /**
   * Set the log aggregator for batching and sending logs
   * @param aggregator The aggregator implementation to use
   */
  setAggregator(aggregator: LogAggregator): void {
    this.aggregator = aggregator;
  }

  /**
   * Get the event emitter for subscribing to logging lifecycle events
   * @returns The event emitter instance
   */
  getEventEmitter(): SimpleEventEmitter {
    return this.eventEmitter;
  }

  /**
   * Get current logging metrics
   * @returns A copy of the current metrics
   */
  getMetrics(): LoggingMetrics {
    return { ...this.metrics }; // Return a copy
  }

  /**
   * Protected getter for configuration (for subclasses)
   * @internal
   */
  protected getConfig(): ProcessedLoggerConfig {
    return this.config;
  }

  /**
   * Protected getter for aggregator (for subclasses)
   * @internal
   */
  protected getAggregator(): LogAggregator | undefined {
    return this.aggregator;
  }

  /**
   * Log a debug message
   * @param message The message to log
   * @param context Optional context data
   */
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  /**
   * Log an info message
   * @param message The message to log
   * @param context Optional context data
   */
  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  /**
   * Log a warning message
   * @param message The message to log
   * @param context Optional context data
   */
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  /**
   * Log an error message
   * @param message The message to log
   * @param error Optional error object
   * @param context Optional context data
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorInfo = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : error ? {
      name: 'UnknownError',
      message: String(error),
    } : undefined;

    this.log('error', message, context, errorInfo);
  }

  /**
   * Create a new logger instance with additional context
   * @param context Context to merge with all log entries
   * @returns A new logger instance with the merged context
   */
  withContext(context: LogContext): Logger {
    // Create a lightweight context wrapper
    return new ContextualLogger(this, context);
  }

  /**
   * Flush buffered logs to the aggregator
   * @throws Error if aggregation fails
   */
  async flush(): Promise<void> {
    if (!this.aggregator || this.isFlushInProgress) {
      return;
    }

    // Double-buffer approach: swap buffers to prevent race conditions
    if (this.buffer.length === 0) {
      return;
    }

    // Mark flush as in progress
    this.isFlushInProgress = true;
    const startTime = Date.now();
    const entryCount = this.buffer.length;

    this.metrics.totalFlushAttempts++;
    this.eventEmitter.emit({ type: 'flush_started', entryCount });

    try {
      // Swap buffers - new logs will go to the empty buffer
      // while we send the current buffer's contents
      const temp = this.buffer;
      this.buffer = this.flushingBuffer;
      this.flushingBuffer = temp;

      // Send the contents of the flushing buffer
      if (this.flushingBuffer.length > 0) {
        await this.aggregator.send([...this.flushingBuffer]);
        this.flushingBuffer.length = 0;
      }

      // Update metrics on successful flush
      const duration = Date.now() - startTime;
      this.metrics.lastFlushDuration = duration;
      this.metrics.lastFlushTimestamp = new Date().toISOString();
      
      this.eventEmitter.emit({ type: 'flush_completed', entryCount, duration });
    } catch (error) {
      this.metrics.totalFlushFailures++;
      this.metrics.totalAggregationErrors++;
      
      const err = error as Error;
      this.eventEmitter.emit({ type: 'flush_failed', error: err, entryCount });
      this.eventEmitter.emit({ 
        type: 'aggregation_error', 
        error: err, 
        entries: this.flushingBuffer 
      });
      
      // Re-throw to maintain existing behavior
      throw error;
    } finally {
      this.isFlushInProgress = false;
    }
  }

  protected log(level: LogLevel, message: string, context?: LogContext, error?: any): void {
    // Check log level
    if (Logger.LOG_LEVELS[level] < Logger.LOG_LEVELS[this.config.minLevel]) {
      return;
    }

    // Apply sampling using crypto for better randomness
    if (this.config.enableSampling) {
      const array = new Uint8Array(1);
      crypto.getRandomValues(array);
      const randomValue = array[0]! / 256; // Convert to 0-1 range
      if (randomValue > this.config.samplingRate!) {
        return;
      }
    }

    // Create log entry
    let entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        namespace: this.config.namespace,
        ...context,
      },
      error,
    };

    // Apply PII filtering
    if (this.config.enablePIIFiltering) {
      try {
        entry = this.piiFilter.filter(entry) as LogEntry;
      } catch (filterError) {
        this.metrics.totalFilterErrors++;
        this.eventEmitter.emit({
          type: 'filter_error',
          error: filterError as Error,
          entry,
          filterIndex: Logger.PII_FILTER_INDEX,
        });
        // Continue with unfiltered entry
      }
    }

    // Apply custom filters
    for (let i = 0; i < this.config.customFilters.length; i++) {
      const filter = this.config.customFilters[i]!;
      try {
        if (!filter(entry)) {
          return; // Filter rejected the entry
        }
      } catch (filterError) {
        this.metrics.totalFilterErrors++;
        this.eventEmitter.emit({
          type: 'filter_error',
          error: filterError as Error,
          entry,
          filterIndex: i,
        });
        // Continue processing despite filter error
      }
    }

    // Output the log
    this.output(entry);

    // Check buffer overflow before adding
    if (this.buffer.length >= this.config.maxBufferSize) {
      const droppedCount = 1; // We're dropping this entry
      this.metrics.totalLogsDropped += droppedCount;
      this.eventEmitter.emit({
        type: 'buffer_overflow',
        droppedCount,
        bufferSize: this.config.maxBufferSize,
      });
      return; // Drop the log entry
    }

    // Add to buffer for aggregation
    this.buffer.push(entry);
    this.metrics.totalLogsProcessed++;
  }

  private output(entry: LogEntry): void {
    const formatted = this.config.outputFormat === 'json' 
      ? JSON.stringify(entry)
      : this.formatStructured(entry);

    // In Cloudflare Workers, console methods are available
    switch (entry.level) {
      case 'debug':
        console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }
  }

  private formatStructured(entry: LogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`,
      `[${entry.context.namespace}]`,
    ];

    if (entry.context.correlationId) {
      parts.push(`[${entry.context.correlationId}]`);
    }

    parts.push(entry.message);

    if (entry.context && Object.keys(entry.context).length > 0) {
      const contextStr = Object.entries(entry.context)
        .filter(([key]) => !['namespace', 'correlationId'].includes(key))
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ');
      
      if (contextStr) {
        parts.push(`| ${contextStr}`);
      }
    }

    if (entry.error) {
      parts.push(`| error=${JSON.stringify(entry.error)}`);
    }

    return parts.join(' ');
  }
}

// Lightweight context wrapper for better performance
class ContextualLogger extends Logger {
  private readonly parentLogger: Logger;
  private readonly baseContext: LogContext;

  constructor(parentLogger: Logger, baseContext: LogContext) {
    // Pass the parent's config to maintain logger behavior
    super((parentLogger as any).getConfig());
    this.parentLogger = parentLogger;
    this.baseContext = baseContext;
    
    // Share the same aggregator reference
    const parentAggregator = (parentLogger as any).getAggregator();
    if (parentAggregator) {
      this.setAggregator(parentAggregator);
    }
  }

  debug(message: string, context?: LogContext): void {
    this.contextualLog('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.contextualLog('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.contextualLog('warn', message, context);
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const mergedContext = { ...this.baseContext, ...context };
    this.parentLogger.error(message, error, mergedContext);
  }

  withContext(context: LogContext): Logger {
    const mergedContext = { ...this.baseContext, ...context };
    return new ContextualLogger(this.parentLogger, mergedContext);
  }

  async flush(): Promise<void> {
    return this.parentLogger.flush();
  }

  getEventEmitter(): SimpleEventEmitter {
    return this.parentLogger.getEventEmitter();
  }

  getMetrics(): LoggingMetrics {
    return this.parentLogger.getMetrics();
  }

  protected log(level: LogLevel, message: string, context?: LogContext, error?: any): void {
    const mergedContext = { ...this.baseContext, ...context };
    super.log(level, message, mergedContext, error);
  }

  private contextualLog(level: LogLevel, message: string, additionalContext?: LogContext): void {
    const mergedContext = { ...this.baseContext, ...additionalContext };
    this.log(level, message, mergedContext);
  }
}