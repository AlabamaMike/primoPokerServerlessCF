import { LogLevel, LogEntry, LogContext, LoggerConfig, LogAggregator } from './types';
import { DefaultPIIFilter } from './pii-filter';

export class Logger {
  private static readonly LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  private readonly config: Required<LoggerConfig>;
  private readonly piiFilter: DefaultPIIFilter;
  private buffer: LogEntry[] = [];
  private flushingBuffer: LogEntry[] = [];
  private isFlushInProgress = false;
  private aggregator?: LogAggregator;

  constructor(config: LoggerConfig) {
    this.config = {
      minLevel: config.minLevel || 'info',
      enableSampling: config.enableSampling ?? false,
      samplingRate: config.samplingRate ?? 1,
      enablePIIFiltering: config.enablePIIFiltering ?? true,
      customFilters: config.customFilters ?? [],
      outputFormat: config.outputFormat ?? 'json',
      namespace: config.namespace ?? 'default',
    };
    
    this.piiFilter = new DefaultPIIFilter();
  }

  setAggregator(aggregator: LogAggregator): void {
    this.aggregator = aggregator;
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

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

  withContext(context: LogContext): Logger {
    // Create a child logger with merged context
    const childConfig = { ...this.config };
    const childLogger = new Logger(childConfig);
    if (this.aggregator) {
      childLogger.setAggregator(this.aggregator);
    }
    
    // Override log method to merge contexts
    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level: LogLevel, message: string, additionalContext?: LogContext, error?: any) => {
      const mergedContext = { ...context, ...additionalContext };
      originalLog(level, message, mergedContext, error);
    };
    
    return childLogger;
  }

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
    } finally {
      this.isFlushInProgress = false;
    }
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: any): void {
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
      entry = this.piiFilter.filter(entry) as LogEntry;
    }

    // Apply custom filters
    for (const filter of this.config.customFilters) {
      if (!filter(entry)) {
        return; // Filter rejected the entry
      }
    }

    // Output the log
    this.output(entry);

    // Add to buffer for aggregation
    this.buffer.push(entry);
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