import { DurableObject } from 'cloudflare:workers';
import { logger } from '@primo-poker/core';
import {
  PerformanceMetrics,
  AggregatedMetrics,
  TimeSeriesData,
  AlertCondition,
  Alert,
  CacheMetrics,
  ApiMetrics,
  WebSocketMetrics,
  EdgeMetrics,
  RegionMetrics,
} from './monitoring/performance-types';
import { TIME_WINDOWS } from './monitoring/constants';

export class PerformanceMonitorDO extends DurableObject {
  private metricsHistory: Map<string, Array<{ timestamp: number; value: number }>> = new Map();
  private alerts: Map<string, Alert> = new Map();
  private alertConditions: Map<string, AlertCondition> = new Map();
  private currentMetrics: PerformanceMetrics | null = null;
  private aggregationBuffer: Map<string, PerformanceMetrics[]> = new Map();

  constructor(state: DurableObjectState, env: any) {
    super(state, env);
    this.initializeFromStorage();
  }

  private async initializeFromStorage(): Promise<void> {
    try {
      const [history, alerts, conditions, current] = await Promise.all([
        this.ctx.storage.get<Map<string, Array<{ timestamp: number; value: number }>>>('metricsHistory'),
        this.ctx.storage.get<Map<string, Alert>>('alerts'),
        this.ctx.storage.get<Map<string, AlertCondition>>('alertConditions'),
        this.ctx.storage.get<PerformanceMetrics>('currentMetrics'),
      ]);

      if (history) this.metricsHistory = history;
      if (alerts) this.alerts = alerts;
      if (conditions) this.alertConditions = conditions;
      if (current) this.currentMetrics = current;
    } catch (error) {
      logger.error('Failed to initialize PerformanceMonitorDO from storage', error as Error);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case '/metrics':
          return this.handleGetMetrics(request);
        case '/metrics/collect':
          return this.handleCollectMetrics(request);
        case '/metrics/aggregate':
          return this.handleAggregateMetrics(request);
        case '/metrics/timeseries':
          return this.handleGetTimeSeries(request);
        case '/alerts':
          return this.handleGetAlerts(request);
        case '/alerts/create':
          return this.handleCreateAlert(request);
        case '/alerts/resolve':
          return this.handleResolveAlert(request);
        case '/ws':
          return this.handleWebSocket(request);
        default:
          return new Response('Not found', { status: 404 });
      }
    } catch (error) {
      logger.error('PerformanceMonitorDO error', error as Error);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async handleGetMetrics(request: Request): Promise<Response> {
    if (!this.currentMetrics) {
      return new Response(JSON.stringify({ error: 'No metrics available' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(this.currentMetrics), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleCollectMetrics(request: Request): Promise<Response> {
    try {
      const metrics = await request.json() as Partial<PerformanceMetrics>;
      
      // Initialize current metrics if not exists
      if (!this.currentMetrics) {
        this.currentMetrics = this.createEmptyMetrics();
      }

      // Update metrics
      this.currentMetrics = {
        ...this.currentMetrics,
        ...metrics,
        timestamp: Date.now(),
      };

      // Store in history
      this.updateMetricsHistory(metrics);

      // Check alert conditions
      await this.checkAlertConditions();

      // Persist to storage
      await this.ctx.storage.put('currentMetrics', this.currentMetrics);

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      logger.error('Failed to collect metrics', error as Error);
      return new Response(JSON.stringify({ error: 'Failed to collect metrics' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async handleAggregateMetrics(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const window = url.searchParams.get('window') as '1m' | '5m' | '1h' || '1m';

    const aggregated = await this.aggregateMetrics(window);
    
    return new Response(JSON.stringify(aggregated), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleGetTimeSeries(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const metric = url.searchParams.get('metric');
    const duration = url.searchParams.get('duration') || '1h';

    if (!metric) {
      return new Response(JSON.stringify({ error: 'Metric parameter required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const timeSeries = await this.getTimeSeries(metric, duration);
    
    return new Response(JSON.stringify(timeSeries), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleGetAlerts(request: Request): Promise<Response> {
    const activeAlerts = Array.from(this.alerts.values()).filter(alert => !alert.resolved);
    
    return new Response(JSON.stringify(activeAlerts), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleCreateAlert(request: Request): Promise<Response> {
    try {
      const condition = await request.json() as AlertCondition;
      
      this.alertConditions.set(condition.id, condition);
      await this.ctx.storage.put('alertConditions', this.alertConditions);
      
      return new Response(JSON.stringify({ success: true, conditionId: condition.id }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      logger.error('Failed to create alert', error as Error);
      return new Response(JSON.stringify({ error: 'Failed to create alert' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async handleResolveAlert(request: Request): Promise<Response> {
    try {
      const { alertId } = await request.json() as { alertId: string };
      
      const alert = this.alerts.get(alertId);
      if (!alert) {
        return new Response(JSON.stringify({ error: 'Alert not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      alert.resolved = true;
      alert.resolvedAt = Date.now();
      
      await this.ctx.storage.put('alerts', this.alerts);
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      logger.error('Failed to resolve alert', error as Error);
      return new Response(JSON.stringify({ error: 'Failed to resolve alert' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    this.ctx.acceptWebSocket(server);

    // Send initial metrics
    if (this.currentMetrics) {
      server.send(JSON.stringify({
        type: 'metrics_update',
        data: this.currentMetrics,
      }));
    }

    // Set up periodic updates
    const interval = setInterval(() => {
      if (this.currentMetrics && server.readyState === WebSocket.READY_STATE.OPEN) {
        server.send(JSON.stringify({
          type: 'metrics_update',
          data: this.currentMetrics,
        }));
      }
    }, 5000); // Update every 5 seconds

    server.addEventListener('close', () => {
      clearInterval(interval);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async aggregateMetrics(window: '1m' | '5m' | '1h'): Promise<AggregatedMetrics> {
    const windowKey = `${window}_buffer`;
    const buffer = this.aggregationBuffer.get(windowKey) || [];
    
    // Add current metrics to buffer
    if (this.currentMetrics) {
      buffer.push(this.currentMetrics);
    }

    // Remove old metrics outside the window
    const windowMs = window === '1m' ? TIME_WINDOWS.ONE_MINUTE 
                   : window === '5m' ? TIME_WINDOWS.FIVE_MINUTES 
                   : TIME_WINDOWS.ONE_HOUR;
    
    const cutoff = Date.now() - windowMs;
    const validMetrics = buffer.filter(m => m.timestamp >= cutoff);
    
    // Update buffer
    this.aggregationBuffer.set(windowKey, validMetrics);

    // Calculate aggregated metrics
    if (validMetrics.length === 0) {
      return {
        ...this.createEmptyMetrics(),
        window,
        sampleCount: 0,
      };
    }

    // Aggregate cache metrics
    const cacheMetrics: CacheMetrics = {
      hitRate: this.average(validMetrics.map(m => m.cache.hitRate)),
      missRate: this.average(validMetrics.map(m => m.cache.missRate)),
      evictions: this.sum(validMetrics.map(m => m.cache.evictions)),
      size: this.average(validMetrics.map(m => m.cache.size)),
      avgHitLatency: this.average(validMetrics.map(m => m.cache.avgHitLatency)),
      avgMissLatency: this.average(validMetrics.map(m => m.cache.avgMissLatency)),
    };

    // Aggregate API metrics
    const apiMetrics: ApiMetrics = {
      latency: {
        p50: this.percentile(validMetrics.map(m => m.api.latency.p50), 0.5),
        p95: this.percentile(validMetrics.map(m => m.api.latency.p95), 0.95),
        p99: this.percentile(validMetrics.map(m => m.api.latency.p99), 0.99),
      },
      throughput: this.sum(validMetrics.map(m => m.api.throughput)),
      errors: this.sum(validMetrics.map(m => m.api.errors)),
      activeRequests: this.average(validMetrics.map(m => m.api.activeRequests)),
      requestsPerSecond: this.average(validMetrics.map(m => m.api.requestsPerSecond)),
      errorRate: this.average(validMetrics.map(m => m.api.errorRate)),
    };

    // Aggregate WebSocket metrics
    const websocketMetrics: WebSocketMetrics = {
      connections: this.average(validMetrics.map(m => m.websocket.connections)),
      messageRate: this.average(validMetrics.map(m => m.websocket.messageRate)),
      batchingEfficiency: this.average(validMetrics.map(m => m.websocket.batchingEfficiency)),
      avgMessageSize: this.average(validMetrics.map(m => m.websocket.avgMessageSize)),
      compressionRatio: this.average(validMetrics.map(m => m.websocket.compressionRatio)),
      disconnections: this.sum(validMetrics.map(m => m.websocket.disconnections)),
      reconnections: this.sum(validMetrics.map(m => m.websocket.reconnections)),
    };

    // Aggregate edge metrics
    const edgeMetrics: EdgeMetrics = {
      cacheHitRate: this.average(validMetrics.map(m => m.edge.cacheHitRate)),
      bandwidth: this.sum(validMetrics.map(m => m.edge.bandwidth)),
      regions: this.aggregateRegionMetrics(validMetrics),
      avgResponseTime: this.average(validMetrics.map(m => m.edge.avgResponseTime)),
      totalRequests: this.sum(validMetrics.map(m => m.edge.totalRequests)),
    };

    return {
      cache: cacheMetrics,
      api: apiMetrics,
      websocket: websocketMetrics,
      edge: edgeMetrics,
      timestamp: Date.now(),
      window,
      sampleCount: validMetrics.length,
    };
  }

  private async getTimeSeries(metric: string, duration: string): Promise<TimeSeriesData> {
    const history = this.metricsHistory.get(metric) || [];
    
    // Parse duration (e.g., '1h', '24h', '7d')
    const durationMs = this.parseDuration(duration);
    const cutoff = Date.now() - durationMs;
    
    const dataPoints = history
      .filter(point => point.timestamp >= cutoff)
      .map(point => ({
        timestamp: point.timestamp,
        value: point.value,
      }));

    return {
      metric,
      dataPoints,
      duration,
    };
  }

  private async checkAlertConditions(): Promise<void> {
    if (!this.currentMetrics) return;

    for (const condition of this.alertConditions.values()) {
      if (!condition.enabled) continue;

      const currentValue = this.getMetricValue(this.currentMetrics, condition.metric);
      if (currentValue === null) continue;

      const shouldAlert = this.evaluateCondition(currentValue, condition.operator, condition.threshold);
      
      if (shouldAlert) {
        const alertId = `${condition.id}_${Date.now()}`;
        const alert: Alert = {
          id: alertId,
          conditionId: condition.id,
          metric: condition.metric,
          currentValue,
          threshold: condition.threshold,
          severity: condition.severity,
          message: `${condition.metric} is ${condition.operator} ${condition.threshold} (current: ${currentValue})`,
          timestamp: Date.now(),
          resolved: false,
        };

        this.alerts.set(alertId, alert);
        await this.ctx.storage.put('alerts', this.alerts);

        // Broadcast alert to WebSocket clients
        this.broadcastAlert(alert);
      }
    }
  }

  private updateMetricsHistory(metrics: Partial<PerformanceMetrics>): void {
    const timestamp = Date.now();
    
    // Update history for each metric
    if (metrics.cache) {
      this.addToHistory('cache.hitRate', metrics.cache.hitRate, timestamp);
      this.addToHistory('cache.size', metrics.cache.size, timestamp);
    }
    
    if (metrics.api) {
      this.addToHistory('api.latency.p95', metrics.api.latency.p95, timestamp);
      this.addToHistory('api.throughput', metrics.api.throughput, timestamp);
      this.addToHistory('api.errorRate', metrics.api.errorRate, timestamp);
    }
    
    if (metrics.websocket) {
      this.addToHistory('websocket.connections', metrics.websocket.connections, timestamp);
      this.addToHistory('websocket.messageRate', metrics.websocket.messageRate, timestamp);
    }
    
    if (metrics.edge) {
      this.addToHistory('edge.cacheHitRate', metrics.edge.cacheHitRate, timestamp);
      this.addToHistory('edge.bandwidth', metrics.edge.bandwidth, timestamp);
    }
  }

  private addToHistory(metric: string, value: number, timestamp: number): void {
    const history = this.metricsHistory.get(metric) || [];
    history.push({ timestamp, value });
    
    // Keep only last 24 hours of data
    const cutoff = timestamp - 86400000;
    const filtered = history.filter(point => point.timestamp >= cutoff);
    
    this.metricsHistory.set(metric, filtered);
  }

  private createEmptyMetrics(): PerformanceMetrics {
    return {
      cache: {
        hitRate: 0,
        missRate: 0,
        evictions: 0,
        size: 0,
        avgHitLatency: 0,
        avgMissLatency: 0,
      },
      api: {
        latency: { p50: 0, p95: 0, p99: 0 },
        throughput: 0,
        errors: 0,
        activeRequests: 0,
        requestsPerSecond: 0,
        errorRate: 0,
      },
      websocket: {
        connections: 0,
        messageRate: 0,
        batchingEfficiency: 0,
        avgMessageSize: 0,
        compressionRatio: 0,
        disconnections: 0,
        reconnections: 0,
      },
      edge: {
        cacheHitRate: 0,
        bandwidth: 0,
        regions: new Map(),
        avgResponseTime: 0,
        totalRequests: 0,
      },
      timestamp: Date.now(),
    };
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private sum(values: number[]): number {
    return values.reduce((a, b) => a + b, 0);
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * p);
    return sorted[index] || 0;
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([hmd])$/);
    if (!match) return TIME_WINDOWS.ONE_HOUR;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 'h': return value * 3600000;
      case 'd': return value * 86400000;
      case 'm': return value * 60000;
      default: return TIME_WINDOWS.ONE_HOUR;
    }
  }

  private getMetricValue(metrics: PerformanceMetrics, metricPath: string): number | null {
    const parts = metricPath.split('.');
    let value: any = metrics;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return null;
      }
    }
    
    return typeof value === 'number' ? value : null;
  }

  private evaluateCondition(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'eq': return value === threshold;
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      default: return false;
    }
  }

  private aggregateRegionMetrics(metrics: PerformanceMetrics[]): Map<string, RegionMetrics> {
    const regionMap = new Map<string, RegionMetrics[]>();
    
    // Collect all region metrics
    for (const metric of metrics) {
      for (const [region, data] of metric.edge.regions) {
        const existing = regionMap.get(region) || [];
        existing.push(data);
        regionMap.set(region, existing);
      }
    }
    
    // Aggregate by region
    const aggregated = new Map<string, RegionMetrics>();
    for (const [region, dataPoints] of regionMap) {
      aggregated.set(region, {
        requests: this.sum(dataPoints.map(d => d.requests)),
        avgLatency: this.average(dataPoints.map(d => d.avgLatency)),
        bandwidth: this.sum(dataPoints.map(d => d.bandwidth)),
        errors: this.sum(dataPoints.map(d => d.errors)),
      });
    }
    
    return aggregated;
  }

  private broadcastAlert(alert: Alert): void {
    const websockets = this.ctx.getWebSockets();
    const message = JSON.stringify({
      type: 'alert',
      data: alert,
    });
    
    for (const ws of websockets) {
      try {
        ws.send(message);
      } catch (error) {
        logger.error('Failed to broadcast alert', error as Error);
      }
    }
  }
}