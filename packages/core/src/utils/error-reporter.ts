import { logger } from './logger';
import type { AnalyticsEngineDataset, KVNamespace } from '@cloudflare/workers-types';

export interface ErrorReport {
  timestamp: string;
  errorId: string;
  errorType: string;
  message: string;
  stack?: string;
  context?: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userImpact?: string;
  metadata?: Record<string, any>;
}

export interface ErrorReporterOptions {
  analyticsEndpoint?: AnalyticsEngineDataset;
  kvNamespace?: KVNamespace;
  webhookUrl?: string;
  environment?: string;
  samplingRate?: number; // 0.0 to 1.0
}

export class ErrorReporter {
  private static instance: ErrorReporter;
  private options: ErrorReporterOptions;
  private errorQueue: ErrorReport[] = [];
  private flushInterval?: number;

  private constructor(options: ErrorReporterOptions = {}) {
    this.options = {
      samplingRate: 1.0, // Report all errors by default
      ...options,
    };

    // Set up periodic flush
    if (typeof setInterval !== 'undefined') {
      this.flushInterval = setInterval(() => {
        this.flush().catch(console.error);
      }, 30000) as any; // Flush every 30 seconds
    }
  }

  static getInstance(options?: ErrorReporterOptions): ErrorReporter {
    if (!ErrorReporter.instance) {
      ErrorReporter.instance = new ErrorReporter(options);
    } else if (options) {
      // Create new instance with updated options instead of mutating
      ErrorReporter.instance = new ErrorReporter({ ...ErrorReporter.instance.options, ...options });
    }
    return ErrorReporter.instance;
  }

  async report(error: Error | any, context?: Record<string, any>): Promise<void> {
    try {
      // Apply sampling
      if (Math.random() > this.options.samplingRate!) {
        return;
      }

      const errorReport = this.createErrorReport(error, context);
      
      // Log the error
      logger.error('Error reported', error, {
        errorId: errorReport.errorId,
        severity: errorReport.severity,
      });

      // Add to queue
      this.errorQueue.push(errorReport);

      // Flush immediately for critical errors
      if (errorReport.severity === 'critical') {
        await this.flush();
      }
    } catch (reportError) {
      console.error('Failed to report error:', reportError);
    }
  }

  private createErrorReport(error: Error | any, context?: Record<string, any>): ErrorReport {
    const errorId = this.generateErrorId();
    const severity = this.determineSeverity(error);

    const report: ErrorReport = {
      timestamp: new Date().toISOString(),
      errorId,
      errorType: error?.name || 'UnknownError',
      message: error?.message || String(error),
      severity,
      userImpact: this.determineUserImpact(error),
      metadata: {
        environment: this.options.environment,
        ...this.extractMetadata(error),
      },
    };

    if (error?.stack) {
      report.stack = error.stack;
    }

    const sanitizedContext = this.sanitizeContext(context);
    if (sanitizedContext) {
      report.context = sanitizedContext;
    }

    return report;
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private determineSeverity(error: Error | any): ErrorReport['severity'] {
    // Critical errors
    if (error?.name?.includes('SecurityError') ||
        error?.name?.includes('AuthenticationError') ||
        error?.message?.toLowerCase().includes('critical')) {
      return 'critical';
    }

    // High severity
    if (error?.name?.includes('DatabaseError') ||
        error?.name?.includes('NetworkError') ||
        error?.statusCode === 500) {
      return 'high';
    }

    // Medium severity
    if (error?.name?.includes('ValidationError') ||
        error?.statusCode >= 400 && error?.statusCode < 500) {
      return 'medium';
    }

    // Default to low
    return 'low';
  }

  private determineUserImpact(error: Error | any): string {
    if (error?.name?.includes('GameRuleError')) {
      return 'Game action failed';
    }
    if (error?.name?.includes('AuthenticationError')) {
      return 'User authentication required';
    }
    if (error?.name?.includes('NetworkError')) {
      return 'Connection issues';
    }
    if (error?.statusCode >= 500) {
      return 'Service temporarily unavailable';
    }
    return 'Operation failed';
  }

  private extractMetadata(error: Error | any): Record<string, any> {
    const metadata: Record<string, any> = {};

    if (error?.statusCode) {
      metadata.statusCode = error.statusCode;
    }
    if (error?.code) {
      metadata.errorCode = error.code;
    }
    if (error?.cause) {
      metadata.cause = String(error.cause);
    }

    return metadata;
  }

  private sanitizeContext(context?: Record<string, any>): Record<string, any> | undefined {
    if (!context) return undefined;

    const sanitized = { ...context };
    const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'creditCard', 'ssn'];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  async flush(): Promise<void> {
    if (this.errorQueue.length === 0) {
      return;
    }

    const errors = [...this.errorQueue];
    this.errorQueue = [];

    // Send to analytics
    if (this.options.analyticsEndpoint) {
      await this.sendToAnalytics(errors);
    }

    // Store in KV
    if (this.options.kvNamespace) {
      await this.storeInKV(errors);
    }

    // Send webhook notification for critical errors
    if (this.options.webhookUrl) {
      const criticalErrors = errors.filter(e => e.severity === 'critical');
      if (criticalErrors.length > 0) {
        await this.sendWebhook(criticalErrors);
      }
    }
  }

  private async sendToAnalytics(errors: ErrorReport[]): Promise<void> {
    try {
      const analytics = this.options.analyticsEndpoint;
      if (!analytics) return;

      for (const error of errors) {
        analytics.writeDataPoint({
          blobs: [
            error.errorType,
            error.message,
            error.errorId,
          ],
          doubles: [
            Date.parse(error.timestamp),
            error.severity === 'critical' ? 4 : 
            error.severity === 'high' ? 3 :
            error.severity === 'medium' ? 2 : 1,
          ],
          indexes: [
            this.options.environment || 'unknown',
            error.severity,
          ],
        });
      }
    } catch (error) {
      console.error('Failed to send errors to analytics:', error);
    }
  }

  private async storeInKV(errors: ErrorReport[]): Promise<void> {
    try {
      const kv = this.options.kvNamespace;
      if (!kv) return;

      for (const error of errors) {
        await kv.put(
          `error:${error.errorId}`,
          JSON.stringify(error),
          {
            expirationTtl: 86400 * 7, // 7 days
            metadata: {
              severity: error.severity,
              type: error.errorType,
            },
          }
        );
      }
    } catch (error) {
      console.error('Failed to store errors in KV:', error);
    }
  }

  private async sendWebhook(errors: ErrorReport[]): Promise<void> {
    try {
      const webhookUrl = this.options.webhookUrl;
      if (!webhookUrl) return;

      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'error_alert',
          environment: this.options.environment,
          timestamp: new Date().toISOString(),
          errors: errors.map(e => ({
            errorId: e.errorId,
            type: e.errorType,
            message: e.message,
            severity: e.severity,
            userImpact: e.userImpact,
          })),
        }),
      });
    } catch (error) {
      console.error('Failed to send webhook:', error);
    }
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flush().catch(console.error);
  }
}

// Export singleton instance
export const errorReporter = ErrorReporter.getInstance();