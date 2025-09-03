import { Context } from '@cloudflare/workers-types';

/**
 * Performance Monitoring Wrapper for Security Middleware
 * Tracks execution time and performance metrics for each middleware layer
 */

export interface PerformanceMetrics {
  middlewareName: string;
  executionTime: number;
  timestamp: number;
  error?: string;
  memoryUsage?: number;
}

export interface PerformanceCollector {
  collect(metrics: PerformanceMetrics): Promise<void>;
  getMetrics(timeWindow?: number): Promise<PerformanceMetrics[]>;
}

export class InMemoryPerformanceCollector implements PerformanceCollector {
  private metrics: PerformanceMetrics[] = [];
  private maxEntries: number = 10000;

  async collect(metrics: PerformanceMetrics): Promise<void> {
    this.metrics.push(metrics);
    
    // Prevent memory overflow
    if (this.metrics.length > this.maxEntries) {
      this.metrics = this.metrics.slice(-this.maxEntries);
    }
  }

  async getMetrics(timeWindow?: number): Promise<PerformanceMetrics[]> {
    if (!timeWindow) {
      return this.metrics;
    }

    const cutoffTime = Date.now() - timeWindow;
    return this.metrics.filter(m => m.timestamp >= cutoffTime);
  }
}

export class KVPerformanceCollector implements PerformanceCollector {
  constructor(
    private kv: KVNamespace,
    private prefix: string = 'perf:'
  ) {}

  async collect(metrics: PerformanceMetrics): Promise<void> {
    const key = `${this.prefix}${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    await this.kv.put(key, JSON.stringify(metrics), {
      expirationTtl: 3600 // 1 hour TTL
    });
  }

  async getMetrics(timeWindow: number = 300000): Promise<PerformanceMetrics[]> {
    const cutoffTime = Date.now() - timeWindow;
    const list = await this.kv.list({ prefix: this.prefix, limit: 1000 });
    
    const metrics: PerformanceMetrics[] = [];
    
    for (const key of list.keys) {
      const timestamp = parseInt(key.name.split(':')[1]);
      if (timestamp >= cutoffTime) {
        const data = await this.kv.get(key.name, 'json') as PerformanceMetrics | null;
        if (data) {
          metrics.push(data);
        }
      }
    }
    
    return metrics.sort((a, b) => b.timestamp - a.timestamp);
  }
}

export type Middleware = (
  request: Request,
  ctx: Context,
  next: () => Promise<Response>
) => Promise<Response>;

/**
 * Wrap a middleware function with performance monitoring
 */
export function withPerformanceMonitoring(
  middlewareName: string,
  middleware: Middleware,
  collector: PerformanceCollector
): Middleware {
  return async (request: Request, ctx: Context, next: () => Promise<Response>): Promise<Response> => {
    const startTime = performance.now();
    const startMemory = (globalThis as any).performance?.memory?.usedJSHeapSize;
    
    try {
      const response = await middleware(request, ctx, next);
      
      const executionTime = performance.now() - startTime;
      const endMemory = (globalThis as any).performance?.memory?.usedJSHeapSize;
      
      await collector.collect({
        middlewareName,
        executionTime,
        timestamp: Date.now(),
        memoryUsage: endMemory ? endMemory - (startMemory || 0) : undefined
      });
      
      return response;
    } catch (error) {
      const executionTime = performance.now() - startTime;
      
      await collector.collect({
        middlewareName,
        executionTime,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  };
}

/**
 * Create a middleware composition function with performance monitoring
 */
export function composeMiddlewareWithMonitoring(
  middlewares: Array<{ name: string; middleware: Middleware }>,
  collector: PerformanceCollector
): Middleware {
  return middlewares.reduceRight(
    (next, { name, middleware }) => {
      const wrappedMiddleware = withPerformanceMonitoring(name, middleware, collector);
      return (request: Request, ctx: Context) => wrappedMiddleware(request, ctx, next);
    },
    async () => new Response('Not Found', { status: 404 })
  );
}

/**
 * Performance summary aggregator
 */
export class PerformanceSummaryAggregator {
  constructor(private collector: PerformanceCollector) {}

  async getPerformanceSummary(timeWindow: number = 300000): Promise<{
    byMiddleware: Record<string, {
      count: number;
      totalTime: number;
      averageTime: number;
      minTime: number;
      maxTime: number;
      errorCount: number;
      p50: number;
      p95: number;
      p99: number;
    }>;
    overall: {
      totalRequests: number;
      totalErrors: number;
      averageStackTime: number;
    };
  }> {
    const metrics = await this.collector.getMetrics(timeWindow);
    
    // Group by middleware
    const byMiddleware: Record<string, PerformanceMetrics[]> = {};
    const stackTimes: Record<number, number> = {};
    
    for (const metric of metrics) {
      if (!byMiddleware[metric.middlewareName]) {
        byMiddleware[metric.middlewareName] = [];
      }
      byMiddleware[metric.middlewareName].push(metric);
      
      // Track total stack time per timestamp
      if (!stackTimes[metric.timestamp]) {
        stackTimes[metric.timestamp] = 0;
      }
      stackTimes[metric.timestamp] += metric.executionTime;
    }
    
    // Calculate stats per middleware
    const summary: any = { byMiddleware: {}, overall: {} };
    
    for (const [name, metrics] of Object.entries(byMiddleware)) {
      const times = metrics.map(m => m.executionTime).sort((a, b) => a - b);
      const errorCount = metrics.filter(m => m.error).length;
      
      summary.byMiddleware[name] = {
        count: metrics.length,
        totalTime: times.reduce((a, b) => a + b, 0),
        averageTime: times.reduce((a, b) => a + b, 0) / times.length,
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
        errorCount,
        p50: this.percentile(times, 0.5),
        p95: this.percentile(times, 0.95),
        p99: this.percentile(times, 0.99)
      };
    }
    
    // Calculate overall stats
    const stackTimeArray = Object.values(stackTimes);
    summary.overall = {
      totalRequests: stackTimeArray.length,
      totalErrors: metrics.filter(m => m.error).length,
      averageStackTime: stackTimeArray.reduce((a, b) => a + b, 0) / stackTimeArray.length
    };
    
    return summary;
  }

  private percentile(sortedArray: number[], percentile: number): number {
    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, index)];
  }
}