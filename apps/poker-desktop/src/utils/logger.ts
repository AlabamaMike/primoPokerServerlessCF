type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: Error;
}

interface LoggerConfig {
  maxLogs: number;
  enableConsole: boolean;
  enableRemote: boolean;
  redactPatterns: RegExp[];
}

class SecureLogger {
  private logs: LogEntry[] = [];
  private config: LoggerConfig = {
    maxLogs: 1000,
    enableConsole: process.env.NODE_ENV === 'development',
    enableRemote: false,
    redactPatterns: [
      /password/i,
      /token/i,
      /secret/i,
      /api[_-]?key/i,
      /auth/i,
      /session/i,
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card pattern
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email pattern
    ]
  };

  constructor(config?: Partial<LoggerConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  private redactSensitiveData(data: any): any {
    if (typeof data === 'string') {
      let redacted = data;
      for (const pattern of this.config.redactPatterns) {
        redacted = redacted.replace(pattern, '[REDACTED]');
      }
      return redacted;
    }

    if (typeof data === 'object' && data !== null) {
      if (data instanceof Error) {
        return {
          name: data.name,
          message: this.redactSensitiveData(data.message),
          stack: this.redactSensitiveData(data.stack || ''),
        };
      }

      if (Array.isArray(data)) {
        return data.map(item => this.redactSensitiveData(item));
      }

      const redacted: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        // Redact keys that might contain sensitive data
        const shouldRedactKey = this.config.redactPatterns.some(pattern => 
          pattern.test(key)
        );
        
        if (shouldRedactKey) {
          redacted[key] = '[REDACTED]';
        } else {
          redacted[key] = this.redactSensitiveData(value);
        }
      }
      return redacted;
    }

    return data;
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error) {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message: this.redactSensitiveData(message),
      context: context ? this.redactSensitiveData(context) : undefined,
      error: error ? this.redactSensitiveData(error) : undefined,
    };

    // Add to in-memory logs
    this.logs.push(entry);
    if (this.logs.length > this.config.maxLogs) {
      this.logs.shift();
    }

    // Console logging
    if (this.config.enableConsole) {
      const timestamp = entry.timestamp.toISOString();
      const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
      
      switch (level) {
        case 'debug':
          console.debug(prefix, message, context || '');
          break;
        case 'info':
          console.info(prefix, message, context || '');
          break;
        case 'warn':
          console.warn(prefix, message, context || '');
          break;
        case 'error':
          console.error(prefix, message, context || '', error || '');
          break;
      }
    }

    // Remote logging (if enabled)
    if (this.config.enableRemote && level === 'error') {
      this.sendToRemote(entry);
    }
  }

  debug(message: string, context?: Record<string, any>) {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, any>) {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, any>) {
    this.log('warn', message, context);
  }

  error(message: string, errorOrContext?: Error | Record<string, any>, context?: Record<string, any>) {
    if (errorOrContext instanceof Error) {
      this.log('error', message, context, errorOrContext);
    } else {
      this.log('error', message, errorOrContext);
    }
  }

  getLogs(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logs.filter(log => log.level === level);
    }
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  private async sendToRemote(entry: LogEntry) {
    // TODO: Implement remote logging
    // This would send errors to a logging service
    // For now, just log that we would send it
    console.log('Would send to remote logging service:', entry);
  }
}

// Singleton instance
export const logger = new SecureLogger();

// Export types for use in other files
export type { LogLevel, LogEntry, LoggerConfig };
export { SecureLogger };