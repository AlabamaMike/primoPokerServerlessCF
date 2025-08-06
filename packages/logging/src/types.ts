export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  correlationId?: string;
  requestId?: string;
  sessionId?: string;
  userId?: string;
  playerId?: string;
  tableId?: string;
  operation?: string;
  resource?: string;
  duration?: number;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerConfig {
  minLevel: LogLevel;
  enableSampling?: boolean;
  samplingRate?: number; // 0-1, percentage of logs to emit
  enablePIIFiltering?: boolean;
  customFilters?: Array<(entry: LogEntry) => boolean>;
  outputFormat?: 'json' | 'structured';
  namespace?: string;
  // Error monitoring callbacks
  onAggregationError?: (error: Error, entries: LogEntry[]) => void;
  onBufferOverflow?: (droppedCount: number, bufferSize: number) => void;
  onFilterError?: (error: Error, entry: LogEntry, filterIndex: number) => void;
  // Buffer management
  maxBufferSize?: number;
}

/**
 * Internal processed logger configuration with all optional fields resolved to defaults
 */
export type ProcessedLoggerConfig = Required<Omit<LoggerConfig, 'onAggregationError' | 'onBufferOverflow' | 'onFilterError'>> & {
  onAggregationError?: (error: Error, entries: LogEntry[]) => void;
  onBufferOverflow?: (droppedCount: number, bufferSize: number) => void;
  onFilterError?: (error: Error, entry: LogEntry, filterIndex: number) => void;
};

export interface LogAggregator {
  send(entries: LogEntry[]): Promise<void>;
}

export interface PIIFilter {
  filter(data: any): any;
}

export type LoggingEvent = 
  | { type: 'aggregation_error'; error: Error; entries: LogEntry[] }
  | { type: 'buffer_overflow'; droppedCount: number; bufferSize: number }
  | { type: 'filter_error'; error: Error; entry: LogEntry; filterIndex: number }
  | { type: 'flush_started'; entryCount: number }
  | { type: 'flush_completed'; entryCount: number; duration: number }
  | { type: 'flush_failed'; error: Error; entryCount: number };

export interface LoggingMetrics {
  totalLogsProcessed: number;
  totalLogsDropped: number;
  totalAggregationErrors: number;
  totalFilterErrors: number;
  totalFlushAttempts: number;
  totalFlushFailures: number;
  lastFlushDuration?: number;
  lastFlushTimestamp?: string;
}

export interface LoggingEventListener {
  (event: LoggingEvent): void;
}

export interface LoggingEventEmitter {
  on(listener: LoggingEventListener): void;
  off(listener: LoggingEventListener): void;
  emit(event: LoggingEvent): void;
}

/**
 * Error thrown when log aggregation fails
 */
export class LogAggregationError extends Error {
  constructor(
    message: string,
    public readonly entries: LogEntry[],
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'LogAggregationError';
  }
}

/**
 * Error thrown when a log filter fails
 */
export class LogFilterError extends Error {
  constructor(
    message: string,
    public readonly entry: LogEntry,
    public readonly filterIndex: number,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'LogFilterError';
  }
}

/**
 * Error thrown when the log buffer overflows
 */
export class LogBufferOverflowError extends Error {
  constructor(
    message: string,
    public readonly droppedCount: number,
    public readonly bufferSize: number
  ) {
    super(message);
    this.name = 'LogBufferOverflowError';
  }
}