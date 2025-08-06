import { Logger } from './logger';
import { LoggerConfig, LogLevel, LogContext } from './types';
import { CorrelationIdGenerator } from './correlation';
import { CloudflareAnalyticsAggregator, CloudflareAnalyticsConfig } from './aggregators/cloudflare-analytics';

export interface LoggerFactoryConfig {
  defaultLevel?: LogLevel;
  enablePIIFiltering?: boolean;
  enableSampling?: boolean;
  samplingRate?: number;
  analytics?: CloudflareAnalyticsConfig;
}

export class LoggerFactory {
  private static instance?: LoggerFactory;
  private readonly config: LoggerFactoryConfig;
  private readonly loggers = new Map<string, Logger>();
  private aggregator?: CloudflareAnalyticsAggregator;

  private constructor(config: LoggerFactoryConfig = {}) {
    this.config = config;
    
    if (config.analytics) {
      this.aggregator = new CloudflareAnalyticsAggregator(config.analytics);
    }
  }

  static initialize(config: LoggerFactoryConfig = {}): void {
    this.instance = new LoggerFactory(config);
  }

  static getInstance(): LoggerFactory {
    if (!this.instance) {
      this.instance = new LoggerFactory();
    }
    return this.instance;
  }

  getLogger(namespace: string, additionalConfig?: Partial<LoggerConfig>): Logger {
    const cacheKey = `${namespace}:${JSON.stringify(additionalConfig || {})}`;
    
    if (!this.loggers.has(cacheKey)) {
      const config: LoggerConfig = {
        namespace,
        minLevel: this.config.defaultLevel || 'info',
        enablePIIFiltering: this.config.enablePIIFiltering ?? true,
        enableSampling: this.config.enableSampling ?? false,
        samplingRate: this.config.samplingRate ?? 1,
        ...additionalConfig,
      };
      
      const logger = new Logger(config);
      
      if (this.aggregator) {
        logger.setAggregator(this.aggregator);
      }
      
      this.loggers.set(cacheKey, logger);
    }
    
    return this.loggers.get(cacheKey)!;
  }

  createRequestLogger(request: Request, namespace: string = 'request'): Logger {
    const correlationId = request.headers.get('x-correlation-id') || CorrelationIdGenerator.generate();
    const requestId = CorrelationIdGenerator.generateShort();
    
    const context: LogContext = {
      correlationId,
      requestId,
      method: request.method,
      url: request.url,
      userAgent: request.headers.get('user-agent') || undefined,
    };
    
    return this.getLogger(namespace).withContext(context);
  }

  async flushAll(): Promise<void> {
    const flushPromises = Array.from(this.loggers.values()).map(logger => logger.flush());
    await Promise.all(flushPromises);
  }

  stop(): void {
    this.aggregator?.stop();
  }
}