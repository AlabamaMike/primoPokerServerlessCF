/**
 * Comprehensive performance monitoring types and interfaces
 */

export interface CacheMetrics {
  hitRate: number;
  missRate: number;
  evictions: number;
  size: number;
  avgHitLatency: number;
  avgMissLatency: number;
}

export interface ApiMetrics {
  latency: {
    p50: number;
    p95: number;
    p99: number;
  };
  throughput: number;
  errors: number;
  activeRequests: number;
  requestsPerSecond: number;
  errorRate: number;
}

export interface WebSocketMetrics {
  connections: number;
  messageRate: number;
  batchingEfficiency: number;
  avgMessageSize: number;
  compressionRatio: number;
  disconnections: number;
  reconnections: number;
}

export interface EdgeMetrics {
  cacheHitRate: number;
  bandwidth: number;
  regions: Map<string, RegionMetrics>;
  avgResponseTime: number;
  totalRequests: number;
}

export interface RegionMetrics {
  requests: number;
  avgLatency: number;
  bandwidth: number;
  errors: number;
}

export interface PerformanceMetrics {
  cache: CacheMetrics;
  api: ApiMetrics;
  websocket: WebSocketMetrics;
  edge: EdgeMetrics;
  timestamp: number;
}

export interface AggregatedMetrics extends PerformanceMetrics {
  window: '1m' | '5m' | '1h';
  sampleCount: number;
}

export interface TimeSeriesData {
  metric: string;
  dataPoints: Array<{
    timestamp: number;
    value: number;
  }>;
  duration: string;
}

export interface AlertCondition {
  id: string;
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  window: '1m' | '5m' | '15m';
  severity: 'info' | 'warning' | 'critical';
  enabled: boolean;
  notificationChannels: string[];
}

export interface Alert {
  id: string;
  conditionId: string;
  metric: string;
  currentValue: number;
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
}

export interface PerformanceDashboard {
  metrics: PerformanceMetrics;
  alerts: Alert[];
  trends: Map<string, TimeSeriesData>;
  lastUpdated: number;
}