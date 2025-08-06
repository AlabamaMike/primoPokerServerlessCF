import { D1Database } from '@cloudflare/workers-types';
import { METRICS_TTL, TIME_WINDOWS, PERFORMANCE_THRESHOLDS, PERCENTILES } from './constants';
import { logger } from '@primo-poker/core';

export interface RequestMetric {
  method: string;
  path: string;
  timestamp: number;
  bodySize?: number;
  memoryUsage?: number;
}

export interface ErrorMetric {
  path: string;
  error?: string;
  statusCode: number;
  timestamp: number;
  errorType?: string;
}

export interface ResponseTimeMetric {
  responseTime: number;
  path: string;
  slow?: boolean;
}

export interface RateLimitMetric {
  clientId: string;
  path: string;
  limited: boolean;
  timestamp: number;
}

export interface DurableObjectHealthMetric {
  objectName: string;
  instanceId: string;
  healthy: boolean;
  responseTime: number;
  timestamp: number;
}

export interface MetricsSummary {
  requestsPerMinute: number;
  averageResponseTime: number;
  errorRate: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  durableObjectHealth?: Record<string, {
    healthyCount: number;
    unhealthyCount: number;
    healthRate: number;
  }>;
}

export class MetricsCollector {
  constructor(
    private db: D1Database,
    private kv: KVNamespace
  ) {}

  async recordRequest(metric: RequestMetric): Promise<void> {
    try {
      // Store in KV for quick access (with TTL)
      const key = `request:${metric.path}:${metric.timestamp}`;
      await this.kv.put(key, JSON.stringify(metric), {
        expirationTtl: METRICS_TTL.REQUEST,
      });

      // Also store aggregated counts
      const countKey = `request_count:${metric.path}:${Math.floor(metric.timestamp / 60000)}`;
      const currentCount = await this.kv.get(countKey);
      const newCount = (currentCount ? parseInt(currentCount) : 0) + 1;
      await this.kv.put(countKey, newCount.toString(), {
        expirationTtl: METRICS_TTL.RESPONSE_TIME,
      });
    } catch (error) {
      logger.error('Failed to record request metric', error as Error);
    }
  }

  async recordResponseTime(responseTime: number, path: string): Promise<void> {
    try {
      const metric: ResponseTimeMetric = {
        responseTime,
        path,
        slow: responseTime > PERFORMANCE_THRESHOLDS.SLOW_REQUEST_MS,
      };

      const key = `response_time:${path}:${Date.now()}`;
      await this.kv.put(key, JSON.stringify(metric), {
        expirationTtl: METRICS_TTL.RESPONSE_TIME,
      });

      // Store for percentile calculation
      await this.updateResponseTimeStats(path, responseTime);
    } catch (error) {
      logger.error('Failed to record response time', error as Error);
    }
  }

  async recordError(metric: ErrorMetric): Promise<void> {
    try {
      // Categorize error type
      if (metric.statusCode >= 400 && metric.statusCode < 500) {
        metric.errorType = 'client_error';
      } else if (metric.statusCode >= 500) {
        metric.errorType = 'server_error';
      }

      const key = `error:${metric.path}:${metric.timestamp}`;
      await this.kv.put(key, JSON.stringify(metric), {
        expirationTtl: METRICS_TTL.REQUEST,
      });

      // Update error count
      const countKey = `error_count:${metric.path}:${Math.floor(metric.timestamp / 60000)}`;
      const currentCount = await this.kv.get(countKey);
      const newCount = (currentCount ? parseInt(currentCount) : 0) + 1;
      await this.kv.put(countKey, newCount.toString(), {
        expirationTtl: METRICS_TTL.RESPONSE_TIME,
      });
    } catch (error) {
      logger.error('Failed to record error metric', error as Error);
    }
  }

  async recordRateLimit(metric: RateLimitMetric): Promise<void> {
    try {
      const key = `rate_limit:${metric.clientId}:${metric.timestamp}`;
      await this.kv.put(key, JSON.stringify(metric), {
        expirationTtl: METRICS_TTL.RATE_LIMIT,
      });
    } catch (error) {
      logger.error('Failed to record rate limit metric', error as Error);
    }
  }

  async recordDurableObjectHealth(metric: DurableObjectHealthMetric): Promise<void> {
    try {
      const key = `do_health:${metric.objectName}:${metric.instanceId}:${metric.timestamp}`;
      await this.kv.put(key, JSON.stringify(metric), {
        expirationTtl: METRICS_TTL.HEALTH_CHECK,
      });
    } catch (error) {
      logger.error('Failed to record Durable Object health', error as Error);
    }
  }

  async getAggregatedRequests(): Promise<Record<string, number>> {
    const aggregated: Record<string, number> = {};
    const now = Date.now();
    const oneMinuteAgo = now - TIME_WINDOWS.ONE_MINUTE;

    try {
      // List all request count keys from the last minute
      const list = await this.kv.list({
        prefix: 'request_count:',
      });

      for (const key of list.keys) {
        const parts = key.name.split(':');
        const path = parts[1];
        const timestamp = parseInt(parts[2]) * 60000;

        if (timestamp >= oneMinuteAgo) {
          const count = await this.kv.get(key.name);
          if (count) {
            aggregated[path] = (aggregated[path] || 0) + parseInt(count);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to get aggregated requests', error as Error);
    }

    return aggregated;
  }

  async getRequestRate(window: '1m' | '5m' | '15m'): Promise<number> {
    const windowMs = window === '1m' ? TIME_WINDOWS.ONE_MINUTE : window === '5m' ? TIME_WINDOWS.FIVE_MINUTES : TIME_WINDOWS.FIFTEEN_MINUTES;
    const now = Date.now();
    const startTime = now - windowMs;
    let totalRequests = 0;

    try {
      const list = await this.kv.list({
        prefix: 'request_count:',
      });

      for (const key of list.keys) {
        const timestamp = parseInt(key.name.split(':')[2]) * 60000;
        if (timestamp >= startTime) {
          const count = await this.kv.get(key.name);
          if (count) {
            totalRequests += parseInt(count);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to get request rate', error as Error);
    }

    return totalRequests / (windowMs / 60000); // Convert to requests per minute
  }

  async getResponseTimePercentiles(path: string): Promise<{ p50: number; p95: number; p99: number }> {
    try {
      const stats = await this.kv.get(`response_stats:${path}`, 'json') as any;
      if (!stats) {
        return { p50: 0, p95: 0, p99: 0 };
      }

      return {
        p50: stats.p50 || 0,
        p95: stats.p95 || 0,
        p99: stats.p99 || 0,
      };
    } catch (error) {
      logger.error('Failed to get response time percentiles', error as Error);
      return { p50: 0, p95: 0, p99: 0 };
    }
  }

  async getSlowRequests(threshold: number): Promise<Array<{ path: string; responseTime: number }>> {
    const slowRequests: Array<{ path: string; responseTime: number }> = [];

    try {
      const list = await this.kv.list({
        prefix: 'response_time:',
      });

      for (const key of list.keys) {
        const data = await this.kv.get(key.name, 'json') as ResponseTimeMetric;
        if (data && data.responseTime > threshold) {
          slowRequests.push({
            path: data.path,
            responseTime: data.responseTime,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to get slow requests', error as Error);
    }

    return slowRequests;
  }

  async getErrorRate(path?: string): Promise<number> {
    try {
      const now = Date.now();
      const oneMinuteAgo = now - TIME_WINDOWS.ONE_MINUTE;
      let totalRequests = 0;
      let totalErrors = 0;

      const requestPrefix = path ? `request_count:${path}:` : 'request_count:';
      const errorPrefix = path ? `error_count:${path}:` : 'error_count:';

      // Get request counts
      const requestList = await this.kv.list({ prefix: requestPrefix });
      for (const key of requestList.keys) {
        const parts = key.name.split(':');
        const timestampStr = parts[parts.length - 1];
        if (!timestampStr) continue;
        const timestamp = parseInt(timestampStr) * 60000;
        if (timestamp >= oneMinuteAgo) {
          const count = await this.kv.get(key.name);
          if (count) totalRequests += parseInt(count);
        }
      }

      // Get error counts
      const errorList = await this.kv.list({ prefix: errorPrefix });
      for (const key of errorList.keys) {
        const parts = key.name.split(':');
        const timestampStr = parts[parts.length - 1];
        if (!timestampStr) continue;
        const timestamp = parseInt(timestampStr) * 60000;
        if (timestamp >= oneMinuteAgo) {
          const count = await this.kv.get(key.name);
          if (count) totalErrors += parseInt(count);
        }
      }

      return totalRequests > 0 ? totalErrors / totalRequests : 0;
    } catch (error) {
      logger.error('Failed to get error rate', error as Error);
      return 0;
    }
  }

  async getErrorsByType(): Promise<Record<string, number>> {
    const errorsByType: Record<string, number> = {};

    try {
      const list = await this.kv.list({
        prefix: 'error:',
      });

      for (const key of list.keys) {
        const data = await this.kv.get(key.name, 'json') as ErrorMetric;
        if (data && data.errorType) {
          errorsByType[data.errorType] = (errorsByType[data.errorType] || 0) + 1;
        }
      }
    } catch (error) {
      logger.error('Failed to get errors by type', error as Error);
    }

    return errorsByType;
  }

  async getRateLimitStats(): Promise<{ limitRate: number; topLimitedClients: string[] }> {
    try {
      const now = Date.now();
      const oneMinuteAgo = now - TIME_WINDOWS.ONE_MINUTE;
      let totalAttempts = 0;
      let limitedAttempts = 0;
      const clientCounts: Record<string, number> = {};

      const list = await this.kv.list({
        prefix: 'rate_limit:',
      });

      for (const key of list.keys) {
        const data = await this.kv.get(key.name, 'json') as RateLimitMetric;
        if (data && data.timestamp >= oneMinuteAgo) {
          totalAttempts++;
          if (data.limited) {
            limitedAttempts++;
            clientCounts[data.clientId] = (clientCounts[data.clientId] || 0) + 1;
          }
        }
      }

      const topLimitedClients = Object.entries(clientCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([clientId]) => clientId);

      return {
        limitRate: totalAttempts > 0 ? limitedAttempts / totalAttempts : 0,
        topLimitedClients,
      };
    } catch (error) {
      logger.error('Failed to get rate limit stats', error as Error);
      return { limitRate: 0, topLimitedClients: [] };
    }
  }

  async getDurableObjectHealthSummary(): Promise<Record<string, {
    healthyCount: number;
    unhealthyCount: number;
    healthRate: number;
  }>> {
    const summary: Record<string, {
      healthyCount: number;
      unhealthyCount: number;
      healthRate: number;
    }> = {};

    try {
      const list = await this.kv.list({
        prefix: 'do_health:',
      });

      for (const key of list.keys) {
        const data = await this.kv.get(key.name, 'json') as DurableObjectHealthMetric;
        if (data) {
          if (!summary[data.objectName]) {
            summary[data.objectName] = {
              healthyCount: 0,
              unhealthyCount: 0,
              healthRate: 0,
            };
          }

          if (data.healthy) {
            summary[data.objectName].healthyCount++;
          } else {
            summary[data.objectName].unhealthyCount++;
          }
        }
      }

      // Calculate health rates
      for (const objectName in summary) {
        const total = summary[objectName].healthyCount + summary[objectName].unhealthyCount;
        summary[objectName].healthRate = total > 0 ? summary[objectName].healthyCount / total : 0;
      }
    } catch (error) {
      logger.error('Failed to get Durable Object health summary', error as Error);
    }

    return summary;
  }

  async getMetricsSummary(): Promise<MetricsSummary> {
    const [
      requestsPerMinute,
      averageResponseTime,
      errorRate,
      durableObjectHealth,
    ] = await Promise.all([
      this.getRequestRate('1m'),
      this.getAverageResponseTime(),
      this.getErrorRate(),
      this.getDurableObjectHealthSummary(),
    ]);

    const percentiles = await this.getResponseTimePercentiles('all');

    return {
      requestsPerMinute,
      averageResponseTime,
      errorRate,
      p95ResponseTime: percentiles.p95,
      p99ResponseTime: percentiles.p99,
      durableObjectHealth,
    };
  }

  async cleanupOldMetrics(): Promise<void> {
    // This would typically be implemented as a scheduled job
    // For now, metrics are auto-expired using KV TTL
  }

  private async updateResponseTimeStats(path: string, responseTime: number): Promise<void> {
    try {
      const statsKey = `response_stats:${path}`;
      const stats = await this.kv.get(statsKey, 'json') as any || {
        times: [],
        lastUpdated: 0,
      };

      // Keep last N response times for percentile calculation
      stats.times.push(responseTime);
      if (stats.times.length > PERFORMANCE_THRESHOLDS.MAX_RESPONSE_TIMES) {
        stats.times = stats.times.slice(-PERFORMANCE_THRESHOLDS.MAX_RESPONSE_TIMES);
      }

      // Calculate percentiles
      const sorted = [...stats.times].sort((a, b) => a - b);
      stats.p50 = sorted[Math.floor(sorted.length * PERCENTILES.P50)];
      stats.p95 = sorted[Math.floor(sorted.length * PERCENTILES.P95)];
      stats.p99 = sorted[Math.floor(sorted.length * PERCENTILES.P99)];
      stats.lastUpdated = Date.now();

      await this.kv.put(statsKey, JSON.stringify(stats), {
        expirationTtl: METRICS_TTL.RESPONSE_TIME,
      });

      // Also update the 'all' stats
      if (path !== 'all') {
        await this.updateResponseTimeStats('all', responseTime);
      }
    } catch (error) {
      logger.error('Failed to update response time stats', error as Error);
    }
  }

  private async getAverageResponseTime(): Promise<number> {
    try {
      const stats = await this.kv.get('response_stats:all', 'json') as any;
      if (!stats || !stats.times || stats.times.length === 0) {
        return 0;
      }

      const sum = stats.times.reduce((acc: number, time: number) => acc + time, 0);
      return sum / stats.times.length;
    } catch (error) {
      logger.error('Failed to get average response time', error as Error);
      return 0;
    }
  }
}