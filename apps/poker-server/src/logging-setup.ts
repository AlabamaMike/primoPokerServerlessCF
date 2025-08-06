import { LoggerFactory, CloudflareAnalyticsConfig } from '@primo-poker/logging';

export interface LoggingConfig {
  enableAnalytics?: boolean;
  analyticsDataset?: string;
  accountId?: string;
  apiToken?: string;
  defaultLogLevel?: 'debug' | 'info' | 'warn' | 'error';
  enableSampling?: boolean;
  samplingRate?: number;
}

export function initializeLogging(config: LoggingConfig): void {
  const analyticsConfig: CloudflareAnalyticsConfig | undefined = config.enableAnalytics && config.analyticsDataset && config.accountId && config.apiToken
    ? {
        dataset: config.analyticsDataset,
        accountId: config.accountId,
        apiToken: config.apiToken,
        batchSize: 100,
        flushInterval: 5000,
      }
    : undefined;

  LoggerFactory.initialize({
    defaultLevel: config.defaultLogLevel || 'info',
    enablePIIFiltering: true,
    enableSampling: config.enableSampling ?? false,
    samplingRate: config.samplingRate ?? 1,
    analytics: analyticsConfig,
  });
}