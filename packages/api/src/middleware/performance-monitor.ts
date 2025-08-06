import { MetricsCollector } from '@primo-poker/persistence';
import { RandomUtils } from '@primo-poker/shared';

export type Middleware = (request: Request, env: any, next: (request: Request, env: any) => Promise<Response>) => Promise<Response>;

export class PerformanceMonitor {
  private metricsCollector?: MetricsCollector;

  middleware: Middleware = async (request: Request, env: any, next: (request: Request, env: any) => Promise<Response>): Promise<Response> => {
    const startTime = Date.now();
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Initialize metrics collector if available
    if (env.DB && env.METRICS_NAMESPACE && !this.metricsCollector) {
      this.metricsCollector = new MetricsCollector(env.DB, env.METRICS_NAMESPACE);
    }

    // Add or preserve correlation ID
    let correlationId = request.headers.get('X-Correlation-ID');
    if (!correlationId) {
      correlationId = RandomUtils.generateUUID();
    }

    // Clone request with correlation ID
    const enhancedRequest = new Request(request, {
      headers: new Headers(request.headers),
    });
    enhancedRequest.headers.set('X-Correlation-ID', correlationId);

    // Record request metrics
    try {
      const requestMetric = {
        method: request.method,
        path,
        timestamp: Date.now(),
        bodySize: request.headers.get('content-length') ? parseInt(request.headers.get('content-length')!) : undefined,
        memoryUsage: (global as any).performance?.memory?.usedJSHeapSize,
      };

      await this.metricsCollector?.recordRequest(requestMetric);
    } catch (error) {
      console.error('Failed to record request metric:', error);
    }

    try {
      // Execute the next middleware/handler
      const response = await next(enhancedRequest, env);
      const responseTime = Date.now() - startTime;

      // Record response time
      await this.metricsCollector?.recordResponseTime(responseTime, path);

      // Record errors for non-2xx responses
      if (response.status >= 400) {
        await this.metricsCollector?.recordError({
          path,
          statusCode: response.status,
          timestamp: Date.now(),
          errorType: response.status >= 400 && response.status < 500 ? 'client_error' : 'server_error',
        });
      }

      // Add performance headers to response
      const enhancedResponse = new Response(response.body, response);
      enhancedResponse.headers.set('X-Response-Time', `${responseTime}ms`);
      enhancedResponse.headers.set('X-Correlation-ID', correlationId);

      return enhancedResponse;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Record error
      await this.metricsCollector?.recordError({
        path,
        error: error instanceof Error ? error.message : 'Unknown error',
        statusCode: 500,
        timestamp: Date.now(),
      });

      // Re-throw the error
      throw error;
    }
  };

  async getAggregatedMetrics(): Promise<any> {
    if (!this.metricsCollector) {
      return null;
    }

    return this.metricsCollector.getMetricsSummary();
  }
}