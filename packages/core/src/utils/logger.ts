export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4,
}

export interface LogContext {
  correlationId?: string;
  operation?: string;
  resource?: string;
  playerId?: string;
  tableId?: string;
  tournamentId?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: Error | any;
  duration?: number;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private context: LogContext = {};
  private logHandlers: Array<(entry: LogEntry) => void> = [];

  private constructor() {
    // Default to console handler
    this.addHandler(this.consoleHandler);
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  clearContext(): void {
    this.context = {};
  }

  addHandler(handler: (entry: LogEntry) => void): void {
    this.logHandlers.push(handler);
  }

  removeHandler(handler: (entry: LogEntry) => void): void {
    this.logHandlers = this.logHandlers.filter(h => h !== handler);
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error | any, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  critical(message: string, error?: Error | any, context?: LogContext): void {
    this.log(LogLevel.CRITICAL, message, context, error);
  }

  // Log with timing
  async time<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: LogContext
  ): Promise<T> {
    const startTime = Date.now();
    const operationContext = { ...context, operation };

    try {
      this.info(`Starting ${operation}`, operationContext);
      const result = await fn();
      const duration = Date.now() - startTime;
      this.info(`Completed ${operation}`, { ...operationContext, duration });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.error(`Failed ${operation}`, error, { ...operationContext, duration });
      throw error;
    }
  }

  private log(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error | any
  ): void {
    if (level < this.logLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context, ...context },
      error: error ? this.sanitizeError(error) : undefined,
    };

    // Filter PII from context
    entry.context = this.filterPII(entry.context);

    // Send to all handlers
    this.logHandlers.forEach(handler => {
      try {
        handler(entry);
      } catch (handlerError) {
        console.error('Log handler error:', handlerError);
      }
    });
  }

  private sanitizeError(error: Error | any): any {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }
    return error;
  }

  private filterPII(data: any): any {
    if (!data) return data;

    const piiFields = ['password', 'email', 'creditCard', 'ssn', 'token', 'apiKey'];
    const filtered = { ...data };

    for (const field of piiFields) {
      if (filtered[field]) {
        filtered[field] = '[REDACTED]';
      }
    }

    return filtered;
  }

  private consoleHandler(entry: LogEntry): void {
    const levelName = LogLevel[entry.level];
    const contextStr = entry.context && Object.keys(entry.context).length > 0
      ? JSON.stringify(entry.context)
      : '';

    const message = `[${entry.timestamp}] [${levelName}] ${entry.message} ${contextStr}`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(message);
        break;
      case LogLevel.INFO:
        console.log(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(message, entry.error);
        break;
    }
  }
}

// Export singleton instance
export const logger = Logger.getInstance();