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
}

export interface LogAggregator {
  send(entries: LogEntry[]): Promise<void>;
}

export interface PIIFilter {
  filter(data: any): any;
}