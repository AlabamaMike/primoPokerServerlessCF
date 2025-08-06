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
}

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