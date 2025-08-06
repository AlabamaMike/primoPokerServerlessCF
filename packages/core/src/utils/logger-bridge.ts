import { Logger as StructuredLogger, LoggerFactory, LogLevel as StructuredLogLevel, LogContext as StructuredLogContext } from '@primo-poker/logging';
import { Logger, LogLevel, LogContext, LogEntry } from './logger';

/**
 * Bridge to integrate the new structured logging with existing logger infrastructure
 */
export class LoggerBridge {
  private structuredLogger: StructuredLogger;

  constructor(namespace: string = 'core') {
    this.structuredLogger = LoggerFactory.getInstance().getLogger(namespace);
  }

  /**
   * Initialize the bridge to replace console handlers with structured logging
   */
  static initialize(): void {
    const logger = Logger.getInstance();
    const bridge = new LoggerBridge();

    // Remove default console handler
    logger.removeHandler((logger as any).consoleHandler);

    // Add structured logging handler
    logger.addHandler((entry: LogEntry) => {
      bridge.handleLogEntry(entry);
    });
  }

  private handleLogEntry(entry: LogEntry): void {
    const context: StructuredLogContext = {
      ...entry.context,
    };
    
    // Only add duration if it's defined
    if (entry.duration !== undefined) {
      context.duration = entry.duration;
    }

    switch (entry.level) {
      case LogLevel.DEBUG:
        this.structuredLogger.debug(entry.message, context);
        break;
      case LogLevel.INFO:
        this.structuredLogger.info(entry.message, context);
        break;
      case LogLevel.WARN:
        this.structuredLogger.warn(entry.message, context);
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        this.structuredLogger.error(entry.message, entry.error, context);
        break;
    }
  }

  /**
   * Convert legacy LogLevel to structured LogLevel
   */
  static convertLogLevel(level: LogLevel): StructuredLogLevel {
    switch (level) {
      case LogLevel.DEBUG:
        return 'debug';
      case LogLevel.INFO:
        return 'info';
      case LogLevel.WARN:
        return 'warn';
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        return 'error';
      default:
        return 'info';
    }
  }
}