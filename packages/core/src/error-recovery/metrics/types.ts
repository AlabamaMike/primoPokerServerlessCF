export interface CircuitBreakerStateTransition {
  from: string;
  to: string;
  timestamp: number;
  reason?: string | undefined;
}

export interface CircuitBreakerMetricsSnapshot {
  timestamp: number;
  state: string;
  successCount: number;
  failureCount: number;
  successRate: number;
  failureRate: number;
  totalRequests: number;
  halfOpenRequests?: number | undefined;
  lastFailureTime?: number | undefined;
  lastSuccessTime?: number | undefined;
  averageResponseTime?: number | undefined;
}

export interface TimeSeriesDataPoint {
  timestamp: number;
  value: number;
  metadata?: Record<string, any> | undefined;
}

export interface CircuitBreakerAlert {
  id: string;
  circuitBreakerName: string;
  alertType: 'trip' | 'recovery' | 'threshold_exceeded';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  message: string;
  metadata?: Record<string, any> | undefined;
}

export interface MetricsAggregation {
  period: 'minute' | 'hour' | 'day';
  startTime: number;
  endTime: number;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  averageSuccessRate: number;
  averageFailureRate: number;
  tripCount: number;
  recoveryCount: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
}

export interface MetricsExportFormat {
  version: string;
  exportedAt: number;
  circuitBreaker: {
    name: string;
    resourceType: string;
    config: any;
  };
  metrics: {
    current: CircuitBreakerMetricsSnapshot;
    stateTransitions: CircuitBreakerStateTransition[];
    timeSeries: {
      successRate: TimeSeriesDataPoint[];
      failureRate: TimeSeriesDataPoint[];
      responseTime: TimeSeriesDataPoint[];
      totalRequests: TimeSeriesDataPoint[];
    };
    aggregations: {
      hourly: MetricsAggregation[];
      daily: MetricsAggregation[];
    };
    alerts: CircuitBreakerAlert[];
  };
}

export interface MetricsCollectorConfig {
  retentionPeriod: number; // in milliseconds
  aggregationIntervals: {
    minute?: boolean;
    hour?: boolean;
    day?: boolean;
  };
  alertThresholds: {
    tripRate?: number; // trips per hour
    failureRate?: number; // percentage
    responseTime?: number; // milliseconds
  };
  exportFormat: 'json' | 'prometheus' | 'cloudwatch';
}

export interface ResourceSpecificConfig {
  resourceType: string;
  circuitBreakerConfig: {
    failureThreshold: number;
    resetTimeout: number;
    halfOpenLimit: number;
    monitoringPeriod: number;
  };
  retryConfig?: {
    maxAttempts: number;
    backoffStrategy: 'linear' | 'exponential' | 'fixed';
    initialDelay: number;
    maxDelay: number;
    jitter: boolean;
  };
  metricsConfig?: Partial<MetricsCollectorConfig>;
}

export const DEFAULT_RESOURCE_CONFIGS: Record<string, ResourceSpecificConfig> = {
  api: {
    resourceType: 'api',
    circuitBreakerConfig: {
      failureThreshold: 5,
      resetTimeout: 30000, // 30 seconds
      halfOpenLimit: 3,
      monitoringPeriod: 60000, // 1 minute
    },
    retryConfig: {
      maxAttempts: 3,
      backoffStrategy: 'exponential',
      initialDelay: 100,
      maxDelay: 5000,
      jitter: true,
    },
  },
  database: {
    resourceType: 'database',
    circuitBreakerConfig: {
      failureThreshold: 3,
      resetTimeout: 60000, // 1 minute
      halfOpenLimit: 1,
      monitoringPeriod: 300000, // 5 minutes
    },
    retryConfig: {
      maxAttempts: 5,
      backoffStrategy: 'exponential',
      initialDelay: 500,
      maxDelay: 10000,
      jitter: true,
    },
  },
  websocket: {
    resourceType: 'websocket',
    circuitBreakerConfig: {
      failureThreshold: 10,
      resetTimeout: 10000, // 10 seconds
      halfOpenLimit: 5,
      monitoringPeriod: 60000, // 1 minute
    },
    retryConfig: {
      maxAttempts: 10,
      backoffStrategy: 'linear',
      initialDelay: 1000,
      maxDelay: 30000,
      jitter: false,
    },
  },
  cache: {
    resourceType: 'cache',
    circuitBreakerConfig: {
      failureThreshold: 20,
      resetTimeout: 5000, // 5 seconds
      halfOpenLimit: 10,
      monitoringPeriod: 30000, // 30 seconds
    },
    retryConfig: {
      maxAttempts: 2,
      backoffStrategy: 'fixed',
      initialDelay: 50,
      maxDelay: 50,
      jitter: false,
    },
  },
  external_service: {
    resourceType: 'external_service',
    circuitBreakerConfig: {
      failureThreshold: 7,
      resetTimeout: 45000, // 45 seconds
      halfOpenLimit: 2,
      monitoringPeriod: 120000, // 2 minutes
    },
    retryConfig: {
      maxAttempts: 4,
      backoffStrategy: 'exponential',
      initialDelay: 200,
      maxDelay: 8000,
      jitter: true,
    },
  },
};