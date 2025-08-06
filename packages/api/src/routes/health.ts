import { ApiResponse } from '@primo-poker/shared';
import { MetricsCollector } from '@primo-poker/persistence';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  environment: string;
  version?: string;
  services: {
    database: string;
    session: string;
    tables: string;
    files: string;
    websocket: string;
  };
  health: {
    database: ServiceHealth;
    durableObjects: ServiceHealth;
    sessionStore: ServiceHealth;
    overall: string;
  };
  metrics?: {
    requestsPerMinute: number;
    averageResponseTime: number;
    errorRate: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
  };
  rateLimiting: {
    enabled: boolean;
    requestsPerWindow: number;
    windowSize: string;
  };
  websocket: {
    url: string;
    status: string;
    upgrade: string;
    authentication: string;
  };
}

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  error?: string;
  details?: Record<string, any>;
}

export class HealthChecker {
  private metricsCollector?: MetricsCollector;

  constructor(private env: any) {
    if (env.DB && env.METRICS_NAMESPACE) {
      this.metricsCollector = new MetricsCollector(env.DB, env.METRICS_NAMESPACE);
    }
  }

  async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    // Check all services in parallel
    const [databaseHealth, durableObjectsHealth, sessionStoreHealth, metrics] = await Promise.all([
      this.checkDatabase(),
      this.checkDurableObjects(),
      this.checkSessionStore(),
      this.getMetrics(),
    ]);

    // Calculate overall health status
    const healthStatuses = [databaseHealth.status, durableObjectsHealth.status, sessionStoreHealth.status];
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (healthStatuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (healthStatuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    const websocketUrl = this.env.ENVIRONMENT === 'production' 
      ? 'wss://primo-poker-server.alabamamike.workers.dev'
      : 'ws://localhost:8787';

    const totalResponseTime = Date.now() - startTime;

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      environment: this.env.ENVIRONMENT || 'development',
      version: this.env.VERSION || '1.0.0',
      services: {
        database: 'D1',
        session: 'KV',
        tables: 'Durable Objects',
        files: 'R2',
        websocket: 'Available',
      },
      health: {
        database: databaseHealth,
        durableObjects: durableObjectsHealth,
        sessionStore: sessionStoreHealth,
        overall: overallStatus,
      },
      metrics,
      rateLimiting: {
        enabled: true,
        requestsPerWindow: 100,
        windowSize: '1m',
      },
      websocket: {
        url: websocketUrl,
        status: 'ready',
        upgrade: 'Supported via WebSocket upgrade header',
        authentication: 'Required (JWT token in query parameter)',
      },
    };
  }

  private async checkDatabase(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      if (!this.env.DB) {
        return {
          status: 'unhealthy',
          responseTime: 0,
          error: 'Database not configured',
        };
      }

      // Perform a simple query to check database connectivity
      const result = await this.env.DB.prepare('SELECT 1 as health_check').first();
      
      const responseTime = Date.now() - startTime;
      
      if (result && result.health_check === 1) {
        return {
          status: 'healthy',
          responseTime,
          details: {
            type: 'D1',
            query: 'SELECT 1',
          },
        };
      }

      return {
        status: 'degraded',
        responseTime,
        error: 'Unexpected query result',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  }

  private async checkDurableObjects(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      if (!this.env.GAME_TABLES) {
        return {
          status: 'unhealthy',
          responseTime: 0,
          error: 'Durable Objects not configured',
        };
      }

      // Create a test Durable Object instance and check its health
      const testId = this.env.GAME_TABLES.idFromName('health-check-test');
      const testObject = this.env.GAME_TABLES.get(testId);
      
      const healthResponse = await testObject.fetch(
        new Request('https://internal/health', {
          method: 'GET',
        })
      );

      const responseTime = Date.now() - startTime;

      if (healthResponse.ok) {
        return {
          status: 'healthy',
          responseTime,
          details: {
            type: 'Durable Objects',
            namespace: 'GAME_TABLES',
          },
        };
      }

      return {
        status: 'degraded',
        responseTime,
        error: `Health check returned status ${healthResponse.status}`,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown Durable Objects error',
      };
    }
  }

  private async checkSessionStore(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      if (!this.env.SESSION_STORE) {
        return {
          status: 'unhealthy',
          responseTime: 0,
          error: 'Session store not configured',
        };
      }

      // Perform a test write and read
      const testKey = 'health-check-test';
      const testValue = Date.now().toString();
      
      await this.env.SESSION_STORE.put(testKey, testValue, {
        expirationTtl: 60, // 1 minute
      });
      
      const retrieved = await this.env.SESSION_STORE.get(testKey);
      const responseTime = Date.now() - startTime;
      
      if (retrieved === testValue) {
        // Clean up test key
        await this.env.SESSION_STORE.delete(testKey);
        
        return {
          status: 'healthy',
          responseTime,
          details: {
            type: 'KV',
            operation: 'write/read/delete',
          },
        };
      }

      return {
        status: 'degraded',
        responseTime,
        error: 'Value mismatch in session store',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown session store error',
      };
    }
  }

  private async getMetrics(): Promise<HealthCheckResult['metrics'] | undefined> {
    try {
      if (!this.metricsCollector) {
        return undefined;
      }

      const summary = await this.metricsCollector.getMetricsSummary();
      
      return {
        requestsPerMinute: summary.requestsPerMinute || 0,
        averageResponseTime: summary.averageResponseTime || 0,
        errorRate: summary.errorRate || 0,
        p95ResponseTime: summary.p95ResponseTime || 0,
        p99ResponseTime: summary.p99ResponseTime || 0,
      };
    } catch (error) {
      console.error('Failed to get metrics:', error);
      return undefined;
    }
  }
}